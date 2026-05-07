import path from "path";
import xlsx from "xlsx";

const workbookPath = path.resolve(process.cwd(), "data", "arena_breakout_infinite_full_dataset.xlsx");
let db = null;

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
  } catch {
    db = { weapons: [], ammo: [], armor: [], helmets: [] };
  }
  return db;
}

export function getDb() {
  if (!db) loadDb();
  return db;
}

function matchAnyName(rows, term) {
  const t = String(term || "").toLowerCase();
  return rows.find(r => JSON.stringify(r).toLowerCase().includes(t)) || null;
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
