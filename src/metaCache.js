import fs from "fs";
import path from "path";
import { getDb } from "./db.js";
import { inferAmmoMeta, inferWeaponMeta, inferArmorMeta } from "./meta.js";

const CACHE_PATH = path.resolve(process.cwd(), "data", "meta_cache.json");

function getRowName(row) {
  if (!row) return "";
  for (const key of ["Name", "Item", "Ammo", "Weapon", "Armor", "Helmet", "Title"]) {
    if (row[key]) return String(row[key]).trim();
  }
  return "";
}

function safeSlug(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

export function buildMetaCache() {
  const db = getDb();
  const cache = {
    generatedAt: new Date().toISOString(),
    weapons: [],
    ammo: [],
    armor: [],
    helmets: []
  };

  for (const row of db.weapons || []) {
    const name = getRowName(row);
    if (!name) continue;
    const meta = inferWeaponMeta(name, row);
    cache.weapons.push({
      id: safeSlug(name),
      name,
      type: "weapon",
      metaTier: meta.tier,
      metaStyle: meta.style,
      metaNote: meta.note
    });
  }

  for (const row of db.ammo || []) {
    const name = getRowName(row);
    if (!name) continue;
    const meta = inferAmmoMeta(name, row);
    cache.ammo.push({
      id: safeSlug(name),
      name,
      type: "ammo",
      metaTier: meta.tier,
      penBand: meta.penBand,
      metaNote: meta.note
    });
  }

  for (const row of db.armor || []) {
    const name = getRowName(row);
    if (!name) continue;
    const meta = inferArmorMeta(name, row);
    cache.armor.push({
      id: safeSlug(name),
      name,
      type: "armor",
      metaTier: meta.tier
    });
  }

  for (const row of db.helmets || []) {
    const name = getRowName(row);
    if (!name) continue;
    const meta = inferArmorMeta(name, row);
    cache.helmets.push({
      id: safeSlug(name),
      name,
      type: "helmet",
      metaTier: meta.tier
    });
  }

  cache.summary = {
    weaponCounts: countByTier(cache.weapons),
    ammoCounts: countByTier(cache.ammo),
    armorCounts: countByTier(cache.armor),
    helmetCounts: countByTier(cache.helmets)
  };

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

function countByTier(rows) {
  return rows.reduce((acc, row) => {
    const t = row.metaTier || "unknown";
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
}

export function loadMetaCache() {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}
