import { useEffect, useRef } from 'react';
import { formatDateTime } from '../utils/trajectory';

/**
 * DetectionList — Sidebar showing all detection points as a scrollable timeline.
 * Highlights the currently active detection during playback.
 * Click a detection to jump to that time.
 */
export default function DetectionList({ points, activeIndex, onSelect }) {
  const listRef = useRef(null);

  // Auto-scroll to active item
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('.active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);
  if (!points || points.length === 0) return null;

  return (
    <div className="detection-sidebar">
      <div className="detection-sidebar-header">
        <span className="detection-sidebar-title">Detections</span>
        <span className="detection-count">{points.length}</span>
      </div>
      <div className="detection-list" ref={listRef}>
        {points.map((p, i) => {
          const isStart = i === 0;
          const isEnd = i === points.length - 1;
          const isActive = i === activeIndex;

          let className = 'detection-item';
          if (isActive) className += ' active';
          if (isStart) className += ' start';
          if (isEnd) className += ' end';

          return (
            <div
              key={i}
              className={className}
              onClick={() => onSelect(i)}
              role="button"
              tabIndex={0}
            >
              <div className="detection-dot" />
              <div className="detection-info">
                <div className="detection-time">
                  {formatDateTime(p.t)}
                  {isStart && ' · Start'}
                  {isEnd && ' · End'}
                </div>
                <div className="detection-coords">
                  {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
                </div>
              </div>
              <div className="detection-index">#{i}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
