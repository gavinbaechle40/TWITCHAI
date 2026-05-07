import fs from "fs";
import path from "path";

const DIR = path.resolve(process.cwd(), "heartbeat");
const FILE = path.join(DIR, "last_alive.json");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

export function writeHeartbeat(extra = {}) {
  ensureDir();
  const payload = {
    at: new Date().toISOString(),
    memoryRss: process.memoryUsage().rss,
    memoryHeapUsed: process.memoryUsage().heapUsed,
    pid: process.pid,
    ...extra
  };
  fs.writeFileSync(FILE, JSON.stringify(payload, null, 2));
}
