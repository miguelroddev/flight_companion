import { useEffect, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
  type MapRef,
} from "react-map-gl/maplibre";

import { airports, type Airport } from "../../data/airports";
import { getConnectedAirports } from "../../data/routes";
import { greatCircleLine } from "./greatCircle";
import type { SelectionRole } from "../../pages/MapPage";

import "maplibre-gl/dist/maplibre-gl.css";
import "./FlightMap.css";

type FlightMapProps = {
  departureAirport: Airport | null;
  arrivalAirport: Airport | null;
  firstSelectedRole: SelectionRole | null;
  onAirportClick: (airport: Airport) => void;
};

// top is taller than the rest to clear the floating navbar, plus the
// airport label callouts that render above a marker's point
const FIT_BOUNDS_PADDING = { top: 100, bottom: 50, left: 20, right: 50 };

function computeWorldCopyOffsets(map: {
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

function lineFeature(
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

function unwrapLng(lng: number, referenceLng: number): number {
  const delta = ((((lng - referenceLng) % 360) + 540) % 360) - 180;
  return referenceLng + delta;
}

function FlightMap({
  departureAirport,
  arrivalAirport,
  firstSelectedRole,
  onAirportClick,
}: FlightMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [worldCopyOffsets, setWorldCopyOffsets] = useState<number[]>([
    -360, 0, 360,
  ]);

  const bothSelected = Boolean(departureAirport && arrivalAirport);
  const noSelection = !departureAirport && !arrivalAirport;
  // Whichever role was picked first stays the anchor for the network view,
  // even after the second one is picked
  const anchorAirport =
    firstSelectedRole === "arrival"
      ? (arrivalAirport ?? departureAirport)
      : (departureAirport ?? arrivalAirport);
  const otherAirport =
    anchorAirport === departureAirport ? arrivalAirport : departureAirport;
  const connectedAirports = anchorAirport
    ? getConnectedAirports(
        anchorAirport.id,
        anchorAirport === arrivalAirport ? "arrival" : "departure",
      )
    : [];
  const previewAirports = (noSelection ? airports : connectedAirports).filter(
    (airport) =>
      airport.id !== departureAirport?.id && airport.id !== arrivalAirport?.id,
  );

  const confirmedTargetId = bothSelected ? otherAirport?.id : undefined;

  useEffect(() => {
    const CAMERA_DURATION = 1000;
    const map = mapRef.current;
    if (!map) return;

    if (!anchorAirport) {
      const lngs = airports.map((airport) => airport.lng);
      const lats = airports.map((airport) => airport.lat);
      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: FIT_BOUNDS_PADDING, duration: CAMERA_DURATION },
      );
      return;
    }

    // Fit only the airports actually on screen rather
    // than every airport in the dataset
    const visibleAirports = [
      anchorAirport,
      ...connectedAirports,
      ...(otherAirport ? [otherAirport] : []),
    ];

    const unwrappedLngs = visibleAirports.map((airport) =>
      unwrapLng(airport.lng, anchorAirport.lng),
    );
    const lats = visibleAirports.map((airport) => airport.lat);

    map.fitBounds(
      [
        [Math.min(...unwrappedLngs), Math.min(...lats)],
        [Math.max(...unwrappedLngs), Math.max(...lats)],
      ],
      { padding: FIT_BOUNDS_PADDING, duration: CAMERA_DURATION },
    );
  }, [anchorAirport]);

  const networkGeoJson = anchorAirport
    ? {
        type: "FeatureCollection" as const,
        features: connectedAirports.map((airport) =>
          lineFeature(anchorAirport, airport, { targetId: airport.id }),
        ),
      }
    : null;

  function syncWorldCopyOffsets(map: Parameters<typeof computeWorldCopyOffsets>[0]) {
    const next = computeWorldCopyOffsets(map);
    setWorldCopyOffsets((prev) =>
      prev.length === next.length && prev.every((value, i) => value === next[i])
        ? prev
        : next,
    );
  }

  return (
    <div className="flight-map">
      <Map
        ref={mapRef}
        onLoad={(e) => syncWorldCopyOffsets(e.target)}
        onMove={(e) => syncWorldCopyOffsets(e.target)}
        onResize={(e) => syncWorldCopyOffsets(e.target)}
        initialViewState={{
          longitude: 0,
          latitude: 20,
          zoom: 1.2,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        dragRotate={false}
        touchPitch={false}
        maxPitch={0}
        // On narrow viewports, fitting a network with a very wide-flung
        // connection can require zooming out past "1 world"
        minZoom={-2}
      >
        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" />

        {networkGeoJson && networkGeoJson.features.length > 0 && (
          <Source id="network-routes" type="geojson" data={networkGeoJson}>
            <Layer
              id="network-routes-casing"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#000000",
                "line-width": 3.5,
                "line-opacity": 0.5,
              }}
            />
            <Layer
              id="network-routes-line"
              type="line"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": "#e2e8f0",
                "line-width": 1.75,
                "line-opacity": 0.9,
                "line-dasharray": [1, 1.5],
              }}
            />

            {confirmedTargetId && (
              <Layer
                id="confirmed-route-casing"
                type="line"
                filter={["==", ["get", "targetId"], confirmedTargetId]}
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                  "line-color": "#000000",
                  "line-width": 5.5,
                  "line-opacity": 0.55,
                }}
              />
            )}
            {confirmedTargetId && (
              <Layer
                id="confirmed-route-line"
                type="line"
                filter={["==", ["get", "targetId"], confirmedTargetId]}
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                  "line-color": "#facc15",
                  "line-width": 3,
                }}
              />
            )}
          </Source>
        )}

        {previewAirports.flatMap((airport) =>
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`${airport.id}-${offset}`}
              longitude={airport.lng + offset}
              latitude={airport.lat}
              anchor="bottom"
            >
              <div
                className="airport-marker airport-marker--available"
                onClick={() => onAirportClick(airport)}
              />
            </Marker>
          )),
        )}

        {departureAirport &&
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`departure-${offset}`}
              longitude={departureAirport.lng + offset}
              latitude={departureAirport.lat}
              anchor="bottom"
            >
              <div
                className="airport-marker airport-marker--departure"
                onClick={() => onAirportClick(departureAirport)}
              >
                <span className="airport-marker-label">
                  <strong>{departureAirport.iata}</strong>
                  <small>{departureAirport.name}</small>
                </span>
              </div>
            </Marker>
          ))}

        {arrivalAirport &&
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`arrival-${offset}`}
              longitude={arrivalAirport.lng + offset}
              latitude={arrivalAirport.lat}
              anchor="bottom"
            >
              <div
                className="airport-marker airport-marker--arrival"
                onClick={() => onAirportClick(arrivalAirport)}
              >
                <span className="airport-marker-label">
                  <strong>{arrivalAirport.iata}</strong>
                  <small>{arrivalAirport.name}</small>
                </span>
              </div>
            </Marker>
          ))}
      </Map>
    </div>
  );
}

export default FlightMap;
