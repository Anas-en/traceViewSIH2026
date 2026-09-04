/**
 * Playback interpolation engine.
 * Maps time-ordered detection timestamps to positions along the OSRM-matched
 * road geometry, enabling smooth vehicle animation that follows real roads.
 */

/**
 * Compute the total length of a polyline (array of [lat, lng] pairs).
 * Returns length in "Leaflet units" (degrees, but consistent for fraction math).
 */
function polylineLength(latlngs) {
  let len = 0;
  for (let i = 1; i < latlngs.length; i++) {
    const dx = latlngs[i][0] - latlngs[i - 1][0];
    const dy = latlngs[i][1] - latlngs[i - 1][1];
    len += Math.sqrt(dx * dx + dy * dy);
  }
  return len;
}

/**
 * Find the nearest point on a polyline to a given target point.
 * Returns the fraction (0..1) along the polyline where the nearest point lies.
 */
function nearestFractionOnPolyline(latlngs, target) {
  let bestDist = Infinity;
  let bestFrac = 0;
  const totalLen = polylineLength(latlngs);
  let accumulated = 0;

  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const segLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

    if (segLen === 0) continue;

    // Project target onto segment a→b
    const t = Math.max(
      0,
      Math.min(
        1,
        ((target[0] - a[0]) * (b[0] - a[0]) + (target[1] - a[1]) * (b[1] - a[1])) /
          (segLen * segLen)
      )
    );
    const proj = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const dist = Math.sqrt((proj[0] - target[0]) ** 2 + (proj[1] - target[1]) ** 2);

    if (dist < bestDist) {
      bestDist = dist;
      bestFrac = totalLen > 0 ? (accumulated + t * segLen) / totalLen : 0;
    }

    accumulated += segLen;
  }

  return bestFrac;
}

/**
 * Build a route index: for each detection, its fraction (0..1) along the matched route.
 * Uses tracepoints to snap each detection to the route geometry.
 *
 * @param {Array} matchedLatLngs - The matched route as [[lat, lng], ...] (Leaflet order)
 * @param {Array} points - Canonical detection points [{ lon, lat, t }, ...]
 * @param {Array|null} tracepoints - OSRM tracepoints (optional)
 * @returns {Array} fractions - One fraction per detection point
 */
export function buildRouteIndex(matchedLatLngs, points, tracepoints) {
  const fractions = [];

  for (let i = 0; i < points.length; i++) {
    let target;

    // Prefer tracepoint location (snapped to road) if available
    if (tracepoints && tracepoints[i] && tracepoints[i].location) {
      target = [tracepoints[i].location[1], tracepoints[i].location[0]]; // [lat, lng]
    } else {
      target = [points[i].lat, points[i].lon]; // fallback to raw detection
    }

    const frac = nearestFractionOnPolyline(matchedLatLngs, target);
    fractions.push(frac);
  }

  // Ensure monotonically increasing (a vehicle can't go backward on its route)
  for (let i = 1; i < fractions.length; i++) {
    if (fractions[i] < fractions[i - 1]) {
      fractions[i] = fractions[i - 1];
    }
  }

  return fractions;
}

/**
 * Get a point at a given fraction (0..1) along a polyline.
 *
 * @param {Array} latlngs - Polyline as [[lat, lng], ...]
 * @param {number} fraction - 0 = start, 1 = end
 * @returns {Array} [lat, lng]
 */
export function pointAlongPolyline(latlngs, fraction) {
  if (fraction <= 0) return latlngs[0];
  if (fraction >= 1) return latlngs[latlngs.length - 1];

  const totalLen = polylineLength(latlngs);
  const targetDist = fraction * totalLen;
  let accumulated = 0;

  for (let i = 0; i < latlngs.length - 1; i++) {
    const a = latlngs[i];
    const b = latlngs[i + 1];
    const segLen = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);

    if (accumulated + segLen >= targetDist) {
      const t = segLen > 0 ? (targetDist - accumulated) / segLen : 0;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }

    accumulated += segLen;
  }

  return latlngs[latlngs.length - 1];
}

/**
 * Find which detection segment a time `t` falls in.
 * Returns the index `i` such that points[i].t <= t <= points[i+1].t
 */
export function findSegment(points, t) {
  for (let i = 0; i < points.length - 1; i++) {
    if (t >= points[i].t && t <= points[i + 1].t) return i;
  }
  return points.length - 2; // clamp to last segment
}

/**
 * Get the interpolated vehicle position at time `t`.
 *
 * @param {number} t - Unix timestamp (seconds)
 * @param {Array} points - Canonical detection points
 * @param {Array} matchedLatLngs - OSRM matched route [[lat, lng], ...]
 * @param {Array} routeIndex - Fractions from buildRouteIndex
 * @returns {Array} [lat, lng]
 */
export function vehiclePosAt(t, points, matchedLatLngs, routeIndex) {
  if (t <= points[0].t) return pointAlongPolyline(matchedLatLngs, routeIndex[0]);
  if (t >= points[points.length - 1].t)
    return pointAlongPolyline(matchedLatLngs, routeIndex[routeIndex.length - 1]);

  const i = findSegment(points, t);
  const segDuration = points[i + 1].t - points[i].t;
  const frac = segDuration > 0 ? (t - points[i].t) / segDuration : 0;
  const routeFrac = routeIndex[i] + frac * (routeIndex[i + 1] - routeIndex[i]);

  return pointAlongPolyline(matchedLatLngs, routeFrac);
}
