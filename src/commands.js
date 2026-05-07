import { lookupLocal, formatSheetStats } from "./db.js";
import { askAI } from "./ai.js";
import { searchWiki } from "./wiki.js";
import { getState, setShared, ensureUser, addMemory, queueSave } from "./state.js";
import { inferTier, inferMap, canonicalize } from "./parsing.js";
import { pick } from "./utils.js";
import { tryClaimEvent } from "./events.js";
import { tryFastPath } from "./fastPath.js";
import { confidenceLabel, formatReason } from "./explain.js";
import { getRuntimeConfig, loadRuntimeConfig } from "./runtimeConfig.js";
import { exportSummary } from "./export.js";
import { getVersionInfo } from "./version.js";
import { audit } from "./audit.js";
import { maybeHypeCallout } from "./engagementMoments.js";
import { evaluateFightMeta, getMetaSummary } from "./meta.js";
import { loadMetaCache } from "./metaCache.js";
import { rememberAdviceForUser, recordOutcomeFromPending, getLearningOverview, summarizeLearning, markPendingOutcome, undoLastLearnedOutcome } from "./metaLearning.js";
import { computeConfidence, autofillContextFromMessage } from "./intelligence.js";

function personality() {
  return getState().shared.personality || "funny";
}


function finalizeReply(text, meta = {}) {
  if (!text) return null;
  return { text, ...meta };
}

function firstDefined(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== "") {
      return row[key];
    }
  }
  return null;
}

function exactAmmoStatReply(row) {
  const name =
    firstDefined(row, ["Name", "name", "ammo_name", "Ammo Name"]) || "This ammo";

  const damage =
    firstDefined(row, ["Damage", "damage"]);
  const penetration =
    firstDefined(row, ["Penetration", "penetration", "Pen", "pen"]);
  const tier =
    firstDefined(row, ["Tier", "tier", "pierce_level", "Pierce Level"]);
  const armorDamage =
    firstDefined(row, ["Armor Damage", "armor_damage"]);
  const velocity =
    firstDefined(row, ["Velocity", "velocity_m_s", "Velocity m/s"]);

  const parts = [];
  if (damage !== null) parts.push(`${damage} damage`);
  if (penetration !== null) parts.push(`${penetration} penetration`);
  if (tier !== null) parts.push(`tier ${tier}`);
  if (armorDamage !== null) parts.push(`${armorDamage} armor damage`);
  if (velocity !== null) parts.push(`${velocity} m/s`);

  if (!parts.length) return null;
  return `${name}: ${parts.join(" | ")}`;
}

function isExactStatQuestion(command, message) {
  const msg = String(message || "").toLowerCase();
  if (command === "meta") return false;

  return (
    msg.includes("damage") ||
    msg.includes("penetration") ||
    msg.includes("pen") ||
    msg.includes("armor damage") ||
    msg.includes("velocity") ||
    msg.includes("stats") ||
    msg.includes("how much") ||
    msg.includes("exact")
  );
}

export async function handleCommand({ command, rawArgs, args, tags, message }) {
  const username = tags.username;
  const s = getState();
  const user = ensureUser(username);
  const ctx = autofillContextFromMessage(username, `${rawArgs || ""} ${message || ""}`);

  if (["loot", "secure", "evac", "event"].includes(command)) {
    if (command === "event") return finalizeReply("watch chat for the next random event prompt");
    const claim = tryClaimEvent(username, command);
    if (!claim.msg) return null;
    return finalizeReply(claim.ok ? `${claim.msg} 😤` : claim.msg, { confidence: 0.95, source: "event" });
  }

  if (command === "metacache") {
    const cache = loadMetaCache();
    if (!cache) return finalizeReply("meta cache is missing — restart the bot to rebuild it");
    return finalizeReply(`meta cache ready | weapons ${cache.weapons.length} | ammo ${cache.ammo.length} | armor ${cache.armor.length} | helmets ${cache.helmets.length}`);
  }

  if (command === "status") {
    const cache = loadMetaCache();
    const runtime = getRuntimeConfig();
    return finalizeReply(
      `online | ai ${process.env.OPENAI_ENABLED === "true" ? "on" : "off"} | wiki live | cache ${cache ? "ready" : "missing"} | roast ${runtime.roastMode ? "on" : "off"} | hype ${runtime.hypeMode ? "on" : "off"}`
    );
  }

  if (command === "version") {
    const v = getVersionInfo();
    return finalizeReply(`v${v.botVersion} | dataset ${v.datasetLoadedAt} | metaCache ${v.metaCacheAt}`);
  }

  if (command === "setmap") {
    setShared({ currentMap: rawArgs });
    user.thread.map = rawArgs;
    queueSave();
    return finalizeReply(`got it — map set to ${rawArgs}`);
  }

  if (command === "setkit") {
    setShared({ currentKit: rawArgs });
    user.thread.kit = rawArgs;
    queueSave();
    return finalizeReply(`saved — current kit is ${rawArgs}`);
  }

  if (command === "setkitvalue") {
    setShared({ currentKitValue: Number(args[0] || 0) });
    return finalizeReply(`kit value set to ${Number(args[0] || 0)} Koen`);
  }

  if (command === "setextractvalue") {
    setShared({ currentExtractValue: Number(args[0] || 0) });
    return finalizeReply(`extract value set to ${Number(args[0] || 0)} Koen`);
  }

  if (command === "died") {
    s.stats.deaths++;
    s.stats.raids++;
    s.stats.totalLoss += s.shared.currentKitValue || 0;
    user.deaths++;
    user.raids++;
    user.totalLoss += s.shared.currentKitValue || 0;
    const learned = recordOutcomeFromPending(username, "died");
    queueSave();
    const learnText = learned ? ` | learned ${summarizeLearning(learned.scenarioKey)}` : "";
    const base = s.shared.roastMode ? `you just lost ${s.shared.currentKitValue || 0} Koen... donate less 😭${learnText}` : `lost ${s.shared.currentKitValue || 0} Koen${learnText}`;
    const hype = maybeHypeCallout("died");
    return hype ? `${base} | ${hype}` : base;
  }

  if (command === "extract") {
    s.stats.extracts++;
    s.stats.raids++;
    s.stats.totalProfit += s.shared.currentExtractValue || 0;
    user.extracts++;
    user.raids++;
    user.totalProfit += s.shared.currentExtractValue || 0;
    queueSave();
    return finalizeReply(`+${s.shared.currentExtractValue || 0} Koen — we up 😤`);
  }

  if (command === "won") {
    s.stats.wins++;
    user.wins++;
    queueSave();
    return finalizeReply("dub secured 😤");
  }

  if (command === "kill") {
    user.kills++;
    queueSave();
    return maybeHypeCallout("kill") || pick(["NAHHH YOU FRYING 😤", "that guy got erased 😭", "delete button energy"]);
  }

  if (command === "wipe") {
    user.wipes++;
    queueSave();
    return maybeHypeCallout("wipe") || pick(["whole squad deleted 😭", "that was disrespectful", "clip that immediately"]);
  }

  if (command === "clutch") {
    user.clutches++;
    queueSave();
    return maybeHypeCallout("clutch") || pick(["clutch gene activated 😤", "plot armor is real", "that should've been impossible"]);
  }

  if (command === "clip") {
    user.clips++;
    queueSave();
    return finalizeReply("🎬 clipped — that better be heat");
  }

  if (command === "stats") {
    const survival = s.stats.raids ? ((s.stats.extracts / s.stats.raids) * 100).toFixed(1) : "0.0";
    const net = s.stats.totalProfit - s.stats.totalLoss;
    return finalizeReply(`raids ${s.stats.raids} | survival ${survival}% | net ${net} Koen`);
  }

  if (command === "mystats") {
    const survival = user.raids ? ((user.extracts / user.raids) * 100).toFixed(1) : "0.0";
    const net = user.totalProfit - user.totalLoss;
    return finalizeReply(`your raids ${user.raids} | survival ${survival}% | wins ${user.wins} | net ${net} Koen`);
  }

  if (command === "leaderboard") {
    const ranked = Object.entries(s.users)
      .map(([name, u]) => ({ name, score: (u.wins * 5) + (u.extracts * 3) + (u.totalProfit - u.totalLoss) / 10000 - u.deaths }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x, i) => `#${i+1} ${x.name}`);
    return ranked.length ? ranked.join(" | ") : "no leaderboard data yet";
  }

  if (command === "personality") {
    s.shared.personality = args[0] || "funny";
    queueSave();
    return finalizeReply(`personality set to ${s.shared.personality}`);
  }

  if (command === "toggle") {
    const target = (args[0] || "").toLowerCase();
    if (target === "roast") {
      s.shared.roastMode = !s.shared.roastMode;
      queueSave();
      return finalizeReply(`roast mode ${s.shared.roastMode ? "on" : "off"}`);
    }
    if (target === "hype") {
      s.shared.hypeMode = !s.shared.hypeMode;
      queueSave();
      return finalizeReply(`hype mode ${s.shared.hypeMode ? "on" : "off"}`);
    }
  }

  if (command === "context") {
    return finalizeReply(`map=${s.shared.currentMap || "none"} | kit=${s.shared.currentKit || "none"} | kitValue=${s.shared.currentKitValue || 0} | extractValue=${s.shared.currentExtractValue || 0}`);
  }

  if (command === "memory") {
    const mem = getState().memory.perUser[username] || [];
    return mem.length ? mem.slice(-3).map(x => x.question).join(" | ") : "no recent memory";
  }

  if (command === "summary") {
    const net = s.stats.totalProfit - s.stats.totalLoss;
    return finalizeReply(`summary: ${s.stats.raids} raids | ${s.stats.wins} wins | ${s.stats.extracts} extracts | net ${net} Koen`);
  }

  if (command === "compare" || command === "value" || command === "lookup" || command === "shouldipush" || command === "ratekit" || command === "loadout" || command === "meta" || command === "worth") {
    return await handleGameQuery({ command, rawArgs, username, message });
  }

  if (command === "help") {
    return finalizeReply("try shouldipush, ratekit, compare, meta, metacache, status, version, loadout, value, stats, mystats, leaderboard, setmap, setkit");
  }

  return null;
}

async function handleGameQuery({ command, rawArgs, username, message }) {
  const s = getState();
  const user = ensureUser(username);
  const rawLookup = canonicalize(rawArgs);
  const rawLooksLikeOnlyStatWords = /^(exact\s*)?(stats?|numbers?)$/i.test(String(rawArgs || "").trim());
  const queryForLocal = rawLooksLikeOnlyStatWords
    ? (user.thread.weapon || user.thread.ammo || rawLookup)
    : rawLookup;
  const local = lookupLocal(queryForLocal);

  const localHit = Boolean(local.weapon || local.ammo || local.armor || local.helmet);
  if (command === "lookup") {
    console.log(`[ABI lookup] raw="${rawArgs}" query="${queryForLocal}" weapon=${Boolean(local.weapon)} ammo=${Boolean(local.ammo)} armor=${Boolean(local.armor)} helmet=${Boolean(local.helmet)}`);
  }
  const ctx = `map=${user.thread.map || s.shared.currentMap || "none"}, kit=${user.thread.kit || s.shared.currentKit || "none"}, weapon=${user.thread.weapon || "unknown"}, ammo=${user.thread.ammo || "unknown"}, enemyTier=${inferTier(message) || user.thread.enemyTier || "unknown"}`;

  let answer = null;

  if (command === "shouldipush") {
    const tier = inferTier(message) || user.thread.enemyTier || 4;
    const raw = String(rawArgs || "");
    const activeMap = user.thread.map || s.shared.currentMap;
    const metaEval = evaluateFightMeta({
      weaponTerm: raw,
      ammoTerm: raw,
      enemyTier: tier,
      map: activeMap
    });
    rememberAdviceForUser(username, {
      scenarioKey: metaEval.scenarioKey,
      weaponTerm: raw,
      ammoTerm: raw,
      enemyTier: tier,
      map: activeMap,
      advisedVerdict: metaEval.verdict
    });
    s.shared.lastDecision = {
      reason: formatReason(metaEval),
      confidenceLabel: confidenceLabel(metaEval.confidenceScore || 0.85)
    };
    queueSave();
    answer = `${metaEval.reply} (${metaEval.weaponMeta.tier}-weapon / ${metaEval.ammoMeta.tier}-ammo | ${metaEval.learningSummary} | ${confidenceLabel(metaEval.confidenceScore || 0.85)})`;
  } else if (command === "ratekit") {
    const raw = String(rawArgs || "");
    const tier = inferTier(message) || user.thread.enemyTier || 4;
    const activeMap = user.thread.map || s.shared.currentMap;
    const metaEval = evaluateFightMeta({
      weaponTerm: raw,
      ammoTerm: raw,
      enemyTier: tier,
      map: activeMap
    });
    rememberAdviceForUser(username, {
      scenarioKey: metaEval.scenarioKey,
      weaponTerm: raw,
      ammoTerm: raw,
      enemyTier: tier,
      map: activeMap,
      advisedVerdict: metaEval.verdict
    });
    s.shared.lastDecision = {
      reason: formatReason(metaEval),
      confidenceLabel: confidenceLabel(metaEval.confidenceScore || 0.82)
    };
    queueSave();
    answer =
      metaEval.verdict === "hard meta" || metaEval.verdict === "strong"
        ? `good kit — ${metaEval.weaponMeta.tier}/${metaEval.ammoMeta.tier} meta value (${metaEval.learningSummary} | ${confidenceLabel(metaEval.confidenceScore || 0.82)})`
        : `mid kit — ${metaEval.reply} (${metaEval.learningSummary} | ${confidenceLabel(metaEval.confidenceScore || 0.82)})`;
  } else if (command === "loadout") {
    answer = s.shared.currentMap && String(s.shared.currentMap).toLowerCase().includes("tv")
      ? "for TV Station, run a close-range setup and don't overspend"
      : "balanced budget kit first, then scale ammo quality";
  } else if (command === "meta") {
    answer = rawArgs
      ? getMetaSummary(rawArgs)
      : "real meta check uses local gun/ammo/armor stats plus enemy tier — ammo still matters more than flex gear";
  } else if (command === "worth") {
    answer = "higher value-per-slot wins, every time";
  }

  if (!answer && command === "compare" && rawArgs.includes(" vs ")) {
    const [left, right] = rawArgs.split(/\s+vs\s+/i);
    const a = getMetaSummary(left);
    const b = getMetaSummary(right);
    answer = `${a} || ${b}`;
  }

  const exactStatWanted = isExactStatQuestion(command, message);

  if (!answer && exactStatWanted && localHit) {
    const exact = formatSheetStats(local) || exactAmmoStatReply(local.ammo);
    if (exact) {
      return finalizeReply(exact, {
        confidence: 0.99,
        source: "local-sheet"
      });
    }
  }

  if (!answer && localHit) {
    const exact = formatSheetStats(local);
    if (exact) {
      return finalizeReply(exact, {
        confidence: 0.98,
        source: "local-sheet"
      });
    }
    answer = "found it in the local sheet — stats are available for that item";
  }

  if (!answer) {
    const wiki = await searchWiki(queryForLocal || rawArgs);
    answer = wiki.summary;
  }

  // Never let AI invent exact spreadsheet stats
  if (exactStatWanted) {
    return finalizeReply(answer, {
      confidence: localHit ? 0.99 : 0.55,
      source: localHit ? "local-sheet" : "wiki"
    });
  }

  const ai = await askAI({
    question: `${command} ${rawArgs}`,
    context: `${answer}. ${ctx}`,
    personality: personality()
  });

  const finalText = ai || answer;
  const confidence = computeConfidence({
    localHit,
    metaHit: ["shouldipush", "ratekit", "meta", "compare"].includes(command),
    wikiHit: !localHit,
    aiUsed: Boolean(ai),
    intentConfidence: 0.9
  });

  return finalizeReply(finalText, {
    confidence,
    source: localHit ? "local/meta" : (ai ? "wiki+ai" : "wiki")
  });
}
