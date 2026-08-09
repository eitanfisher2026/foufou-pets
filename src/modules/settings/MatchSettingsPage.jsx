import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMatchConfig, saveMatchConfig, resetMatchConfig } from '../matching/matchConfigApi.js';
import { COMPARABLE_FIELDS, COMPARISON_TYPE_LABELS, fieldLabel } from '../matching/matchingEngine.js';
import { CAT_COLORS } from '../shared/collections.js';
import { useConfirm } from '../shared/useConfirm.jsx';

// "אחר" (other) is an AI catch-all, not a real color - grouping it with
// anything wouldn't mean anything, so it's left out of the groupable list.
const GROUPABLE_COLORS = CAT_COLORS.filter((c) => c !== 'אחר');

/**
 * Lets the matching algorithm be tuned without a code change: reorder is
 * irrelevant to the math, but weight, on/off, and which field/comparison
 * method each parameter uses are all pure configuration, stored in
 * Firestore at config/matchWeights and read fresh on every "check matches"
 * click. Adding a parameter for a field not in COMPARABLE_FIELDS still
 * needs real engineering (a new form field) - this panel can only wire up
 * fields that already exist somewhere in the data.
 */
export default function MatchSettingsPage() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    getMatchConfig().then(setConfig);
  }, []);

  function updateParam(index, patch) {
    setConfig((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function removeParam(index) {
    setConfig((prev) => ({ ...prev, parameters: prev.parameters.filter((_, i) => i !== index) }));
  }

  function addColorGroup() {
    setConfig((prev) => ({ ...prev, colorGroups: [...(prev.colorGroups || []), []] }));
  }

  function removeColorGroup(index) {
    setConfig((prev) => ({ ...prev, colorGroups: prev.colorGroups.filter((_, i) => i !== index) }));
  }

  function toggleColorInGroup(groupIndex, color) {
    setConfig((prev) => ({
      ...prev,
      colorGroups: prev.colorGroups.map((g, i) =>
        i === groupIndex ? (g.includes(color) ? g.filter((c) => c !== color) : [...g, color]) : g
      ),
    }));
  }

  function addParam() {
    setConfig((prev) => ({
      ...prev,
      parameters: [
        ...prev.parameters,
        {
          key: `custom_${Date.now()}`,
          label: 'פרמטר חדש',
          weight: 5,
          enabled: true,
          comparisonType: 'exact',
          lostField: COMPARABLE_FIELDS[0].field,
          foundField: COMPARABLE_FIELDS[0].field,
        },
      ],
    }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveMatchConfig(config);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const ok = await confirm('לאפס את כל הגדרות ההתאמה לברירת המחדל? כל שינוי שנעשה כאן יימחק.', { confirmLabel: 'איפוס' });
    if (!ok) return;
    const defaults = await resetMatchConfig();
    setConfig(defaults);
  }

  if (!config) return <p className="p-4 text-slate-500">טוען...</p>;

  const enabledWeightSum = config.parameters.filter((p) => p.enabled).reduce((sum, p) => sum + Number(p.weight || 0), 0);

  return (
    <div className="mx-auto max-w-2xl p-4 pb-24">
      <Link to="/" className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </Link>
      <h1 className="mb-1 text-xl font-bold text-slate-800">הגדרות אלגוריתם ההתאמה</h1>
      <p className="mb-6 text-sm text-slate-500">
        כל פרמטר משווה שדה אחד בין תיק החיפוש לדיווח, לפי משקל ושיטת השוואה. אין צורך למלא כל שדה - שדות חסרים פשוט מדולגים.
      </p>

      <label className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
        <input
          type="checkbox"
          className="mt-1"
          checked={config.relativeScoring}
          onChange={(e) => setConfig((prev) => ({ ...prev, relativeScoring: e.target.checked }))}
        />
        <span>
          <span className="font-medium">ניקוד יחסי למידע שמולא</span>
          <br />
          כשמסומן, הציון מחושב יחסית למשקל השדות שמולאו בפועל משני הצדדים (כך שדיווח דל פרטים אך מדויק לא ייפגע רק בגלל
          שיש בו פחות מידע). כשלא מסומן, הציון הוא סכום ישיר מתוך 100.
        </span>
      </label>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-700">פרמטרים ({config.parameters.length})</h2>
        <span className="text-xs text-slate-400">סכום משקלים פעילים: {enabledWeightSum}</span>
      </div>

      <div className="space-y-3">
        {config.parameters.map((p, i) => (
          <ParameterRow key={p.key} param={p} onChange={(patch) => updateParam(i, patch)} onRemove={() => removeParam(i)} />
        ))}
      </div>

      <button
        type="button"
        onClick={addParam}
        className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600"
      >
        + הוספת פרמטר
      </button>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-700">קבוצות צבעים דומים</h2>
      <p className="mb-3 text-sm text-slate-500">
        צבעים שנמצאים באותה קבוצה לא נחשבים כאי-התאמה כשמשווים ביניהם (רק כהתאמה חלקית) - מיועד לצבעים שקל לבלבל ביניהם
        בגלל תאורת הצילום, כמו לבן/אפור, ולא לצבעים שבאמת שונים. רלוונטי לפרמטרים שמשתמשים בשיטת ההשוואה "צבע".
      </p>
      <div className="space-y-3">
        {(config.colorGroups || []).map((group, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600">קבוצה {i + 1}</span>
              <button type="button" onClick={() => removeColorGroup(i)} className="text-sm text-red-600" aria-label="הסרת קבוצה">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {GROUPABLE_COLORS.map((color) => (
                <label
                  key={color}
                  className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                    group.includes(color) ? 'border-slate-800 bg-slate-100' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  <input type="checkbox" checked={group.includes(color)} onChange={() => toggleColorInGroup(i, color)} />
                  {color}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addColorGroup}
        className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600"
      >
        + הוספת קבוצת צבעים
      </button>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'שומרים...' : savedNotice ? 'נשמר ✓' : 'שמירת ההגדרות'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
          >
            איפוס לברירת מחדל
          </button>
        </div>
      </div>

      {dialog}
    </div>
  );
}

function ParameterRow({ param, onChange, onRemove }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-3 ${param.enabled ? '' : 'opacity-50'}`}>
      <div className="mb-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={param.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          aria-label="פעיל"
        />
        <input
          className="input flex-1"
          value={param.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="שם הפרמטר"
        />
        <label className="whitespace-nowrap text-xs text-slate-500">
          משקל
          <input
            type="number"
            min="0"
            className="input mr-1 inline-block w-16"
            value={param.weight}
            onChange={(e) => onChange({ weight: Number(e.target.value) })}
          />
        </label>
        <button type="button" onClick={onRemove} className="text-sm text-red-600" aria-label="הסרת פרמטר">
          ✕
        </button>
      </div>

      <p className="mb-2 text-xs text-slate-400">
        משווה {fieldLabel(param.lostField)} מול {fieldLabel(param.foundField)} · {COMPARISON_TYPE_LABELS[param.comparisonType]}
      </p>

      <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs text-slate-500 underline">
        {showAdvanced ? 'הסתרת שדות מתקדמים' : 'שינוי אילו שדות מושווים'}
      </button>

      {showAdvanced && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <label className="block">
            <span className="mb-1 block text-slate-500">שדה בתיק החיפוש</span>
            <select className="input" value={param.lostField} onChange={(e) => onChange({ lostField: e.target.value })}>
              {COMPARABLE_FIELDS.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-500">שדה בדיווח</span>
            <select className="input" value={param.foundField} onChange={(e) => onChange({ foundField: e.target.value })}>
              {COMPARABLE_FIELDS.map((f) => (
                <option key={f.field} value={f.field}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-500">שיטת השוואה</span>
            <select
              className="input"
              value={param.comparisonType}
              onChange={(e) => onChange({ comparisonType: e.target.value })}
            >
              {Object.entries(COMPARISON_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {(param.comparisonType === 'exact' ||
            param.comparisonType === 'booleanTrait' ||
            param.comparisonType === 'colorMatch') && (
            <>
              <label className="block">
                <span className="mb-1 block text-slate-500">קנס באי-התאמה (0 = ללא קנס)</span>
                <input
                  type="number"
                  min="0"
                  className="input"
                  disabled={param.disqualifying}
                  value={param.mismatchPenalty || 0}
                  onChange={(e) => onChange({ mismatchPenalty: Number(e.target.value) })}
                />
              </label>
              <label className="col-span-2 flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={!!param.disqualifying}
                  onChange={(e) => onChange({ disqualifying: e.target.checked })}
                />
                <span>
                  אי-התאמה בפרמטר זה פוסלת את ההתאמה כליל (ציון 0), לא רק מפחיתה ממנו - מתאים לפרמטר שאם הוא לא תואם, זו
                  כמעט בוודאות לא אותה חתולה
                </span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}
