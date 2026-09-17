/* Midnight Aviation colours for everything maplibre paints.
 *
 * Mirrors the map half of src/styles/tokens.css: paint properties are
 * evaluated in JS and cannot read CSS custom properties.
 */

export const ROUTE = {
  network: "#46596b",
  networkOpacity: 0.35,
  // A step darker than the 100+ pin tier, so the chosen route reads as the
  // heaviest blue on the map.
  selected: "#1b3480",
  // Pale, not dark: the casing is wider than the line, and a dark one would
  // swallow a navy route. White haloes it against the blue ocean instead.
  casing: "rgb(255 255 255 / 85%)",
};

export const PIN = {
  radius: 5.6,
  // One crisp hairline at every size rather than a ring that scales with the
  // pin. The ring is still load-bearing - the tiers differ by hue, not
  // brightness, and yellow over white is only ~1.8:1 - but it only has to
  // define the edge, not be seen in its own right.
  stroke: 1,
  outline: "#000000",
  hover: "#ff0000",
  // Selected airports keep their category colour; a heavier ring marks them,
  // backed up by the label above the pin.
  selectedRing: "#111827",
  selectedRingWidth: 2,
};

/* Ordered quietest -> busiest: red, yellow, cyan, deep blue. This is a
 * categorical hue ramp rather than a brightness ramp, so the sense of hierarchy
 * comes from the size progression and the ring, not from contrast. Shared with
 * the legend so the two cannot drift apart. */
export const PIN_TIERS = [
  { minRoutes: 0, label: "Under 8", scale: 0.5, color: "#e03131" },
  { minRoutes: 8, label: "8 - 24", scale: 0.7, color: "#eab308" },
  { minRoutes: 25, label: "25 - 99", scale: 0.8, color: "#0891b2" },
  { minRoutes: 100, label: "100+", scale: 1, color: "#1e40af" },
];

/* Positron ships grey water; this is the one basemap layer overridden, to get
 * the white-land/blue-ocean look. Missing layers are skipped, so an upstream
 * rename degrades to the stock style rather than throwing. */
export const BASEMAP_WATER = "#cfe4f5";

type StyledMap = {
  getLayer: (id: string) => unknown;
  setPaintProperty: (id: string, property: string, value: unknown) => void;
};

export function applyWaterColour(map: StyledMap): void {
  if (map.getLayer("water")) {
    map.setPaintProperty("water", "fill-color", BASEMAP_WATER);
  }
  if (map.getLayer("waterway")) {
    map.setPaintProperty("waterway", "line-color", BASEMAP_WATER);
  }
}

