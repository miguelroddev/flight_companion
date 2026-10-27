import { useEffect, useId, useState } from "react";

import type { Airport, Difficulty, GamePuzzle, GameRoute } from "../../api/flights";
import { haversineDistanceKm } from "../../data/geo";
import AirportSearchInput from "../airports/AirportSearchInput";
import departurePin from "../../assets/branding/departure-pin.png";
import arrivalPin from "../../assets/branding/arrival-pin.png";
import { Icon } from "./icons";
import {
  comparison,
  DIFFICULTIES,
  difficultyLabel,
  difficultyLevel,
  FLIGHT_PENALTY,
  finalScore,
  flightCount,
  formatKm,
  MISS_PENALTY,
  PERFECT_SCORE,
  puzzleKind,
  shareText,
  shortDate,
  starCount,
  TWO_STAR_SCORE,
  verdict,
} from "./scoring";

import "./GamePanel.css";

export type GameSettings = {
  difficulty: Difficulty;
  // Show where the player can fly next, or leave it to them to know
  hints: boolean;
};

// How a game ended: scored on reaching the arrival, or given up on and only
// shown the best route.
export type GameEnding =
  | { kind: "finished"; route: GameRoute; best: GameRoute; score: number }
  | { kind: "gave-up"; best: GameRoute };

function placeName(airport: Airport) {
  return airport.city || airport.name;
}

function missCount(misses: number) {
  return misses === 1 ? "1 flight that doesn't exist" : `${misses} flights that don't exist`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The star rules, worded the same wherever they are shown. Stars rate the
// route alone, so the misses that cost points never cost a star.
const STAR_RULES = `Stars rate your route before misses: three for the best route, two for a route score of ${TWO_STAR_SCORE}+, one for getting there.`;

// Three rising bars, as many lit as the level: a signal-strength look.
function LevelBars({ level }: { level: number }) {
  return (
    <span className="game-level-bars" aria-hidden="true">
      {[1, 2, 3].map((bar) => (
        <span key={bar} className={bar <= level ? "is-on" : undefined} />
      ))}
    </span>
  );
}

// The head of every panel once a puzzle is dealt, read like a boarding pass:
// where from, where to, and what kind of game it is.
function Ticket({ puzzle }: { puzzle: GamePuzzle }) {
  const km = haversineDistanceKm(puzzle.departure, puzzle.arrival);
  return (
    <header className="game-ticket">
      <div className="game-ticket-chips">
        <span className="game-chip">
          <Icon name={puzzle.daily ? "calendar" : "shuffle"} />
          {puzzleKind(puzzle)}
        </span>
        <span className="game-chip">
          <LevelBars level={difficultyLevel(puzzle.difficulty)} />
          {difficultyLabel(puzzle.difficulty)}
        </span>
      </div>

      <div className="game-ticket-route">
        <div className="game-ticket-end" title={puzzle.departure.name}>
          <span className="game-ticket-role">
            <img src={departurePin} alt="" />
            From
          </span>
          <span className="game-ticket-code">{puzzle.departure.iata}</span>
          <span className="game-ticket-place">{placeName(puzzle.departure)}</span>
        </div>

        <div className="game-ticket-path" aria-hidden="true">
          <svg viewBox="0 0 120 30" preserveAspectRatio="none" className="game-ticket-arc">
            <path d="M4 26 Q60 -8 116 26" />
          </svg>
          <Icon name="flight" className="game-ticket-plane" />
          <span className="game-ticket-distance">{formatKm(km)}</span>
        </div>

        <div className="game-ticket-end game-ticket-end--to" title={puzzle.arrival.name}>
          <span className="game-ticket-role">
            <img src={arrivalPin} alt="" />
            To
          </span>
          <span className="game-ticket-code">{puzzle.arrival.iata}</span>
          <span className="game-ticket-place">{placeName(puzzle.arrival)}</span>
        </div>
      </div>
    </header>
  );
}

type GameSetupProps = {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onDaily: () => void;
  onRandom: () => void;
  loading: boolean;
  error: string | null;
};

export function GameSetup({ settings, onChange, onDaily, onRandom, loading, error }: GameSetupProps) {
  const difficultyId = useId();
  return (
    <section className="game-panel game-panel--setup" aria-label="Route game">
      <header className="game-ticket game-intro">
        <span className="game-eyebrow">
          <Icon name="flight" />
          Route game
        </span>
        <h2 className="game-intro-title">Find the best way there</h2>
        <p className="game-intro-text">
          Two airports with no direct flight between them. Connect them one flight at a time, and
          score up to {PERFECT_SCORE} for the best route.
        </p>
      </header>

      <div className="game-body">
        <div>
          <h3 className="game-label" id={difficultyId}>
            Difficulty
          </h3>
          <div className="game-levels" role="radiogroup" aria-labelledby={difficultyId}>
            {DIFFICULTIES.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                className="game-level"
                aria-checked={settings.difficulty === option.id}
                onClick={() => onChange({ ...settings, difficulty: option.id })}
              >
                <LevelBars level={index + 1} />
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
        </div>

        <label className="game-switch-row">
          <span className="game-switch-icon">
            <Icon name="bulb" />
          </span>
          <span className="game-switch-text">
            <strong>Show where I can fly</strong>
            <small>
              {settings.hints
                ? "Every flight from your airport is drawn on the map."
                : `Off: guess freely. A flight that doesn't exist costs ${MISS_PENALTY} points.`}
            </small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="game-switch"
            checked={settings.hints}
            onChange={(event) => onChange({ ...settings, hints: event.target.checked })}
          />
        </label>

        <div className="game-cta">
          <button
            type="button"
            className="game-start game-start--primary"
            onClick={onDaily}
            disabled={loading}
          >
            <span className="game-start-icon">
              <Icon name="calendar" />
            </span>
            <span className="game-start-text">
              <strong>Today's route</strong>
              <small>{shortDate()} · the same for everyone</small>
            </span>
            <Icon name="arrow" className="game-start-arrow" />
          </button>
          <button type="button" className="game-start" onClick={onRandom} disabled={loading}>
            <span className="game-start-icon">
              <Icon name="shuffle" />
            </span>
            <span className="game-start-text">
              <strong>Random route</strong>
              <small>A new pair every time</small>
            </span>
            <Icon name="arrow" className="game-start-arrow" />
          </button>
          {loading && <p className="game-hint">Finding a route…</p>}
          {error && (
            <p className="game-alert" role="alert">
              <Icon name="close" />
              {error}
            </p>
          )}
        </div>

        <details className="game-rules">
          <summary>
            <Icon name="info" />
            How scoring works
          </summary>
          <ul>
            <li>
              <Icon name="flight" />
              <span>
                The best route takes the fewest flights, then the shortest distance. Your
                route scores up to {PERFECT_SCORE}: every extra flight takes {FLIGHT_PENALTY} points
                off, and extra distance takes some off in proportion.
              </span>
            </li>
            <li>
              <Icon name="close" />
              <span>
                Without hints, every flight that doesn't exist takes {MISS_PENALTY} off your
                points.
              </span>
            </li>
            <li>
              <Icon name="star" />
              <span>{STAR_RULES}</span>
            </li>
          </ul>
        </details>
      </div>
    </section>
  );
}

// Planes for the flights taken, empty slots for the ones left.
function FlightMeter({ used, max }: { used: number; max: number }) {
  return (
    <span className="game-meter" role="img" aria-label={`${used} of ${max} flights used`}>
      {Array.from({ length: max }, (_, index) => (
        <span key={index} className={index < used ? "game-meter-slot is-used" : "game-meter-slot"}>
          {index < used && <Icon name="flight" />}
        </span>
      ))}
    </span>
  );
}

// The route so far down a rail: departure, stops, where the player is, and
// the arrival still to reach, dashed.
function Timeline({ path, arrival }: { path: Airport[]; arrival: Airport }) {
  const arrived = path[path.length - 1]?.iata === arrival.iata;
  return (
    <ol className="game-timeline">
      {path.map((airport, index) => {
        let kind = index === 0 ? "from" : index === path.length - 1 ? "here" : "via";
        if (arrived && index === path.length - 1) kind = "to";
        return (
          <li key={airport.iata} className={`game-stop game-stop--${kind}`}>
            <span className="game-stop-dot" />
            <span className="game-stop-name" title={airport.name}>
              <strong>{airport.iata}</strong>
              {placeName(airport)}
            </span>
            {index > 0 && (
              <span className="game-stop-km">
                +{formatKm(haversineDistanceKm(path[index - 1], airport))}
              </span>
            )}
          </li>
        );
      })}
      {!arrived && (
        <li className="game-stop game-stop--to game-stop--pending">
          <span className="game-stop-dot" />
          <span className="game-stop-name" title={arrival.name}>
            <strong>{arrival.iata}</strong>
            {placeName(arrival)}
          </span>
          <span className="game-stop-km">?</span>
        </li>
      )}
    </ol>
  );
}

type GamePlayProps = {
  puzzle: GamePuzzle;
  path: Airport[];
  hints: boolean;
  misses: number;
  // Every airport, for picking the next one by name when playing without hints
  airports: Airport[];
  // Feedback on the last move, or an error
  message: string | null;
  busy: boolean;
  onPick: (airport: Airport) => void;
  onUndo: () => void;
  onRestart: () => void;
  onGiveUp: () => void;
  // Shown once the arrival is reached, should scoring the route have failed
  onScore: (() => void) | null;
};

export function GamePlay({
  puzzle,
  path,
  hints,
  misses,
  airports,
  message,
  busy,
  onPick,
  onUndo,
  onRestart,
  onGiveUp,
  onScore,
}: GamePlayProps) {
  const current = path[path.length - 1];
  const flights = path.length - 1;
  const flightsLeft = puzzle.maxFlights - flights;
  const flownKm = path
    .slice(1)
    .reduce((sum, airport, index) => sum + haversineDistanceKm(path[index], airport), 0);
  const directKm = haversineDistanceKm(puzzle.departure, puzzle.arrival);
  const toGoKm = haversineDistanceKm(current, puzzle.arrival);
  // How much closer the player is than at the start; a detour can go
  // backwards, so it is kept within the bar.
  const progress = Math.min(1, Math.max(0, 1 - toGoKm / directKm));

  let title: string;
  let hint: string | null;
  if (onScore) {
    title = `Landed in ${placeName(current)}!`;
    hint = null;
  } else if (flightsLeft === 0) {
    title = "Out of flights";
    hint = "Undo a flight to try another way.";
  } else {
    title = `You're in ${placeName(current)}`;
    const step = flights === 0 ? "your first stop" : "where to fly next";
    hint = hints
      ? `Pick ${step} on the map: the dashed lines are every flight from here.`
      : `Pick ${step} on the map, or type it below.`;
  }

  return (
    <section className="game-panel game-panel--play" aria-label="Route game">
      <Ticket puzzle={puzzle} />

      <div className="game-body">
        <div className="game-status">
          <div className="game-status-head">
            <span className={onScore ? "game-status-dot is-landed" : "game-status-dot"} />
            <p className="game-status-title" aria-live="polite">
              {busy ? "Checking…" : title}
            </p>
            <FlightMeter used={flights} max={puzzle.maxFlights} />
          </div>
          <div
            className="game-progress"
            role="progressbar"
            aria-label={`Distance to ${placeName(puzzle.arrival)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <span className="game-progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="game-status-sub">
            <span>{onScore ? "Arrived" : `${formatKm(toGoKm)} to ${placeName(puzzle.arrival)}`}</span>
            <span>{flightCount(flightsLeft)} left</span>
          </p>
        </div>

        {message && (
          <p className="game-alert" role="alert">
            <Icon name="close" />
            {message}
          </p>
        )}
        {hint && !busy && <p className="game-hint">{hint}</p>}
        {!hints && !onScore && flightsLeft > 0 && (
          <AirportSearchInput
            label="Next"
            airports={airports}
            selectedAirport={null}
            onSelect={onPick}
            onClear={() => {}}
          />
        )}
        {onScore && (
          <button
            type="button"
            className="game-button game-button--primary"
            onClick={onScore}
            disabled={busy}
          >
            <Icon name="trophy" />
            Score my route
          </button>
        )}

        <div className="game-card">
          <div className="game-card-head">
            <h3 className="game-label">Your route</h3>
            <span className="game-card-stat">
              {flightCount(flights)} · {formatKm(flownKm)}
            </span>
          </div>
          <Timeline path={path} arrival={puzzle.arrival} />
          {!hints && misses > 0 && (
            <p className="game-misses">
              <Icon name="close" />
              {missCount(misses)}
              <span>−{misses * MISS_PENALTY} points</span>
            </p>
          )}
        </div>

        <div className="game-toolbar">
          <button type="button" className="game-tool" onClick={onUndo} disabled={busy || flights === 0}>
            <Icon name="undo" />
            Undo
          </button>
          <button
            type="button"
            className="game-tool"
            onClick={onRestart}
            disabled={busy || flights === 0}
          >
            <Icon name="restart" />
            Restart
          </button>
          <button
            type="button"
            className="game-tool game-tool--quiet"
            onClick={onGiveUp}
            disabled={busy}
          >
            <Icon name="flag" />
            Give up
          </button>
        </div>
      </div>
    </section>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <p className="game-stars" role="img" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((star) => (
        <span
          key={star}
          className={star <= count ? "game-star is-on" : "game-star"}
          style={{ animationDelay: `${150 + star * 120}ms` }}
        >
          <Icon name="star" />
        </span>
      ))}
    </p>
  );
}

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

// The points as a ring filling to their share of the maximum, the number
// counting up inside it.
function ScoreRing({ points }: { points: number }) {
  const gradientId = useId();
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? points : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const duration = 900;
    let start: number | null = null;
    let frame = requestAnimationFrame(function step(time) {
      start ??= time;
      const t = Math.min(1, (time - start) / duration);
      // Ease out: quick at first, settling onto the score.
      setShown(Math.round(points * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [points]);

  return (
    <div className="game-ring">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3fbaf4" />
            <stop offset="100%" stopColor="#1b3480" />
          </linearGradient>
        </defs>
        <circle className="game-ring-track" cx="60" cy="60" r={RING_RADIUS} />
        <circle
          className="game-ring-fill"
          cx="60"
          cy="60"
          r={RING_RADIUS}
          stroke={`url(#${gradientId})`}
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - shown / PERFECT_SCORE)}
        />
      </svg>
      <p className="game-ring-value">
        <strong>{shown}</strong>
        <small>points</small>
      </p>
    </div>
  );
}

// One route of the result as a line of codes, tagged in its colour on the
// map. Stops the other route does not go through are filled in, so where the
// two part ways reads at a glance.
function RouteCard({
  label,
  variant,
  route,
  other,
}: {
  label: string;
  variant: "yours" | "best";
  route: GameRoute;
  other: GameRoute | null;
}) {
  const shared = new Set(other?.airports.map((airport) => airport.iata));
  return (
    <div className={`game-route game-route--${variant}`}>
      <div className="game-route-head">
        <span className="game-route-tag">{label}</span>
        <span className="game-route-stats">
          {flightCount(route.legKm.length)} · {formatKm(route.totalKm)}
        </span>
      </div>
      <ol className="game-route-codes">
        {route.airports.map((airport) => (
          <li
            key={airport.iata}
            title={airport.name}
            className={other && !shared.has(airport.iata) ? "is-different" : undefined}
          >
            {airport.iata}
          </li>
        ))}
      </ol>
    </div>
  );
}

type GameOverProps = {
  puzzle: GamePuzzle;
  ending: GameEnding;
  misses: number;
  onNewGame: () => void;
  onChangeSettings: () => void;
};

export function GameOver({ puzzle, ending, misses, onNewGame, onChangeSettings }: GameOverProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (ending.kind !== "finished") return;
    try {
      await navigator.clipboard.writeText(shareText(puzzle, ending.route, ending.score, misses));
      setCopied(true);
    } catch (error) {
      console.error(error);
    }
  }

  const sameRoute =
    ending.kind === "finished" &&
    ending.route.airports.map((airport) => airport.iata).join() ===
      ending.best.airports.map((airport) => airport.iata).join();

  return (
    <section className="game-panel game-panel--over" aria-label="Route game result">
      <Ticket puzzle={puzzle} />

      <div className="game-body">
        {ending.kind === "finished" ? (
          <div className="game-result">
            <Stars count={starCount(ending.score)} />
            <p className="game-verdict">{verdict(ending.score)}</p>
            <p className="game-route-score">Route score {ending.score}</p>
            <ScoreRing points={finalScore(ending.score, misses)} />
            <p className="game-comparison">{comparison(ending.route, ending.best, ending.score)}</p>

            {misses > 0 && (
              <dl className="game-breakdown">
                <div>
                  <dt>Route score</dt>
                  <dd>{ending.score}</dd>
                </div>
                <div>
                  <dt>{missCount(misses)}</dt>
                  <dd>−{misses * MISS_PENALTY}</dd>
                </div>
                <div className="game-breakdown-total">
                  <dt>Points</dt>
                  <dd>{finalScore(ending.score, misses)}</dd>
                </div>
              </dl>
            )}
          </div>
        ) : (
          <div className="game-result">
            <span className="game-result-icon">
              <Icon name="flag" />
            </span>
            <p className="game-verdict">You gave up</p>
            <p className="game-comparison">Here's the best way there, in green on the map.</p>
          </div>
        )}

        <div className="game-cta">
          {ending.kind === "finished" && (
            <button type="button" className="game-button game-button--primary" onClick={share}>
              <Icon name={copied ? "check" : "share"} />
              {copied ? "Copied to clipboard" : "Share result"}
            </button>
          )}
          <div className="game-cta-row">
            <button type="button" className="game-button" onClick={onNewGame}>
              <Icon name="shuffle" />
              New route
            </button>
            <button type="button" className="game-button" onClick={onChangeSettings}>
              Change settings
            </button>
          </div>
        </div>

        <div className="game-routes">
          {ending.kind === "finished" && (
            <RouteCard
              label={sameRoute ? "Yours · the best" : "Yours"}
              variant="yours"
              route={ending.route}
              other={sameRoute ? null : ending.best}
            />
          )}
          {!sameRoute && (
            <RouteCard
              label="Best"
              variant="best"
              route={ending.best}
              other={ending.kind === "finished" ? ending.route : null}
            />
          )}
          <p className="game-footnote">
            The best route takes the fewest flights, then the shortest distance.{" "}
            {STAR_RULES}
          </p>
        </div>

      </div>
    </section>
  );
}
