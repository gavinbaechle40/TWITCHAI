import { getState, setShared } from "./state.js";
import { getTopLearningSignals } from "./metaLearning.js";
import { config } from "./config.js";
import { pick } from "./utils.js";

function funnyBadInsight(top) {
  const weapon = top.scenario.weaponTerm || "that setup";
  const tier = top.scenario.enemyTier || "?";
  return pick([
    `mrnutt3r note: ${weapon} into T${tier} has been a certified donation drive lately 😭`,
    `mrnutt3r note: chat... ${weapon} into T${tier} keeps sending us back to the lobby`,
    `mrnutt3r note: we might need to stop ego-challing T${tier} with ${weapon} 💀`
  ]);
}

function funnyGoodInsight(top) {
  const weapon = top.scenario.weaponTerm || "that setup";
  const tier = top.scenario.enemyTier || "?";
  return pick([
    `mrnutt3r note: ${weapon} into T${tier} has actually been cooking lately 😤`,
    `mrnutt3r note: not gonna lie, ${weapon} into T${tier} has been paying rent`,
    `mrnutt3r note: ${weapon} into T${tier} is looking kinda nasty right now`
  ]);
}

export function maybeEmitInsight(client, channel) {
  if (!config.autoInsightsEnabled) return;
  const s = getState();
  const now = Date.now();
  if (now - (s.shared.lastSummaryAt || 0) < config.autoInsightsIntervalMs) return;

  const signals = getTopLearningSignals(config.autoInsightsMinSignal);
  if (!signals.length) return;

  const top = signals[0];
  let msg = null;

  if (top.adj.adjustment <= -0.35) {
    msg = config.funnyInsightsEnabled ? funnyBadInsight(top) : `mrnutt3r note: ${top.scenario.weaponTerm || "that setup"} into T${top.scenario.enemyTier || "?"} has been selling lately 😭`;
  } else if (top.adj.adjustment >= 0.35) {
    msg = config.funnyInsightsEnabled ? funnyGoodInsight(top) : `mrnutt3r note: ${top.scenario.weaponTerm || "that setup"} has actually been cooking lately 😤`;
  }

  if (!msg) return;
  if (config.dryRun) {
    console.log(`[DRY RUN] would send insight: ${msg}`);
  } else {
    client.say(channel, msg);
  }
  setShared({ lastSummaryAt: now });
}
