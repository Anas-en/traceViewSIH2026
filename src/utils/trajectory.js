/**
 * Trajectory data normalization and utility functions.
 * Converts GeoJSON detection data into a canonical format for OSRM and Leaflet.
 */

/**
 * Normalize GeoJSON FeatureCollection into canonical { lon, lat, t, timestamp_iso, index } array.
 * Single function to change if backend shape changes.
 */
export function normalizeTrajectory(data) {
  const features = data.trajectory_geojson.features;
  return features
    .map((f) => ({
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      t: f.properties.timestamp_unix,
      timestamp_iso: f.properties.timestamp_iso,
      index: f.properties.index,
    }))
    .sort((a, b) => a.t - b.t); // always ensure time-ordered
}

/**
 * Haversine distance between two { lon, lat } points in meters.
 */
export function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Total raw (straight-line) distance across an array of points, in meters.
 */
export function rawDistanceMeters(points) {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    sum += haversineMeters(points[i - 1], points[i]);
  }
  return sum;
}

/**
 * Format distance in meters to a human-readable string (km or m).
 */
export function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Format duration in seconds to human-readable string.
 */
export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * Format unix timestamp to time string.
 */
export function formatTimestamp(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format unix timestamp to date and time string.
 */
export function formatDateTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Calculate average speed in km/h from distance (m) and duration (s).
 */
export function avgSpeedKmh(distanceMeters, durationSeconds) {
  if (durationSeconds <= 0) return 0;
  return (distanceMeters / 1000) / (durationSeconds / 3600);
}

/**
 * Compute bearing (degrees, 0=N, 90=E) between two [lat, lng] points.
 */
export function computeBearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

