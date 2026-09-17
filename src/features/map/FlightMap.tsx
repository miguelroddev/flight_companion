import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";

import { fetchConnectedAirports, type Airport } from "../../api/flights";
import { greatCircleLine } from "./greatCircle";
import { applyWaterColour, PIN, PIN_TIERS, ROUTE } from "./mapTheme";
import type { SelectionRole } from "../../pages/MapPage";

import "maplibre-gl/dist/maplibre-gl.css";
import "./FlightMap.css";

type FlightMapProps = {
  airports: Airport[];
  departureAirport: Airport | null;
  arrivalAirport: Airport | null;
  firstSelectedRole: SelectionRole | null;
  onAirportClick: (airport: Airport) => void;
  onAirportDeselect: (role: SelectionRole) => void;
};

// top is taller than the rest to clear the floating navbar, plus the
// airport label callouts that render above a marker's point
const FIT_BOUNDS_PADDING = { top: 100, bottom: 50, left: 20, right: 50 };

const SELECTION_FIT_BOUNDS_PADDING = { top: 140, bottom: 120, left: 370, right: 80 };

// Every airport is drawn in one GPU circle layer rather than a DOM marker each:
// the dataset is a few thousand airports and maplibre repositions every DOM
// marker on each frame of a pan. Selected airports are in here too, so they keep
// the colour of their traffic category instead of a selection colour.
const PIN_SOURCE_ID = "airport-pins";
const PIN_LAYER_ID = "airport-pins";
const PIN_LAYER_IDS = [PIN_LAYER_ID];

const NO_AIRPORTS: Airport[] = [];

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
  airports,
  departureAirport,
  arrivalAirport,
  firstSelectedRole,
  onAirportClick,
  onAirportDeselect,
}: FlightMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [worldCopyOffsets, setWorldCopyOffsets] = useState<number[]>([
    -360, 0, 360,
  ]);
  // Hover is driven straight through maplibre's feature state, never React
  // state: re-rendering to change circle-color would re-evaluate the paint
  // expression for every pin in the layer and visibly trail the cursor.
  const hoveredFeatureId = useRef<number | null>(null);

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
  const anchorDirection =
    anchorAirport === arrivalAirport ? "inbound" : "outbound";
  const anchorIata = anchorAirport?.iata;
  const anchorKey = anchorIata ? `${anchorIata}-${anchorDirection}` : null;

  // Tagged with the anchor they were fetched for, so connections from a
  // previous anchor are never drawn around the current one
  const [connections, setConnections] = useState<{
    key: string;
    airports: Airport[];
  } | null>(null);
  const connectionsLoaded = connections !== null && connections.key === anchorKey;
  const connectedAirports = connectionsLoaded ? connections.airports : NO_AIRPORTS;

  useEffect(() => {
    if (!anchorIata) return;

    const key = `${anchorIata}-${anchorDirection}`;
    const controller = new AbortController();
    fetchConnectedAirports(anchorIata, anchorDirection, controller.signal)
      .then((airports) => setConnections({ key, airports }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setConnections({ key, airports: [] });
      });
    return () => controller.abort();
  }, [anchorIata, anchorDirection]);

  const departureIata = departureAirport?.iata;
  const arrivalIata = arrivalAirport?.iata;

  // Selected airports stay in the pin layer so they keep their category colour;
  // they are only ever added, never filtered out.
  const pinAirports = useMemo(() => {
    const pins = [...(noSelection ? airports : connectedAirports)];
    const present = new Set(pins.map((airport) => airport.iata));

    for (const selected of [departureAirport, arrivalAirport]) {
      if (selected && !present.has(selected.iata)) {
        pins.push(selected);
        present.add(selected.iata);
      }
    }
    return pins;
  }, [noSelection, airports, connectedAirports, departureAirport, arrivalAirport]);

  // Feature ids must be stable per airport, not per position in the array, or a
  // hover could survive a change of pin set and light up a different airport.
  // Numbered from 1 because maplibre treats a missing id and 0 alike here.
  const featureIdByIata = useMemo(() => {
    const ids: Record<string, number> = {};
    airports.forEach((airport, index) => {
      ids[airport.iata] = index + 1;
    });
    return ids;
  }, [airports]);

  const pinGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pinAirports.map((airport) => ({
        type: "Feature" as const,
        id: featureIdByIata[airport.iata],
        properties: { iata: airport.iata, routeCount: airport.routeCount },
        geometry: {
          type: "Point" as const,
          coordinates: [airport.lng, airport.lat],
        },
      })),
    }),
    [pinAirports, featureIdByIata],
  );

  // A plain object, not a Map: the react-map-gl import shadows the global.
  const pinByIata = useMemo(
    () =>
      Object.fromEntries(
        pinAirports.map((airport) => [airport.iata, airport]),
      ) as Record<string, Airport>,
    [pinAirports],
  );

  const selectedIatas = useMemo(
    () => [departureIata, arrivalIata].filter((iata) => iata !== undefined),
    [departureIata, arrivalIata],
  );

  // Carries the role so the label's close button knows which one to clear. An
  // airport picked as both departure and arrival is labelled once.
  const labelledAirports = useMemo(() => {
    const labelled: { role: SelectionRole; airport: Airport }[] = [];
    if (departureAirport) {
      labelled.push({ role: "departure", airport: departureAirport });
    }
    if (arrivalAirport && arrivalAirport.iata !== departureAirport?.iata) {
      labelled.push({ role: "arrival", airport: arrivalAirport });
    }
    return labelled;
  }, [departureAirport, arrivalAirport]);

  const confirmedTargetId = bothSelected ? otherAirport?.iata : undefined;

  useEffect(() => {
    const CAMERA_DURATION = 1000;
    const map = mapRef.current;
    if (!map) return;

    if (!anchorAirport) {
      if (airports.length === 0) return;

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

    // Wait for this anchor's connections, otherwise the camera would
    // first zoom onto the lone anchor and then jump out again
    if (!connectionsLoaded) return;

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
      { padding: SELECTION_FIT_BOUNDS_PADDING, duration: CAMERA_DURATION },
    );
  }, [anchorAirport, airports, connectionsLoaded]);

  const networkGeoJson = anchorAirport
    ? {
        type: "FeatureCollection" as const,
        features: connectedAirports.map((airport) =>
          lineFeature(anchorAirport, airport, { targetId: airport.iata }),
        ),
      }
    : null;

  function handlePinClick(event: MapLayerMouseEvent) {
    const iata = event.features?.[0]?.properties?.iata;
    if (typeof iata !== "string") return;

    const airport = pinByIata[iata];
    if (airport) onAirportClick(airport);
  }

  // Applied straight to the map, so the colour changes in the same frame as the
  // mouse event. Derived from the cursor alone, so clicking or selecting can
  // never strand a pin in the hover colour.
  function setHoveredFeature(map: MapLayerMouseEvent["target"], next: number | null) {
    if (hoveredFeatureId.current === next) return;

    if (hoveredFeatureId.current !== null) {
      map.removeFeatureState(
        { source: PIN_SOURCE_ID, id: hoveredFeatureId.current },
        "hover",
      );
    }
    if (next !== null) {
      map.setFeatureState({ source: PIN_SOURCE_ID, id: next }, { hover: true });
    }

    hoveredFeatureId.current = next;
    map.getCanvas().style.cursor = next === null ? "" : "pointer";
  }

  function handlePinHover(event: MapLayerMouseEvent) {
    const id = event.features?.[0]?.id;
    setHoveredFeature(event.target, typeof id === "number" ? id : null);
  }

  // Feature state outlives a setData, so selecting from the search box could
  // otherwise leave a pin coral while the cursor is nowhere near the map.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || hoveredFeatureId.current === null) return;

    map.removeFeatureState(
      { source: PIN_SOURCE_ID, id: hoveredFeatureId.current },
      "hover",
    );
    hoveredFeatureId.current = null;
    map.getCanvas().style.cursor = "";
  }, [pinGeoJson]);

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
        onLoad={(e) => {
          applyWaterColour(e.target);
          syncWorldCopyOffsets(e.target);
        }}
        onMove={(e) => syncWorldCopyOffsets(e.target)}
        onResize={(e) => syncWorldCopyOffsets(e.target)}
        interactiveLayerIds={
          pinGeoJson.features.length > 0 ? PIN_LAYER_IDS : undefined
        }
        onMouseMove={handlePinHover}
        onMouseOut={(e) => setHoveredFeature(e.target, null)}
        onClick={handlePinClick}
        initialViewState={{
          longitude: 0,
          latitude: 20,
          zoom: 1.2,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
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
            {/* No casing on the network: under an 18%-opacity line a dark
                casing would be the only thing you could see. */}
            <Layer
              id="network-routes-line"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": ROUTE.network,
                "line-width": 1.75,
                "line-opacity": ROUTE.networkOpacity,
                "line-dasharray": [1, 1.5],
              }}
            />

            {confirmedTargetId && (
              <Layer
                id="confirmed-route-casing"
                type="line"
                beforeId={PIN_LAYER_ID}
                filter={["==", ["get", "targetId"], confirmedTargetId]}
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                  "line-color": ROUTE.casing,
                  "line-width": 5.5,
                }}
              />
            )}
            {confirmedTargetId && (
              <Layer
                id="confirmed-route-line"
                type="line"
                beforeId={PIN_LAYER_ID}
                filter={["==", ["get", "targetId"], confirmedTargetId]}
                layout={{ "line-join": "round", "line-cap": "round" }}
                paint={{
                  "line-color": ROUTE.selected,
                  "line-width": 3,
                }}
              />
            )}
          </Source>
        )}

        {pinGeoJson.features.length > 0 && (
          <Source id={PIN_SOURCE_ID} type="geojson" data={pinGeoJson}>
            <Layer
              id={PIN_LAYER_ID}
              type="circle"
              // Busier airports draw over quieter ones wherever they collide.
              layout={{ "circle-sort-key": ["get", "routeCount"] }}
              paint={{
                // ["step", input, <tier0>, 8, <tier1>, 25, <tier2>, 100, <tier3>]
                "circle-radius": [
                  "step",
                  ["get", "routeCount"],
                  PIN.radius * PIN_TIERS[0].scale,
                  PIN_TIERS[1].minRoutes,
                  PIN.radius * PIN_TIERS[1].scale,
                  PIN_TIERS[2].minRoutes,
                  PIN.radius * PIN_TIERS[2].scale,
                  PIN_TIERS[3].minRoutes,
                  PIN.radius * PIN_TIERS[3].scale,
                ],
                // Hover wins; otherwise every pin keeps its traffic category,
                // selected or not. Reading hover from feature state keeps this
                // expression constant, so it is never recompiled mid-hover.
                "circle-color": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  PIN.hover,
                  [
                    "step",
                    ["get", "routeCount"],
                    PIN_TIERS[0].color,
                    PIN_TIERS[1].minRoutes,
                    PIN_TIERS[1].color,
                    PIN_TIERS[2].minRoutes,
                    PIN_TIERS[2].color,
                    PIN_TIERS[3].minRoutes,
                    PIN_TIERS[3].color,
                  ],
                ],
                // Departure and arrival are marked by the ring and the label,
                // never by the fill.
                "circle-stroke-color": [
                  "case",
                  ["in", ["get", "iata"], ["literal", selectedIatas]],
                  PIN.selectedRing,
                  PIN.outline,
                ],
                "circle-stroke-width": [
                  "case",
                  ["in", ["get", "iata"], ["literal", selectedIatas]],
                  PIN.selectedRingWidth,
                  PIN.stroke,
                ],
              }}
            />
          </Source>
        )}

        {/* Label only: the pin itself is drawn in the circle layer above, so a
            selected airport keeps its category colour. */}
        {labelledAirports.flatMap(({ role, airport }) =>
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`${airport.iata}-label-${offset}`}
              longitude={airport.lng + offset}
              latitude={airport.lat}
              anchor="bottom"
              offset={[0, -(PIN.radius + PIN.selectedRingWidth + 4)]}
              // The box is inert so drags pass through to the map; only the
              // close button opts back in.
              style={{ pointerEvents: "none" }}
            >
              <span className="airport-marker-label">
                <span className="airport-marker-text">
                  <strong>{airport.iata}</strong>
                  <small>{airport.name}</small>
                </span>

                <button
                  type="button"
                  className="airport-marker-close"
                  aria-label={`Clear ${role} airport ${airport.iata}`}
                  onClick={() => onAirportDeselect(role)}
                >
                  ×
                </button>
              </span>
            </Marker>
          )),
        )}
      </Map>

      <div className="airport-legend">
        <h2 className="airport-legend-title">Airport Legend</h2>
        <p className="airport-legend-subtitle">Routes departing</p>

        <ul className="airport-legend-tiers">
          {[...PIN_TIERS].reverse().map((tier) => (
            <li key={tier.minRoutes}>
              <span className="airport-legend-swatch">
                <span
                  className="airport-legend-dot"
                  style={{
                    width: PIN.radius * tier.scale * 2,
                    height: PIN.radius * tier.scale * 2,
                    background: tier.color,
                  }}
                />
              </span>
              {tier.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default FlightMap;
