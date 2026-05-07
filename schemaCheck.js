import fs from "fs";
import path from "path";

import { checkSpreadsheetSchema } from "./schemaCheck.js";

export function validateStartup() {
  const errors = [];
  const warnings = [];

  if (!process.env.TWITCH_USERNAME) errors.push("Missing TWITCH_USERNAME");
  if (!process.env.TWITCH_OAUTH) errors.push("Missing TWITCH_OAUTH");
  if (!process.env.TWITCH_CHANNEL) errors.push("Missing TWITCH_CHANNEL");

  const datasetPath = path.resolve(process.cwd(), "data", "arena_breakout_infinite_full_dataset.xlsx");
  if (!fs.existsSync(datasetPath)) errors.push("Missing data/arena_breakout_infinite_full_dataset.xlsx");

  if (process.env.OPENAI_ENABLED === "true" && !process.env.OPENAI_API_KEY) {
    warnings.push("OPENAI_ENABLED is true but OPENAI_API_KEY is missing; AI replies will be unavailable");
  }

  const schema = checkSpreadsheetSchema();
  errors.push(...schema.errors);
  warnings.push(...schema.warnings);

  return { errors, warnings, ok: errors.length === 0, schema };
}
