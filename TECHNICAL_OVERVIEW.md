# TraceView: Vehicle Plate Tracking Map — Technical Overview

This document provides a technical overview of the **TraceView** prototype—a React-based frontend application for visualizing and replaying vehicle trajectories based on ANPR (Automatic Number Plate Recognition) camera detections.

## Architecture & Tech Stack

- **Framework**: React 18 (bootstrapped with Vite)
- **Map Engine**: Leaflet.js (using the vanilla API directly for maximum performance; avoiding `react-leaflet` to manage animation layers efficiently).
- **Map Tiles**: CartoDB Voyager (clean, professional light map).
- **Styling**: Vanilla CSS with custom properties (`src/index.css`), structured around a professional fleet-management aesthetic.
- **Routing/Snapping API**: OSRM (Open Source Routing Machine) `/match` endpoint.

---

## Core Features & Implementation Details

### 1. Data Ingestion & Normalization
- **Mock Data**: Uses `public/trajectory.geojson` representing raw, noisy camera detections with timestamps.
- **Utility (`src/utils/trajectory.js`)**: Normalizes the GeoJSON into a flat, predictable array of canonical `{ lat, lon, t }` objects (where `t` is unix timestamp in seconds).
- **Distance Calculation**: Computes point-to-point distances using the Haversine formula to display "Raw Distance".

### 2. OSRM Map Matching
- **API Client (`src/utils/osrm.js`)**: Sends the raw GPS points to a live OSRM instance (`https://route.abba-s.dev/match/v1/driving/`).
- **Chunking Strategy**: OSRM has a strict limit of 100 coordinates per request. The client chunks the coordinates into arrays of 90, with an overlap of 9 points. This overlap is crucial because OSRM uses a Hidden Markov Model (HMM) that requires surrounding context to accurately snap boundary points to the correct road segment.
- **Match Confidence**: The HMM returns a `confidence` score (0.0 to 1.0) indicating how well the raw points fit the physical road network. This is displayed on the UI as a percentage.

### 3. Rendering the Map Layers (`src/components/MapView.jsx`)
The map uses raw Leaflet `L.layerGroup` to manage rendering independently of React's render cycle (preventing unnecessary re-renders).
- **Raw Trajectory**: A dashed gray line connecting the exact camera detection points.
- **Road-Matched Route**: A solid blue polyline representing the actual physical roads the vehicle took.
- **Directional Arrows**: Small blue SVG chevrons placed every ~400m along the matched route. The bearing (angle) of the road segment is calculated using trigonometric math to correctly rotate each arrow.
- **Camera Detections**: Interactive circle markers that display popup metadata. S (Start) and E (End) markers are uniquely styled.

### 4. High-Performance Playback Engine
The most complex part of the app is the smooth playback of the vehicle along the route.
- **Animation Loop (`src/App.jsx`)**: Uses `requestAnimationFrame` to run a 60fps tick loop. React state is updated, but to avoid stale closures, all critical animation data is held in `useRef`.
- **Interpolation (`src/utils/playback.js`)**: Since camera detections only happen at specific timestamps, the vehicle position must be interpolated *along the OSRM road geometry* (not in a straight line between cameras).
  - The `buildRouteIndex` function maps every camera detection to a fractional progress (0.0 to 1.0) along the complex OSRM polyline using Leaflet GeometryUtils-style math (`nearestFractionOnPolyline`).
  - During playback, the current time is used to find the exact fraction along the road route, ensuring the vehicle moves accurately along the curves of the road.
- **Vehicle Bearing**: As the vehicle interpolates its position, the angle between the previous frame's position and current position is computed. This `vehicleBearing` is passed down to rotate the SVG marker (a Telegram-style 3D paper airplane) so it always points in the direction of travel.

### 5. UI & UX Refinements
- **Lazy Map Panning**: Instead of locking the map center to the vehicle 60 times a second (which causes severe stuttering as map tiles constantly snap), the app uses a "lazy pan" bounding box. It tracks if the vehicle leaves the inner 40% of the screen (`map.getBounds().pad(-0.3)`). If it does, Leaflet's smooth `panTo` animation glides the map to catch up.
- **Detection Sidebar (`src/components/DetectionList.jsx`)**: A scrollable timeline of all camera detections. As the playback reaches a specific time segment, a `useEffect` triggers a native DOM `scrollIntoView()` to ensure the active detection is always visible in the sidebar.
- **Timeline Controls (`src/components/TimelinePanel.jsx`)**: Allows Play/Pause, timeline scrubbing via a range slider, and 1x/2x/4x/8x playback speed multiplication.

---

## Project Structure

```text
src/
├── App.jsx                    # Main orchestrator, holds state, runs animation loop
├── main.jsx                   # React entry point
├── index.css                  # Custom fleet-management light theme
├── components/
│   ├── MapView.jsx            # Vanilla Leaflet integration, layers, and lazy panning
│   ├── SearchBar.jsx          # Input for plate number and time window
│   ├── StatsPanel.jsx         # Displays distances, duration, and OSRM confidence
│   ├── TimelinePanel.jsx      # Playback controls and time slider
│   └── DetectionList.jsx      # Auto-scrolling sidebar of camera hits
└── utils/
    ├── trajectory.js          # GeoJSON normalization and Haversine math
    ├── osrm.js                # OSRM /match API client and overlap chunking
    └── playback.js            # Polyline interpolation and time mapping
```
