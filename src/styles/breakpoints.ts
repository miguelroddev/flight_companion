// Phones get a stacked layout: the header above the map rather than floating
// over it, filters in one scrolling row, panels as sheets. The same width is
// written out in the @media rules of the CSS files; change it in both.
export const MOBILE_MEDIA_QUERY = "(max-width: 760px)";

export function isMobileLayout(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}
