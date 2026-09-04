import { useState, useRef, useCallback, useEffect } from 'react';
import SearchBar from './components/SearchBar';
import StatsPanel from './components/StatsPanel';
import MapView from './components/MapView';
import TimelinePanel from './components/TimelinePanel';
import DetectionList from './components/DetectionList';
import { normalizeTrajectory, rawDistanceMeters, computeBearing } from './utils/trajectory';
import { fetchMatch } from './utils/osrm';
import {
  buildRouteIndex,
  vehiclePosAt,
  findSegment,
} from './utils/playback';

/**
 * App — Main orchestrator.
 * Manages trajectory data, OSRM matching, playback state, and passes
 * props to all child components.
 */
export default function App() {
  // --- Data state ---
  const [points, setPoints] = useState(null);
  const [matchResult, setMatchResult] = useState(null); // { geometry, distance, duration, confidence, tracepoints }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- Stats ---
  const [rawDist, setRawDist] = useState(null);

  // --- Playback state ---
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [vehiclePos, setVehiclePos] = useState(null);
  const [vehicleBearing, setVehicleBearing] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  // Refs for playback animation (avoid stale closure)
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const currentTimeRef = useRef(0);
  const pointsRef = useRef(null);
  const matchedLatLngsRef = useRef(null);
  const routeIndexRef = useRef(null);
  const animFrameRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const prevPosRef = useRef(null);

  // --- Search handler ---
  const handleSearch = useCallback(async ({ plate, fromUnix, toUnix }) => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    playingRef.current = false;

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    try {
      // Fetch trajectory data (mock: from public/trajectory.geojson)
      const res = await fetch('/trajectory.geojson');
      if (!res.ok) throw new Error('Failed to load trajectory data');
      const data = await res.json();

      // Normalize to canonical format
      let normalized = normalizeTrajectory(data);

      // Filter by time window
      normalized = normalized.filter(
        (p) => p.t >= fromUnix && p.t <= toUnix
      );

      if (normalized.length < 2) {
        setError('No detections found in the specified time window.');
        setPoints(null);
        setMatchResult(null);
        setRawDist(null);
        setLoading(false);
        return;
      }

      setPoints(normalized);
      pointsRef.current = normalized;

      // Calculate raw distance
      const rd = rawDistanceMeters(normalized);
      setRawDist(rd);

      // OSRM /match
      const match = await fetchMatch(normalized);
      setMatchResult(match);

      if (match && match.geometry) {
        // Build playback index
        const mLatLngs = match.geometry.coordinates.map((c) => [c[1], c[0]]);
        matchedLatLngsRef.current = mLatLngs;

        const rIndex = buildRouteIndex(mLatLngs, normalized, match.tracepoints);
        routeIndexRef.current = rIndex;

        // Set initial vehicle position and bearing
        const startPos = vehiclePosAt(
          normalized[0].t,
          normalized,
          mLatLngs,
          rIndex
        );
        const nextPos = vehiclePosAt(
          normalized[0].t + 1,
          normalized,
          mLatLngs,
          rIndex
        );
        const initialBearing = computeBearing(startPos, nextPos);

        setVehiclePos(startPos);
        setVehicleBearing(initialBearing);
        prevPosRef.current = startPos;
        setCurrentTime(normalized[0].t);
        currentTimeRef.current = normalized[0].t;
        setActiveIndex(0);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Playback tick ---
  const tick = useCallback((timestamp) => {
    if (!playingRef.current) return;

    const pts = pointsRef.current;
    const mLatLngs = matchedLatLngsRef.current;
    const rIndex = routeIndexRef.current;

    if (!pts || !mLatLngs || !rIndex) return;

    // Calculate delta time
    if (lastFrameTimeRef.current === null) {
      lastFrameTimeRef.current = timestamp;
    }
    const deltaMs = timestamp - lastFrameTimeRef.current;
    lastFrameTimeRef.current = timestamp;

    // Advance playback time (speed multiplier × real seconds elapsed)
    const advance = speedRef.current * (deltaMs / 1000);
    let newTime = currentTimeRef.current + advance;

    const endTime = pts[pts.length - 1].t;
    if (newTime >= endTime) {
      newTime = endTime;
      playingRef.current = false;
      setPlaying(false);
    }

    currentTimeRef.current = newTime;
    setCurrentTime(newTime);

    // Update vehicle position and bearing (always forward-facing)
    const pos = vehiclePosAt(newTime, pts, mLatLngs, rIndex);
    const forwardTime = Math.min(newTime + 0.1, endTime);
    const forwardPos = vehiclePosAt(forwardTime, pts, mLatLngs, rIndex);
    
    if (pos[0] !== forwardPos[0] || pos[1] !== forwardPos[1]) {
      const bearing = computeBearing(pos, forwardPos);
      setVehicleBearing(bearing);
    } else if (newTime === endTime) {
      // If exactly at the end, look slightly backward to maintain final direction
      const backwardTime = Math.max(newTime - 0.1, pts[0].t);
      const backwardPos = vehiclePosAt(backwardTime, pts, mLatLngs, rIndex);
      if (pos[0] !== backwardPos[0] || pos[1] !== backwardPos[1]) {
        setVehicleBearing(computeBearing(backwardPos, pos));
      }
    }
    
    setVehiclePos(pos);

    // Update active detection index
    const seg = findSegment(pts, newTime);
    setActiveIndex(seg);

    if (playingRef.current) {
      animFrameRef.current = requestAnimationFrame(tick);
    }
  }, []);

  // --- Playback controls ---
  const handlePlay = useCallback(() => {
    const pts = pointsRef.current;
    if (!pts || !matchedLatLngsRef.current) return;

    // If at end, restart
    if (currentTimeRef.current >= pts[pts.length - 1].t) {
      currentTimeRef.current = pts[0].t;
      setCurrentTime(pts[0].t);
    }

    playingRef.current = true;
    lastFrameTimeRef.current = null;
    setPlaying(true);
    animFrameRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const handlePause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const handleSpeedChange = useCallback((s) => {
    speedRef.current = s;
    setSpeed(s);
  }, []);

  const handleSeek = useCallback((t) => {
    const pts = pointsRef.current;
    const mLatLngs = matchedLatLngsRef.current;
    const rIndex = routeIndexRef.current;
    if (!pts || !mLatLngs || !rIndex) return;

    currentTimeRef.current = t;
    setCurrentTime(t);

    // Always point vehicle forward regardless of scrub direction
    const endTime = pts[pts.length - 1].t;
    const pos = vehiclePosAt(t, pts, mLatLngs, rIndex);
    const forwardTime = Math.min(t + 0.1, endTime);
    const forwardPos = vehiclePosAt(forwardTime, pts, mLatLngs, rIndex);
    
    if (pos[0] !== forwardPos[0] || pos[1] !== forwardPos[1]) {
      const bearing = computeBearing(pos, forwardPos);
      setVehicleBearing(bearing);
    } else if (t === endTime) {
      // At the exact end, look back to find final bearing
      const backwardTime = Math.max(t - 0.1, pts[0].t);
      const backwardPos = vehiclePosAt(backwardTime, pts, mLatLngs, rIndex);
      if (pos[0] !== backwardPos[0] || pos[1] !== backwardPos[1]) {
        setVehicleBearing(computeBearing(backwardPos, pos));
      }
    }
    
    setVehiclePos(pos);

    const seg = findSegment(pts, t);
    setActiveIndex(seg);
  }, []);

  const handleDetectionSelect = useCallback(
    (index) => {
      if (!pointsRef.current) return;
      const t = pointsRef.current[index].t;
      handleSeek(t);
    },
    [handleSeek]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">⟐</div>
          <span className="app-logo-text">TraceView</span>
          <span className="app-logo-badge">Prototype</span>
        </div>

        <SearchBar onSearch={handleSearch} loading={loading} />
      </header>

      {/* Main content */}
      <div className="main-content">
        {/* Stats overlay */}
        {matchResult && (
          <StatsPanel
            rawDistance={rawDist}
            roadDistance={matchResult.distance}
            duration={matchResult.duration}
            confidence={matchResult.confidence}
          />
        )}

        {/* Map */}
        <MapView
          points={points}
          matchedGeometry={matchResult?.geometry}
          vehiclePos={vehiclePos}
          vehicleBearing={vehicleBearing}
          activeIndex={activeIndex}
        />

        {/* Detection sidebar */}
        <DetectionList
          points={points}
          activeIndex={activeIndex}
          onSelect={handleDetectionSelect}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner-large" />
          </div>
        )}
      </div>

      {/* Timeline panel */}
      <TimelinePanel
        points={points}
        currentTime={currentTime}
        playing={playing}
        speed={speed}
        onPlay={handlePlay}
        onPause={handlePause}
        onSpeedChange={handleSpeedChange}
        onSeek={handleSeek}
      />

      {/* Error toast */}
      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 90,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--red-dim)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: '8px 20px',
            borderRadius: 'var(--radius)',
            fontSize: '13px',
            fontWeight: 500,
            zIndex: 300,
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
