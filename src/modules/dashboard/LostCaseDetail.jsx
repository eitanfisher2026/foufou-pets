import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS } from '../shared/collections.js';
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

  useEffect(() => {
    load();
  }, [caseId]);

  async function load() {
    const caseSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, caseId));
    setLostCase({ id: caseSnap.id, ...caseSnap.data() });
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

  if (!lostCase) return <p className="p-4 text-slate-500">טוען...</p>;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <h1 className="text-xl font-bold text-slate-800">{lostCase.name || 'חתול ללא שם'}</h1>
      <p className="text-sm text-slate-500">
        {lostCase.color} · {lostCase.lastSeenLocation} · {lostCase.lastSeenAt}
      </p>
      {lostCase.markings && <p className="mt-2 text-sm text-slate-600">{lostCase.markings}</p>}

      <button
        onClick={handleCheckMatches}
        disabled={checking}
        className="my-6 w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white disabled:opacity-50"
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
