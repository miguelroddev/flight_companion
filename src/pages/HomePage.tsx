import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";

import {
  fetchAirlines,
  fetchAirports,
  fetchConnectedAirports,
  fetchGamePuzzle,
  NO_FILTERS,
  type Airport,
  type GamePuzzle,
} from "../api/flights";
import { haversineDistanceKm } from "../data/geo";
import NetworkGlobe from "../features/landing/NetworkGlobe";
import logo from "../assets/branding/logo.png";

import "./HomePage.css";

const GITHUB_URL = "https://github.com/miguelroddev/flight_companion";
const DAILY_GAME_URL = "/play?difficulty=medium&daily=1";

// Hubs the globe's arcs fly out of: the busiest airports by routes, spread
// out so one region does not take every arc.
const HUB_COUNT = 10;
const HUB_SPACING_KM = 2000;
// From each hub, its longest routes: the arcs that read best on a globe.
const ARCS_PER_HUB = 8;
const MIN_ARC_KM = 1200;

const NO_ARCS: [Airport, Airport][] = [];

function pickHubs(airports: Airport[]): Airport[] {
  const hubs: Airport[] = [];
  for (const airport of [...airports].sort((a, b) => b.routeCount - a.routeCount)) {
    if (hubs.every((hub) => haversineDistanceKm(hub, airport) >= HUB_SPACING_KM)) {
      hubs.push(airport);
      if (hubs.length === HUB_COUNT) break;
    }
  }
  return hubs;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// A number counting up to its value once it is known.
function CountUp({ value }: { value: number | null }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (value === null) return;
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min((now - start) / 1400, 1);
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{value === null ? "—" : shown.toLocaleString("en-US")}</>;
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 19 19" className="landing-icon" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M9.356 1.85C5.05 1.85 1.57 5.356 1.57 9.694a7.84 7.84 0 0 0 5.324 7.44c.387.079.528-.168.528-.376 0-.182-.013-.805-.013-1.454-2.165.467-2.616-.935-2.616-.935-.349-.91-.864-1.143-.864-1.143-.71-.48.051-.48.051-.48.787.051 1.2.805 1.2.805.695 1.194 1.817.857 2.268.649.064-.507.27-.857.49-1.052-1.728-.182-3.545-.857-3.545-3.87 0-.857.31-1.558.8-2.104-.078-.195-.349-1 .077-2.078 0 0 .657-.208 2.14.805a7.5 7.5 0 0 1 1.946-.26c.657 0 1.328.092 1.946.26 1.483-1.013 2.14-.805 2.14-.805.426 1.078.155 1.883.078 2.078.502.546.799 1.247.799 2.104 0 3.013-1.818 3.675-3.558 3.87.284.247.528.714.528 1.454 0 1.052-.012 1.896-.012 2.156 0 .208.142.455.528.377a7.84 7.84 0 0 0 5.324-7.441c.013-4.338-3.48-7.844-7.773-7.844"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="landing-icon" aria-hidden="true">
      <path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
    </svg>
  );
}

// Today's route game as a boarding-pass ticket, like the game's own panel.
function DailyTicket({ puzzle }: { puzzle: GamePuzzle | null }) {
  const km = puzzle ? Math.round(haversineDistanceKm(puzzle.departure, puzzle.arrival)) : null;
  return (
    <Link to={DAILY_GAME_URL} className="landing-ticket" aria-label="Play today's route">
      <span className="landing-ticket-head">
        <span>Today's route</span>
        <span>Medium</span>
      </span>
      <span className="landing-ticket-route">
        <span className="landing-ticket-end">
          <small>From</small>
          <strong>{puzzle?.departure.iata ?? "···"}</strong>
          <span>{puzzle ? puzzle.departure.city || puzzle.departure.name : " "}</span>
        </span>
        <span className="landing-ticket-path" aria-hidden="true">
          <svg viewBox="0 0 120 30" preserveAspectRatio="none">
            <path d="M4 26 Q60 -8 116 26" />
          </svg>
          <span>{km === null ? " " : `${km.toLocaleString("en-US")} km`}</span>
        </span>
        <span className="landing-ticket-end landing-ticket-end--to">
          <small>To</small>
          <strong>{puzzle?.arrival.iata ?? "···"}</strong>
          <span>{puzzle ? puzzle.arrival.city || puzzle.arrival.name : " "}</span>
        </span>
      </span>
      <span className="landing-ticket-foot">
        No direct flight. How few can you do it in?
        <span className="landing-ticket-play">
          Play
          <ArrowIcon />
        </span>
      </span>
    </Link>
  );
}

// The front page: a live globe of the whole network, the numbers behind it,
// and a way into each half of the app.
function HomePage() {
  const [airports, setAirports] = useState<Airport[]>([]);
  const [airlineCount, setAirlineCount] = useState<number | null>(null);
  const [daily, setDaily] = useState<GamePuzzle | null>(null);
  const [arcs, setArcs] = useState<[Airport, Airport][]>(NO_ARCS);
  // The busiest hub and how many airports it flies to, for the map's card.
  const [topHub, setTopHub] = useState<{ airport: Airport; destinations: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const report = (error: unknown) => {
      if (!controller.signal.aborted) console.error(error);
    };
    fetchAirports(NO_FILTERS, controller.signal).then(setAirports).catch(report);
    fetchAirlines()
      .then((airlines) => setAirlineCount(airlines.length))
      .catch(report);
    fetchGamePuzzle("medium", { daily: true }, controller.signal).then(setDaily).catch(report);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (airports.length === 0) return;
    const controller = new AbortController();
    const hubs = pickHubs(airports);
    Promise.all(
      hubs.map((hub) =>
        fetchConnectedAirports(hub.iata, "outbound", NO_FILTERS, controller.signal)
          .then((destinations) => ({ hub, destinations }))
          .catch(() => ({ hub, destinations: [] as Airport[] })),
      ),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setArcs(
        results.flatMap(({ hub, destinations }) =>
          destinations
            .map((destination) => ({ destination, km: haversineDistanceKm(hub, destination) }))
            .filter(({ km }) => km >= MIN_ARC_KM)
            .sort((a, b) => b.km - a.km)
            .slice(0, ARCS_PER_HUB)
            .map(({ destination }): [Airport, Airport] => [hub, destination]),
        ),
      );
      const [first] = results;
      if (first) setTopHub({ airport: first.hub, destinations: first.destinations.length });
    });
    return () => controller.abort();
  }, [airports]);

  const routeCount = useMemo(
    () => (airports.length ? airports.reduce((sum, airport) => sum + airport.routeCount, 0) : null),
    [airports],
  );

  const highlight = useMemo(
    () => (daily ? { from: daily.departure, to: daily.arrival } : null),
    [daily],
  );

  return (
    <div className="landing">
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <img src={logo} alt="" />
          Flight Companion
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/map">Explore map</Link>
          <Link to="/play">Route game</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="landing-nav-github">
            <GitHubIcon />
            <span>GitHub</span>
          </a>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">Open-source flight explorer</p>
          <h1>
            Every airport.
            <br />
            Every route.
            <span>One living map.</span>
          </h1>
          <p className="landing-lede">
            Pick any airport to see everywhere you can fly direct, and every airline that
            flies there. No direct flight? Flight Companion finds the best ways there with a
            stop or two.
          </p>
          <div className="landing-ctas">
            <Link to="/map" className="landing-button landing-button--primary">
              Explore the map
              <ArrowIcon />
            </Link>
            <Link to={DAILY_GAME_URL} className="landing-button">
              Play today's route
            </Link>
            <Link to="/play" className="landing-button">
              Route game
            </Link>
          </div>

          <dl className="landing-stats">
            <div>
              <dt>Airports</dt>
              <dd>
                <CountUp value={airports.length ? airports.length : null} />
              </dd>
            </div>
            <div>
              <dt>Airline routes</dt>
              <dd>
                <CountUp value={routeCount} />
              </dd>
            </div>
            <div>
              <dt>Airlines</dt>
              <dd>
                <CountUp value={airlineCount} />
              </dd>
            </div>
          </dl>
        </div>

        <figure className="landing-globe">
          <NetworkGlobe airports={airports} arcs={arcs} highlight={highlight} />
          <figcaption>
            Every dot is a real airport, coloured by how busy it is.{" "}
            <span className="landing-orange">Orange</span> is today's route game. Drag to
            spin.
          </figcaption>
        </figure>
      </section>

      <section className="landing-features" aria-labelledby="features-title">
        <h2 id="features-title">Two ways to explore</h2>

        <article className="landing-card">
          <p className="landing-card-kicker">Explore map</p>
          <h3>See everywhere you can fly</h3>
          <ul>
            <li>Every direct route from any airport, with the airlines that fly it.</li>
            <li>No direct flight? Connections with up to two stops, fastest first.</li>
            <li>Narrow it down by alliance, airline, distance and flight time.</li>
          </ul>
          {topHub && (
            <p className="landing-fact">
              <strong>{topHub.destinations.toLocaleString("en-US")}</strong> airports
              reachable nonstop from {topHub.airport.city || topHub.airport.name} (
              {topHub.airport.iata}), the airport with the most routes on the map.
            </p>
          )}
          <Link to="/map" className="landing-card-link">
            Open the map
            <ArrowIcon />
          </Link>
        </article>

        <article className="landing-card landing-card--game">
          <p className="landing-card-kicker">Route game</p>
          <h3>Find the best way there</h3>
          <p>
            Two airports with no direct flight between them. Connect them one flight at a
            time: the fewest flights wins, then the shortest distance. A new route every
            day, the same for everyone.
          </p>
          <DailyTicket puzzle={daily} />
          <Link to="/play" className="landing-card-link">
            Open the route game
            <ArrowIcon />
          </Link>
        </article>
      </section>

      <section className="landing-oss">
        <h2>Built in the open</h2>
        <p>
          Flight Companion is open source. Spotted a route that doesn't exist, or an
          airport in the wrong place? Open an issue or send a pull request.
        </p>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="landing-button">
          <GitHubIcon />
          View on GitHub
        </a>
      </section>

      <footer className="landing-footer">
        <img src={logo} alt="" />
        Flight Companion
      </footer>
    </div>
  );
}

export default HomePage;
