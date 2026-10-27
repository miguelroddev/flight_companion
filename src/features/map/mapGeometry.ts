import type { MapGeoJSONFeature, MapLayerMouseEvent } from "react-map-gl/maplibre";

import type { Airport } from "../../api/flights";
import { greatCircleLine } from "./greatCircle";

// Shared by the explore map and the route game's map.

// The longitude offsets of every copy of the world visible at the current
// zoom, so labels drawn as DOM markers repeat along with the map.
export function computeWorldCopyOffsets(map: {
  getZoom: () => number;
  getContainer: () => { clientWidth: number };
}): number[] {
  const worldSizePixels = 512 * 2 ** map.getZoom();
  const degreesVisible = (map.getContainer().clientWidth * 360) / worldSizePixels;
  const radius = Math.max(1, Math.ceil(degreesVisible / 360) + 1);

  const offsets: number[] = [];
  for (let n = -radius; n <= radius; n++) offsets.push(n * 360);
  return offsets;
}

export function lineFeature(
  from: Airport,
  to: Airport,
  properties: Record<string, unknown> = {},
) {
  return {
    type: "Feature" as const,
    properties,
    geometry: {
      type: "LineString" as const,
      coordinates: greatCircleLine(from, to),
    },
  };
}

// Feature ids must be stable per airport, not per position in some list, or a
// hover could survive a change of pin set and light up a different airport. An
// IATA code read as base 36 is unique and needs no lookup table, so a selected
// airport outside the current (filtered) list still gets one. Offset by 1
// because maplibre treats a missing id and 0 alike.
export function pinFeatureId(iata: string): number {
  return parseInt(iata, 36) + 1;
}

export function unwrapLng(lng: number, referenceLng: number): number {
  const delta = ((((lng - referenceLng) % 360) + 540) % 360) - 180;
  return referenceLng + delta;
}

// The [southwest, northeast] corners framing every airport, unwrapped around
// the first so a set spanning the antimeridian is framed the short way.
export function boundsOf(airports: Airport[]): [[number, number], [number, number]] {
  const reference = airports[0].lng;
  const lngs = airports.map((airport) => unwrapLng(airport.lng, reference));
  const lats = airports.map((airport) => airport.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

// Hit areas are all the same size, so they overlap far more than the pins
// do; the pin whose centre is nearest the cursor wins, not the busiest one.
export function nearestPin(event: MapLayerMouseEvent): MapGeoJSONFeature | undefined {
  const map = event.target;
  // Events bubbling up from the label markers (the close button) reach the
  // map too, and would otherwise pick whichever pin sits behind them.
  if (event.originalEvent.target !== map.getCanvas()) return undefined;

  let nearest: MapGeoJSONFeature | undefined;
  let nearestDistance = Infinity;
  for (const feature of event.features ?? []) {
    if (feature.geometry.type !== "Point") continue;

    const [lng, lat] = feature.geometry.coordinates;
    // Unwrapped towards the cursor, so a pin in a neighbouring world copy
    // is measured where it is drawn.
    const pixel = map.project([unwrapLng(lng, event.lngLat.lng), lat]);
    const distance = (pixel.x - event.point.x) ** 2 + (pixel.y - event.point.y) ** 2;
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  }
  return nearest;
}
