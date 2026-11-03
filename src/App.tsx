import { useState } from "react";
import { Route, Routes, useLocation } from "react-router";
import GamePage from "./pages/GamePage";
import HomePage from "./pages/HomePage";
import MapPage from "./pages/MapPage";
import Test from "./pages/Test";

// The explore map and the route game stay mounted once opened, hidden while
// another page shows, rather than starting over on every visit: going over to
// check an airport's routes mid-game and back keeps the game, the map's
// selection and filters, the loaded maps, and (sharedCamera.ts) the view.
const KEPT_PAGES = ["/map", "/play"] as const;
type KeptPage = (typeof KEPT_PAGES)[number];

function keptPage(pathname: string): KeptPage | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return KEPT_PAGES.find((page) => page === path) ?? null;
}

function App() {
  const shown = keptPage(useLocation().pathname);
  const [opened, setOpened] = useState<readonly KeptPage[]>([]);
  // Adjusting state while rendering, as React suggests for state derived from
  // a prop: the page mounts in this same render, not one later.
  if (shown && !opened.includes(shown)) setOpened([...opened, shown]);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/test" element={<Test />} />
        {/* Drawn below, kept between visits. */}
        <Route path="/map" element={null} />
        <Route path="/play" element={null} />
      </Routes>

      {opened.includes("/map") && (
        <div hidden={shown !== "/map"}>
          <MapPage active={shown === "/map"} />
        </div>
      )}
      {opened.includes("/play") && (
        <div hidden={shown !== "/play"}>
          <GamePage active={shown === "/play"} />
        </div>
      )}
    </>
  );
}

export default App;
