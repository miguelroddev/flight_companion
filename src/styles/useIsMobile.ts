import { useSyncExternalStore } from "react";

import { MOBILE_MEDIA_QUERY } from "./breakpoints";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_MEDIA_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Whether the phone layout applies, kept current as the window is resized or
// the phone rotated.
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_MEDIA_QUERY).matches);
}
