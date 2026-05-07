import path from "path";
import xlsx from "xlsx";

const workbookPath = path.resolve(process.cwd(), "data", "arena_breakout_infinite_full_dataset.xlsx");
let db = null;

const STOP_WORDS = new Set([
  "what","are","the","stats","stat","on","for","exact","numbers","number","info","tell","me","show","give",
  "arena","breakout","infinite","abi","mrnutt3r","mister","mr","nutt3r","@mrnutt3r"
]);

const NAME_KEYS = ["name", "weapon", "ammo", "item", "helmet", "armor", "title"];
const CATEGORY_KEYS = ["category", "type", "caliber", "armor_class", "class"];

function rowsToObjects(sheetName) {
  const wb = xlsx.readFile(workbookPath);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return xlsx.utils.sheet_to_json(ws, { defval: "" });
}

export function loadDb() {
  try {
    db = {
      weapons: rowsToObjects("Weapons"),
      ammo: rowsToObjects("Ammo"),
      armor: rowsToObjects("Body Armor"),
      helmets: rowsToObjects("Helmets")
    };
  } catch (err) {
    console.error("Failed to load Arena Breakout dataset:", err?.message || err);
    db = { weapons: [], ammo: [], armor: [], helmets: [] };
  }
  return db;
}

export function getDb() {
  if (!db) loadDb();
  return db;
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function rowName(row) {
  for (const key of NAME_KEYS) {
    if (row[key]) return String(row[key]).trim();
    const foundKey = Object.keys(row).find(k => normalizeText(k) === key);
    if (foundKey && row[foundKey]) return String(row[foundKey]).trim();
  }
  return String(Object.values(row).find(Boolean) || "").trim();
}

function queryTokens(term) {
  return normalizeText(term)
    .split(/\s+/)
    .filter(t => t && !STOP_WORDS.has(t) && t.length >= 2);
}

function scoreRow(row, term) {
  const tokens = queryTokens(term);
  if (!tokens.length) return 0;

  const name = normalizeText(rowName(row));
  const searchable = normalizeText(Object.values(row).join(" "));
  let score = 0;

  for (const token of tokens) {
    if (name === token) score += 100;
    else if (name.split(/\s+/).includes(token)) score += 75;
    else if (name.includes(token) || token.includes(name)) score += 60;
    else if (searchable.split(/\s+/).includes(token)) score += 20;
    else if (searchable.includes(token)) score += 10;
  }

  return score;
}

function matchAnyName(rows, term) {
  let best = null;
  let bestScore = 0;
  for (const row of rows || []) {
    const score = scoreRow(row, term);
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return bestScore >= 60 ? best : null;
}

export function lookupLocal(term) {
  const data = getDb();
  return {
    weapon: matchAnyName(data.weapons, term),
    ammo: matchAnyName(data.ammo, term),
    armor: matchAnyName(data.armor, term),
    helmet: matchAnyName(data.helmets, term)
  };
}

function prettyKey(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

export function formatSheetStats(hit, maxChars = 430) {
  const kind = hit.weapon ? "weapon" : hit.ammo ? "ammo" : hit.armor ? "armor" : hit.helmet ? "helmet" : null;
  if (!kind) return null;

  const row = hit[kind];
  const name = rowName(row);
  const skip = new Set(["source_url", "source", "url", "parse_note"]);
  const priority = [
    ...NAME_KEYS,
    ...CATEGORY_KEYS,
    "damage", "penetration", "armor_damage", "v_recoil_control", "h_recoil_control", "ergonomics",
    "weapon_stability", "accuracy", "hip_fire_stability", "effective_range", "muzzle_velocity", "rate_of_fire",
    "weight_kg", "durability", "movement_speed", "material"
  ];

  const keys = [...new Set([...priority, ...Object.keys(row)])]
    .filter(k => Object.prototype.hasOwnProperty.call(row, k))
    .filter(k => !skip.has(normalizeText(k).replace(/ /g, "_")))
    .filter(k => !isBlank(row[k]))
    .filter(k => !NAME_KEYS.includes(normalizeText(k).replace(/ /g, "_")));

  const parts = keys.map(k => `${prettyKey(k)}: ${row[k]}`);
  let out = `${name} ${kind} sheet stats — ${parts.join(" | ")}`;
  if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + "…";
  return out;
}
