import { useEffect, useRef, useState } from "react";

import heroImage from "../../assets/branding/hero.png";
import landImage from "./land.png";
import { NetworkGlobe as Globe, type GlobeAirport } from "./globeScene";

import "./NetworkGlobe.css";

type Hover = { airport: GlobeAirport; x: number; y: number };

type NetworkGlobeProps = {
  airports: GlobeAirport[];
  arcs: [GlobeAirport, GlobeAirport][];
  // Today's route game, picked out in orange and turned to face
  highlight: { from: GlobeAirport; to: GlobeAirport } | null;
};

// Halfway along the great circle, to face a route's middle.
function midpoint(a: GlobeAirport, b: GlobeAirport): { lat: number; lng: number } {
  const vector = (airport: GlobeAirport) => {
    const phi = (airport.lat * Math.PI) / 180;
    const lambda = (airport.lng * Math.PI) / 180;
    return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
  };
  const [x, y, z] = vector(a).map((value, index) => value + vector(b)[index]);
  return {
    lat: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    lng: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

// The landing page's globe: the WebGL scene (globeScene.ts) plus the HTML
// on top of it, a tooltip for the airport under the pointer and tags on
// today's route. Without WebGL2 it falls back to the old hero illustration.
function NetworkGlobe({ airports, arcs, highlight }: NetworkGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const fromTag = useRef<HTMLSpanElement>(null);
  const toTag = useRef<HTMLSpanElement>(null);
  const highlightRef = useRef(highlight);
  const airportsRef = useRef(airports);
  const arcsRef = useRef(arcs);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    highlightRef.current = highlight;
    airportsRef.current = airports;
    arcsRef.current = arcs;
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // A fresh canvas per mount: the globe gives its WebGL context up when it
    // is destroyed, and a canvas whose context was lost cannot get another.
    // StrictMode (and hot reload) mount, unmount and mount again on the same
    // DOM, which a canvas element in the JSX would have kept.
    const canvas = document.createElement("canvas");
    canvas.className = "globe-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "A spinning globe of every airport on Flight Companion, with flights arcing out of the busiest hubs",
    );
    host.prepend(canvas);

    // The tags follow their airports frame by frame, moved directly rather
    // than through React state.
    function placeTags() {
      const globe = globeRef.current;
      const route = highlightRef.current;
      for (const [tag, airport] of [
        [fromTag.current, route?.from],
        [toTag.current, route?.to],
      ] as const) {
        if (!tag) continue;
        if (!globe || !airport) {
          tag.style.opacity = "0";
          continue;
        }
        const point = globe.project(airport.lat, airport.lng);
        tag.style.transform = `translate(${point.x}px, ${point.y}px)`;
        tag.style.opacity = point.visible ? "1" : "0";
      }
    }

    let globe: Globe;
    try {
      globe = new Globe(canvas, landImage, {
        reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        onHover: setHover,
        onFrame: placeTags,
      });
    } catch (error) {
      console.error(error);
      canvas.remove();
      setFailed(true);
      return;
    }
    globeRef.current = globe;
    // Whatever the page already has, now that there is a globe to show it.
    globe.setAirports(airportsRef.current);
    globe.setArcs(arcsRef.current);
    return () => {
      globe.destroy();
      canvas.remove();
      globeRef.current = null;
    };
  }, []);

  useEffect(() => {
    globeRef.current?.setAirports(airports);
  }, [airports]);

  useEffect(() => {
    globeRef.current?.setArcs(arcs);
  }, [arcs]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.setHighlight(highlight?.from ?? null, highlight?.to ?? null);
    if (highlight) {
      const middle = midpoint(highlight.from, highlight.to);
      // A little south of the middle, so the arc, which rises off the
      // surface, has room above it.
      globe.lookAt(middle.lat - 8, middle.lng);
    }
  }, [highlight]);

  if (failed) {
    return (
      <img
        src={heroImage}
        alt="Stylized world map with flight paths connecting several cities"
        className="globe-fallback"
      />
    );
  }

  return (
    // The canvas itself is added by the effect above.
    <div className="globe" ref={hostRef}>
      <span ref={fromTag} className="globe-tag globe-tag--from" aria-hidden="true">
        <em>From</em>
        {highlight?.from.iata}
      </span>
      <span ref={toTag} className="globe-tag globe-tag--to" aria-hidden="true">
        <em>To</em>
        {highlight?.to.iata}
      </span>
      {hover && (
        <span
          className="globe-tooltip"
          style={{ transform: `translate(${hover.x}px, ${hover.y}px)` }}
          aria-hidden="true"
        >
          <strong>{hover.airport.iata}</strong>
          {hover.airport.city || hover.airport.name}
          <small>
            {hover.airport.routeCount.toLocaleString("en-US")}{" "}
            {hover.airport.routeCount === 1 ? "route" : "routes"} out
          </small>
        </span>
      )}
    </div>
  );
}

export default NetworkGlobe;
