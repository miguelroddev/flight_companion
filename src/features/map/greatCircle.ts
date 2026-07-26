type LngLat = { lat: number; lng: number };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Interpolates points along the great-circle (shortest sphere-surface) path
 * between two coordinates via spherical linear interpolation (slerp).
 */
export function greatCircleLine(
  from: LngLat,
  to: LngLat,
  segments = 64,
): [number, number][] {
  const φ1 = toRadians(from.lat);
  const λ1 = toRadians(from.lng);
  const φ2 = toRadians(to.lat);
  const λ2 = toRadians(to.lng);

  const angularDistance =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((φ2 - φ1) / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
      ),
    );

  if (angularDistance === 0) {
    return [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ];
  }

  const points: [number, number][] = [];
  let previousLng = from.lng;

  for (let i = 0; i <= segments; i++) {
    const fraction = i / segments;
    const a =
      Math.sin((1 - fraction) * angularDistance) / Math.sin(angularDistance);
    const b = Math.sin(fraction * angularDistance) / Math.sin(angularDistance);

    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
    const z = a * Math.sin(φ1) + b * Math.sin(φ2);

    const lat = toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y)));
    let lng = toDegrees(Math.atan2(y, x));

    // keep the polyline continuous instead of jumping across the antimeridian
    while (lng - previousLng > 180) lng -= 360;
    while (lng - previousLng < -180) lng += 360;
    previousLng = lng;

    points.push([lng, lat]);
  }

  return points;
}
