
/**
 * OSRM API client.
 * Handles building /match URLs, chunking large traces, and parsing responses.
 * Server: https://route.abba-s.dev (Delhi/NCR coverage)
 */

const OSRM_BASE = 'https://route.abba-s.dev';

/**
 * Chunk coordinates array to respect OSRM's 100-coordinate limit.
 * Uses overlap to ensure smooth boundary matching (HMM needs context on both sides).
 */
export function chunkCoords(coords, size = 90, overlap = 9) {
  const chunks = [];
  for (let i = 0; i < coords.length; i += size - overlap) {
    chunks.push(coords.slice(i, Math.min(i + size, coords.length)));
    if (i + size >= coords.length) break;
  }
  return chunks;
}

/**
 * Build the /match URL for a set of points.
 * Points: array of { lon, lat, t } (canonical format from trajectory.js)
 * Coordinates: lon,lat (OSRM order — NOT Leaflet order!)
 */
export function buildMatchUrl(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const timestamps = points.map((p) => p.t).join(';');
  return `${OSRM_BASE}/match/v1/driving/${coords}?timestamps=${timestamps}&geometries=geojson&overview=full&tidy=true`;
}

/**
 * Fetch OSRM /match for a single chunk of points.
 * Returns { geometry, distance, duration, confidence, tracepoints } or null on error.
 */
async function matchChunk(points) {
  const url = buildMatchUrl(points);
  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) {
      console.warn('OSRM match failed:', data.code, data.message);
      return null;
    }

    const matching = data.matchings[0];
    return {
      geometry: matching.geometry,
      distance: matching.distance,
      duration: matching.duration,
      confidence: matching.confidence,
      tracepoints: data.tracepoints,
    };
  } catch (err) {
    console.error('OSRM fetch error:', err);
    return null;
  }
}

/**
 * Fetch OSRM /match for an entire trace, with automatic chunking.
 * Merges chunk geometries and sums distance/duration.
 * Returns { geometry, distance, duration, confidence, tracepoints }
 */
export async function fetchMatch(points) {
  if (points.length < 2) return null;

  // If under the limit, single request
  if (points.length <= 100) {
    return matchChunk(points);
  }

  // Chunk and merge
  const chunks = chunkCoords(points);
  const results = [];

  for (const chunk of chunks) {
    const result = await matchChunk(chunk);
    if (result) results.push(result);
  }

  if (results.length === 0) return null;

  // Merge geometries — drop duplicate boundary points
  const mergedCoords = [...results[0].geometry.coordinates];
  for (let i = 1; i < results.length; i++) {
    const coords = results[i].geometry.coordinates;
    mergedCoords.push(...coords.slice(1)); // skip first (overlap point)
  }

  return {
    geometry: {
      type: 'LineString',
      coordinates: mergedCoords,
    },
    distance: results.reduce((sum, r) => sum + r.distance, 0),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
    confidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
    tracepoints: results[0].tracepoints,
  };
}
