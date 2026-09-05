import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase.js';
import { COLLECTIONS, REPORT_STATUS, RECORD_STATUS } from '../shared/collections.js';
import {
  rankMatches,
  scoreMatch,
  confidenceMeetsThreshold,
  visualVerdictMeetsDisqualifyThreshold,
  normalizeVisualVerdict,
} from './matchingEngine.js';
import { getMatchConfig } from './matchConfigApi.js';
import { comparePhotoSimilarity } from './photoSimilarityApi.js';
import { displayLostCaseName } from '../lost-report/lostFieldMapping.js';
import { displayFoundReportName } from '../found-report/foundFieldMapping.js';

// Must match PHOTO_SIMILARITY_MODEL in functions/index.js - the functions
// package doesn't share modules with the client, so this is kept in sync by
// hand (same pattern already used for CAT_COLORS/DOG_COLORS/etc. there).
// Bump this alongside the server whenever the model changes, so every
// verdict from a retired model is treated as stale (see
// isVisualSimilarityStale below) instead of being trusted forever just
// because its photos never changed.
const CURRENT_PHOTO_SIMILARITY_MODEL = 'claude-sonnet-5';

// A verdict worth actively surfacing to a person (see maybeCheckPhotoSimilarity
// below and the visualMatches returned by the check functions) - "low" and
// "noMatch" are still stored on the match for transparency (see the "ניתוח
// מלא" page) but aren't worth interrupting anyone about.
const NOTABLE_VISUAL_VERDICTS = new Set(['high', 'medium']);
function isNotableVisualVerdict(verdict) {
  return NOTABLE_VISUAL_VERDICTS.has(normalizeVisualVerdict(verdict));
}

/**
 * Runs the AI photo-similarity check for one lost-case/found-report pair,
 * but only when it's actually worth the cost: the pair's score has to clear
 * the admin-configured threshold (config.photoMatchThreshold - "never"
 * disables this entirely), and both sides need a main photo to compare.
 * Never throws - a failed photo check (missing photos, a transient AI
 * error) just means no visualSimilarity gets attached to this match, not a
 * failed scan. Returns null when skipped or failed, otherwise
 * { verdict, explanation, label, lostCaseId, foundReportId, lostPhotoUrl,
 * foundPhotoUrl, model, costUsd, checkedAt } - lostCaseId/foundReportId let
 * a caller (see VisualMatchAlertDialog.jsx) link straight to the match,
 * since an alert can be shown from a page (like the Settings bulk actions)
 * that has no other way to identify which pair it's even about. `label`
 * identifies the OTHER side of the pair for display. lostPhotoUrl/
 * foundPhotoUrl/model record exactly what produced this verdict - see
 * isVisualSimilarityStale below, the reason they're stored at all.
 */
async function maybeCheckPhotoSimilarity(lostCase, lostCaseId, foundReport, foundReportId, score, config, labelSide) {
  if (!confidenceMeetsThreshold(score, config.photoMatchThreshold)) return null;
  const lostPhotoUrl = lostCase.photos?.[0]?.url;
  const foundPhotoUrl = foundReport.photos?.[0]?.url;
  if (!lostPhotoUrl || !foundPhotoUrl) return null;

  try {
    const { verdict, explanation, model, _aiUsage } = await comparePhotoSimilarity(lostPhotoUrl, foundPhotoUrl);
    const label =
      labelSide === 'lost'
        ? displayLostCaseName(lostCase)
        : labelSide === 'found'
          ? displayFoundReportName(foundReport)
          : `${displayLostCaseName(lostCase)} ↔ ${displayFoundReportName(foundReport)}`;
    return {
      verdict,
      explanation,
      label,
      lostCaseId,
      foundReportId,
      lostPhotoUrl,
      foundPhotoUrl,
      model,
      costUsd: _aiUsage?.estimatedCostUsd || 0,
      checkedAt: serverTimestamp(),
    };
  } catch (err) {
    console.error('photo similarity check failed', err);
    return null;
  }
}

/**
 * A stored visualSimilarity is only trustworthy as long as it's still
 * describing the two photos actually shown today, AND was produced by the
 * model currently in use. Either side's main photo can change after the
 * fact (a new photo uploaded and made primary, an old one removed), and
 * nothing about that touches the match doc at all - before the photo-URL
 * check, a reused cached verdict had no way to notice its own photos had
 * moved on, so "בדיקה חוזרת" could keep repeating a now-meaningless
 * comparison indefinitely (exactly what made LC087/FC008 confidently
 * disqualify itself by describing a photo that wasn't the current one).
 * The model check exists for the same reason on a different axis: swapping
 * PHOTO_SIMILARITY_MODEL (e.g. after a confirmed accuracy problem) is
 * pointless if every existing match just keeps reusing verdicts the old
 * model already produced - a "recheck" needs to mean a fresh AI call in
 * that case too, not just when the photos themselves changed. A verdict
 * saved before either field existed (no lostPhotoUrl/model recorded at
 * all) is treated as stale on both counts, rather than assumed still
 * valid - safe default given there's no way to know either way.
 */
function isVisualSimilarityStale(visual, lostCase, foundReport) {
  if (!visual) return false;
  return (
    visual.lostPhotoUrl !== lostCase.photos?.[0]?.url ||
    visual.foundPhotoUrl !== foundReport.photos?.[0]?.url ||
    visual.model !== CURRENT_PHOTO_SIMILARITY_MODEL
  );
}

/**
 * A photo verdict confident enough (per the admin-configured
 * photoDisqualifyThreshold) that these are different animals outweighs
 * whatever the field-based score said - the same way a disqualifying field
 * (color, breed) already zeroes a match's score, just discovered a step
 * later, once an actual photo comparison exists. Forces score to 0 and
 * records the AI's explanation as the leading reason, so both the
 * confidence badge (ConfidenceBadge reads match.score directly) and the
 * reasons list correctly reflect the disqualification, not just the
 * visualSimilarity note sitting unconnected next to a stale high score.
 * Every verdict below the threshold leaves score and reasons untouched -
 * still purely additive/informational, per the original design.
 */
function applyVisualVerdict(score, reasons, visual, disqualifyThreshold) {
  if (!visualVerdictMeetsDisqualifyThreshold(visual?.verdict, disqualifyThreshold)) {
    return { score, reasons, disqualifiedByPhoto: false };
  }
  return {
    score: 0,
    reasons: [`השוואת תמונות AI: ${visual.explanation}`, ...reasons],
    disqualifiedByPhoto: true,
  };
}

// NO_MATCH_PHOTO is NO_MATCH's photo-driven sibling (see collections.js) -
// picking between the two, or NEW, is otherwise identical to the original
// score-only rule.
function autoStatusFor(score, disqualifiedByPhoto) {
  if (disqualifiedByPhoto) return REPORT_STATUS.NO_MATCH_PHOTO;
  return score === 0 ? REPORT_STATUS.NO_MATCH : REPORT_STATUS.NEW;
}

// Both check functions' status-preservation rule: only a genuine human
// triage status should survive a re-score untouched - NEW/NO_MATCH/
// NO_MATCH_PHOTO are all the algorithm's own verdict, never a person's.
function isAutoStatus(status) {
  return !status || status === REPORT_STATUS.NEW || status === REPORT_STATUS.NO_MATCH || status === REPORT_STATUS.NO_MATCH_PHOTO;
}

// A pairing only ever gets scored once by the "check" action. After that,
// its match record (score, reasons, status) is left alone until either a
// person changes its status by hand, or the whole set is explicitly reset
// (see clearMatches/clearMatchesForFoundReport) - re-running the check
// action never re-touches an already-scored pairing. This is what makes
// "New" a real, meaningful count (candidates never yet compared) instead
// of a status that silently got reused for "compared but unreviewed".

async function activeFoundReportsForSpecies(species) {
  const snap = await getDocs(collection(db, COLLECTIONS.FOUND_REPORTS));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (r) => (r.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE && (!species || !r.species || r.species === species)
    );
}

async function activeLostCasesForSpecies(species) {
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter(
      (c) => (c.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE && (!species || !c.species || c.species === species)
    );
}

async function recomputeLostCaseCounts(lostCaseId) {
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const all = snap.docs.map((d) => d.data());
  await setDoc(
    doc(db, COLLECTIONS.LOST_CASES, lostCaseId),
    {
      matchCount: all.length,
      newMatchCount: all.filter((m) => m.status === REPORT_STATUS.NEW).length,
      topMatchScore: all.reduce((max, m) => Math.max(max, m.score || 0), 0),
      // Denormalized so this can be a search filter (see recordSearch.js)
      // without every search needing to read every lost case's matches
      // subcollection - kept in sync here, same as the other counts above,
      // so it's always current whenever matches change for any reason.
      hasVisualMatch: all.some((m) => isNotableVisualVerdict(m.visualSimilarity?.verdict)),
      lastCheckedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

// The found-report-side mirror of recomputeLostCaseCounts's hasVisualMatch -
// a found report doesn't own a matches subcollection of its own (matches
// always live under the lost case, see getMatchesForFoundReport below), so
// this reads back every match referencing this found report across every
// lost case to answer "does ANY of them have a notable visual verdict
// right now". Same read-cost tradeoff already accepted for
// getMatchesForFoundReport itself at this project's scale.
async function recomputeFoundReportVisualFlag(foundReportId) {
  const matches = await getMatchesForFoundReport(foundReportId);
  await setDoc(
    doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId),
    { hasVisualMatch: matches.some((m) => isNotableVisualVerdict(m.visualSimilarity?.verdict)) },
    { merge: true }
  );
}

/**
 * Manual "check for matches" action: scores this lost case against every
 * active found/seen report that doesn't already have a match record here -
 * i.e. only genuinely new candidates, never re-scoring a pairing that was
 * already checked before. Any candidate whose field-based score clears the
 * configured photo-match threshold also gets an AI photo-similarity check
 * (see maybeCheckPhotoSimilarity above), run in parallel across candidates
 * before the single batched Firestore write. Returns
 * { newCount, visualMatches } - visualMatches lists only the notable
 * verdicts (see NOTABLE_VISUAL_VERDICTS), for a caller to alert on.
 *
 * onProgress(done, total) fires as each candidate's photo check settles
 * (done still counts a candidate that skipped the AI call entirely,
 * immediately) - the field scoring above is instant, but with dozens of
 * candidates clearing the photo threshold, the AI calls are what can
 * actually take a while, and a caller has no other way to show real
 * progress through a batch that's running in parallel rather than one at a
 * time.
 */
export async function checkMatchesForLostCase(lostCaseId, onProgress) {
  const caseSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId));
  if (!caseSnap.exists()) throw new Error('lost case not found');
  const lostCase = caseSnap.data();

  const foundReports = await activeFoundReportsForSpecies(lostCase.species);
  const existingSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  const newCandidates = foundReports.filter((r) => !existingIds.has(r.id));
  if (newCandidates.length === 0) return { newCount: 0, visualMatches: [] };

  const config = await getMatchConfig();
  const ranked = rankMatches(lostCase, newCandidates, config);

  let done = 0;
  onProgress?.(done, ranked.length);
  const visuals = await Promise.all(
    ranked.map(async ({ report, score }) => {
      const result = await maybeCheckPhotoSimilarity(lostCase, lostCaseId, report, report.id, score, config, 'found');
      done += 1;
      onProgress?.(done, ranked.length);
      return result;
    })
  );

  const batch = writeBatch(db);
  const visualMatches = [];
  let visualCostUsd = 0;
  ranked.forEach(({ report, score: rawScore, reasons: rawReasons, breakdown }, i) => {
    const visual = visuals[i];
    const { score, reasons, disqualifiedByPhoto } = applyVisualVerdict(rawScore, rawReasons, visual, config.photoDisqualifyThreshold);
    const status = autoStatusFor(score, disqualifiedByPhoto);
    // breakdown is stored alongside score/reasons (not recomputed on demand)
    // so the "full analysis" view always shows exactly what was checked at
    // the time this match was scored, even if the config changes later.
    batch.set(doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', report.id), {
      foundReportId: report.id,
      score,
      reasons,
      breakdown,
      status,
      checkedAt: serverTimestamp(),
      ...(visual ? { visualSimilarity: visual } : {}),
    });
    if (visual) {
      visualCostUsd += visual.costUsd;
      if (isNotableVisualVerdict(visual.verdict)) visualMatches.push(visual);
    }
  });
  await batch.commit();
  await recomputeLostCaseCounts(lostCaseId);
  if (visualCostUsd > 0) {
    await setDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId), { visualMatchCostUsd: increment(visualCostUsd) }, { merge: true });
  }
  await Promise.all(
    visuals.filter(Boolean).map((visual) => recomputeFoundReportVisualFlag(visual.foundReportId))
  );

  return { newCount: newCandidates.length, visualMatches };
}

/**
 * How many active found reports (matching species) don't yet have a match
 * record against this lost case - the "New" count shown next to the check
 * button. Recomputed live rather than denormalized, since it depends on
 * the whole found-reports pool, which changes from other pages at any time.
 */
export async function countNewCandidatesForLostCase(lostCaseId) {
  const caseSnap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId));
  if (!caseSnap.exists()) return 0;
  const lostCase = caseSnap.data();
  const [foundReports, existingSnap] = await Promise.all([
    activeFoundReportsForSpecies(lostCase.species),
    getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches')),
  ]);
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  return foundReports.filter((r) => !existingIds.has(r.id)).length;
}

/**
 * Re-scores just one lost-case/found-report pair on demand, regardless of
 * whether it was already scored - useful right after editing that one
 * found report's details (or the matching config) to see the effect
 * immediately. This is a deliberate, explicit override of the "only score
 * new candidates" rule above, triggered per-card, not by the main check
 * action. Keeps whatever review status the match already had (or picks the
 * same NEW/NO_MATCH default a fresh check would for a pairing that somehow
 * has none yet). Reuses an already-stored visualSimilarity rather than
 * re-spending on the AI photo check every time someone presses recheck -
 * but only when it's still actually describing the current photos (see
 * isVisualSimilarityStale); a stale one is treated the same as having none
 * at all, so a photo change is exactly what "recheck" needs to catch.
 */
export async function checkSingleMatch(lostCaseId, foundReportId) {
  const [caseSnap, reportSnap] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId)),
    getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId)),
  ]);
  if (!caseSnap.exists()) throw new Error('lost case not found');
  if (!reportSnap.exists()) throw new Error('found report not found');
  const lostCase = caseSnap.data();
  const foundReport = reportSnap.data();

  const config = await getMatchConfig();
  const { score: rawScore, reasons: rawReasons, breakdown } = scoreMatch(lostCase, foundReport, config);

  const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId);
  const prevSnap = await getDoc(matchRef);
  const prevData = prevSnap.exists() ? prevSnap.data() : null;
  const prevStatus = prevData?.status;

  const reusableVisual =
    prevData?.visualSimilarity && !isVisualSimilarityStale(prevData.visualSimilarity, lostCase, foundReport)
      ? prevData.visualSimilarity
      : null;
  const visual = reusableVisual || (await maybeCheckPhotoSimilarity(lostCase, lostCaseId, foundReport, foundReportId, rawScore, config));
  const { score, reasons, disqualifiedByPhoto } = applyVisualVerdict(rawScore, rawReasons, visual, config.photoDisqualifyThreshold);

  // Only a real triage status (REVIEWING, NOT_RELEVANT, LIKELY_MATCH,
  // CONTACTED, CLOSED, ...) means a person actually looked at this pairing,
  // and only that should survive a re-score untouched. Otherwise the
  // auto-verdict needs to track whatever the current score/photo check
  // actually says - a re-check that now disqualifies a pairing (or
  // un-disqualifies one) should visibly move it, not leave a stale status
  // sitting on a score that no longer matches it.
  const status = isAutoStatus(prevStatus) ? autoStatusFor(score, disqualifiedByPhoto) : prevStatus;

  await setDoc(
    matchRef,
    { foundReportId, score, reasons, breakdown, status, checkedAt: serverTimestamp(), ...(visual ? { visualSimilarity: visual } : {}) },
    { merge: true }
  );
  await recomputeLostCaseCounts(lostCaseId);
  if (visual && visual !== reusableVisual && visual.costUsd > 0) {
    await setDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId), { visualMatchCostUsd: increment(visual.costUsd) }, { merge: true });
  }
  if (visual) await recomputeFoundReportVisualFlag(foundReportId);

  return { score, reasons, breakdown, status, visualMatch: visual && isNotableVisualVerdict(visual.verdict) ? visual : null };
}

/**
 * Deletes every existing match record for a lost case - including whatever
 * status a person already set on them - and zeroes its denormalized
 * counters, so every candidate (including ones already scored before)
 * counts as "New" again on the next check. Used when a matching-config
 * change (a new field, a re-tuned weight) makes the old results worth
 * throwing away rather than just refreshing scores in place. Deliberately
 * does NOT re-run the check itself - resetting and re-checking are two
 * separate, explicit actions now.
 */
export async function clearMatches(lostCaseId) {
  const existingSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  const batch = writeBatch(db);
  existingSnap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();

  await setDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId), { matchCount: 0, newMatchCount: 0, topMatchScore: 0 }, { merge: true });
}

export async function getMatches(lostCaseId) {
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.score - a.score);
}

/**
 * Admin bulk action: clears and immediately rescans every active lost
 * case's matches against the current active found-reports pool (both cats
 * and dogs), using whatever scoring logic/config is live right now - one
 * lost case at a time, same clear-then-rescan as the single-case "reset"
 * button. Meant to be run once after a real change to the matching
 * algorithm, so already-stored match data (score, reasons, breakdown)
 * doesn't keep reflecting an old algorithm version until someone happens to
 * open that one case and press recheck by hand. onProgress(done, total) is
 * called after each lost case finishes so a caller can show a progress bar
 * - this redoes every pair, not just new candidates, so it can take a
 * while across the whole pool. Also re-runs the photo-similarity check for
 * every pair that clears the configured threshold (since clearing wipes any
 * previously-stored visualSimilarity too) - expect this to spend more on AI
 * photo checks than a normal day's usage, proportional to how many pairs
 * currently score into that bucket. visualMatches aggregates every notable
 * verdict found across the whole run, for a caller to alert on.
 */
export async function rescanAllLostCases(onProgress) {
  const lostCases = await activeLostCasesForSpecies(null);
  let matchesScored = 0;
  const visualMatches = [];

  for (let i = 0; i < lostCases.length; i++) {
    const lostCase = lostCases[i];
    await clearMatches(lostCase.id);
    const result = await checkMatchesForLostCase(lostCase.id);
    matchesScored += result.newCount;
    visualMatches.push(...result.visualMatches);
    onProgress?.(i + 1, lostCases.length);
  }

  return { casesProcessed: lostCases.length, matchesScored, visualMatches };
}

/**
 * Admin bulk action for EXISTING match data - unlike rescanAllLostCases,
 * this never clears or re-scores anything (field scores, reasons, and
 * breakdown are left exactly as they are). It only looks at matches that
 * already clear the configured photo-match threshold but don't have a
 * CURRENT visualSimilarity result yet - either no result at all (the normal
 * case right after first turning this feature on, or after lowering the
 * threshold so more existing matches now qualify), or one produced by a
 * model that's since been swapped out - and runs just the AI photo check
 * for those.
 *
 * Also backfills the denormalized hasVisualMatch search flag (see
 * recomputeLostCaseCounts/recomputeFoundReportVisualFlag) onto EVERY
 * scanned lost case and every found report referenced by a notable match,
 * not just ones this particular run happened to check - otherwise a
 * verdict saved before this flag existed (or before it was correctly
 * wired up) would stay invisible to search forever, since nothing else
 * would ever recompute it. onProgress(done, total) reports lost cases
 * scanned, for a progress bar.
 */
export async function backfillPhotoSimilarityForExistingMatches(onProgress) {
  // Every lost case is scanned (not just active ones) so the reported
  // counts are honest about what was actually looked at - active cases get
  // fully processed; a case that's since been resolved/archived/suspended
  // only has its un-checked matches counted, not spent on (checking a
  // closed case's matches in bulk isn't worth the AI cost) - skippedClosed
  // in the result tells you if that's hiding anything, and the per-match
  // "סריקה חוזרת" button on that case's own page still works regardless of
  // its status if you do want one checked.
  const snap = await getDocs(collection(db, COLLECTIONS.LOST_CASES));
  const allLostCases = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const config = await getMatchConfig();
  let pairsChecked = 0;
  let skippedBelowThreshold = 0;
  let skippedClosed = 0;
  const visualMatches = [];
  const foundReportIdsToRecompute = new Set();

  for (let i = 0; i < allLostCases.length; i++) {
    const lostCase = allLostCases[i];
    const isActive = (lostCase.status || RECORD_STATUS.ACTIVE) === RECORD_STATUS.ACTIVE;
    const matchesSnap = await getDocs(collection(db, COLLECTIONS.LOST_CASES, lostCase.id, 'matches'));
    const allMatches = matchesSnap.docs.map((d) => ({ ref: d.ref, data: d.data() }));

    // Already has a result from before this run (or before this flag
    // existed) - still needs its found report's flag caught up.
    allMatches.forEach((m) => {
      if (m.data.visualSimilarity) foundReportIdsToRecompute.add(m.data.foundReportId);
    });

    // "Unchecked" also covers a result produced by a model that's since
    // been retired (see CURRENT_PHOTO_SIMILARITY_MODEL) - otherwise
    // upgrading the model (e.g. after a confirmed accuracy problem) would
    // silently do nothing here, since every match that already has SOME
    // verdict would keep being skipped forever regardless of which model
    // produced it. Doesn't re-check the photo URLs themselves in bulk
    // (that's what the per-match "סריקה חוזרת" is for) - just the model.
    const uncheckedMatches = allMatches.filter(
      (m) => !m.data.visualSimilarity || m.data.visualSimilarity.model !== CURRENT_PHOTO_SIMILARITY_MODEL
    );

    if (!isActive) {
      skippedClosed += uncheckedMatches.length;
    } else if (uncheckedMatches.length > 0) {
      const foundReportSnaps = await Promise.all(
        uncheckedMatches.map((m) => getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, m.data.foundReportId)))
      );
      // Eligibility is decided from a FRESH score (recomputed right here),
      // not the score stored on the match doc at whatever point it was last
      // checked - the matching algorithm/config can (and here, repeatedly
      // did) change since then, so a stale stored score can under- or
      // over-report what the current config would actually decide. This is
      // exactly what makes this action a trustworthy "is everything
      // eligible actually checked" pass, matching what a per-match
      // "סריקה חוזרת" already does.
      const candidates = [];
      uncheckedMatches.forEach((m, idx) => {
        const reportSnap = foundReportSnaps[idx];
        if (!reportSnap.exists()) return;
        const foundReport = reportSnap.data();
        const freshScore = scoreMatch(lostCase, foundReport, config).score;
        if (confidenceMeetsThreshold(freshScore, config.photoMatchThreshold)) {
          candidates.push({ m, foundReport, freshScore });
        } else {
          skippedBelowThreshold += 1;
        }
      });

      if (candidates.length > 0) {
        const visuals = await Promise.all(
          candidates.map(({ m, foundReport, freshScore }) =>
            maybeCheckPhotoSimilarity(lostCase, lostCase.id, foundReport, m.data.foundReportId, freshScore, config, 'found')
          )
        );

        const batch = writeBatch(db);
        let costUsd = 0;
        candidates.forEach(({ m }, idx) => {
          const visual = visuals[idx];
          if (!visual) return;
          const { score, reasons, disqualifiedByPhoto } = applyVisualVerdict(
            m.data.score,
            m.data.reasons || [],
            visual,
            config.photoDisqualifyThreshold
          );
          const updates = { visualSimilarity: visual };
          // Unlike the live "check" actions, this backfill otherwise never
          // touches score/reasons/status for existing matches - only a
          // disqualifying photo verdict is worth overriding stored data
          // for, and even then only if nobody has already triaged this
          // pairing by hand (see isAutoStatus).
          if (disqualifiedByPhoto) {
            updates.score = score;
            updates.reasons = reasons;
            if (isAutoStatus(m.data.status)) updates.status = REPORT_STATUS.NO_MATCH_PHOTO;
          }
          batch.set(m.ref, updates, { merge: true });
          costUsd += visual.costUsd;
          pairsChecked += 1;
          foundReportIdsToRecompute.add(m.data.foundReportId);
          if (isNotableVisualVerdict(visual.verdict)) visualMatches.push(visual);
        });
        await batch.commit();
        if (costUsd > 0) {
          await setDoc(doc(db, COLLECTIONS.LOST_CASES, lostCase.id), { visualMatchCostUsd: increment(costUsd) }, { merge: true });
        }
      }
    }

    // Unconditional - a lost case with nothing new to check this run may
    // still have an older visualSimilarity whose flag was never set.
    await recomputeLostCaseCounts(lostCase.id);
    onProgress?.(i + 1, allLostCases.length);
  }

  await Promise.all([...foundReportIdsToRecompute].map((id) => recomputeFoundReportVisualFlag(id)));

  return { casesScanned: allLostCases.length, pairsChecked, skippedBelowThreshold, skippedClosed, visualMatches };
}

/**
 * The reverse direction of checkMatchesForLostCase: starting from one found/
 * seen report, scores it against every active lost case that doesn't
 * already have a match record for this found report - same "only new
 * candidates" rule, just approached from the other side. Matches still live
 * in the same place (each lost case's own "matches" subcollection, keyed by
 * foundReportId) regardless of which side triggered the check - there's
 * only ever one match record per lost-case/found-report pair. Same photo-
 * similarity refinement as checkMatchesForLostCase, just gated per lost
 * case (each candidate is a different lost-case doc, so cost increments
 * per-doc rather than once). Returns { newCount, visualMatches }. Same
 * onProgress(done, total) contract as checkMatchesForLostCase.
 */
export async function checkMatchesForFoundReport(foundReportId, onProgress) {
  const reportSnap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId));
  if (!reportSnap.exists()) throw new Error('found report not found');
  const report = reportSnap.data();

  // Same collection-group-query fix as getMatchesForFoundReport/
  // countNewCandidatesForFoundReport above - one getDoc per active lost
  // case (fine when the pool was tiny) doesn't scale.
  const [lostCases, matchesSnap] = await Promise.all([
    activeLostCasesForSpecies(report.species),
    getDocs(query(collectionGroup(db, 'matches'), where('foundReportId', '==', foundReportId))),
  ]);
  const matchedCaseIds = new Set(matchesSnap.docs.map((d) => d.ref.parent.parent.id));
  const newCandidates = lostCases.filter((lostCase) => !matchedCaseIds.has(lostCase.id));
  if (newCandidates.length === 0) return { newCount: 0, visualMatches: [] };

  const config = await getMatchConfig();
  const scored = newCandidates.map((lostCase) => ({ lostCase, ...scoreMatch(lostCase, report, config) }));
  let done = 0;
  onProgress?.(done, scored.length);
  const visuals = await Promise.all(
    scored.map(async ({ lostCase, score }) => {
      const result = await maybeCheckPhotoSimilarity(lostCase, lostCase.id, report, foundReportId, score, config, 'lost');
      done += 1;
      onProgress?.(done, scored.length);
      return result;
    })
  );

  const batch = writeBatch(db);
  const visualMatches = [];
  scored.forEach(({ lostCase, score: rawScore, reasons: rawReasons, breakdown }, i) => {
    const visual = visuals[i];
    const { score, reasons, disqualifiedByPhoto } = applyVisualVerdict(rawScore, rawReasons, visual, config.photoDisqualifyThreshold);
    const status = autoStatusFor(score, disqualifiedByPhoto);
    batch.set(doc(db, COLLECTIONS.LOST_CASES, lostCase.id, 'matches', foundReportId), {
      foundReportId,
      score,
      reasons,
      breakdown,
      status,
      checkedAt: serverTimestamp(),
      ...(visual ? { visualSimilarity: visual } : {}),
    });
    if (visual && isNotableVisualVerdict(visual.verdict)) visualMatches.push(visual);
  });
  await batch.commit();
  await Promise.all(newCandidates.map((lostCase) => recomputeLostCaseCounts(lostCase.id)));
  await Promise.all(
    scored.map(({ lostCase }, i) => {
      const cost = visuals[i]?.costUsd;
      if (!cost) return null;
      return setDoc(doc(db, COLLECTIONS.LOST_CASES, lostCase.id), { visualMatchCostUsd: increment(cost) }, { merge: true });
    })
  );
  // Every visual here (if any) is about this same single found report, so
  // one recompute covers the whole batch, not one per lost case.
  if (visuals.some(Boolean)) await recomputeFoundReportVisualFlag(foundReportId);

  return { newCount: newCandidates.length, visualMatches };
}

/**
 * How many active lost cases (matching species) don't yet have a match
 * record against this found report - the found-report-detail equivalent of
 * countNewCandidatesForLostCase. Same collection-group-query fix as
 * getMatchesForFoundReport above, for the same reason - one getDoc per
 * active lost case (this ran on every found-report page load) doesn't
 * scale the way it did when the pool was tiny.
 */
export async function countNewCandidatesForFoundReport(foundReportId) {
  const reportSnap = await getDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId));
  if (!reportSnap.exists()) return 0;
  const report = reportSnap.data();
  const [lostCases, matchesSnap] = await Promise.all([
    activeLostCasesForSpecies(report.species),
    getDocs(query(collectionGroup(db, 'matches'), where('foundReportId', '==', foundReportId))),
  ]);
  const matchedCaseIds = new Set(matchesSnap.docs.map((d) => d.ref.parent.parent.id));
  return lostCases.filter((lostCase) => !matchedCaseIds.has(lostCase.id)).length;
}

/**
 * Reads back whatever matches were last persisted for this found report
 * (across every lost case's subcollection) without re-scoring anything -
 * the found-report-detail equivalent of getMatches, used on page load so
 * revisiting the page doesn't silently re-run a fresh check.
 *
 * Uses a collection-group query on "matches" filtered by foundReportId,
 * not one getDoc per lost case - the original version fired one read PER
 * ACTIVE LOST CASE, in parallel, every single time this ran. That was fine
 * at this project's very first, tiny scale, but recomputeFoundReportVisualFlag
 * calls this once per notable visual match found during a single scan (see
 * checkMatchesForLostCase) - with the lost-case count grown into the
 * hundreds, a scan turning up even a handful of notable matches multiplied
 * out to hundreds of simultaneous reads, enough to trip Firestore's
 * client-side "too many outstanding requests" limit and silently kill the
 * whole scan partway through. This reads exactly the matches that actually
 * reference this found report - a handful at most, never one query per
 * lost case in the whole database.
 */
export async function getMatchesForFoundReport(foundReportId) {
  const matchesSnap = await getDocs(query(collectionGroup(db, 'matches'), where('foundReportId', '==', foundReportId)));
  const results = await Promise.all(
    matchesSnap.docs.map(async (matchDoc) => {
      const caseSnap = await getDoc(matchDoc.ref.parent.parent);
      return { lostCase: { id: caseSnap.id, ...caseSnap.data() }, ...matchDoc.data() };
    })
  );
  return results.sort((a, b) => b.score - a.score);
}

/**
 * The reverse of clearMatches: deletes this found report's match record
 * from every lost case that has one (including whatever status a person
 * already set), and recomputes each affected lost case's denormalized
 * counters from what's left - a lost case may well have matches against
 * other found reports too, so its counters can't just be zeroed out here.
 * Deliberately does NOT re-run the check itself, same as clearMatches.
 */
export async function clearMatchesForFoundReport(foundReportId) {
  const existing = await getMatchesForFoundReport(foundReportId);
  if (existing.length === 0) return;

  const batch = writeBatch(db);
  existing.forEach(({ lostCase }) => {
    batch.delete(doc(db, COLLECTIONS.LOST_CASES, lostCase.id, 'matches', foundReportId));
  });
  await batch.commit();
  await Promise.all(existing.map(({ lostCase }) => recomputeLostCaseCounts(lostCase.id)));
  await setDoc(doc(db, COLLECTIONS.FOUND_REPORTS, foundReportId), { hasVisualMatch: false }, { merge: true });
}

export async function getMatch(lostCaseId, foundReportId) {
  const snap = await getDoc(doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Updates one match's review status and keeps the lost case's denormalized
 * newMatchCount (used for the dashboard summary badge) in sync.
 */
export async function updateMatchStatus(lostCaseId, foundReportId, status) {
  const matchRef = doc(db, COLLECTIONS.LOST_CASES, lostCaseId, 'matches', foundReportId);
  const prevSnap = await getDoc(matchRef);
  const wasNew = prevSnap.exists() && prevSnap.data().status === REPORT_STATUS.NEW;
  const isNew = status === REPORT_STATUS.NEW;

  await setDoc(matchRef, { status }, { merge: true });

  if (wasNew !== isNew) {
    await setDoc(
      doc(db, COLLECTIONS.LOST_CASES, lostCaseId),
      { newMatchCount: increment(isNew ? 1 : -1) },
      { merge: true }
    );
  }
}
