import { useEffect, useState } from 'react';
import { collection, getCountFromServer } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS } from '../shared/collections.js';
import BackLink from '../shared/BackLink.jsx';
import { getGlobalCosts, runCostTrackingMigration } from './userCostsApi.js';
import { getErrorMessage } from '../shared/errorMessages.js';
import CollapsibleSection from '../shared/CollapsibleSection.jsx';
import { getMatchConfig, saveMatchConfig } from '../matching/matchConfigApi.js';
import { getProviderKeys, setProviderKeys } from './aiProviderKeysApi.js';
import ProviderModelPicker from './ProviderModelPicker.jsx';

// Rough size assumption only, since actual file sizes aren't stored per
// photo - photos are compressed client-side to max 1280px / JPEG q0.75
// before upload (src/modules/shared/imageCompression.js), which typically
// lands well under this per photo, so this errs on the high side rather
// than understating cost.
const ASSUMED_KB_PER_PHOTO = 150;
// A record photo's own main photo plus, on average, roughly one more -
// used only to turn a cheap document count into a rough photo-count
// estimate (see estimatedPhotos below), not counted exactly per document -
// exact per-photo aggregation would need a stored count field this app
// doesn't keep, and isn't worth adding just for a number this page already
// treats as a rough, high-side estimate.
const ASSUMED_PHOTOS_PER_RECORD = 2;
const FREE_STORAGE_GB = 5;
const STORAGE_PRICE_PER_GB_MONTH = 0.026;

function formatUsd(n) {
  return `$${n.toFixed(n < 1 ? 4 : 2)}`;
}

/**
 * Site-wide AI cost (total + this month) and a rough Firebase storage
 * estimate. The per-user cost breakdown lives on the users settings page
 * instead (see UsersSettingsPage.jsx) - alongside the role each person
 * already has there, which is what a per-user cost number is actually
 * judged against.
 */
export default function CostSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [recordCount, setRecordCount] = useState(0);
  const [globalCosts, setGlobalCosts] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState('');
  // Provider/model choice for the two paid AI calls (extraction, photo
  // comparison) - lives in the same config/matchWeights doc the matching
  // parameters page edits (see matchConfigApi.js), just surfaced here
  // instead, since choosing a provider is fundamentally a cost decision.
  const [matchConfig, setMatchConfig] = useState(null);
  const [savingProviders, setSavingProviders] = useState(false);
  const [providersSavedNotice, setProvidersSavedNotice] = useState(false);
  const [providersError, setProvidersError] = useState('');
  // Separate from matchConfig/handleSaveProviders above - these live in
  // their own Firestore doc (config/aiProviderKeys, see
  // aiProviderKeysApi.js), not config/matchWeights, so they get their own
  // small save flow.
  const [keyInputs, setKeyInputs] = useState({
    geminiApiKey: '',
    openaiApiKey: '',
    fireworksApiKey: '',
    jinaApiKey: '',
    voyageApiKey: '',
  });
  const [savingKeys, setSavingKeys] = useState(false);
  const [keysSavedNotice, setKeysSavedNotice] = useState(false);
  const [keysError, setKeysError] = useState('');

  useEffect(() => {
    load();
  }, []);

  // recordCount (for the Firebase storage estimate) is still a server-side
  // count aggregation, not a full read - the AI cost figures below come
  // from config/costLedger instead of summing lostCases/foundReports fields
  // directly, so they no longer need an aggregation query at all (and the
  // "requires an index" crash that came with combining two summed fields in
  // one query is gone along with it).
  async function load() {
    const lostCasesRef = collection(db, COLLECTIONS.LOST_CASES);
    const foundReportsRef = collection(db, COLLECTIONS.FOUND_REPORTS);
    const [lostCount, foundCount, global, config, providerKeys] = await Promise.all([
      getCountFromServer(lostCasesRef),
      getCountFromServer(foundReportsRef),
      getGlobalCosts(),
      getMatchConfig(),
      getProviderKeys(),
    ]);
    setRecordCount((lostCount.data().count || 0) + (foundCount.data().count || 0));
    setGlobalCosts(global);
    setMatchConfig(config);
    setKeyInputs(providerKeys);
    setLoading(false);
  }

  async function handleMigrate() {
    setMigrating(true);
    setMigrationError('');
    try {
      await runCostTrackingMigration();
      await load();
    } catch (err) {
      setMigrationError(getErrorMessage(err));
    } finally {
      setMigrating(false);
    }
  }

  // Saves the WHOLE match config back (not just the two provider fields) -
  // matchConfig here is the same object the matching-parameters page reads
  // and writes, so this round-trips everything else it holds untouched,
  // same principle as that page's own save button.
  async function handleSaveProviders() {
    setSavingProviders(true);
    setProvidersError('');
    setProvidersSavedNotice(false);
    try {
      await saveMatchConfig(matchConfig);
      setProvidersSavedNotice(true);
      setTimeout(() => setProvidersSavedNotice(false), 2500);
    } catch (err) {
      setProvidersError(getErrorMessage(err));
    } finally {
      setSavingProviders(false);
    }
  }

  async function handleSaveKeys() {
    setSavingKeys(true);
    setKeysError('');
    setKeysSavedNotice(false);
    try {
      await setProviderKeys(keyInputs);
      setKeysSavedNotice(true);
      setTimeout(() => setKeysSavedNotice(false), 2500);
    } catch (err) {
      setKeysError(getErrorMessage(err));
    } finally {
      setSavingKeys(false);
    }
  }

  if (loading || !matchConfig) return <p className="p-4 text-slate-500">טוען...</p>;

  const estimatedPhotos = recordCount * ASSUMED_PHOTOS_PER_RECORD;
  const estimatedStorageGB = (estimatedPhotos * ASSUMED_KB_PER_PHOTO) / (1024 * 1024);
  const storageOverageGB = Math.max(0, estimatedStorageGB - FREE_STORAGE_GB);
  const estimatedStorageCost = storageOverageGB * STORAGE_PRICE_PER_GB_MONTH;

  return (
    <div className="p-4 pb-10">
      <BackLink to="/settings">חזרה להגדרות</BackLink>
      <h1 className="mb-1 text-xl font-bold text-slate-800">עלויות</h1>
      <p className="mb-6 text-sm text-slate-500">
        עלות ה-AI מבוססת על צריכת הטוקנים האמיתית שדווחה בכל קריאה בפועל - לא הערכה. עלות Firebase היא הערכה גסה בלבד,
        ראו הסבר למטה. פירוט עלות לפי משתמש עבר לעמוד "ניהול משתמשים".
      </p>

      <CollapsibleSection icon="🧩" title="ספק AI - אלגוריתם (חילוץ פרטים מצילומי מסך)">
        <p className="mb-3 text-sm text-slate-500">
          קריאת ה-AI שרצה פעם אחת לכל דיווח, בזמן ההעלאה, כדי לחלץ את הפרטים מהתמונה/הטקסט. ספק שאינו Claude דורש
          מפתח API משלו למטה לפני שהוא באמת עובד - בחירה בספק בלי מפתח שמור תיכשל עם הודעת שגיאה ברורה בזמן הקריאה,
          לא תעבוד בשקט לספק אחר.
        </p>
        <ProviderModelPicker
          task="extraction"
          providerKind={matchConfig.extractionProviderKind}
          model={matchConfig.extractionModel}
          onProviderChange={(kind, defaultModel) =>
            setMatchConfig((prev) => ({ ...prev, extractionProviderKind: kind, extractionModel: defaultModel }))
          }
          onModelChange={(model) => setMatchConfig((prev) => ({ ...prev, extractionModel: model }))}
          keyInputs={keyInputs}
          onKeyChange={(field, value) => setKeyInputs((prev) => ({ ...prev, [field]: value }))}
        />
        <button
          type="button"
          onClick={handleSaveProviders}
          disabled={savingProviders}
          className="mt-3 w-full rounded-xl bg-slate-800 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingProviders ? 'שומר...' : providersSavedNotice ? 'נשמר ✓' : 'שמירת ספק ומודל'}
        </button>
        {providersError && <p className="mt-2 text-xs font-medium text-red-600">{providersError}</p>}
      </CollapsibleSection>

      <CollapsibleSection icon="📷" title="ספק AI - השוואת תמונות">
        <p className="mb-3 text-sm text-slate-500">
          איזה ספק מריץ את השוואת התמונות בין תיק חיפוש לדיווח - LLM שיפוטי (Claude/Gemini/OpenAI/Fireworks) או
          embedding זול (Jina/Voyage - ראו הסבר בתוך הבחירה). סף ההפעלה, סף הפסילה, והתקרה למספר ההשוואות עצמם
          נמצאים בעמוד "פרמטרים להתאמה".
        </p>
        <ProviderModelPicker
          task="photoCompare"
          providerKind={matchConfig.photoCompareProviderKind}
          model={matchConfig.photoCompareModel}
          onProviderChange={(kind, defaultModel) =>
            setMatchConfig((prev) => ({ ...prev, photoCompareProviderKind: kind, photoCompareModel: defaultModel }))
          }
          onModelChange={(model) => setMatchConfig((prev) => ({ ...prev, photoCompareModel: model }))}
          keyInputs={keyInputs}
          onKeyChange={(field, value) => setKeyInputs((prev) => ({ ...prev, [field]: value }))}
        />
        <button
          type="button"
          onClick={handleSaveProviders}
          disabled={savingProviders}
          className="mt-3 w-full rounded-xl bg-slate-800 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingProviders ? 'שומר...' : providersSavedNotice ? 'נשמר ✓' : 'שמירת ספק ומודל'}
        </button>
        {providersError && <p className="mt-2 text-xs font-medium text-red-600">{providersError}</p>}
      </CollapsibleSection>

      <CollapsibleSection icon="🔑" title="מפתחות API">
        <p className="mb-3 text-sm text-slate-500">
          מפתח לכל ספק שאינו Claude (שכבר מוגדר בנפרד) - משותפים לכל המשתמשים, ומשמשים גם את בחירת הספק לאלגוריתם וגם
          את בחירת הספק להשוואת תמונות למעלה.
        </p>
        <div className="space-y-3">
          {[
            { field: 'geminiApiKey', label: 'Gemini', getKeyUrl: 'https://aistudio.google.com/apikey' },
            { field: 'openaiApiKey', label: 'OpenAI', getKeyUrl: 'https://platform.openai.com/api-keys' },
            { field: 'fireworksApiKey', label: 'Fireworks', getKeyUrl: 'https://fireworks.ai/account/api-keys' },
            { field: 'jinaApiKey', label: 'Jina AI', getKeyUrl: 'https://jina.ai/embeddings' },
            { field: 'voyageApiKey', label: 'Voyage AI', getKeyUrl: 'https://dashboard.voyageai.com/api-keys' },
          ].map(({ field, label, getKeyUrl }) => (
            <div key={field}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-slate-500">{label}</span>
                <a
                  href={getKeyUrl}
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
                value={keyInputs[field]}
                onChange={(e) => setKeyInputs((prev) => ({ ...prev, [field]: e.target.value }))}
                placeholder={keyInputs[field] ? '' : 'לא הוגדר'}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={handleSaveKeys}
          disabled={savingKeys}
          className="mt-3 w-full rounded-xl bg-slate-800 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {savingKeys ? 'שומר...' : keysSavedNotice ? 'נשמר ✓' : 'שמירת מפתחות'}
        </button>
        {keysError && <p className="mt-2 text-xs font-medium text-red-600">{keysError}</p>}
      </CollapsibleSection>

      <CollapsibleSection
        icon="💸"
        title="עלות AI"
        subtitle={globalCosts ? `סה"כ ${formatUsd(globalCosts.aiCostUsd + globalCosts.visualMatchCostUsd)}` : undefined}
        defaultOpen
      >
        {globalCosts === null ? (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p className="mb-2">
              המעקב עדיין לא עבר למודל החודשי (סך הכל + החודש הנוכחי בנפרד). לחיצה כאן תעביר את כל העלות שנצברה עד
              עכשיו לשדות "סך הכל", ותאפס את "החודש הנוכחי" (וגם את "החודש הנוכחי" של כל משתמש בעמוד "ניהול
              משתמשים") ל-0$ - פעולה חד-פעמית, לא ניתנת להרצה חוזרת.
            </p>
            <button
              type="button"
              onClick={handleMigrate}
              disabled={migrating}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {migrating ? 'מבצע...' : 'מעבר למעקב חודשי'}
            </button>
            {migrationError && <p className="mt-2 font-medium text-red-600">{migrationError}</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">סך הכל</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">זיהוי מצילומי מסך</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.aiCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">השוואת תמונות</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.visualMatchCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
                    <span className="text-slate-700">סה"כ</span>
                    <span className="text-slate-900">{formatUsd(globalCosts.aiCostUsd + globalCosts.visualMatchCostUsd)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">החודש הנוכחי</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">זיהוי מצילומי מסך</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.currentMonthAiCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">השוואת תמונות</span>
                    <span className="font-medium text-slate-800">{formatUsd(globalCosts.currentMonthVisualMatchCostUsd)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
                    <span className="text-slate-700">סה"כ</span>
                    <span className="text-slate-900">
                      {formatUsd(globalCosts.currentMonthAiCostUsd + globalCosts.currentMonthVisualMatchCostUsd)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              "החודש הנוכחי" מתאפס אוטומטית ב-1 בכל חודש (מה-1 ועד היום האחרון של החודש, כולל). זיהוי מצילומי מסך:
              קריאה אחת לכל דיווח בזמן ההעלאה (כולל סריקות חוזרות). השוואת תמונות רצה רק על התאמות שכבר עברו את סף
              הסבירות שנבחר ב"פרמטרים להתאמה" - ראו שם גם את התקרה למספר ההשוואות בסריקה אחת.
            </p>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection icon="🗄️" title="עלות Firebase (הערכה גסה)">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">תמונות משוערות</span>
            <span className="font-medium text-slate-800">{estimatedPhotos}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">אחסון משוער</span>
            <span className="font-medium text-slate-800">{estimatedStorageGB.toFixed(3)} GB</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-semibold">
            <span className="text-slate-700">עלות אחסון משוערת</span>
            <span className="text-slate-900">{formatUsd(estimatedStorageCost)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          זו הערכה גסה יותר מבעבר: כדי לא לקרוא כל רשומה בנפרד, מספר התמונות עצמו הפך גם הוא להערכה - כ-
          {ASSUMED_PHOTOS_PER_RECORD} תמונות בממוצע לרשומה (במקום ספירה מדויקת), כפול כ-{ASSUMED_KB_PER_PHOTO}KB
          לתמונה (התמונות עצמן מכווצות לרזולוציה נמוכה-בינונית לפני ההעלאה, כך שזו הערכה שמרנית-כלפי-מעלה).{' '}
          {FREE_STORAGE_GB}GB הראשונים באחסון פטורים ממכסת החינם של Firebase. עלויות קריאה/כתיבה ב-Firestore לא
          נכללות כאן - בנפח השימוש הנוכחי הן כמעט בוודאות בתוך מכסת החינם היומית; לעלות מדויקת יש לבדוק ב-Firebase
          Console.
        </p>
      </CollapsibleSection>
    </div>
  );
}
