import { useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Marker,
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/maplibre";
import { Marker as MaplibreMarker } from "maplibre-gl";

import {
  fetchConnectedAirports,
  fetchNetwork,
  type Airport,
  type RouteFilters,
} from "../../api/flights";
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
  filters: RouteFilters;
  // Keep the airports the selection has no direct route to on the map, faded.
  showIndirect: boolean;
  // Every connection on offer, each as departure, stops and arrival in flying
  // order, and the one opened in the panel, if any.
  itineraryOptions: Airport[][];
  itineraryPath: Airport[] | null;
  onAirportClick: (airport: Airport) => void;
  onAirportDeselect: (role: SelectionRole) => void;
};

// The floating header (16px margin + 66px navbar + 12px gap + 46px filter bar)
// ends ~140px down, so every fit keeps its pins clear of that first.
// World view: only a pin and its one-line hover tag (~30px) have to fit below.
const FIT_BOUNDS_PADDING = { top: 190, bottom: 50, left: 20, right: 50 };

// Selection: a selected airport carries its label ~36px above the pin, and it
// may well be the northernmost point. An active filter grows the header to
// ~155px: 155 + 36, plus breathing room.

const SELECTION_FIT_BOUNDS_PADDING = { top: 230, bottom: 120, left: 370, right: 80 };

// Every airport is drawn in one GPU circle layer rather than a DOM marker each:
// the dataset is a few thousand airports and maplibre repositions every DOM
// marker on each frame of a pan. Selected airports are in here too, so they keep
// the colour of their traffic category instead of a selection colour.
const PIN_SOURCE_ID = "airport-pins";
const PIN_LAYER_ID = "airport-pins";
// Transparent, full-size circles drawn over the visible pins: every airport is
// as easy to hit as the largest tier, however small it looks. Only this layer
// is interactive.
const PIN_HIT_LAYER_ID = "airport-pins-hit";
const PIN_HIT_LAYER_IDS = [PIN_HIT_LAYER_ID];

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

// Feature ids must be stable per airport, not per position in some list, or a
// hover could survive a change of pin set and light up a different airport. An
// IATA code read as base 36 is unique and needs no lookup table, so a selected
// airport outside the current (filtered) list still gets one. Offset by 1
// because maplibre treats a missing id and 0 alike.
function pinFeatureId(iata: string): number {
  return parseInt(iata, 36) + 1;
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
  filters,
  showIndirect,
  itineraryOptions,
  itineraryPath,
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
  // The one-line name tag shown over a hovered pin. Imperative for the same
  // reason: as React state, every hover would re-render the map and rebuild
  // the route lines.
  const hoverLabel = useRef<MaplibreMarker | null>(null);

  useEffect(
    () => () => {
      hoverLabel.current?.remove();
    },
    [],
  );

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
  // previous anchor are never drawn around the current one. The filters are
  // part of the tag: changing them makes the old network stale too.
  const [connections, setConnections] = useState<{
    key: string;
    filters: RouteFilters;
    airports: Airport[];
  } | null>(null);
  const connectionsLoaded =
    connections !== null &&
    connections.key === anchorKey &&
    connections.filters === filters;
  const connectedAirports = connectionsLoaded ? connections.airports : NO_AIRPORTS;

  useEffect(() => {
    if (!anchorIata) return;

    const key = `${anchorIata}-${anchorDirection}`;
    const controller = new AbortController();
    fetchConnectedAirports(anchorIata, anchorDirection, filters, controller.signal)
      .then((airports) => setConnections({ key, filters, airports }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setConnections({ key, filters, airports: [] });
      });
    return () => controller.abort();
  }, [anchorIata, anchorDirection, filters]);

  // Every route of the airlines picked in the filter. Once an airport is
  // selected it stays, dimmed further, as context behind that airport's own
  // routes. Tagged with the filters it was fetched for.
  const [airlineNetwork, setAirlineNetwork] = useState<{
    filters: RouteFilters;
    pairs: [string, string][];
  } | null>(null);

  useEffect(() => {
    if (filters.airlines.length === 0) return;

    const controller = new AbortController();
    fetchNetwork(filters, controller.signal)
      .then((pairs) => setAirlineNetwork({ filters, pairs }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setAirlineNetwork({ filters, pairs: [] });
      });
    return () => controller.abort();
  }, [filters]);

  const airlineFilterOn = filters.airlines.length > 0;
  // Around a selection, airports it has no direct route to stay on the map
  // (faded) when asked to, and always under an airline filter, where they
  // are part of the airline network being shown.
  const keepUnconnected = airlineFilterOn || showIndirect;

  const airlineNetworkGeoJson = useMemo(() => {
    if (!airlineFilterOn || airlineNetwork?.filters !== filters) return null;

    const airportByIata = Object.fromEntries(
      airports.map((airport) => [airport.iata, airport]),
    ) as Record<string, Airport>;

    const features = [];
    for (const [fromIata, toIata] of airlineNetwork.pairs) {
      const from = airportByIata[fromIata];
      const to = airportByIata[toIata];
      // Absent only while the airport list for these filters is still loading.
      if (!from || !to) continue;
      features.push({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          // Half the usual detail: a big carrier flies a thousand-odd pairs,
          // and this is only ever seen zoomed out.
          coordinates: greatCircleLine(from, to, 32),
        },
      });
    }
    return { type: "FeatureCollection" as const, features };
  }, [airlineFilterOn, filters, airlineNetwork, airports]);

  const departureIata = departureAirport?.iata;
  const arrivalIata = arrivalAirport?.iata;

  // The stops of the opened connection, which are labelled like the selected
  // airports.
  const itineraryStops = useMemo(
    () => (itineraryPath ? itineraryPath.slice(1, -1) : NO_AIRPORTS),
    [itineraryPath],
  );

  // The stops of every connection on offer, which join the selected airports
  // as pins that are always shown and never faded.
  // (A plain object, not a Map: the react-map-gl import shadows the global.)
  const optionStops = useMemo(() => {
    const stops: Record<string, Airport> = {};
    for (const path of itineraryOptions) {
      for (const stop of path.slice(1, -1)) stops[stop.iata] = stop;
    }
    return Object.values(stops);
  }, [itineraryOptions]);

  // Selected airports stay in the pin layer so they keep their category colour;
  // they are only ever added, never filtered out. With keepUnconnected every
  // airport matching the filters stays on the map around a selection too,
  // with everything the selection does not connect to faded (see fadedIatas).
  const pinAirports = useMemo(() => {
    const pins = [...(noSelection || keepUnconnected ? airports : connectedAirports)];
    const present = new Set(pins.map((airport) => airport.iata));

    for (const selected of [departureAirport, arrivalAirport, ...optionStops]) {
      if (selected && !present.has(selected.iata)) {
        pins.push(selected);
        present.add(selected.iata);
      }
    }
    return pins;
  }, [
    noSelection,
    keepUnconnected,
    airports,
    connectedAirports,
    departureAirport,
    arrivalAirport,
    optionStops,
  ]);

  // The pins to recede: only with keepUnconnected and a selection, and then
  // everything except the selected airports and what the anchor connects to.
  // Until the anchor's connections arrive that is everything else, so they
  // appear to light up as they load.
  const fadedIatas = useMemo(() => {
    if (noSelection || !keepUnconnected) return null;
    const lit = new Set(connectedAirports.map((airport) => airport.iata));
    for (const selected of [departureAirport, arrivalAirport, ...optionStops]) {
      if (selected) lit.add(selected.iata);
    }
    return new Set(
      pinAirports.map((airport) => airport.iata).filter((iata) => !lit.has(iata)),
    );
  }, [
    noSelection,
    keepUnconnected,
    connectedAirports,
    departureAirport,
    arrivalAirport,
    optionStops,
    pinAirports,
  ]);

  const pinGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pinAirports.map((airport) => ({
        type: "Feature" as const,
        id: pinFeatureId(airport.iata),
        properties: {
          iata: airport.iata,
          routeCount: airport.routeCount,
          faded: fadedIatas?.has(airport.iata) ?? false,
        },
        geometry: {
          type: "Point" as const,
          coordinates: [airport.lng, airport.lat],
        },
      })),
    }),
    [pinAirports, fadedIatas],
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
    // role is null for a connection's stops, which have no close button:
    // they go away with the connection, not on their own.
    const labelled: { role: SelectionRole | null; airport: Airport }[] = [];
    if (departureAirport) {
      labelled.push({ role: "departure", airport: departureAirport });
    }
    if (arrivalAirport && arrivalAirport.iata !== departureAirport?.iata) {
      labelled.push({ role: "arrival", airport: arrivalAirport });
    }
    for (const stop of itineraryStops) {
      labelled.push({ role: null, airport: stop });
    }
    return labelled;
  }, [departureAirport, arrivalAirport, itineraryStops]);

  // Every leg of every connection on offer, once each: options often share
  // a first or last leg.
  const itineraryOptionsGeoJson = useMemo(() => {
    if (itineraryOptions.length === 0) return null;
    const legs: Record<string, [Airport, Airport]> = {};
    for (const path of itineraryOptions) {
      for (let index = 1; index < path.length; index++) {
        legs[`${path[index - 1].iata}-${path[index].iata}`] = [path[index - 1], path[index]];
      }
    }
    return {
      type: "FeatureCollection" as const,
      features: Object.values(legs).map(([from, to]) => lineFeature(from, to)),
    };
  }, [itineraryOptions]);

  // The opened connection, leg by leg, drawn like a confirmed direct route
  // over the rest.
  const itineraryGeoJson = useMemo(() => {
    if (!itineraryPath) return null;
    return {
      type: "FeatureCollection" as const,
      features: itineraryPath
        .slice(1)
        .map((to, index) => lineFeature(itineraryPath[index], to)),
    };
  }, [itineraryPath]);

  // Frames the opened connection, or all of them when none is open: stops can
  // lie well outside the view fitted to the departure's network.
  useEffect(() => {
    const map = mapRef.current;
    const framed = itineraryPath ?? itineraryOptions.flat();
    if (!map || framed.length === 0) return;

    const reference = framed[0].lng;
    const lngs = framed.map((airport) => unwrapLng(airport.lng, reference));
    const lats = framed.map((airport) => airport.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: SELECTION_FIT_BOUNDS_PADDING, duration: 1000 },
    );
  }, [itineraryPath, itineraryOptions]);

  const confirmedTargetId = bothSelected ? otherAirport?.iata : undefined;

  // The world view is fitted once per return to it, not every time the airport
  // list changes: toggling a filter refetches the list, and re-fitting would
  // yank the camera away from wherever the user had panned to.
  const worldFitted = useRef(false);

  useEffect(() => {
    const CAMERA_DURATION = 1000;
    const map = mapRef.current;
    if (!map) return;

    if (!anchorAirport) {
      if (airports.length === 0 || worldFitted.current) return;
      worldFitted.current = true;

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

    worldFitted.current = false;

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

  // Hit areas are all the same size, so they overlap far more than the pins
  // do; the pin whose centre is nearest the cursor wins, not the busiest one.
  function nearestPin(event: MapLayerMouseEvent): MapGeoJSONFeature | undefined {
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

  function handlePinClick(event: MapLayerMouseEvent) {
    const iata = nearestPin(event)?.properties?.iata;
    if (typeof iata !== "string") return;

    const airport = pinByIata[iata];
    if (airport) onAirportClick(airport);
  }

  // Applied straight to the map, so the colour changes in the same frame as the
  // mouse event. Derived from the cursor alone, so clicking or selecting can
  // never strand a pin in the hover colour.
  function showHoverLabel(
    map: MapLayerMouseEvent["target"],
    hovered: { airport: Airport; lng: number } | null,
  ) {
    // Selected airports and a connection's stops already carry a label.
    const labelled =
      hovered !== null &&
      (selectedIatas.includes(hovered.airport.iata) ||
        itineraryStops.some((stop) => stop.iata === hovered.airport.iata));
    if (!hovered || labelled) {
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

  function setHoveredFeature(
    map: MapLayerMouseEvent["target"],
    next: number | null,
    hovered: { airport: Airport; lng: number } | null = null,
  ) {
    if (hoveredFeatureId.current === next) return;
    showHoverLabel(map, hovered);

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
    const feature = nearestPin(event);
    const airport = pinByIata[feature?.properties?.iata];
    if (typeof feature?.id !== "number" || !airport) {
      setHoveredFeature(event.target, null);
      return;
    }

    // Placed on the world copy under the cursor, not the original.
    setHoveredFeature(event.target, feature.id, {
      airport,
      lng: unwrapLng(airport.lng, event.lngLat.lng),
    });
  }

  // Feature state outlives a setData, so selecting from the search box could
  // otherwise leave a pin coral while the cursor is nowhere near the map.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    hoverLabel.current?.remove();
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
          pinGeoJson.features.length > 0 ? PIN_HIT_LAYER_IDS : undefined
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

        {airlineNetworkGeoJson && airlineNetworkGeoJson.features.length > 0 && (
          <Source id="airline-network" type="geojson" data={airlineNetworkGeoJson}>
            <Layer
              id="airline-network-line"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": ROUTE.airlineNetwork,
                "line-width": 1.2,
                "line-opacity": noSelection
                  ? ROUTE.airlineNetworkOpacity
                  : ROUTE.airlineNetworkFadedOpacity,
              }}
            />
          </Source>
        )}

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

        {itineraryOptionsGeoJson && (
          <Source id="itinerary-options" type="geojson" data={itineraryOptionsGeoJson}>
            <Layer
              id="itinerary-options-line"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{
                "line-color": ROUTE.selected,
                "line-width": 2,
                // Receding once one option is opened and drawn over them.
                "line-opacity": itineraryPath
                  ? ROUTE.itineraryOptionFadedOpacity
                  : ROUTE.itineraryOptionOpacity,
              }}
            />
          </Source>
        )}

        {itineraryGeoJson && (
          <Source id="itinerary" type="geojson" data={itineraryGeoJson}>
            <Layer
              id="itinerary-casing"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{ "line-color": ROUTE.casing, "line-width": 5.5 }}
            />
            <Layer
              id="itinerary-line"
              type="line"
              beforeId={PIN_LAYER_ID}
              layout={{ "line-join": "round", "line-cap": "round" }}
              paint={{ "line-color": ROUTE.selected, "line-width": 3 }}
            />
          </Source>
        )}

        {pinGeoJson.features.length > 0 && (
          <Source id={PIN_SOURCE_ID} type="geojson" data={pinGeoJson}>
            <Layer
              id={PIN_LAYER_ID}
              type="circle"
              // Busier airports draw over quieter ones wherever they collide,
              // and every lit pin over every faded one.
              layout={{
                "circle-sort-key": [
                  "+",
                  ["get", "routeCount"],
                  ["case", ["boolean", ["get", "faded"], false], 0, 100000],
                ],
              }}
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
                // A hovered pin comes back to full strength, so a faded one
                // is still readable before it is clicked.
                "circle-opacity": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  1,
                  ["boolean", ["get", "faded"], false],
                  PIN.fadedOpacity,
                  1,
                ],
                "circle-stroke-opacity": [
                  "case",
                  ["boolean", ["feature-state", "hover"], false],
                  1,
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
              {/* The hover tag's look, plus a close button on the selected
                  airports. */}
              <span className="airport-hover-label">
                <span>{airport.name}</span>
                <strong>{airport.iata}</strong>

                {role && (
                  <button
                    type="button"
                    className="airport-marker-close"
                    aria-label={`Clear ${role} airport ${airport.iata}`}
                    onClick={() => onAirportDeselect(role)}
                  >
                    ×
                  </button>
                )}
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
