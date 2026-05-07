import { inferTier } from "./parsing.js";

export function deterministicFallback({ command, rawArgs = "", message = "", context = {} }) {
  const tier = inferTier(message) || context.enemyTier || 4;
  const lower = `${rawArgs} ${message}`.toLowerCase();

  if (command === "shouldipush") {
    if (lower.includes("mp5") && tier >= 5) return "not ideal — mp5 into T5 is usually a donation unless you ambush hard";
    if (lower.includes("m4") || lower.includes("m4a1")) return tier >= 5 ? "playable if your ammo is real" : "solid push angle, just don't troll first peek";
    return tier >= 5 ? "risky — stronger ammo matters here" : "playable if you take first contact clean";
  }

  if (command === "ratekit") {
    if (tier >= 5 && lower.includes("ps")) return "budget kit, bad matchup into heavy armor";
    return "serviceable kit — ammo quality decides the real answer";
  }

  if (command === "loadout") {
    const map = String(context.currentMap || "").toLowerCase();
    if (map.includes("tv") || map.includes("armory")) return "close-range gun, decent armor, and don't cheap out on ammo";
    return "balanced rifle, good ammo, and enough armor to avoid random embarrassment";
  }

  if (command === "meta") {
    return "ammo is usually more meta than the gun itself — penetration pays rent";
  }

  if (command === "compare") {
    return "pick the gun you control better unless the ammo gap is massive";
  }

  if (command === "worth") {
    return "higher value per slot wins, always";
  }

  return null;
}
