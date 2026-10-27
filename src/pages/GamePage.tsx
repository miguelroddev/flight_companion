import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";

import GameMap from "../features/game/GameMap";
import {
  GameOver,
  GamePlay,
  GameSetup,
  type GameEnding,
  type GameSettings,
} from "../features/game/GamePanel";
import {
  fetchAirports,
  fetchBestGameRoute,
  fetchConnectedAirports,
  fetchGamePuzzle,
  fetchGameScore,
  fetchRoute,
  NO_FILTERS,
  type Airport,
  type Difficulty,
  type GamePuzzle,
} from "../api/flights";
import logo from "../assets/branding/logo.png";

import "./MapPage.css";
import "./GamePage.css";

const NO_AIRPORTS: Airport[] = [];

const DIFFICULTY_IDS: readonly string[] = ["easy", "medium", "hard"];

function placeName(airport: Airport) {
  return airport.city || airport.name;
}

// The route game: get from one airport to another with no direct flight
// between them, a flight at a time, picked on the map. Scored on arrival
// against the best route there is (backend/app/route_game.py).
//
// /play?difficulty=medium&seed=123 opens that puzzle straight away, which is
// how a shared result links back to the same game.
function GamePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [airports, setAirports] = useState<Airport[]>([]);
  const [settings, setSettings] = useState<GameSettings>({ difficulty: "medium", hints: false });

  const [puzzle, setPuzzle] = useState<GamePuzzle | null>(null);
  const [loadingPuzzle, setLoadingPuzzle] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Flown so far, departure first
  const [path, setPath] = useState<Airport[]>([]);
  // Flights tried that do not exist, when playing without hints
  const [misses, setMisses] = useState(0);
  const [ending, setEnding] = useState<GameEnding | null>(null);
  // Feedback on the last move, or an error, shown in the panel
  const [message, setMessage] = useState<string | null>(null);
  // Checking a flight, scoring, or fetching the best route
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchAirports(NO_FILTERS, controller.signal)
      .then(setAirports)
      .catch((error) => {
        if (!controller.signal.aborted) console.error(error);
      });
    return () => controller.abort();
  }, []);

  async function startGame(difficulty: Difficulty, pick: { daily: true } | { seed: number | null }) {
    setLoadingPuzzle(true);
    setSetupError(null);
    try {
      const next = await fetchGamePuzzle(difficulty, pick);
      setPuzzle(next);
      setPath([next.departure]);
      setMisses(0);
      setEnding(null);
      setMessage(null);
      setSettings((current) => ({ ...current, difficulty: next.difficulty }));
      setSearchParams({ difficulty: next.difficulty, seed: String(next.seed) }, { replace: true });
    } catch (error) {
      console.error(error);
      setSetupError("Couldn't find a route to play. Please try again.");
    } finally {
      setLoadingPuzzle(false);
    }
  }

  // The puzzle in a shared link, opened once: a ref rather than state, so
  // StrictMode running the effect twice does not deal it twice.
  const linkOpened = useRef(false);
  useEffect(() => {
    if (linkOpened.current) return;
    linkOpened.current = true;

    const difficulty = searchParams.get("difficulty");
    const seed = Number(searchParams.get("seed"));
    if (difficulty && DIFFICULTY_IDS.includes(difficulty) && Number.isInteger(seed) && seed >= 0) {
      void startGame(difficulty as Difficulty, { seed });
    }
  });

  const current = path.at(-1) ?? null;
  const currentIata = current?.iata;
  const arrived = puzzle !== null && currentIata === puzzle.arrival.iata;
  const wantOptions = puzzle !== null && settings.hints && ending === null && !arrived;

  // Where the player can fly from where it is, when hints are on. Tagged with
  // the airport it was fetched for, so a slow answer never shows elsewhere.
  const [optionsResult, setOptionsResult] = useState<{
    iata: string;
    airports: Airport[];
  } | null>(null);

  useEffect(() => {
    if (!wantOptions || !currentIata) return;
    const controller = new AbortController();
    fetchConnectedAirports(currentIata, "outbound", NO_FILTERS, controller.signal)
      .then((airports) => setOptionsResult({ iata: currentIata, airports }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setMessage("Couldn't load the flights from here. Please try again.");
      });
    return () => controller.abort();
  }, [wantOptions, currentIata]);

  const optionsLoading = wantOptions && optionsResult?.iata !== currentIata;

  // Never back to where the route has already been: that is undone, not flown.
  const options = useMemo(() => {
    if (!settings.hints) return null;
    if (!wantOptions || optionsLoading) return NO_AIRPORTS;
    const flown = new Set(path.map((airport) => airport.iata));
    return (optionsResult?.airports ?? NO_AIRPORTS).filter((airport) => !flown.has(airport.iata));
  }, [settings.hints, wantOptions, optionsLoading, optionsResult, path]);

  async function score(route: Airport[]) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetchGameScore(route.map((airport) => airport.iata));
      setEnding({ kind: "finished", ...result });
    } catch (error) {
      console.error(error);
      setMessage("Couldn't score your route. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function fly(airport: Airport) {
    const next = [...path, airport];
    setPath(next);
    setMessage(null);
    if (airport.iata === puzzle?.arrival.iata) void score(next);
  }

  async function handlePick(airport: Airport) {
    if (!puzzle || !current || ending || busy || arrived) return;

    // Back to an airport already flown through: the route since is undone.
    const index = path.findIndex((flown) => flown.iata === airport.iata);
    if (index !== -1) {
      setPath(path.slice(0, index + 1));
      setMessage(null);
      return;
    }

    if (path.length - 1 >= puzzle.maxFlights) {
      setMessage(`That's all ${puzzle.maxFlights} flights. Undo one to try another way.`);
      return;
    }

    if (options) {
      // Until they arrive, nothing can be told apart from a missing flight.
      if (optionsLoading) return;
      if (options.some((option) => option.iata === airport.iata)) fly(airport);
      else setMessage(`No flight from ${placeName(current)} to ${placeName(airport)}.`);
      return;
    }

    setBusy(true);
    try {
      const route = await fetchRoute(current.iata, airport.iata, NO_FILTERS);
      if (route) {
        fly(airport);
      } else {
        setMisses((count) => count + 1);
        setMessage(`No flight from ${placeName(current)} to ${placeName(airport)}.`);
      }
    } catch (error) {
      console.error(error);
      setMessage("Couldn't check that flight. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function giveUp() {
    if (!puzzle) return;
    setBusy(true);
    setMessage(null);
    try {
      const best = await fetchBestGameRoute(puzzle.departure.iata, puzzle.arrival.iata);
      setEnding({ kind: "gave-up", best });
    } catch (error) {
      console.error(error);
      setMessage("Couldn't load the best route. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeSettings() {
    setPuzzle(null);
    setPath([]);
    setEnding(null);
    setMessage(null);
    setSearchParams({}, { replace: true });
  }

  let panel;
  if (!puzzle) {
    panel = (
      <GameSetup
        settings={settings}
        onChange={setSettings}
        onDaily={() => startGame(settings.difficulty, { daily: true })}
        onRandom={() => startGame(settings.difficulty, { seed: null })}
        loading={loadingPuzzle}
        error={setupError}
      />
    );
  } else if (ending) {
    panel = (
      <GameOver
        // A fresh panel per game, so "Copied!" does not carry over.
        key={`${puzzle.difficulty}-${puzzle.seed}`}
        puzzle={puzzle}
        ending={ending}
        misses={misses}
        onNewGame={() => startGame(puzzle.difficulty, { seed: null })}
        onChangeSettings={changeSettings}
      />
    );
  } else {
    panel = (
      <GamePlay
        puzzle={puzzle}
        path={path}
        hints={settings.hints}
        misses={misses}
        airports={airports}
        message={message}
        busy={busy}
        onPick={handlePick}
        onUndo={() => {
          setPath(path.slice(0, -1));
          setMessage(null);
        }}
        onRestart={() => {
          setPath(path.slice(0, 1));
          setMessage(null);
        }}
        onGiveUp={giveUp}
        onScore={arrived && !busy ? () => score(path) : null}
      />
    );
  }

  return (
    <main className="game-page">
      <GameMap
        airports={airports}
        arrival={puzzle?.arrival ?? null}
        path={ending?.kind === "finished" ? ending.route.airports : path}
        options={options}
        bestPath={ending?.best.airports ?? null}
        onAirportClick={puzzle && !ending && !arrived ? handlePick : null}
      />

      <div className="game-overlay">
        <nav className="map-navbar game-navbar" aria-label="Main navigation">
          <Link className="navbar-brand" to="/">
            <img src={logo} alt="" className="navbar-logo" />
            Flight Companion
          </Link>
          <h1 className="game-navbar-title">Route game</h1>
          <Link className="navbar-link" to="/map">
            Explore map
          </Link>
        </nav>

        {panel}
      </div>
    </main>
  );
}

export default GamePage;
