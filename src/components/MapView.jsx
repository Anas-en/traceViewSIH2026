import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * MapView — Core Leaflet map component.
 * Draws all 6 layers: raw trajectory, OSRM matched route, S/E markers,
 * detection dots, and animated vehicle marker.
 *
 * Uses Leaflet directly (not react-leaflet) for full control.
 */

// Light map tiles — CartoDB Voyager (clean, professional)
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

/**
 * Compute bearing (degrees, 0=N, 90=E) between two [lat, lng] points.
 */
function bearing(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Compute approximate distance (degrees) between two [lat, lng] points.
 */
function segDist(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Place small directional arrow markers at regular intervals along a polyline.
 * Arrow spacing is in degrees (~0.003 ≈ 300m at Delhi's latitude).
 */
function addDirectionArrows(latlngs, layer) {
  if (latlngs.length < 2) return;

  const ARROW_SPACING = 0.004; // ~400m between arrows
  let accumulated = 0;

  for (let i = 1; i < latlngs.length; i++) {
    const d = segDist(latlngs[i - 1], latlngs[i]);
    accumulated += d;

    if (accumulated >= ARROW_SPACING) {
      accumulated = 0;
      const angle = bearing(latlngs[i - 1], latlngs[i]);

      const arrowIcon = L.divIcon({
        className: '',
        html: `<div class="direction-arrow" style="transform: rotate(${angle}deg)">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                   <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" fill="#1a73e8"/>
                 </svg>
               </div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker(latlngs[i], { icon: arrowIcon, interactive: false }).addTo(layer);
    }
  }
}

export default function MapView({
  points,
  matchedGeometry,
  vehiclePos,
  vehicleBearing,
  activeIndex,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const vehicleMarkerRef = useRef(null);

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [28.6139, 77.209],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Layer group for all route-related layers (cleared on new search)
    const routeLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    routeLayerRef.current = routeLayer;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw route layers when points or matched geometry change
  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer || !points || points.length < 2) return;

    // Clear previous layers
    routeLayer.clearLayers();

    // Remove old vehicle marker
    if (vehicleMarkerRef.current) {
      map.removeLayer(vehicleMarkerRef.current);
      vehicleMarkerRef.current = null;
    }

    // Convert points to Leaflet [lat, lng]
    const rawLatLngs = points.map((p) => [p.lat, p.lon]);

    // --- 1. Raw trajectory (gray dashed) ---
    L.polyline(rawLatLngs, {
      color: '#9aa0a6',
      weight: 2.5,
      dashArray: '8, 6',
      opacity: 0.8,
    }).addTo(routeLayer);

    // --- 2. OSRM matched route (blue solid) + direction arrows ---
    if (matchedGeometry) {
      const matchedLatLngs = matchedGeometry.coordinates.map((c) => [c[1], c[0]]);
      L.polyline(matchedLatLngs, {
        color: '#1a73e8',
        weight: 4.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayer);

      // Direction arrows along the route
      addDirectionArrows(matchedLatLngs, routeLayer);
    }

    // --- 3. Detection points (white/dark circles) ---
    points.forEach((p, i) => {
      const isStart = i === 0;
      const isEnd = i === points.length - 1;

      // Skip S/E for circle markers (they get special markers)
      if (!isStart && !isEnd) {
        L.circleMarker([p.lat, p.lon], {
          radius: 5,
          color: '#fff',
          weight: 2,
          fillColor: '#5f6368',
          fillOpacity: 0.9,
        })
          .bindPopup(
            `<div class="popup-title">Detection #${i}</div>
             <div class="popup-detail">${p.timestamp_iso || ''}</div>
             <div class="popup-detail">${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</div>`
          )
          .addTo(routeLayer);
      }
    });

    // --- 4. Start marker (green S) ---
    const startIcon = L.divIcon({
      className: '',
      html: '<div class="marker-start">S</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker(rawLatLngs[0], { icon: startIcon })
      .bindPopup(
        `<div class="popup-title">Start</div>
         <div class="popup-detail">${points[0].timestamp_iso || ''}</div>`
      )
      .addTo(routeLayer);

    // --- 5. End marker (red E) ---
    const endIcon = L.divIcon({
      className: '',
      html: '<div class="marker-end">E</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    L.marker(rawLatLngs[rawLatLngs.length - 1], { icon: endIcon })
      .bindPopup(
        `<div class="popup-title">End</div>
         <div class="popup-detail">${points[points.length - 1].timestamp_iso || ''}</div>`
      )
      .addTo(routeLayer);

    // --- 6. Vehicle marker (Telegram-like logo) ---
    const vehicleIcon = L.divIcon({
      className: '',
      html: `<div class="marker-vehicle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Left Wing (White) -->
          <path d="M12 2L3 21L12 17V2Z" fill="white"/>
          <!-- Right Wing (Light Gray for 3D fold effect) -->
          <path d="M12 2L21 21L12 17V2Z" fill="#e2e8f0"/>
        </svg>
      </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    const vehicle = L.marker(rawLatLngs[0], {
      icon: vehicleIcon,
      zIndexOffset: 1000,
    }).addTo(map);
    vehicleMarkerRef.current = vehicle;

    // Fit bounds with padding
    const allLatLngs = matchedGeometry
      ? matchedGeometry.coordinates.map((c) => [c[1], c[0]])
      : rawLatLngs;
    const bounds = L.latLngBounds(allLatLngs);
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [points, matchedGeometry]);

  // Update vehicle marker position + rotation during playback
  useEffect(() => {
    if (vehicleMarkerRef.current && vehiclePos) {
      vehicleMarkerRef.current.setLatLng(vehiclePos);

      // Auto-pan the map to follow the vehicle smoothly (Lazy Panning)
      if (mapRef.current) {
        const map = mapRef.current;
        // pad(-0.3) creates a bounding box of the inner 40% of the screen.
        // If the vehicle leaves this box, we smoothly pan the map to catch up.
        // This avoids the 60fps tile-snapping jitter of setView(..., animate: false).
        const innerBounds = map.getBounds().pad(-0.3);
        if (!innerBounds.contains(vehiclePos)) {
          map.panTo(vehiclePos, { animate: true, duration: 0.5 });
        }
      }

      // Rotate the marker to face driving direction
      const el = vehicleMarkerRef.current.getElement();
      if (el && vehicleBearing != null) {
        const inner = el.querySelector('.marker-vehicle');
        if (inner) {
          inner.style.transform = `rotate(${vehicleBearing}deg)`;
        }
      }
    }
  }, [vehiclePos, vehicleBearing]);

  return (
    <div className="map-container">
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />

      {/* Legend */}
      {points && points.length > 0 && (
        <div className="map-legend">
          <div className="legend-item">
            <span className="legend-line raw" />
            <span>Raw Detections</span>
          </div>
          <div className="legend-item">
            <span className="legend-line matched" />
            <span>Road-Matched Route</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot start" />
            <span>Start</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot end" />
            <span>End</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot vehicle" />
            <span>Vehicle</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot detection" />
            <span>Camera Detection</span>
          </div>
        </div>
      )}

      {/* Empty state when no data loaded */}
      {(!points || points.length === 0) && (
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <div className="empty-state-title">No trajectory loaded</div>
          <div className="empty-state-desc">
            Search for a vehicle plate number and time window to view its trajectory on the map.
          </div>
        </div>
      )}
    </div>
  );
}
