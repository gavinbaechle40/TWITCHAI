import xlsx from "xlsx";
import path from "path";

const REQUIRED_SHEETS = ["Weapons", "Ammo", "Body Armor", "Helmets"];
const OPTIONAL_KEY_COLUMNS = {
  "Weapons": ["Name"],
  "Ammo": ["Name"],
  "Body Armor": ["Name"],
  "Helmets": ["Name"]
};

export function checkSpreadsheetSchema() {
  const workbookPath = path.resolve(process.cwd(), "data", "arena_breakout_infinite_full_dataset.xlsx");
  const wb = xlsx.readFile(workbookPath);
  const sheetNames = wb.SheetNames || [];

  const errors = [];
  const warnings = [];

  for (const name of REQUIRED_SHEETS) {
    if (!sheetNames.includes(name)) {
      errors.push(`Missing required sheet: ${name}`);
      continue;
    }
    const ws = wb.Sheets[name];
    const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
    if (!rows.length) {
      warnings.push(`Sheet ${name} is empty`);
      continue;
    }
    const first = rows[0];
    for (const col of OPTIONAL_KEY_COLUMNS[name] || []) {
      if (!(col in first)) warnings.push(`Sheet ${name} missing expected column: ${col}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings, sheetNames };
}
