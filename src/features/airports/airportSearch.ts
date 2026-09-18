import type { Airport } from "../../api/flights";

export type IndexedAirport = {
  airport: Airport;
  code: string;
  cityWords: string[];
  nameWords: string[];
  // Code, city and name run together, for the anywhere-in-the-text fallback
  compact: string;
};

// Lowercase words with accents stripped: "São Paulo" -> ["sao", "paulo"].
function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Whether the text, from the start of one of its words, begins with needle.
// Spaces are ignored on both sides, so "sao paulo", "saopaulo" and "paulo"
// all match "São Paulo".
function startsAtWord(textWords: string[], needle: string): boolean {
  for (let start = 0; start < textWords.length; start++) {
    if (textWords.slice(start).join("").startsWith(needle)) return true;
  }
  return false;
}

// Done once per airport list, not per keystroke.
export function indexAirports(airports: Airport[]): IndexedAirport[] {
  return airports.map((airport) => {
    const code = airport.iata.toLowerCase();
    const cityWords = words(airport.city);
    const nameWords = words(airport.name);
    return {
      airport,
      code,
      cityWords,
      nameWords,
      compact: [code, ...cityWords, ...nameWords].join(""),
    };
  });
}

// The airports best matching a query, best first:
//   0. the code is the query, or the city starts with it
//   1. the code starts with it, or a word of the airport's name does
//   2. it appears anywhere, only when nothing matched above
// Within a tier, busier airports first: "lon" is Heathrow before Southend.
// An exact code shares the top tier with city names rather than beating them,
// so "bar" finds Barcelona before an obscure airport coded BAR.
export function searchAirports(
  index: IndexedAirport[],
  query: string,
  limit = 6,
): Airport[] {
  const needle = words(query).join("");
  if (!needle) return [];

  const ranked: { airport: Airport; tier: number }[] = [];
  for (const entry of index) {
    let tier: number;
    if (entry.code === needle || startsAtWord(entry.cityWords, needle)) tier = 0;
    else if (entry.code.startsWith(needle) || startsAtWord(entry.nameWords, needle)) tier = 1;
    else if (entry.compact.includes(needle)) tier = 2;
    else continue;
    ranked.push({ airport: entry.airport, tier });
  }

  const hasPrefixMatch = ranked.some((match) => match.tier < 2);
  return ranked
    .filter((match) => !hasPrefixMatch || match.tier < 2)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        b.airport.routeCount - a.airport.routeCount ||
        a.airport.name.localeCompare(b.airport.name),
    )
    .slice(0, limit)
    .map((match) => match.airport);
}
