import fs from "fs";
import path from "path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

let runtime = {
  roastMode: true,
  hypeMode: true,
  naturalIntentChance: Number(process.env.NATURAL_INTENT_CHANCE || 0.20),
  confidenceMin: Number(process.env.INTENT_REPLY_MIN_CONFIDENCE || 0.72),
  hotReloadConfig: process.env.HOT_RELOAD_CONFIG !== "false"
};

function parseEnvValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  const n = Number(v);
  if (!Number.isNaN(n) && String(n) === String(v).trim()) return n;
  return v;
}

export function loadRuntimeConfig() {
  if (!fs.existsSync(ENV_PATH)) return runtime;
  try {
    const text = fs.readFileSync(ENV_PATH, "utf8");
    const lines = text.split(/\r?\n/);
    const map = {};
    for (const line of lines) {
      if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      map[key] = parseEnvValue(val);
    }
    runtime = {
      ...runtime,
      roastMode: map.ROAST_MODE ?? runtime.roastMode,
      hypeMode: map.HYPE_MODE ?? runtime.hypeMode,
      naturalIntentChance: Number(map.NATURAL_INTENT_CHANCE ?? runtime.naturalIntentChance),
      confidenceMin: Number(map.INTENT_REPLY_MIN_CONFIDENCE ?? runtime.confidenceMin),
      hotReloadConfig: map.HOT_RELOAD_CONFIG ?? runtime.hotReloadConfig
    };
  } catch {}
  return runtime;
}

export function getRuntimeConfig() {
  return runtime;
}
