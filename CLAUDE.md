# FouFou-Pets — Project Brief

This file is a plain-language summary of what's been discussed and decided so far, for Eitan to review, and for any future Claude session to pick up context without re-reading everything from scratch. Nothing described as "decided" below has been built yet.

## What this project is

A system to help someone whose pet went missing manage the search, instead of doing it alone from memory and panic — and to connect them to sighting/found reports that are scattered across Facebook groups, WhatsApp, vets, shelters, etc.

Full vision is described in two source documents in this folder:
- `איתור חיות מחמד אבודות - מסמך איפיון.docx` — the full, detailed spec (very large scope: regional editors, org partnerships, gamified volunteers, economic model, multi-country future).
- `איתור_חיות_מחמד_מסמך_מוצר_לגרסה_הראשונית.docx` — a condensed "first version" doc, already trimmed down from the full vision (excludes e.g. full Facebook auto-scraping, chip-database access, certain photo-ID, nationwide day-one coverage).

Both documents describe the eventual full product. **We are not building either of those in full.** We're starting with a much smaller proof-of-concept described below, to validate the core idea before investing in the bigger vision.

## POC scope — decided

Cats only, to start. Two people/flows:

1. **Report a lost cat.** Either:
   - fill in a short form (species, name, photos, color, size, markings, collar, last-seen place/time, contact), or
   - upload one or more Facebook screenshots of the lost-cat post, which get auto-read into the same fields, then confirmed/corrected by the person.

2. **Report a found/seen cat.** Same screenshot-first approach, but with an important twist: the person uploading the screenshot is usually **not** the person who originally posted on Facebook. So this module has to separately capture:
   - facts about the cat itself (photo, color, markings, condition), and
   - facts about the **source** — which Facebook group, roughly when it was posted, who the original poster was — kept distinct from who uploaded it to us.
   - A manual "fill in the gaps" popup covers whatever the automatic reading couldn't reliably get from the screenshot(s).

3. **Manual matching only.** A "check for matches" button — no automatic background matching for the POC. Compares one lost report against the pool of found/seen reports on structured attributes (color, size, markings, location, timing) and returns a ranked list, each with a plain-language reason.

4. **In-app notification only.** When a match is found, the owner sees it by opening their case in the app. No email/SMS for the POC.

5. **Real Google sign-in required**, even at this POC stage (matches the pattern used in FouFou/Buli) — not skipped, despite this being small/internal.

## Explicitly NOT in the POC

Everything else in the source documents is future scope, not now: regional editors, organizational partnerships (vets/shelters/municipalities as integrated partners), volunteer gamification (badges/points), automatic/background matching, email/SMS notifications, multi-species beyond cats, multi-city rollout, any real Facebook API integration, chip-database lookups, economic/paid-tier model.

## What real Facebook screenshots actually look like (from 15 real examples in `/photos`)

This matters because it shapes how the screenshot-reading feature needs to work:

- **Three different identities can appear in one screenshot**, not two: the original poster, a *sharer* if Facebook shows it as "shared from another group" (common), and whoever eventually screenshots it into our app. These need to stay distinguishable, not collapsed into one "reported by" field.
- **Some found/seen reports have no phone number at all** — the only way back to that person is the Facebook post itself (which group, roughly when). So capturing the source (group name + approximate date + poster name) isn't a nice-to-have — for a real chunk of reports, it's the *only* way the owner can ever close the loop.
- **Captions are often cut off** ("...עוד" / "more") — a single screenshot commonly shows only part of the post, so a report having multiple screenshots is the normal case, not an edge case.
- Posts aren't all the same visual style — most are plain Facebook post screenshots, but some are designed flyer-graphics, some include multi-photo collages, one included a video thumbnail (not a usable comparison photo).
- Not all content is Hebrew — at least one real example was Russian with an English translation line.

## Technical direction so far

**Stack (decided):** Keep the same overall pattern as FouFou/Buli/Roy-News — GitHub + Firebase. Firebase project and GitHub repo (`foufou-pets`) already created, empty.

**Modularity (decided):** FouFou grew into a few huge files (~500KB+ each) because its build pipeline hand-concatenates everything into a global namespace, which made module boundaries hard to hold onto. For FouFou-Pets: a real bundler (Vite) with genuine ES modules, so the domain modules Eitan asked for (lost-report, found-report, screenshot-reading, matching, notifications) stay as actual separate, isolated files rather than growing back into one big file over time. Same Firebase backend, same GitHub flow — just a build step that enforces boundaries instead of relying on discipline.

**Photo storage (decided):** Firebase Storage. Compress/resize photos to a low-medium resolution client-side before upload (not full original resolution) — cheaper storage and bandwidth, faster upload on mobile, and full resolution isn't needed for matching/analysis anyway. Same compress-before-upload pattern already used in Eitan's other apps.

**Photo/screenshot analysis (decided):** Use AI vision **once per uploaded report** to extract structured fields (species, color, markings, and — for found reports — source group/date/poster info from the screenshot). The matching step itself is a free, deterministic comparison over those structured fields — it does not call AI — which keeps AI cost fixed and small regardless of how many comparisons happen later, and keeps matching fast. Visual similarity is shown to the human side-by-side, not decided by AI, matching the source docs' own principle that visual comparison should assist, not decide.

**Auth (decided):** Google Sign-In via Firebase Auth, same as other apps.

**Notifications (decided for POC):** In-app only.

**Database (decided):** Firestore, not Realtime Database — its document/collection structure fits "case files," "reports," and "matches" more naturally than a Realtime DB tree.

**Language/i18n (decided):** Two separate concerns, handled differently:
- App interface text: written translatably from day one (all display text in a language file, not hardcoded), same pattern as FouFou's existing Hebrew+English setup. Only Hebrew is active for the POC; adding a country/language later means adding a language file, not rebuilding screens.
- Content people upload (screenshots in Hebrew/Russian/English/etc.): no special handling needed. The AI vision extraction step already reads any language into the same structured fields, and the matching engine only ever compares those structured fields — so a Hebrew lost-report can already match a Russian found-report in the POC itself. The one real gap, left for later: user-written free text isn't auto-translated for someone viewing in a different interface language.

## How Eitan wants to work on this

- He's a product/UX person, not a programmer. He decides product and UX; **technical implementation decisions are Claude's call** — present the recommended approach and why, not a menu of options to choose between (unless it's genuinely a product-level choice, like the notification-channel question above).
- Cost matters a lot — he pays directly for storage and AI-API usage on this project. Every feature touching a paid API or billed-by-volume resource should be designed economically by default, not only when flagged.
- Communicate in plain, product-level language — no code, no file/function names, no implementation narrative, unless he asks for it.

## Not yet decided / open questions

- Exact structured fields to extract per screenshot, and how the matching score/explanation should be presented in the UI.
