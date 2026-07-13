import Map, {
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";

import "maplibre-gl/dist/maplibre-gl.css";
import "./FlightMap.css";

function FlightMap() {
  return (
    <div className="flight-map">
      <Map
        initialViewState={{
          longitude: 0,
          latitude: 20,
          zoom: 1.2,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle="https://demotiles.maplibre.org/style.json"
        dragRotate={false}
        touchPitch={false}
        maxPitch={0}
      >
        <NavigationControl position="bottom-right" />
        <ScaleControl position="bottom-left" />
      </Map>
    </div>
  );
}

export default FlightMap;