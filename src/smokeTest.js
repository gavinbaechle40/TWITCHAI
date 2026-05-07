import "dotenv/config";
import { validateStartup } from "./validate.js";
import { loadDb, getDb } from "./db.js";
import { buildMetaCache } from "./metaCache.js";
import { evaluateFightMeta } from "./meta.js";
import { getVersionInfo } from "./version.js";

try {
  const validation = validateStartup();
  if (!validation.ok) {
    console.error("Startup validation failed:", validation.errors);
    process.exit(1);
  }

  loadDb();
  const db = getDb();
  if (!db.weapons || !db.ammo) throw new Error("DB failed to load");

  const cache = buildMetaCache();
  if (!cache.weapons || !cache.ammo) throw new Error("Meta cache failed");

  const meta = evaluateFightMeta({
    weaponTerm: "mp5 ap",
    ammoTerm: "mp5 ap",
    enemyTier: 5,
    map: "TV Station"
  });
  if (!meta.reply) throw new Error("Meta eval failed");

  const version = getVersionInfo();
  if (!version.botVersion) throw new Error("Version info failed");

  console.log("Smoke test passed");
  process.exit(0);
} catch (err) {
  console.error("Smoke test failed:", err);
  process.exit(1);
}
