import { Route, Routes } from "react-router";
import GamePage from "./pages/GamePage";
import HomePage from "./pages/HomePage";
import MapPage from "./pages/MapPage";
import Test from "./pages/Test";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/play" element={<GamePage />} />
      <Route path="/test" element={<Test />} />
    </Routes>
  );
}

export default App;