"""Self-hosted pet Re-ID embedding function.

Not a vendor API like Jina/Voyage (functions/index.js) - this runs
AvitoTech/SigLIP2-Base-for-animal-identification, a SigLIP2 model
fine-tuned specifically to tell individual cats/dogs apart, which has no
hosted inference API anywhere. It lives in its own Python codebase because
Firebase's main Node.js functions can't load a PyTorch model at all.

Deliberately min_instances=0 (see the decorator below) - this is an
additional path to test, not a replacement for the always-available
Jina/Voyage path, so it carries no idle cost. The tradeoff, by choice: a
request arriving after any idle period pays for loading ~1.5GB of model
weights before it can even start on the photo, typically ~15-30s.

torch/transformers/PIL/requests are all imported lazily inside the request
handler, not at module scope - Firebase's local deploy-time discovery step
imports this whole file just to read the decorators, under a hard ~10s
timeout, and importing torch alone can take longer than that.
"""

import json
import os

from firebase_functions import https_fn, options

_MODEL_REPO = "AvitoTech/SigLIP2-Base-for-animal-identification"

# Loaded once per warm instance, not once per request - a request that
# lands on an instance still warm from a previous call skips the ~15-30s
# load entirely.
_processor = None
_model = None


def _get_model():
    global _processor, _model
    if _model is None:
        from transformers import AutoImageProcessor, AutoModel

        _processor = AutoImageProcessor.from_pretrained(_MODEL_REPO)
        _model = AutoModel.from_pretrained(_MODEL_REPO).eval()
    return _processor, _model


def _json_response(body, status=200):
    return https_fn.Response(json.dumps(body), status=status, mimetype="application/json")


@https_fn.on_request(
    region="me-west1",
    memory=options.MemoryOption.GB_4,
    # Explicit rather than left to Cloud Run's implicit default for this
    # memory tier - both so CPU-bound inference gets a predictable amount of
    # compute, and so the cost estimate on the Costs page has a known,
    # documented basis instead of guessing at an undocumented default.
    cpu=2,
    timeout_sec=120,
    min_instances=0,
    secrets=["SIGLIP2_SHARED_SECRET"],
)
def compute_siglip2_embedding(req: https_fn.Request) -> https_fn.Response:
    # .strip() on both sides: the secret was created via a piped
    # `openssl rand ... | firebase functions:secrets:set ...` command, which
    # stores openssl's trailing newline as part of the secret's actual
    # bytes. Node's fetch() silently strips trailing whitespace from an
    # outgoing header value (the Fetch spec's header-value normalization),
    # but Python's raw os.environ value keeps it - so an unstripped
    # comparison here compared "secret" against "secret\n" and rejected
    # every legitimate request with 401.
    shared_secret = os.environ.get("SIGLIP2_SHARED_SECRET", "").strip()
    if not shared_secret or req.headers.get("X-Shared-Secret", "").strip() != shared_secret:
        return _json_response({"error": "unauthorized"}, status=401)

    body = req.get_json(silent=True) or {}
    photo_url = body.get("photoUrl")
    if not photo_url:
        return _json_response({"error": "photoUrl is required"}, status=400)

    try:
        import io

        import requests
        import torch
        import torch.nn.functional as F
        from PIL import Image

        image_resp = requests.get(photo_url, timeout=30)
        image_resp.raise_for_status()
        image = Image.open(io.BytesIO(image_resp.content)).convert("RGB")

        processor, model = _get_model()
        with torch.no_grad():
            inputs = processor(images=[image], return_tensors="pt")
            output = model.get_image_features(**inputs)
            # The model card's own example treats this as already a plain
            # pooled tensor, but on the installed transformers version it
            # comes back as a BaseModelOutputWithPooling instead - .pooler_output
            # IS that pooled representation by definition (what
            # get_image_features would normally have already unwrapped), so
            # this isn't a fallback guess, just unwrapping one extra layer.
            embedding = output if torch.is_tensor(output) else output.pooler_output
            embedding = F.normalize(embedding, dim=1)

        return _json_response({"embedding": embedding[0].tolist()})
    except Exception as err:  # noqa: BLE001 - surfaced to the caller, same pattern as the Node side
        return _json_response({"error": str(err)}, status=500)
