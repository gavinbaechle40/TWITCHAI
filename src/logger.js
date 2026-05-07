import fs from "fs";
import path from "path";

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "bot.log");

function ensureDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function levelRank(level) {
  return { debug: 10, info: 20, warn: 30, error: 40 }[level] || 20;
}

const currentLevel = process.env.LOG_LEVEL || "info";
const fileLogging = process.env.ENABLE_FILE_LOGGING !== "false";

export function log(level, message, meta = null) {
  if (levelRank(level) < levelRank(currentLevel)) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}${meta ? " " + JSON.stringify(meta) : ""}`;
  console.log(line);
  if (fileLogging) {
    ensureDir();
    fs.appendFileSync(LOG_FILE, line + "\n");
  }
}

export const logger = {
  debug: (m, meta=null) => log("debug", m, meta),
  info: (m, meta=null) => log("info", m, meta),
  warn: (m, meta=null) => log("warn", m, meta),
  error: (m, meta=null) => log("error", m, meta)
};
