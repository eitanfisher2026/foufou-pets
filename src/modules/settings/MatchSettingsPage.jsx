import { useEffect, useState } from 'react';
import BackLink from '../shared/BackLink.jsx';
import { getMatchConfig, saveMatchConfig, resetMatchConfig } from '../matching/matchConfigApi.js';
import {
  COMPARABLE_FIELDS,
  COMPARISON_TYPE_LABELS,
  fieldLabel,
  CONFIDENCE_BUCKETS,
  CONFIDENCE_COLOR_PALETTE,
} from '../matching/matchingEngine.js';
import { getColorOptions, saveColorOptions } from '../shared/colorOptionsApi.js';
import { getDogBreedOptions, saveDogBreedOptions } from '../shared/breedOptionsApi.js';
import { SPECIES, SPECIES_LABELS, CAT_COLORS, DOG_COLORS, DOG_BREEDS } from '../shared/collections.js';
import { useConfirm } from '../shared/useConfirm.jsx';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';

const OTHER = 'אחר';

// The AI extraction (functions/index.js) reads its own static copies of
// any customizable vocabulary - not a live Firestore read, kept simple and
// fast on purpose, the same pattern as Roy News' static include/exclude
// word lists. That means it's only ever as current as the last code
// deploy. Only settings that constrain what the AI is allowed to choose
// from (an enum in its extraction schema) belong in this list - most of
// this panel (weights, comparison method, disqualifying, color-similarity
// groups) is pure scoring configuration the AI never needs to know about.
// Breed isn't here: the AI's breed field is free text, not a picklist, so
// there's nothing to drift out of sync with.
const AI_KNOWN_COLORS = {
  [SPECIES.CAT]: new Set(CAT_COLORS.filter((c) => c !== OTHER)),
  [SPECIES.DOG]: new Set(DOG_COLORS.filter((c) => c !== OTHER)),
};

function getAiSyncIssues(species, colorOptions) {
  const known = AI_KNOWN_COLORS[species];
  const issues = [];
  const colorsInSync = colorOptions.length === known.size && colorOptions.every((c) => known.has(c));
  if (!colorsInSync) issues.push(`רשימת הצבעים (${SPECIES_LABELS[species]})`);
  return issues;
}

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
  // Both species' color lists are held in state at once (not re-fetched per
  // tab) so switching the tab below never risks losing an unsaved edit -
  // the single save button at the bottom always saves everything together,
  // same principle as parameters/color-groups already following.
  const [catColorOptions, setCatColorOptions] = useState(null);
  const [dogColorOptions, setDogColorOptions] = useState(null);
  const [dogBreedOptions, setDogBreedOptions] = useState(null);
  const [colorSpecies, setColorSpecies] = useState(SPECIES.CAT);
  const [colorInput, setColorInput] = useState('');
  const [breedInput, setBreedInput] = useState('');
  const [saveError, setSaveError] = useState('');
  const { confirm, dialog } = useConfirm();

  const colorOptions = colorSpecies === SPECIES.DOG ? dogColorOptions : catColorOptions;
  const setColorOptions = colorSpecies === SPECIES.DOG ? setDogColorOptions : setCatColorOptions;

  useEffect(() => {
    getMatchConfig().then(setConfig);
    getColorOptions(SPECIES.CAT).then((colors) => setCatColorOptions(colors.filter((c) => c !== OTHER)));
    getColorOptions(SPECIES.DOG).then((colors) => setDogColorOptions(colors.filter((c) => c !== OTHER)));
    getDogBreedOptions().then((breeds) => setDogBreedOptions(breeds.filter((b) => b !== OTHER)));
  }, []);

  function addColorOption() {
    const value = colorInput.trim();
    if (!value || colorOptions.includes(value)) return;
    setColorOptions((prev) => [...prev, value]);
    setColorInput('');
  }

  function removeColorOption(color) {
    setColorOptions((prev) => prev.filter((c) => c !== color));
    // A color removed from the list shouldn't linger in a similarity group.
    setConfig((prev) => ({
      ...prev,
      colorGroups: (prev.colorGroups || []).map((g) => g.filter((c) => c !== color)),
    }));
  }

  function addBreedOption() {
    const value = breedInput.trim();
    if (!value || dogBreedOptions.includes(value)) return;
    setDogBreedOptions((prev) => [...prev, value]);
    setBreedInput('');
  }

  function removeBreedOption(breed) {
    setDogBreedOptions((prev) => prev.filter((b) => b !== breed));
  }

  function updateParam(index, patch) {
    setConfig((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function removeParam(index) {
    setConfig((prev) => ({ ...prev, parameters: prev.parameters.filter((_, i) => i !== index) }));
  }

  function setConfidenceColor(bucketKey, colorKey) {
    setConfig((prev) => ({ ...prev, confidenceColors: { ...prev.confidenceColors, [bucketKey]: colorKey } }));
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

  // One save button for the whole page - parameters, color-similarity
  // groups, and the color list itself all live in different Firestore docs
  // under the hood, but a single button saving only some of them (while a
  // second, easy-to-miss button saves the rest) is exactly what silently
  // lost the color-groups edit last time. Everything on this page is saved
  // together, every time.
  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await Promise.all([
        saveMatchConfig(config),
        saveColorOptions(SPECIES.CAT, catColorOptions),
        saveColorOptions(SPECIES.DOG, dogColorOptions),
        saveDogBreedOptions(dogBreedOptions),
      ]);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2500);
    } catch (err) {
      // A failed save used to fail completely silently - the button just
      // went back to normal with no explanation, so a real failure looked
      // identical to a successful save unless you specifically noticed the
      // checkmark never appeared. Now it's impossible to miss.
      setSaveError(`השמירה נכשלה: ${err.message || 'שגיאה לא ידועה'}. השינויים לא נשמרו - נסו שוב.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const ok = await confirm(
      'לאפס את כל הגדרות ההתאמה לברירת המחדל, כולל רשימות הצבעים והגזעים? כל שינוי שנעשה כאן יימחק.',
      { confirmLabel: 'איפוס' }
    );
    if (!ok) return;
    const catDefaults = CAT_COLORS.filter((c) => c !== OTHER);
    const dogDefaults = DOG_COLORS.filter((c) => c !== OTHER);
    const breedDefaults = DOG_BREEDS.filter((b) => b !== OTHER);
    const [defaults] = await Promise.all([
      resetMatchConfig(),
      saveColorOptions(SPECIES.CAT, catDefaults),
      saveColorOptions(SPECIES.DOG, dogDefaults),
      saveDogBreedOptions(breedDefaults),
    ]);
    setConfig(defaults);
    setCatColorOptions(catDefaults);
    setDogColorOptions(dogDefaults);
    setDogBreedOptions(breedDefaults);
  }

  if (!config || !catColorOptions || !dogColorOptions || !dogBreedOptions) {
    return <p className="p-4 text-slate-500">טוען...</p>;
  }

  const enabledWeightSum = config.parameters.filter((p) => p.enabled).reduce((sum, p) => sum + Number(p.weight || 0), 0);
  const aiSyncIssues = [
    ...getAiSyncIssues(SPECIES.CAT, catColorOptions),
    ...getAiSyncIssues(SPECIES.DOG, dogColorOptions),
  ];

  return (
    <div className="p-4 pb-24">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">הגדרות אלגוריתם ההתאמה</h1>
      <p className="mb-6 text-sm text-slate-500">
        כל פרמטר משווה שדה אחד בין תיק החיפוש לדיווח, לפי משקל ושיטת השוואה. אין צורך למלא כל שדה - שדות חסרים פשוט מדולגים.
      </p>

      {aiSyncIssues.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">נדרש עדכון קוד כדי שזיהוי ה-AI מצילומי מסך יכיר גם את: {aiSyncIssues.join(', ')}</p>
          <p className="mt-1 text-xs text-amber-700">
            ה-AI קורא מתוך רשימה קבועה בקוד, לא מההגדרות כאן ישירות - עד שהקוד יעודכן ויפורס מחדש, הוא ימשיך להשתמש
            ברשימה הישנה בזיהוי אוטומטי (הדיווח הידני כאן כבר מעודכן). בקשו מקלוד לעדכן ולפרוס.
          </p>
        </div>
      )}

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

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-700">רשימת הצבעים האפשריים</h2>
      <p className="mb-3 text-sm text-slate-500">
        אלו האפשרויות שמופיעות בתפריט "צבע" בכל טפסי הדיווח, וגם מה שה-AI מתבקש לבחור מתוכן כשהוא קורא צילום מסך. "אחר"
        תמיד קיים כברירת מחדל קבועה ולא ניתן להסרה. לחתולים וכלבים יש רשימות נפרדות.
      </p>
      <div className="mb-3 flex gap-2">
        {Object.values(SPECIES).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setColorSpecies(s)}
            className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium ${
              colorSpecies === s ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 text-slate-600'
            }`}
          >
            {SPECIES_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {colorOptions.map((color) => (
            <span key={color} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {color}
              <button
                type="button"
                onClick={() => removeColorOption(color)}
                className="text-red-600"
                aria-label={`הסרת ${color}`}
              >
                ✕
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-400">אחר (קבוע)</span>
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            placeholder="שם צבע חדש"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addColorOption();
              }
            }}
          />
          <button
            type="button"
            onClick={addColorOption}
            className="rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600"
          >
            הוספה
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          שינויים כאן נשמרים יחד עם שאר ההגדרות בעמוד, בכפתור "שמירת ההגדרות" למטה.
        </p>
      </div>

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
              {colorOptions.map((color) => (
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

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-700">רשימת גזעי הכלבים האפשריים</h2>
      <p className="mb-3 text-sm text-slate-500">
        אלו האפשרויות שמופיעות בתפריט "גזע" בטפסי כלב. חתולים לא מקבלים רשימה כזו - גזע חתול נשאר טקסט חופשי, כי
        רוב חתולי הרחוב הם מעורבים ללא גזע מזוהה. "אחר" תמיד קיים כברירת מחדל קבועה ולא ניתן להסרה.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap gap-2">
          {dogBreedOptions.map((breed) => (
            <span key={breed} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
              {breed}
              <button
                type="button"
                onClick={() => removeBreedOption(breed)}
                className="text-red-600"
                aria-label={`הסרת ${breed}`}
              >
                ✕
              </button>
            </span>
          ))}
          <span className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-400">אחר (קבוע)</span>
        </div>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={breedInput}
            onChange={(e) => setBreedInput(e.target.value)}
            placeholder="שם גזע חדש"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addBreedOption();
              }
            }}
          />
          <button
            type="button"
            onClick={addBreedOption}
            className="rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600"
          >
            הוספה
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          שינויים כאן נשמרים יחד עם שאר ההגדרות בעמוד, בכפתור "שמירת ההגדרות" למטה.
        </p>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-700">צבעי רמת התאמה</h2>
      <p className="mb-3 text-sm text-slate-500">
        ציון גולמי (כמו "45/100") נראה מדויק יותר משהוא באמת - במקום זאת, כל התאמה מוצגת ברמת סבירות. אפשר לבחור איזה
        צבע מייצג כל רמה.
      </p>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        {CONFIDENCE_BUCKETS.map((bucket) => (
          <div key={bucket.key} className="flex items-center justify-between gap-2">
            <ConfidenceBadge score={bucket.min} confidenceColors={config.confidenceColors} />
            <select
              className="input w-auto"
              value={config.confidenceColors?.[bucket.key] || 'gray'}
              onChange={(e) => setConfidenceColor(bucket.key, e.target.value)}
            >
              {Object.entries(CONFIDENCE_COLOR_PALETTE).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        {saveError && <p className="mx-auto mb-2 max-w-2xl text-sm font-medium text-red-600">{saveError}</p>}
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
            param.comparisonType === 'exactSkipDefault' ||
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
