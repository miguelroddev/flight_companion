import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";

// The camera the explore map and the route game's map share. Both stay alive
// between visits (App.tsx), and whichever comes back on screen picks up where
// the other was looking: going over to check an airport's routes and back
// keeps the place and the zoom.

export type Camera = { longitude: number; latitude: number; zoom: number };

// Before either map has been looked at: the whole world.
const WORLD_VIEW: Camera = { longitude: 0, latitude: 20, zoom: 1.2 };

let shared: Camera | null = null;

type CameraSource = { getCenter(): { lng: number; lat: number }; getZoom(): number };

export function useSharedCamera(mapRef: RefObject<MapRef | null>, active: boolean) {
  // Read once, for where this map opens.
  const [opening] = useState(() => shared);
  const wasActive = useRef(active);

  // A layout effect, so the map takes the shared camera before the browser
  // reports its new size. That resize fires a moveend, which would otherwise
  // save the map's own stale camera over the shared one first.
  useLayoutEffect(() => {
    const map = mapRef.current;
    // Read before the resize below, whose own moveend saves over it.
    const camera = shared;
    if (active && !wasActive.current && map && camera) {
      // While hidden the map had no size, so it is measured again first.
      map.resize();
      map.jumpTo({ center: [camera.longitude, camera.latitude], zoom: camera.zoom });
    }
    wasActive.current = active;
  }, [active, mapRef]);

  return {
    initialViewState: { ...(opening ?? WORLD_VIEW), pitch: 0, bearing: 0 },
    // Opened where the other map left off, so it need not frame anything
    // itself.
    resumed: opening !== null,
    // For onMoveEnd. Only the map on screen speaks for the camera: a hidden
    // one still fires moveend when it is resized away.
    saveCamera(map: CameraSource) {
      if (!active) return;
      const { lng, lat } = map.getCenter();
      shared = { longitude: lng, latitude: lat, zoom: map.getZoom() };
    },
  };
}
