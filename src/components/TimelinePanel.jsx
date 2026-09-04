import { formatTimestamp } from '../utils/trajectory';

/**
 * TimelinePanel — Fixed bottom panel with play/pause, speed control, slider, and clock.
 * Drives the playback engine through callbacks.
 */

const SPEEDS = [1, 2, 4, 8];

export default function TimelinePanel({
  points,
  currentTime,
  playing,
  speed,
  onPlay,
  onPause,
  onSpeedChange,
  onSeek,
}) {
  if (!points || points.length < 2) return null;

  const startTime = points[0].t;
  const endTime = points[points.length - 1].t;
  const totalDuration = endTime - startTime;
  const progress = totalDuration > 0 ? ((currentTime - startTime) / totalDuration) * 100 : 0;

  // Find which detection we're closest to
  let detectionIndex = 0;
  for (let i = 0; i < points.length; i++) {
    if (currentTime >= points[i].t) detectionIndex = i;
  }

  const handleSliderChange = (e) => {
    const pct = parseFloat(e.target.value);
    const t = startTime + (pct / 100) * totalDuration;
    onSeek(t);
  };

  return (
    <div className="timeline-panel animate-slide-up">
      {/* Controls */}
      <div className="timeline-controls">
        <button
          id="btn-play"
          className={`btn-play ${playing ? 'playing' : ''}`}
          onClick={playing ? onPause : onPlay}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn-speed ${speed === s ? 'active' : ''}`}
            onClick={() => onSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>

      {/* Slider */}
      <div className="timeline-slider-container">
        <input
          id="timeline-slider"
          type="range"
          className="timeline-slider"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          onChange={handleSliderChange}
          style={{
            background: `linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`,
          }}
        />
        <div className="timeline-labels">
          <span className="timeline-time">{formatTimestamp(startTime)}</span>
          <span className="timeline-time">{formatTimestamp(endTime)}</span>
        </div>
      </div>

      {/* Clock */}
      <div className="timeline-clock">
        <div className="detection-progress">
          {detectionIndex + 1}/{points.length}
        </div>
        <div className="clock-display">{formatTimestamp(currentTime)}</div>
      </div>
    </div>
  );
}
