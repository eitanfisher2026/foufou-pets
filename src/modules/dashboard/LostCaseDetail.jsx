import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS, CAT_COLORS } from '../shared/collections.js';
import { getLostCase, updateLostCase } from '../lost-report/lostReportApi.js';
import { checkMatchesForLostCase, getMatches, updateMatchStatus } from '../matching/matchingApi.js';

const STATUS_LABELS = {
  [REPORT_STATUS.NEW]: 'חדש',
  [REPORT_STATUS.REVIEWING]: 'בבדיקה',
  [REPORT_STATUS.NEEDS_FOLLOWUP]: 'דורש מעקב',
  [REPORT_STATUS.NOT_RELEVANT]: 'נבדק ולא נמצא קשר',
  [REPORT_STATUS.LIKELY_MATCH]: 'בעל סבירות גבוהה',
  [REPORT_STATUS.CONTACTED]: 'נוצר קשר עם המדווח',
  [REPORT_STATUS.CLOSED]: 'נסגר',
};

export default function LostCaseDetail() {
  const { caseId } = useParams();
  const [lostCase, setLostCase] = useState(null);
  const [matches, setMatches] = useState([]);
  const [reportsById, setReportsById] = useState({});
  const [checking, setChecking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, [caseId]);

  async function load() {
    const data = await getLostCase(caseId);
    setLostCase(data);
    setFields(data);
    const existingMatches = await getMatches(caseId);
    setMatches(existingMatches);
    await loadReportSnapshots(existingMatches);
  }

  async function loadReportSnapshots(matchList) {
    const snapshots = {};
    await Promise.all(
      matchList.map(async (m) => {
        const snap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, m.foundReportId));
        if (snap.exists()) snapshots[m.foundReportId] = { id: snap.id, ...snap.data() };
      })
    );
    setReportsById(snapshots);
  }

  async function handleCheckMatches() {
    setChecking(true);
    try {
      await checkMatchesForLostCase(caseId);
      await load();
    } finally {
      setChecking(false);
    }
  }

  async function handleStatusChange(foundReportId, status) {
    await updateMatchStatus(caseId, foundReportId, status);
    setMatches((prev) => prev.map((m) => (m.foundReportId === foundReportId ? { ...m, status } : m)));
  }

  function setField(key, value) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateLostCase(caseId, fields, newPhotos);
      setNewPhotos([]);
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!lostCase) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Link to="/" className="mb-4 inline-block text-sm text-slate-500 underline">
        ← חזרה לעמוד הראשי
      </Link>

      {!editing ? (
        <>
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">{lostCase.name || 'חתול ללא שם'}</h1>
              <p className="text-sm text-slate-500">
                {lostCase.color} · {lostCase.lastSeenLocation} · {lostCase.lastSeenAt}
              </p>
            </div>
            <button onClick={() => setEditing(true)} className="text-sm text-slate-600 underline">
              עריכה
            </button>
          </div>
          {lostCase.markings && <p className="mb-2 text-sm text-slate-600">{lostCase.markings}</p>}
          {lostCase.contactPhone && (
            <p className="mb-2 text-sm text-slate-600">טלפון: {lostCase.contactPhone}</p>
          )}
          {lostCase.photos?.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {lostCase.photos.map((p, i) => (
                <img key={i} src={p.url} alt="" className="h-28 w-28 flex-shrink-0 rounded-lg object-cover" />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <Field label="שם החתולה">
            <input className="input" value={fields.name || ''} onChange={(e) => setField('name', e.target.value)} />
          </Field>
          <Field label="צבע">
            <select className="input" value={fields.color || ''} onChange={(e) => setField('color', e.target.value)}>
              <option value="">בחר/י צבע</option>
              {CAT_COLORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סימנים מזהים">
            <textarea className="input" value={fields.markings || ''} onChange={(e) => setField('markings', e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!fields.hasCollar}
              onChange={(e) => setField('hasCollar', e.target.checked)}
            />
            לובשת קולר/רתמה
          </label>
          <Field label="מקום אחרון שנראתה">
            <input
              className="input"
              value={fields.lastSeenLocation || ''}
              onChange={(e) => setField('lastSeenLocation', e.target.value)}
            />
          </Field>
          <Field label="מועד האובדן">
            <input className="input" value={fields.lastSeenAt || ''} onChange={(e) => setField('lastSeenAt', e.target.value)} />
          </Field>
          <Field label="שם איש קשר">
            <input className="input" value={fields.contactName || ''} onChange={(e) => setField('contactName', e.target.value)} />
          </Field>
          <Field label="טלפון">
            <input className="input" value={fields.contactPhone || ''} onChange={(e) => setField('contactPhone', e.target.value)} />
          </Field>
          <Field label="הערות נוספות">
            <textarea className="input" value={fields.notes || ''} onChange={(e) => setField('notes', e.target.value)} />
          </Field>
          <Field label="הוספת תמונות">
            <input type="file" accept="image/*" multiple onChange={(e) => setNewPhotos(Array.from(e.target.files || []))} />
          </Field>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-xl bg-slate-800 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {saving ? 'שומרים...' : 'שמירה'}
            </button>
            <button
              onClick={() => {
                setFields(lostCase);
                setNewPhotos([]);
                setEditing(false);
              }}
              className="flex-1 rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-600"
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleCheckMatches}
        disabled={checking}
        className="mb-6 w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        {checking ? 'בודקים התאמות...' : 'בדיקת התאמות אפשריות'}
      </button>

      <h2 className="mb-3 text-lg font-semibold text-slate-700">התאמות אפשריות ({matches.length})</h2>
      {matches.length === 0 && <p className="text-sm text-slate-400">לא בוצעה בדיקה עדיין, או שאין דיווחים במאגר.</p>}

      <ul className="space-y-3">
        {matches.map((m) => {
          const report = reportsById[m.foundReportId];
          return (
            <li key={m.foundReportId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-800">רמת התאמה: {m.score}/100</span>
                <select
                  className="input w-auto text-xs"
                  value={m.status}
                  onChange={(e) => handleStatusChange(m.foundReportId, e.target.value)}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {report?.photos?.[0]?.url && (
                <img src={report.photos[0].url} alt="" className="mb-2 h-40 w-full rounded-lg object-cover" />
              )}

              <ul className="mb-2 list-inside list-disc text-sm text-slate-600">
                {m.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>

              {report && (
                <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
                  {report.sourceGroupName && <p>מקור: {report.sourceGroupName}</p>}
                  {report.originalPosterName && <p>פורסם ע"י: {report.originalPosterName}</p>}
                  {report.contactPhone && <p>טלפון ליצירת קשר: {report.contactPhone}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}
