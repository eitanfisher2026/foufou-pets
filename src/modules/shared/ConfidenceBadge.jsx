import { CONFIDENCE_COLOR_PALETTE, DEFAULT_CONFIDENCE_COLORS, getMatchConfidence } from '../matching/matchingEngine.js';

/**
 * Shows a match score as a plain-language confidence level (not the raw
 * number - see getMatchConfidence's doc comment for why), colored per the
 * settings panel's configured confidenceColors, falling back to the
 * defaults if not passed in (e.g. before the settings page has ever loaded
 * the live config here).
 */
export default function ConfidenceBadge({ score, confidenceColors = DEFAULT_CONFIDENCE_COLORS, className = '' }) {
  const confidence = getMatchConfidence(score);
  const colorKey = confidenceColors[confidence.key] || DEFAULT_CONFIDENCE_COLORS[confidence.key];
  const palette = CONFIDENCE_COLOR_PALETTE[colorKey] || CONFIDENCE_COLOR_PALETTE.gray;
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${palette.badge} ${className}`}>
      {confidence.label}
    </span>
  );
}
