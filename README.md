# TraceView — Vehicle Plate Tracking Map

TraceView is an interactive React application for visualizing and replaying vehicle trajectories based on ANPR (Automatic Number Plate Recognition) camera detections. It takes noisy GPS camera hits, matches them to the physical road network using the OSRM Routing API, and provides a smooth 60fps playback experience.

## Features

- **Real Road Matching**: Sends raw GPS coordinates to OSRM (`/match`) to calculate the exact roads taken using a Hidden Markov Model.
- **Smooth Playback Engine**: Interpolates vehicle position along the complex road geometry, running in a `requestAnimationFrame` loop.
- **Auto-Tracking Camera**: Lazy-panning map automatically tracks the vehicle as it drives without jitter.
- **Dynamic Direction**: The vehicle marker (a Telegram-style navigation arrow) dynamically calculates bearing and rotates to face the direction of travel.
- **Interactive UI**: Includes a time-scrubbing slider, 1x-8x speed controls, floating stats panels (confidence, duration, distance), and a live-scrolling detection sidebar.

## Setup & Installation

This project is built with React 18, Vite, and Leaflet.js (vanilla API).

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Development Server**
   ```bash
   npm run dev
   ```

3. **View the App**
   Open `http://localhost:5173` in your browser.

## How to Test

1. The app loads with mock data representing a vehicle moving through New Delhi.
2. The search bar is pre-filled with the plate number `DL-3C-AX-1234`.
3. Click **Track** to pull the route and snap it to the road network.
4. Press the **Play** button (▶) in the bottom timeline to start the animation.
5. Zoom in to watch the vehicle dynamically follow the curves of the road!

---

*For detailed architectural information on how the OSRM overlap chunking and playback engine work, please read [TECHNICAL_OVERVIEW.md](./TECHNICAL_OVERVIEW.md).*
