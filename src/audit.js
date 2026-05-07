import fs from "fs";
import path from "path";
import { config } from "./config.js";

const DIR = path.resolve(process.cwd(), "audit");
const FILE = path.join(DIR, "admin.log");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

export function audit(action, username, extra = {}) {
  if (!config.enableAuditLog) return;
  ensureDir();
  const line = JSON.stringify({
    at: new Date().toISOString(),
    action,
    username,
    ...extra
  });
  fs.appendFileSync(FILE, line + "\n");
}
