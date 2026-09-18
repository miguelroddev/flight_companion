// Downloads a square logo for every airline in the scraped route data into
// public/airline-logos/<IATA>.png, and regenerates the list of codes that have
// one (src/features/route/airlineLogos.generated.ts).
//
//   node scripts/fetch-airline-logos.mjs           # fetch what is missing
//   node scripts/fetch-airline-logos.mjs --force   # refetch everything
//
// Source: Kiwi.com's public airline images, which are square symbols (the TAP
// "TAP", the Lufthansa crane) rather than full wordmarks, so they stay legible
// in the route panel's small square badges.
//
// IATA codes get reused when airlines fold (KA was Dragonair's, and is Aero
// Nomad's in our data), and Kiwi still has some old owners' logos. So a logo
// is only taken when Kiwi's name for the code matches ours; anything doubtful
// is listed for review and resolved in SAME_AIRLINE / WRONG_AIRLINE below.
//
// A file already on disk is kept unless --force, so a hand-picked replacement
// dropped into public/airline-logos survives reruns.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_FILE = join(ROOT, "backend", "data", "airline_routes.json");
const LOGO_DIR = join(ROOT, "public", "airline-logos");
const MANIFEST = join(ROOT, "src", "features", "route", "airlineLogos.generated.ts");

const AIRLINE_LIST_URL = "https://api.skypicker.com/airlines";
const logoUrl = (code) => `https://images.kiwi.com/airlines/64/${code}.png`;
const USER_AGENT = "FlightCompanion/1.0 (airline logo fetch)";
// Kiwi starts refusing requests past a few hundred in quick succession, so
// keep it gentle and retry refusals with a growing pause.
const CONCURRENCY = 4;
const RETRIES = 4;

// Checked by hand: the names differ, but it is the same airline (spelling,
// abbreviation, or a rename such as GoAir -> Go First, Bearskin -> Perimeter).
const SAME_AIRLINE = new Set([
  "4B", "5F", "5L", "5U", "5Z", "7G", "7P", "8J", "8W", "BT", "BU", "CAT",
  "DX", "FP", "FZ", "G8", "JL", "JV", "KB", "LT", "NH", "OP", "OV", "P2",
  "PE", "PM", "SK", "SV", "TW", "UO", "WF", "WM", "Y2", "YR", "ZL",
  // Our data calls G5 "Gestair", a Spanish charter firm, but all ~600 of its
  // routes are within China: it is China Express Airlines, as Kiwi says.
  "G5",
]);
// Checked by hand: the names look alike, but Kiwi's logo is someone else's.
const WRONG_AIRLINE = new Set([]);

const force = process.argv.includes("--force");

// Words that say "this is an airline" rather than which one.
const GENERIC = new Set([
  "air", "airline", "airlines", "airways", "aviation", "lines", "international",
  "express", "de", "the", "company", "co", "ltd", "sa", "aerolineas", "linhas",
  "aereas", "transportes", "aereos",
]);

function tokens(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !GENERIC.has(word));
}

// "match": same words. "likely": one name's words contain the other's, or
// they share a distinctive word; taken, but listed. "mismatch": skipped.
function compareNames(ours, theirs) {
  const a = new Set(tokens(ours));
  const b = new Set(tokens(theirs));
  if (a.size === 0 || b.size === 0) return "mismatch";
  const shared = [...a].filter((word) => b.has(word));
  if (shared.length === a.size && shared.length === b.size) return "match";
  if (shared.length === Math.min(a.size, b.size)) return "likely";
  if (shared.some((word) => word.length >= 4)) return "likely";
  return "mismatch";
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Retries anything but a success or a 404, so a throttled request is never
// mistaken for an airline without a logo.
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok || response.status === 404 || attempt === RETRIES) return response;
    } catch (error) {
      if (attempt === RETRIES) throw error;
    }
    await sleep(2000 * 2 ** attempt);
  }
}

function md5(buffer) {
  return createHash("md5").update(buffer).digest("hex");
}

function loadOurAirlines() {
  if (!existsSync(DATA_FILE)) {
    console.error(`${DATA_FILE} not found. Run the scraper first.`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(DATA_FILE, "utf8"));
  const airlines = new Map();
  for (const airport of Object.values(raw)) {
    for (const route of airport.routes ?? []) {
      for (const carrier of route.carriers ?? []) {
        if (carrier.iata && !airlines.has(carrier.iata)) {
          airlines.set(carrier.iata, carrier.name || carrier.iata);
        }
      }
    }
  }
  return airlines;
}

async function main() {
  const ours = loadOurAirlines();
  console.log(`${ours.size} airlines in the route data.`);

  const kiwiList = await (await get(AIRLINE_LIST_URL)).json();
  const kiwiNames = new Map(kiwiList.map((airline) => [airline.id, airline.name]));

  // Kiwi answers an unknown code with a generic plane rather than a 404.
  const placeholder = md5(Buffer.from(await (await get(logoUrl("XXXX"))).arrayBuffer()));

  mkdirSync(LOGO_DIR, { recursive: true });

  const report = { fetched: [], kept: [], likely: [], mismatch: [], unknown: [], failed: [] };
  const queue = [...ours.entries()].sort(([a], [b]) => a.localeCompare(b));

  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const [code, name] = item;
      const file = join(LOGO_DIR, `${code}.png`);

      if (existsSync(file) && !force) {
        report.kept.push(code);
        continue;
      }

      const theirName = kiwiNames.get(code);
      if (theirName === undefined || WRONG_AIRLINE.has(code)) {
        report.unknown.push(`${code}  ${name}`);
        continue;
      }

      const verdict = SAME_AIRLINE.has(code) ? "match" : compareNames(name, theirName);
      if (verdict === "mismatch") {
        report.mismatch.push(`${code}  ours: ${name}  |  kiwi: ${theirName}`);
        continue;
      }

      try {
        const response = await get(logoUrl(code));
        const image = Buffer.from(await response.arrayBuffer());
        if (!response.ok && response.status !== 404) {
          report.failed.push(`${code}  HTTP ${response.status}; rerun to retry`);
          continue;
        }
        if (response.status === 404 || md5(image) === placeholder) {
          report.unknown.push(`${code}  ${name}`);
          continue;
        }
        writeFileSync(file, image);
        report.fetched.push(code);
        if (verdict === "likely") report.likely.push(`${code}  ours: ${name}  |  kiwi: ${theirName}`);
      } catch (error) {
        report.failed.push(`${code}  ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Everything on disk counts, hand-placed files included.
  const available = readdirSync(LOGO_DIR)
    .filter((file) => file.endsWith(".png"))
    .map((file) => file.slice(0, -4))
    .sort();
  writeFileSync(
    MANIFEST,
    [
      "// Generated by scripts/fetch-airline-logos.mjs. Do not edit by hand.",
      "// IATA codes with a logo at /airline-logos/<code>.png.",
      `export const AIRLINE_LOGO_CODES: ReadonlySet<string> = new Set(${JSON.stringify(available, null, 2)});`,
      "",
    ].join("\n"),
  );

  const section = (title, lines) => {
    if (lines.length === 0) return;
    console.log(`\n${title} (${lines.length}):`);
    for (const line of lines.sort()) console.log(`  ${line}`);
  };
  section("Taken on a partial name match, worth a glance", report.likely);
  section("Skipped, names disagree: add to SAME_AIRLINE if it is the same airline", report.mismatch);
  section("No logo available", report.unknown);
  section("Failed", report.failed);

  console.log(
    `\nFetched ${report.fetched.length}, kept ${report.kept.length} already on disk. ` +
      `${available.length} of ${ours.size} airlines now have a logo.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
