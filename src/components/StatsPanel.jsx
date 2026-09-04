import { formatDistance, formatDuration } from '../utils/trajectory';

/**
 * StatsPanel — Floating stat cards showing raw distance, road distance, duration, and confidence.
 * Renders as an overlay on top of the map.
 */
export default function StatsPanel({ rawDistance, roadDistance, duration, confidence }) {
  if (rawDistance == null) return null;

  const confidenceClass =
    confidence >= 0.7 ? 'green' : confidence >= 0.5 ? 'orange' : 'red';

  return (
    <div className="stats-panel animate-fade-in">
      <div className="stat-card">
        <div className="stat-value">{formatDistance(rawDistance)}</div>
        <div className="stat-label">Raw Distance</div>
      </div>
      <div className="stat-card">
        <div className="stat-value" style={{ color: 'var(--accent)' }}>
          {formatDistance(roadDistance)}
        </div>
        <div className="stat-label">Road Distance</div>
      </div>
      <div className="stat-card">
        <div className="stat-value purple">{formatDuration(duration)}</div>
        <div className="stat-label">Duration</div>
      </div>
      <div className="stat-card">
        <div className={`stat-value ${confidenceClass}`}>
          {(confidence * 100).toFixed(0)}%
        </div>
        <div className="stat-label">Match Confidence</div>
      </div>
    </div>
  );
}
