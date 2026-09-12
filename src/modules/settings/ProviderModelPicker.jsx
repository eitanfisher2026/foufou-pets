import { useState } from 'react';
import SelectField from '../shared/SelectField.jsx';
import { AI_PROVIDER_KINDS } from '../matching/matchingEngine.js';
import { listProviderModels } from './aiProviderKeysApi.js';

/**
 * One task's AI provider + model choice - a provider dropdown, that
 * provider's own API key field (skipped for Claude, whose key is a Firebase
 * secret, never a form field) with a "get key" link, and a model dropdown
 * with a live "רענון רשימה" action that asks the provider itself what it
 * currently offers, instead of relying only on a small hand-maintained
 * fallback list (see AI_PROVIDER_KINDS.fallbackModels in matchingEngine.js) -
 * skipped for a noRefresh provider (the two embedding providers), which
 * only ever offer one meaningful model. Used twice on the match-parameters
 * page (extraction, photo comparison); `task` filters which provider kinds
 * are even offered (embedding providers are photoCompare-only, since they
 * return a similarity vector, not structured extraction fields).
 * keyInputs/onKeyChange are shared across both instances though, since the
 * underlying API keys are per-provider, not per-task.
 */
export default function ProviderModelPicker({ task, providerKind, model, onProviderChange, onModelChange, keyInputs, onKeyChange }) {
  const [liveModels, setLiveModels] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const availableKinds = AI_PROVIDER_KINDS.filter((p) => p.allowedFor.includes(task));
  const providerInfo = availableKinds.find((p) => p.value === providerKind) || availableKinds[0];
  const modelOptions = (liveModels || providerInfo.fallbackModels).map((m) => ({ value: m.id, label: m.label }));

  function handleProviderChange(value) {
    setLiveModels(null);
    setModelsError('');
    const next = availableKinds.find((p) => p.value === value);
    onProviderChange(value, next?.fallbackModels[0]?.id);
  }

  async function handleRefresh() {
    setLoadingModels(true);
    setModelsError('');
    try {
      const apiKey = providerInfo.keyField ? keyInputs[providerInfo.keyField] : undefined;
      const models = await listProviderModels(providerKind, apiKey);
      setLiveModels(models);
    } catch {
      setModelsError('לא ניתן היה לקבל רשימת מודלים - בדקו שהמפתח תקין.');
    } finally {
      setLoadingModels(false);
    }
  }

  return (
    <div className="space-y-3">
      <SelectField
        className="w-full max-w-[16rem]"
        label="ספק AI"
        allowClear={false}
        value={providerKind}
        onChange={handleProviderChange}
        options={availableKinds.map((p) => ({ value: p.value, label: p.label }))}
      />

      {providerInfo.isEmbedding && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
          שונה מהותית מספקי ה-LLM למעלה: במקום קריאת AI שיפוטית על כל זוג תמונות, כל תמונה מקבלת "טביעת אצבע"
          (embedding) פעם אחת בלבד, בפעם הראשונה שהיא נבדקת - ונשמרת. השוואות הבאות עם אותה תמונה כמעט חינמיות
          ומיידיות. הסף שממנו נחשב "התאמה" הוא הערכה ראשונית, לא מכויל על תמונות אמיתיות מהאפליקציה - כדאי לעקוב
          אחרי איכות ההתאמות בהתחלה.
        </p>
      )}

      {providerInfo.keyField && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs text-slate-500">מפתח API - {providerInfo.label}</span>
            <a
              href={providerInfo.getKeyUrl}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700"
            >
              🔑 קבלת מפתח API ↗
            </a>
          </div>
          <input
            type="password"
            dir="ltr"
            className="input w-full text-left"
            value={keyInputs[providerInfo.keyField] || ''}
            onChange={(e) => onKeyChange(providerInfo.keyField, e.target.value)}
            placeholder={keyInputs[providerInfo.keyField] ? '' : 'לא הוגדר'}
          />
        </div>
      )}

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">מודל</span>
          {!providerInfo.noRefresh && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loadingModels || (!!providerInfo.keyField && !keyInputs[providerInfo.keyField])}
              className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
            >
              {loadingModels ? 'בודק...' : '🔄 רענון רשימה'}
            </button>
          )}
        </div>
        <SelectField className="w-full max-w-[16rem]" label="בחירת מודל" allowClear={false} value={model} onChange={onModelChange} options={modelOptions} />
        {modelsError && <p className="mt-1 text-xs font-medium text-red-600">{modelsError}</p>}
      </div>
    </div>
  );
}
