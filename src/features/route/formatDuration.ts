// "3h 15m", "45m", "2h"; "–" when the duration is unknown.
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "–";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
