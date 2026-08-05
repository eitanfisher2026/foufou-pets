/**
 * Deterministic, explainable scoring - no AI call here on purpose. This runs
 * for every lost-case x found-report pair, so it has to stay free and instant;
 * the one AI call per report already happened at intake (screenshot reading).
 * Never filters anything out - only ranks - because a false "no match" is
 * worse than making the owner look at one more weak card.
 */

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[.,!?"'()]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function wordOverlapScore(a, b) {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared += 1;
  }
  return shared / Math.max(wordsA.size, wordsB.size);
}

function containsAny(haystack, needle) {
  if (!haystack || !needle) return false;
  const h = haystack.toLowerCase();
  return tokenize(needle).some((word) => h.includes(word));
}

/**
 * Scores one lost case against one found/seen report.
 * Returns { score: 0-100, reasons: string[] } where reasons explain every
 * component that moved the score, positive or negative.
 */
export function scoreMatch(lostCase, foundReport) {
  const reasons = [];
  let score = 0;

  // Color - prefer comparing the two structured dropdown values directly
  // (exact match, both sides use the same fixed list) over the old fuzzy
  // text check, which broke silently whenever a found report's free-text
  // description was extracted in a different language than the dropdown.
  if (lostCase.color && foundReport.color) {
    if (lostCase.color === foundReport.color) {
      score += 30;
      reasons.push(`הצבע (${lostCase.color}) זהה בשני הדיווחים`);
    } else {
      reasons.push(`הצבע שדווח (${foundReport.color}) שונה מהצבע של החתולה שאבדה (${lostCase.color})`);
    }
  } else if (lostCase.color && foundReport.colorDescription) {
    if (containsAny(foundReport.colorDescription, lostCase.color)) {
      score += 30;
      reasons.push(`הצבע (${lostCase.color}) תואם לתיאור בדיווח`);
    } else {
      reasons.push('הצבע שצוין בדיווח שונה מהצבע שדווח לגבי החתולה שאבדה');
    }
  }

  // Size - a soft signal only, since size/age judgment from a photo is rough
  if (lostCase.size && foundReport.size) {
    if (lostCase.size === foundReport.size) {
      score += 10;
      reasons.push('הגודל המדווח תואם');
    } else {
      reasons.push('הגודל המדווח שונה - ייתכן שמדובר בהערכה לא מדויקת');
    }
  }

  // Markings / free-text description overlap
  const markingsOverlap = wordOverlapScore(lostCase.markings, foundReport.markings);
  if (markingsOverlap > 0) {
    score += Math.round(markingsOverlap * 25);
    reasons.push('קיים חפיפה בין הסימנים המזהים שתוארו');
  }

  // Collar - a mismatch lowers confidence but never disqualifies, since a collar can fall off
  if (typeof lostCase.hasCollar === 'boolean' && typeof foundReport.hasCollar === 'boolean') {
    if (lostCase.hasCollar === foundReport.hasCollar) {
      score += 10;
      reasons.push(lostCase.hasCollar ? 'שני הדיווחים מציינים קולר/רתמה' : 'שני הדיווחים מציינים שאין קולר');
    } else {
      score -= 5;
      reasons.push('קיימת אי-התאמה בנוגע לקולר - ייתכן שהקולר נשמט');
    }
  }

  // Location - simple shared-word heuristic (no geocoding in the POC)
  const locationOverlap = wordOverlapScore(lostCase.lastSeenLocation, foundReport.location);
  if (locationOverlap > 0) {
    score += Math.round(locationOverlap * 25);
    reasons.push('המיקום שדווח קרוב או תואם למקום האובדן');
  } else if (lostCase.lastSeenLocation && foundReport.location) {
    reasons.push('המיקום שונה ממקום האובדן - אך ייתכן שהחיה זזה או הועברה');
  }

  // Timing - free text, so this is a soft signal only
  if (lostCase.lastSeenAt && foundReport.dateText) {
    score += 5;
    reasons.push('קיים מועד מדווח משני הצדדים - יש לבדוק התאמה בזמן באופן ידני');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function rankMatches(lostCase, foundReports) {
  return foundReports
    .map((report) => ({ report, ...scoreMatch(lostCase, report) }))
    .sort((a, b) => b.score - a.score);
}
