import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { Marker as MaplibreMarker } from "maplibre-gl";

import type { Airport } from "../../api/flights";
import {
  boundsOf,
  computeWorldCopyOffsets,
  lineFeature,
  nearestPin,
  pinFeatureId,
  unwrapLng,
} from "../map/mapGeometry";
import {
  applyWaterColour,
  PIN,
  PIN_COLOR_BY_TIER,
  PIN_RADIUS_BY_TIER,
  ROUTE,
} from "../map/mapTheme";
import { isMobileLayout } from "../../styles/breakpoints";
import departurePin from "../../assets/branding/departure-pin.png";
import arrivalPin from "../../assets/branding/arrival-pin.png";

import "maplibre-gl/dist/maplibre-gl.css";
import "../map/FlightMap.css";
import "./GameMap.css";

type GameMapProps = {
  // Every airport: the backdrop before a game, and the choice in one played
  // without hints.
  airports: Airport[];
  // Null before a game starts
  arrival: Airport | null;
  // Flown so far, departure first
  path: Airport[];
  // Where the player can fly next, drawn as the only choices; null when the
  // game is played without hints, and every airport is a choice.
  options: Airport[] | null;
  // The best route, shown once the game is over
  bestPath: Airport[] | null;
  // Null when the map is only to be looked at
  onAirportClick: ((airport: Airport) => void) | null;
};

const PIN_SOURCE_ID = "game-pins";
const PIN_LAYER_ID = "game-pins";
// Transparent, full-size circles over the pins, so the smallest airport is as
// easy to hit as the busiest. Only this layer is interactive.
const PIN_HIT_LAYER_ID = "game-pins-hit";
const PIN_HIT_LAYER_IDS = [PIN_HIT_LAYER_ID];

const NO_AIRPORTS: Airport[] = [];

// The departure and arrival stand on pin images, tip on the airport, so the
// two ends of the puzzle cannot be mistaken for each other or for any stop.
const END_PIN_SIZE = 38;

type LabelRole = "from" | "to" | "here";

const ROLE_TAGS: Record<LabelRole, string> = { from: "From", to: "To", here: "You're here" };

// On desktop the game panel (376px with its margin) floats over the left of
// the map and the navbar (~70px) over its top; on phones both sit outside the
// map (GamePage.css). Labels are centred ~36px above their pins and can be
// ~120px wide, so a pin needs that much room more on every side.
function fitPadding() {
  return isMobileLayout()
    ? { top: 56, bottom: 56, left: 64, right: 64 }
    : { top: 120, bottom: 60, left: 470, right: 110 };
}

// The route game's map: the player's route so far, where it can go next, and
// at the end the best route beside it. A cut-down sibling of FlightMap, which
// is built around picking two airports to explore between.
function GameMap({
  airports,
  arrival,
  path,
  options,
  bestPath,
  onAirportClick,
}: GameMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [worldCopyOffsets, setWorldCopyOffsets] = useState<number[]>([-360, 0, 360]);
  // Hover goes through maplibre's feature state and an imperative marker, as
  // in FlightMap: as React state it would re-render every pin per mouse move.
  const hoveredFeatureId = useRef<number | null>(null);
  const hoverLabel = useRef<MaplibreMarker | null>(null);

  useEffect(
    () => () => {
      hoverLabel.current?.remove();
    },
    [],
  );

  const playing = arrival !== null;
  const departure = path[0] ?? null;
  const current = path.at(-1) ?? null;
  // Where the player stands, while there is still a move to make.
  const here = playing && !bestPath ? current : null;

  function roleOf(airport: Airport): LabelRole | null {
    if (airport.iata === departure?.iata) return "from";
    if (airport.iata === arrival?.iata) return "to";
    if (airport.iata === here?.iata) return "here";
    return null;
  }

  const ends = [departure, arrival].filter((airport) => airport !== null);

  // The airports the game is about, always on the map and labelled: the
  // route flown so far, the arrival, and the best route once it is shown.
  const marked = useMemo(() => {
    const marked: Record<string, Airport> = {};
    for (const airport of [...path, ...(bestPath ?? NO_AIRPORTS)]) {
      marked[airport.iata] = airport;
    }
    if (arrival) marked[arrival.iata] = arrival;
    return marked;
  }, [path, bestPath, arrival]);

  // The best route's airports that the player did not fly through, whose
  // labels take the best route's green.
  const bestStops = useMemo(() => {
    const flown = new Set(path.map((airport) => airport.iata));
    return new Set(
      (bestPath ?? NO_AIRPORTS)
        .map((airport) => airport.iata)
        .filter((iata) => !flown.has(iata)),
    );
  }, [path, bestPath]);

  // Before a game, every airport as a faded backdrop. During one, the choices
  // and the marked airports. After it, the marked airports alone.
  const pinAirports = useMemo(() => {
    let shown: Airport[];
    if (!playing) shown = airports;
    else if (bestPath) shown = NO_AIRPORTS;
    // Without hints every airport is a choice.
    else shown = options ?? airports;

    const pins: Record<string, Airport> = {};
    for (const airport of shown) pins[airport.iata] = airport;
    Object.assign(pins, marked);
    return Object.values(pins);
  }, [playing, options, bestPath, airports, marked]);

  const pinGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pinAirports.map((airport) => ({
        type: "Feature" as const,
        id: pinFeatureId(airport.iata),
        properties: {
          iata: airport.iata,
          routeCount: airport.routeCount,
          faded: !playing,
          marked: airport.iata in marked,
        },
        geometry: { type: "Point" as const, coordinates: [airport.lng, airport.lat] },
      })),
    }),
    [pinAirports, playing, marked],
  );

  // A plain object, not a Map: the react-map-gl import shadows the global.
  const pinByIata = useMemo(
    () =>
      Object.fromEntries(pinAirports.map((airport) => [airport.iata, airport])) as Record<
        string,
        Airport
      >,
    [pinAirports],
  );

  // From where the player is to everywhere it can fly next, like the
  // network around a selected airport on the explore map.
  const optionsGeoJson = useMemo(() => {
    if (!current || !options || bestPath) return null;
    return {
      type: "FeatureCollection" as const,
      features: options.map((airport) => lineFeature(current, airport)),
    };
  }, [current, options, bestPath]);

  const pathGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: path.slice(1).map((to, index) => lineFeature(path[index], to)),
    }),
    [path],
  );

  const bestGeoJson = useMemo(
    () =>
      bestPath && {
        type: "FeatureCollection" as const,
        features: bestPath.slice(1).map((to, index) => lineFeature(bestPath[index], to)),
      },
    [bestPath],
  );

  // Frames the route so far and the arrival as the game goes, and both
  // routes at the end. Keyed by the codes, so new but equal arrays (a
  // refetch) do not move the camera.
  const framed = useMemo(
    () => (arrival ? [...path, ...(bestPath ?? [arrival])] : NO_AIRPORTS),
    [path, bestPath, arrival],
  );
  const framedKey = framed.map((airport) => airport.iata).join("-");

  useEffect(() => {
    const map = mapRef.current;
    if (!map || framed.length === 0) return;
    map.fitBounds(boundsOf(framed), { padding: fitPadding(), duration: 1000, maxZoom: 6 });
    // framed is read through its key, see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framedKey]);

  function showHoverLabel(
    map: MapLayerMouseEvent["target"],
    hovered: { airport: Airport; lng: number } | null,
  ) {
    // Marked airports already carry a label.
    if (!hovered || hovered.airport.iata in marked) {
      hoverLabel.current?.remove();
      return;
    }

    let label = hoverLabel.current;
    if (!label) {
      const element = document.createElement("div");
      element.className = "airport-hover-label";
      label = new MaplibreMarker({
        element,
        anchor: "bottom",
        offset: [0, -(PIN.radius + PIN.stroke + 3)],
      });
      hoverLabel.current = label;
    }

    const name = document.createElement("span");
    name.textContent = hovered.airport.name;
    const code = document.createElement("strong");
    code.textContent = hovered.airport.iata;
    label.getElement().replaceChildren(name, code);
    label.setLngLat([hovered.lng, hovered.airport.lat]).addTo(map);
  }

  function setHovered(
    map: MapLayerMouseEvent["target"],
    next: number | null,
    hovered: { airport: Airport; lng: number } | null = null,
  ) {
    if (hoveredFeatureId.current === next) return;
    showHoverLabel(map, hovered);

    if (hoveredFeatureId.current !== null) {
      map.removeFeatureState({ source: PIN_SOURCE_ID, id: hoveredFeatureId.current }, "hover");
    }
    if (next !== null) {
      map.setFeatureState({ source: PIN_SOURCE_ID, id: next }, { hover: true });
    }
    hoveredFeatureId.current = next;
    map.getCanvas().style.cursor = next === null ? "" : "pointer";
  }

  function handlePinHover(event: MapLayerMouseEvent) {
    const feature = nearestPin(event);
    const airport = pinByIata[feature?.properties?.iata];
    if (typeof feature?.id !== "number" || !airport) {
      setHovered(event.target, null);
      return;
    }
    // Placed on the world copy under the cursor, not the original.
    setHovered(event.target, feature.id, {
      airport,
      lng: unwrapLng(airport.lng, event.lngLat.lng),
    });
  }

  function handlePinClick(event: MapLayerMouseEvent) {
    const airport = pinByIata[nearestPin(event)?.properties?.iata];
    if (airport && onAirportClick) onAirportClick(airport);
  }

  // Feature state outlives a setData, so a pin hovered as the pins change
  // would otherwise stay red.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    hoverLabel.current?.remove();
    if (!map || hoveredFeatureId.current === null) return;
    map.removeFeatureState({ source: PIN_SOURCE_ID, id: hoveredFeatureId.current }, "hover");
    hoveredFeatureId.current = null;
    map.getCanvas().style.cursor = "";
  }, [pinGeoJson]);

  function syncWorldCopyOffsets(map: Parameters<typeof computeWorldCopyOffsets>[0]) {
    const next = computeWorldCopyOffsets(map);
    setWorldCopyOffsets((prev) =>
      prev.length === next.length && prev.every((value, i) => value === next[i]) ? prev : next,
    );
  }

  const interactive = onAirportClick !== null && pinGeoJson.features.length > 0;

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
        interactiveLayerIds={interactive ? PIN_HIT_LAYER_IDS : undefined}
        onMouseMove={interactive ? handlePinHover : undefined}
        onMouseOut={(e) => setHovered(e.target, null)}
        onClick={interactive ? handlePinClick : undefined}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.2, pitch: 0, bearing: 0 }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        dragRotate={false}
        touchPitch={false}
        maxPitch={0}
        minZoom={-2}
      >
        <NavigationControl position="bottom-right" />

        {/* First, so the route layers below can be slotted in under it by
            beforeId: that layer has to exist when they are added. */}
        <Source id={PIN_SOURCE_ID} type="geojson" data={pinGeoJson}>
          <Layer
            id={PIN_LAYER_ID}
            type="circle"
            // The game's own airports over every other, then busiest first.
            layout={{
              "circle-sort-key": [
                "+",
                ["get", "routeCount"],
                ["case", ["boolean", ["get", "marked"], false], 100000, 0],
              ],
            }}
            paint={{
              "circle-radius": PIN_RADIUS_BY_TIER,
              "circle-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                PIN.hover,
                PIN_COLOR_BY_TIER,
              ],
              "circle-stroke-color": [
                "case",
                ["boolean", ["get", "marked"], false],
                PIN.selectedRing,
                PIN.outline,
              ],
              "circle-stroke-width": [
                "case",
                ["boolean", ["get", "marked"], false],
                PIN.selectedRingWidth,
                PIN.stroke,
              ],
              "circle-opacity": ["case", ["boolean", ["get", "faded"], false], PIN.fadedOpacity, 1],
              "circle-stroke-opacity": [
                "case",
                ["boolean", ["get", "faded"], false],
                PIN.fadedOpacity,
                1,
              ],
            }}
          />
          <Layer
            id={PIN_HIT_LAYER_ID}
            type="circle"
            // Hit-testing ignores opacity, so these stay clickable.
            paint={{
              "circle-radius": PIN.radius,
              "circle-stroke-width": PIN.stroke,
              "circle-opacity": 0,
              "circle-stroke-opacity": 0,
            }}
          />
        </Source>

        <Source id="game-path" type="geojson" data={pathGeoJson}>
          <Layer
            id="game-path-casing"
            type="line"
            beforeId={PIN_LAYER_ID}
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{ "line-color": ROUTE.casing, "line-width": 5.5 }}
          />
          <Layer
            id="game-path-line"
            type="line"
            beforeId={PIN_LAYER_ID}
            layout={{ "line-join": "round", "line-cap": "round" }}
            paint={{ "line-color": ROUTE.selected, "line-width": 3 }}
          />
        </Source>

        {optionsGeoJson && (
          <Source id="game-options" type="geojson" data={optionsGeoJson}>
            {/* Under the route flown, which is always there and comes first:
                added later than it, these would otherwise land on top. */}
            <Layer
              id="game-options-line"
              type="line"
              beforeId="game-path-casing"
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": ROUTE.network,
                "line-width": 1.75,
                "line-opacity": ROUTE.networkOpacity,
                "line-dasharray": [1, 1.5],
              }}
            />
          </Source>
        )}

        {/* Dashed and over the player's route, so where the two agree the
            navy shows through the gaps. */}
        {bestGeoJson && (
          <Source id="game-best" type="geojson" data={bestGeoJson}>
            <Layer
              id="game-best-line"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round" }}
              paint={{ "line-color": ROUTE.best, "line-width": 3, "line-dasharray": [2, 1.5] }}
            />
          </Source>
        )}


        {/* Under the labels: a ring pulsing where the player stands. */}
        {here &&
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`here-${offset}`}
              longitude={here.lng + offset}
              latitude={here.lat}
              anchor="center"
              style={{ pointerEvents: "none" }}
            >
              <span className="game-here-ring" />
            </Marker>
          ))}

        {/* Inert, so a click lands on the canvas and the pin under the tip. */}
        {ends.flatMap((airport) =>
          worldCopyOffsets.map((offset) => (
            <Marker
              key={`${airport.iata}-end-${offset}`}
              longitude={airport.lng + offset}
              latitude={airport.lat}
              anchor="bottom"
              style={{ pointerEvents: "none" }}
            >
              <img
                src={airport === departure ? departurePin : arrivalPin}
                alt=""
                width={END_PIN_SIZE}
                height={END_PIN_SIZE}
                className="game-end-pin"
              />
            </Marker>
          )),
        )}

        {Object.values(marked).flatMap((airport) => {
          const role = roleOf(airport);
          // Above the pin image at either end, above the circle elsewhere.
          const lift =
            role === "from" || role === "to"
              ? END_PIN_SIZE + 2
              : PIN.radius + PIN.selectedRingWidth + 4;
          const classes = ["airport-hover-label"];
          if (bestStops.has(airport.iata)) classes.push("airport-hover-label--best");
          if (role) classes.push(`game-label--${role}`);

          return worldCopyOffsets.map((offset) => (
            <Marker
              key={`${airport.iata}-label-${offset}`}
              longitude={airport.lng + offset}
              latitude={airport.lat}
              anchor="bottom"
              offset={[0, -lift]}
              style={{ pointerEvents: "none" }}
            >
              <span className={classes.join(" ")}>
                {role && <em className="game-label-role">{ROLE_TAGS[role]}</em>}
                <span className="airport-label-place">{airport.city || airport.name}</span>
                <strong>{airport.iata}</strong>
              </span>
            </Marker>
          ));
        })}
      </Map>
    </div>
  );
}

export default GameMap;
