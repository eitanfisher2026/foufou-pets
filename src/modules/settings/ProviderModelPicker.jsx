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
 * fallback list (see AI_PROVIDER_KINDS.fallbackModels in matchingEngine.js).
 * Used twice on the match-parameters page (extraction, photo comparison),
 * each with its own provider/model state, since the two tasks can run on
 * entirely different providers - keyInputs/onKeyChange are shared across
 * both instances though, since the underlying API keys are per-provider,
 * not per-task.
 */
export default function ProviderModelPicker({ providerKind, model, onProviderChange, onModelChange, keyInputs, onKeyChange }) {
  const [liveModels, setLiveModels] = useState(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');

  const providerInfo = AI_PROVIDER_KINDS.find((p) => p.value === providerKind) || AI_PROVIDER_KINDS[0];
  const modelOptions = (liveModels || providerInfo.fallbackModels).map((m) => ({ value: m.id, label: m.label }));

  function handleProviderChange(value) {
    setLiveModels(null);
    setModelsError('');
    const next = AI_PROVIDER_KINDS.find((p) => p.value === value);
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
        options={AI_PROVIDER_KINDS.map((p) => ({ value: p.value, label: p.label }))}
      />

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
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loadingModels || (!!providerInfo.keyField && !keyInputs[providerInfo.keyField])}
            className="whitespace-nowrap rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 disabled:opacity-40"
          >
            {loadingModels ? 'בודק...' : '🔄 רענון רשימה'}
          </button>
        </div>
        <SelectField className="w-full max-w-[16rem]" label="בחירת מודל" allowClear={false} value={model} onChange={onModelChange} options={modelOptions} />
        {modelsError && <p className="mt-1 text-xs font-medium text-red-600">{modelsError}</p>}
      </div>
    </div>
  );
}
