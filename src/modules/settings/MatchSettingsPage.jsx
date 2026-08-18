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
import { getBreedOptions, saveBreedOptions } from '../shared/breedOptionsApi.js';
import { getPatternOptions, savePatternOptions } from '../shared/patternOptionsApi.js';
import { SPECIES, SPECIES_LABELS, CAT_COLORS, DOG_COLORS, CAT_BREEDS, DOG_BREEDS, CAT_PATTERNS } from '../shared/collections.js';
import { useConfirm } from '../shared/useConfirm.jsx';
import ConfidenceBadge from '../shared/ConfidenceBadge.jsx';
import SelectField from '../shared/SelectField.jsx';

const OTHER = 'אחר';

// A starting point for "קבוצות גזעים דומים" below, not a fixed system
// default (unlike DEFAULT_BREED_GROUPS in matchingEngine.js, which starts
// empty for both species) - these are specific breed pairs that are
// genuinely easy to mix up from a phone photo (not just related breeds),
// offered as a one-click fill-in via seedRecommendedBreedGroups so an admin
// doesn't have to hand-build ~10 groups through the checkboxes below.
// Editable/removable like any other group once seeded.
const RECOMMENDED_BREED_GROUPS = {
  [SPECIES.DOG]: [
    ['לברדור', 'גולדן רטריבר'],
    ['מלטז', 'שיצו', 'יורקשייר טרייר'],
    ['דוברמן', 'רוטוויילר'],
    ['בוקסר', 'אמריקן סטפורדשייר (פיטבול)'],
    ['בורדר קולי', 'קולי'],
    ['ג׳ק ראסל', 'ביגל'],
  ],
  [SPECIES.CAT]: [
    ['מיין קון', 'יער נורווגי'],
    ['בריטי/סקוטי', 'אמריקן שורטהייר'],
    ['רוסי כחול', 'בריטי/סקוטי'],
    ['אבסיני', 'בנגלי'],
  ],
};

// A one-time nudge for a config someone already saved before these
// parameters' comparison logic improved in code (see ageClass/collarBell/
// furType in DEFAULT_MATCH_CONFIG) - a saved parameter is never auto-
// upgraded by mergeNewDefaultParameters in matchConfigApi.js (that only
// adds parameters missing entirely, e.g. a brand new one), so anyone who
// saved this page before a fix would otherwise keep the old behavior
// forever. Applied via applyRecommendedParameterUpgrades below; harmless to
// click more than once.
const RECOMMENDED_PARAMETER_UPGRADES = {
  ageClass: { comparisonType: 'exactSkipDefault', defaultValue: 'adult' },
  collarBell: { comparisonType: 'booleanTrait' },
  furType: { disqualifying: true },
  breed: { disqualifying: true },
};

function sameGroupContents(a, b) {
  return a.length === b.length && a.every((breed) => b.includes(breed));
}

// The AI extraction (functions/index.js) reads its own static copies of
// any customizable vocabulary - not a live Firestore read, kept simple and
// fast on purpose, the same pattern as Roy News' static include/exclude
// word lists. That means it's only ever as current as the last code
// deploy. Only settings that constrain what the AI is allowed to choose
// from (an enum in its extraction schema) belong in this list - most of
// this panel (weights, comparison method, disqualifying, color-similarity
// groups) is pure scoring configuration the AI never needs to know about.
// Breed is here too now: both species' breed fields are real AI-enum
// picklists (see functions/index.js), not free text.
const AI_KNOWN_COLORS = {
  [SPECIES.CAT]: new Set(CAT_COLORS.filter((c) => c !== OTHER)),
  [SPECIES.DOG]: new Set(DOG_COLORS.filter((c) => c !== OTHER)),
};
const AI_KNOWN_BREEDS = {
  [SPECIES.CAT]: new Set(CAT_BREEDS.filter((b) => b !== OTHER)),
  [SPECIES.DOG]: new Set(DOG_BREEDS.filter((b) => b !== OTHER)),
};
// Cat-only, unlike colors/breeds above - dogs don't get a pattern field.
const AI_KNOWN_PATTERNS = new Set(CAT_PATTERNS.filter((p) => p !== OTHER));

function getAiSyncIssues(species, colorOptions, breedOptions) {
  const knownColors = AI_KNOWN_COLORS[species];
  const knownBreeds = AI_KNOWN_BREEDS[species];
  const issues = [];
  const colorsInSync = colorOptions.length === knownColors.size && colorOptions.every((c) => knownColors.has(c));
  if (!colorsInSync) issues.push(`רשימת הצבעים (${SPECIES_LABELS[species]})`);
  const breedsInSync = breedOptions.length === knownBreeds.size && breedOptions.every((b) => knownBreeds.has(b));
  if (!breedsInSync) issues.push(`רשימת הגזעים (${SPECIES_LABELS[species]})`);
  return issues;
}

function getPatternAiSyncIssue(patternOptions) {
  const inSync =
    patternOptions.length === AI_KNOWN_PATTERNS.size && patternOptions.every((p) => AI_KNOWN_PATTERNS.has(p));
  return inSync ? [] : ['רשימת תבניות הפרווה (חתולים)'];
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
  const [catBreedOptions, setCatBreedOptions] = useState(null);
  const [dogBreedOptions, setDogBreedOptions] = useState(null);
  // Cat-only, so no per-species pair like colors/breeds above.
  const [patternOptions, setPatternOptions] = useState(null);
  const [listSpecies, setColorSpecies] = useState(SPECIES.CAT);
  const [colorInput, setColorInput] = useState('');
  const [breedInput, setBreedInput] = useState('');
  const [patternInput, setPatternInput] = useState('');
  const [saveError, setSaveError] = useState('');
  const { confirm, dialog } = useConfirm();

  const colorOptions = listSpecies === SPECIES.DOG ? dogColorOptions : catColorOptions;
  const setColorOptions = listSpecies === SPECIES.DOG ? setDogColorOptions : setCatColorOptions;
  const breedOptions = listSpecies === SPECIES.DOG ? dogBreedOptions : catBreedOptions;
  const setBreedOptions = listSpecies === SPECIES.DOG ? setDogBreedOptions : setCatBreedOptions;

  useEffect(() => {
    getMatchConfig().then(setConfig);
    getColorOptions(SPECIES.CAT).then((colors) => setCatColorOptions(colors.filter((c) => c !== OTHER)));
    getColorOptions(SPECIES.DOG).then((colors) => setDogColorOptions(colors.filter((c) => c !== OTHER)));
    getBreedOptions(SPECIES.CAT).then((breeds) => setCatBreedOptions(breeds.filter((b) => b !== OTHER)));
    getBreedOptions(SPECIES.DOG).then((breeds) => setDogBreedOptions(breeds.filter((b) => b !== OTHER)));
    getPatternOptions().then((patterns) => setPatternOptions(patterns.filter((p) => p !== OTHER)));
  }, []);

  function addColorOption() {
    const value = colorInput.trim();
    if (!value || colorOptions.includes(value)) return;
    setColorOptions((prev) => [...prev, value]);
    setColorInput('');
  }

  function removeColorOption(color) {
    setColorOptions((prev) => prev.filter((c) => c !== color));
    // A color removed from the list shouldn't linger in a similarity group -
    // only this species' groups, colorGroups is keyed by species (see
    // matchingEngine.js).
    setConfig((prev) => ({
      ...prev,
      colorGroups: {
        ...prev.colorGroups,
        [listSpecies]: (prev.colorGroups?.[listSpecies] || []).map((g) => g.filter((c) => c !== color)),
      },
    }));
  }

  function addBreedOption() {
    const value = breedInput.trim();
    if (!value || breedOptions.includes(value)) return;
    setBreedOptions((prev) => [...prev, value]);
    setBreedInput('');
  }

  function removeBreedOption(breed) {
    setBreedOptions((prev) => prev.filter((b) => b !== breed));
    // Same reasoning as removeColorOption - a breed removed from the list
    // shouldn't linger in a similarity group. breedGroups is keyed by
    // species, same as colorGroups (see matchingEngine.js).
    setConfig((prev) => ({
      ...prev,
      breedGroups: {
        ...prev.breedGroups,
        [listSpecies]: (prev.breedGroups?.[listSpecies] || []).map((g) => g.filter((b) => b !== breed)),
      },
    }));
  }

  function addPatternOption() {
    const value = patternInput.trim();
    if (!value || patternOptions.includes(value)) return;
    setPatternOptions((prev) => [...prev, value]);
    setPatternInput('');
  }

  function removePatternOption(pattern) {
    setPatternOptions((prev) => prev.filter((p) => p !== pattern));
  }

  function updateParam(index, patch) {
    setConfig((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  // Removing a parameter loses its weight/comparison-method/field setup,
  // not just a label - a one-click ✕ with no confirmation is exactly how
  // "color" got deleted by mistake. A default parameter (like color) does
  // come back on its own next load (see mergeNewDefaultParameters in
  // matchConfigApi.js), but a custom one wouldn't, and either way losing
  // one by mis-click still shouldn't be a single click.
  async function removeParam(index) {
    const param = config.parameters[index];
    const ok = await confirm(`להסיר את הפרמטר "${param.label}"? הוא יפסיק להשפיע על ההתאמות עד שיתווסף מחדש.`, {
      confirmLabel: 'הסרה',
      danger: true,
    });
    if (!ok) return;
    setConfig((prev) => ({ ...prev, parameters: prev.parameters.filter((_, i) => i !== index) }));
  }

  function setConfidenceColor(bucketKey, colorKey) {
    setConfig((prev) => ({ ...prev, confidenceColors: { ...prev.confidenceColors, [bucketKey]: colorKey } }));
  }

  function addColorGroup() {
    setConfig((prev) => ({
      ...prev,
      colorGroups: { ...prev.colorGroups, [listSpecies]: [...(prev.colorGroups?.[listSpecies] || []), []] },
    }));
  }

  function removeColorGroup(index) {
    setConfig((prev) => ({
      ...prev,
      colorGroups: { ...prev.colorGroups, [listSpecies]: prev.colorGroups[listSpecies].filter((_, i) => i !== index) },
    }));
  }

  function toggleColorInGroup(groupIndex, color) {
    setConfig((prev) => ({
      ...prev,
      colorGroups: {
        ...prev.colorGroups,
        [listSpecies]: prev.colorGroups[listSpecies].map((g, i) =>
          i === groupIndex ? (g.includes(color) ? g.filter((c) => c !== color) : [...g, color]) : g
        ),
      },
    }));
  }

  function addBreedGroup() {
    setConfig((prev) => ({
      ...prev,
      breedGroups: { ...prev.breedGroups, [listSpecies]: [...(prev.breedGroups?.[listSpecies] || []), []] },
    }));
  }

  function removeBreedGroup(index) {
    setConfig((prev) => ({
      ...prev,
      breedGroups: { ...prev.breedGroups, [listSpecies]: prev.breedGroups[listSpecies].filter((_, i) => i !== index) },
    }));
  }

  function toggleBreedInGroup(groupIndex, breed) {
    setConfig((prev) => ({
      ...prev,
      breedGroups: {
        ...prev.breedGroups,
        [listSpecies]: prev.breedGroups[listSpecies].map((g, i) =>
          i === groupIndex ? (g.includes(breed) ? g.filter((b) => b !== breed) : [...g, breed]) : g
        ),
      },
    }));
  }

  // Fills in RECOMMENDED_BREED_GROUPS for both species at once (not just
  // whichever tab is currently open) - skips any group whose exact breed
  // set is already present, so clicking this again after editing doesn't
  // re-add duplicates. Only touches local state; still needs "שמירת
  // ההגדרות" below like every other edit on this page.
  function seedRecommendedBreedGroups() {
    setConfig((prev) => {
      const nextBreedGroups = { ...prev.breedGroups };
      for (const species of Object.values(SPECIES)) {
        const existing = prev.breedGroups?.[species] || [];
        const toAdd = (RECOMMENDED_BREED_GROUPS[species] || []).filter(
          (group) => !existing.some((g) => sameGroupContents(g, group))
        );
        nextBreedGroups[species] = [...existing, ...toAdd];
      }
      return { ...prev, breedGroups: nextBreedGroups };
    });
  }

  function applyRecommendedParameterUpgrades() {
    setConfig((prev) => ({
      ...prev,
      parameters: prev.parameters.map((p) =>
        RECOMMENDED_PARAMETER_UPGRADES[p.key] ? { ...p, ...RECOMMENDED_PARAMETER_UPGRADES[p.key] } : p
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
        saveBreedOptions(SPECIES.CAT, catBreedOptions),
        saveBreedOptions(SPECIES.DOG, dogBreedOptions),
        savePatternOptions(patternOptions),
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
      'לאפס את כל הגדרות ההתאמה לברירת המחדל, כולל רשימות הצבעים, הגזעים ותבניות הפרווה? כל שינוי שנעשה כאן יימחק.',
      { confirmLabel: 'איפוס' }
    );
    if (!ok) return;
    const catColorDefaults = CAT_COLORS.filter((c) => c !== OTHER);
    const dogColorDefaults = DOG_COLORS.filter((c) => c !== OTHER);
    const catBreedDefaults = CAT_BREEDS.filter((b) => b !== OTHER);
    const dogBreedDefaults = DOG_BREEDS.filter((b) => b !== OTHER);
    const patternDefaults = CAT_PATTERNS.filter((p) => p !== OTHER);
    const [defaults] = await Promise.all([
      resetMatchConfig(),
      saveColorOptions(SPECIES.CAT, catColorDefaults),
      saveColorOptions(SPECIES.DOG, dogColorDefaults),
      saveBreedOptions(SPECIES.CAT, catBreedDefaults),
      saveBreedOptions(SPECIES.DOG, dogBreedDefaults),
      savePatternOptions(patternDefaults),
    ]);
    setConfig(defaults);
    setCatColorOptions(catColorDefaults);
    setDogColorOptions(dogColorDefaults);
    setCatBreedOptions(catBreedDefaults);
    setDogBreedOptions(dogBreedDefaults);
    setPatternOptions(patternDefaults);
  }

  if (!config || !catColorOptions || !dogColorOptions || !catBreedOptions || !dogBreedOptions || !patternOptions) {
    return <p className="p-4 text-slate-500">טוען...</p>;
  }

  const enabledWeightSum = config.parameters.filter((p) => p.enabled).reduce((sum, p) => sum + Number(p.weight || 0), 0);
  const aiSyncIssues = [
    ...getAiSyncIssues(SPECIES.CAT, catColorOptions, catBreedOptions),
    ...getAiSyncIssues(SPECIES.DOG, dogColorOptions, dogBreedOptions),
    ...getPatternAiSyncIssue(patternOptions),
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

      <button
        type="button"
        onClick={applyRecommendedParameterUpgrades}
        className="mb-3 w-full rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600"
      >
        עדכון "גור/מבוגר", "פעמון על הקולר", "סוג פרווה" ו"גזע" לשיטת השוואה מומלצת (מתעלם מהתאמה על הערך הנפוץ, וסוג פרווה/גזע שונה בין שני גזעים ספציפיים פוסל התאמה כמו צבע)
      </button>

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

      <h2 className="mb-1 mt-8 text-lg font-semibold text-slate-700">הגדרות לפי סוג חיה</h2>
      <p className="mb-3 text-sm text-slate-500">
        צבעים, קבוצות צבעים דומים, גזעים, ותבניות פרווה - לכל סוג חיה יש הגדרות משלו. הבחירה כאן קובעת מה מוצג בכל
        הסעיפים למטה, עד שתבחרו סוג אחר.
      </p>
      <div className="mb-4 flex gap-2">
        {Object.values(SPECIES).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setColorSpecies(s)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
              listSpecies === s ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 text-slate-600'
            }`}
          >
            {SPECIES_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="space-y-6 rounded-2xl border-2 border-slate-200 p-4">
        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-700">רשימת הצבעים האפשריים</h3>
          <p className="mb-3 text-sm text-slate-500">
            אלו האפשרויות שמופיעות בתפריט "צבע" בטפסי {SPECIES_LABELS[listSpecies]}, וגם מה שה-AI מתבקש לבחור מתוכן
            כשהוא קורא צילום מסך. "אחר" תמיד קיים כברירת מחדל קבועה ולא ניתן להסרה.
          </p>
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
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-700">קבוצות צבעים דומים</h3>
          <p className="mb-3 text-sm text-slate-500">
            צבעים שנמצאים באותה קבוצה לא נחשבים כאי-התאמה כשמשווים ביניהם (רק כהתאמה חלקית) - מיועד לצבעים שקל לבלבל
            ביניהם בגלל תאורת הצילום, כמו לבן/אפור, ולא לצבעים שבאמת שונים. רלוונטי לפרמטרים שמשתמשים בשיטת ההשוואה
            "צבע".
          </p>
          <div className="space-y-3">
            {(config.colorGroups?.[listSpecies] || []).map((group, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">קבוצה {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeColorGroup(i)}
                    className="text-sm text-red-600"
                    aria-label="הסרת קבוצה"
                  >
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
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-700">רשימת הגזעים האפשריים</h3>
          <p className="mb-3 text-sm text-slate-500">
            אלו האפשרויות שמופיעות בתפריט "גזע" בטפסי {SPECIES_LABELS[listSpecies]}, וגם מה שה-AI מתבקש לבחור מתוכן
            כשהוא קורא צילום מסך. הרשומה הראשונה ברשימה היא ברירת המחדל לחיה ללא גזע מזוהה. "אחר" תמיד קיים כברירת
            מחדל קבועה ולא ניתן להסרה.
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              {breedOptions.map((breed) => (
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
          </div>
        </div>

        <div>
          <h3 className="mb-1 text-base font-semibold text-slate-700">קבוצות גזעים דומים</h3>
          <p className="mb-3 text-sm text-slate-500">
            גזעים שנמצאים באותה קבוצה מקבלים ציון בינוני כשמשווים ביניהם, במקום לפסול את ההתאמה - מיועד לגזעים שקל
            לבלבל ביניהם בתמונה, לא לגזעים שבאמת שונים. רלוונטי לפרמטרים שמשתמשים בשיטת ההשוואה "גזע". השוואת גזע
            מדלגת (לא ציון גבוה ולא נמוך) כשאחד הצדדים לפחות מסומן כ"מעורב" (ברירת המחדל) - אין דרך לדעת. אבל ברגע
            ששני הצדדים ציינו גזע ספציפי, ההשוואה מחייבת: גזע זהה מקבל ציון גבוה, זוג גזעים שהוגדר כאן כקבוצה מקבל
            ציון בינוני, וכל זוג גזעים ספציפיים אחר פוסל את ההתאמה כליל - בדיוק כמו אי-התאמת צבע.
          </p>
          <div className="space-y-3">
            {(config.breedGroups?.[listSpecies] || []).map((group, i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">קבוצה {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeBreedGroup(i)}
                    className="text-sm text-red-600"
                    aria-label="הסרת קבוצה"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {breedOptions.map((breed) => (
                    <label
                      key={breed}
                      className={`flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                        group.includes(breed) ? 'border-slate-800 bg-slate-100' : 'border-slate-200 text-slate-500'
                      }`}
                    >
                      <input type="checkbox" checked={group.includes(breed)} onChange={() => toggleBreedInGroup(i, breed)} />
                      {breed}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={seedRecommendedBreedGroups}
              className="flex-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600"
            >
              + הוספת קבוצות מומלצות (חתולים וכלבים)
            </button>
            <button
              type="button"
              onClick={addBreedGroup}
              className="flex-1 rounded-xl border border-dashed border-slate-300 py-2 text-sm font-medium text-slate-600"
            >
              + הוספת קבוצת גזעים
            </button>
          </div>
        </div>

        {listSpecies === SPECIES.CAT && (
          <div>
            <h3 className="mb-1 text-base font-semibold text-slate-700">רשימת תבניות הפרווה האפשריות</h3>
            <p className="mb-3 text-sm text-slate-500">
              אלו האפשרויות שמופיעות בתפריט "תבנית פרווה" בטפסי חתול - שדה נפרד מ"צבע", לתבנית עצמה (טאבי, קליקו,
              טורטי, טוקסידו, פוינט וכו'). שדה קיים לחתולים בלבד - לא מופיע בטפסי כלב כלל. "אחיד" הוא ברירת המחדל
              לחתול ללא תבנית מיוחדת, ו"אחר" תמיד קיים כברירת מחדל קבועה ולא ניתן להסרה.
            </p>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="mb-2 flex flex-wrap gap-2">
                {patternOptions.map((pattern) => (
                  <span key={pattern} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">
                    {pattern}
                    <button
                      type="button"
                      onClick={() => removePatternOption(pattern)}
                      className="text-red-600"
                      aria-label={`הסרת ${pattern}`}
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
                  value={patternInput}
                  onChange={(e) => setPatternInput(e.target.value)}
                  placeholder="שם תבנית חדשה"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addPatternOption();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addPatternOption}
                  className="rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600"
                >
                  הוספה
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400">שינויים בכל הסעיפים כאן נשמרים יחד עם שאר ההגדרות בעמוד, בכפתור "שמירת ההגדרות" למטה.</p>
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
            <SelectField
              className="w-auto"
              label="בחירת צבע"
              allowClear={false}
              value={config.confidenceColors?.[bucket.key] || 'gray'}
              onChange={(v) => setConfidenceColor(bucket.key, v)}
              options={Object.entries(CONFIDENCE_COLOR_PALETTE).map(([key, { label }]) => ({ value: key, label }))}
            />
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

// A number input bound straight to value={param.weight} (with onChange
// coercing via Number(e.target.value)) forced the field to "0" the instant
// it went empty - Number('') is 0 - so selecting the old value and retyping
// looked broken: the field jumped to 0 before a single new digit landed.
// This keeps its own text buffer so an in-progress edit (including a
// momentarily empty field) can exist without being coerced into a real
// number every keystroke; only a value that actually parses gets pushed
// upward, and leaving the field empty/invalid on blur reverts it instead of
// silently saving a 0 nobody typed.
function NumberField({ value, onChange, min, disabled, className }) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function handleChange(e) {
    const raw = e.target.value;
    setText(raw);
    if (raw !== '' && !Number.isNaN(Number(raw))) {
      onChange(Number(raw));
    }
  }

  function handleBlur() {
    if (text === '' || Number.isNaN(Number(text))) {
      setText(String(value));
    }
  }

  return (
    <input
      type="number"
      min={min}
      disabled={disabled}
      className={className}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
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
          <NumberField
            min="0"
            className="input mr-1 inline-block w-16"
            value={param.weight}
            onChange={(weight) => onChange({ weight })}
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
            <SelectField
              label="שדה בתיק החיפוש"
              allowClear={false}
              value={param.lostField}
              onChange={(v) => onChange({ lostField: v })}
              options={COMPARABLE_FIELDS.map((f) => ({ value: f.field, label: f.label }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-500">שדה בדיווח</span>
            <SelectField
              label="שדה בדיווח"
              allowClear={false}
              value={param.foundField}
              onChange={(v) => onChange({ foundField: v })}
              options={COMPARABLE_FIELDS.map((f) => ({ value: f.field, label: f.label }))}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-slate-500">שיטת השוואה</span>
            <SelectField
              label="שיטת השוואה"
              allowClear={false}
              value={param.comparisonType}
              onChange={(v) => onChange({ comparisonType: v })}
              options={Object.entries(COMPARISON_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </label>
          {(param.comparisonType === 'exact' ||
            param.comparisonType === 'booleanTrait' ||
            param.comparisonType === 'exactSkipDefault' ||
            param.comparisonType === 'colorMatch') && (
            <>
              <label className="block">
                <span className="mb-1 block text-slate-500">קנס באי-התאמה (0 = ללא קנס)</span>
                <NumberField
                  min="0"
                  className="input"
                  disabled={param.disqualifying}
                  value={param.mismatchPenalty || 0}
                  onChange={(mismatchPenalty) => onChange({ mismatchPenalty })}
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
