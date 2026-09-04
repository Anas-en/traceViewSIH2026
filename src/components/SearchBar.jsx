import { useState } from 'react';

/**
 * SearchBar — Plate number input + from/to datetime pickers + search button.
 * Pre-filled with sample data defaults for immediate prototyping.
 */
export default function SearchBar({ onSearch, loading }) {
  const [plate, setPlate] = useState('DL-3C-AX-1234');
  const [fromTime, setFromTime] = useState('2024-01-15T10:25');
  const [toTime, setToTime] = useState('2024-01-15T10:40');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!plate.trim()) return;
    onSearch({
      plate: plate.trim().toUpperCase(),
      fromUnix: Math.floor(new Date(fromTime).getTime() / 1000),
      toUnix: Math.floor(new Date(toTime).getTime() / 1000),
    });
  };

  return (
    <form className="search-bar" onSubmit={handleSubmit}>
      <div className="search-input-group">
        <span className="search-icon">🔍</span>
        <input
          id="plate-input"
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="Enter plate number..."
          spellCheck={false}
        />
      </div>
      <input
        id="from-datetime"
        type="datetime-local"
        className="datetime-input"
        value={fromTime}
        onChange={(e) => setFromTime(e.target.value)}
        title="From time"
      />
      <input
        id="to-datetime"
        type="datetime-local"
        className="datetime-input"
        value={toTime}
        onChange={(e) => setToTime(e.target.value)}
        title="To time"
      />
      <button
        id="search-btn"
        type="submit"
        className="search-btn"
        disabled={loading || !plate.trim()}
      >
        {loading ? <span className="spinner" /> : null}
        {loading ? 'Matching…' : 'Track'}
      </button>
    </form>
  );
}
