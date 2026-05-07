import { getState, queueSave, ensureUser } from "./state.js";
import { config } from "./config.js";
import { pick } from "./utils.js";
import { addKoen } from "./economy.js";

const templates = [
  { type: "loot", prompt: "🪂 Airdrop spotted — type !abi loot", reward: [8000, 18000] },
  { type: "secure", prompt: "📦 Intel case found — type !abi secure", reward: [6000, 15000] },
  { type: "evac", prompt: "🚁 Secret evac is open — type !abi evac", reward: [10000, 22000] }
];

function nextDelay() {
  return Math.floor(Math.random() * (config.randomEventIntervalMaxMs - config.randomEventIntervalMinMs + 1)) + config.randomEventIntervalMinMs;
}

export function initEvents() {
  const s = getState();
  if (!s.events.nextAt) s.events.nextAt = Date.now() + nextDelay();
  queueSave();
}

export function pollEvents(client, channel) {
  if (!config.randomEventsEnabled) return;
  const s = getState();
  const now = Date.now();

  if (s.events.active && now > s.events.active.expiresAt) {
    s.events.active = null;
    s.events.nextAt = now + nextDelay();
    queueSave();
    return;
  }

  if (!s.events.active && now >= s.events.nextAt) {
    const t = pick(templates);
    s.events.active = {
      ...t,
      rewardKoen: Math.floor(Math.random() * (t.reward[1] - t.reward[0] + 1)) + t.reward[0],
      startedAt: now,
      expiresAt: now + config.randomEventDurationMs,
      claimedBy: null
    };
    queueSave();
    client.say(channel, t.prompt);
  }
}

export function tryClaimEvent(username, command) {
  const s = getState();
  const evt = s.events.active;
  if (!evt) return { ok: false, msg: "no live event right now" };
  if (evt.claimedBy) return { ok: false, msg: "that event was already claimed" };
  if (evt.type !== command) return { ok: false, msg: null };

  evt.claimedBy = username;
  const reward = Number(evt.rewardKoen || 0);
  const user = ensureUser(username);
  user.totalProfit = Number(user.totalProfit || 0) + reward;
  user.koen = Number(user.koen || 0) + reward;
  const newBalance = addKoen(username, reward);
  s.events.active = null;
  s.events.nextAt = Date.now() + nextDelay();
  queueSave();
  return { ok: true, msg: `@${username} claimed ${reward.toLocaleString()} Koen. Balance: ${newBalance.toLocaleString()} Koen` };
}
