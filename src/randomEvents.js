import { getState, patchState, ensureUser } from "./stateManager.js";

const EVENTS = [
  { type: "airdrop", command: "loot", rewardMin: 4000, rewardMax: 14000, announce: "🪂 Airdrop spotted. Type !abi loot to snag a crate.", resolve: (name, reward) => `${name} yoinked the airdrop for ${reward.toLocaleString()} Koen.` },
  { type: "intel", command: "secure", rewardMin: 3000, rewardMax: 11000, announce: "🗂️ Loose intel on the floor. Type !abi secure to grab it.", resolve: (name, reward) => `${name} secured the intel and pocketed ${reward.toLocaleString()} Koen.` },
  { type: "evac", command: "evac", rewardMin: 5000, rewardMax: 16000, announce: "🚪 Secret evac is open. Type !abi evac to slip out rich.", resolve: (name, reward) => `${name} hit the secret evac and escaped with ${reward.toLocaleString()} Koen.` },
];

function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
function pickEvent() { return EVENTS[Math.floor(Math.random() * EVENTS.length)]; }

export function maybeStartRandomEvent() {
  const state = getState();
  const enabled = String(process.env.RANDOM_EVENTS_ENABLED || 'true') !== 'false';
  if (!enabled) return null;
  const now = Date.now();
  if (state.randomEvents?.active) return null;
  if (state.randomEvents?.nextAt && now < state.randomEvents.nextAt) return null;

  const event = pickEvent();
  const durationMs = Number(process.env.RANDOM_EVENT_DURATION_MS || 45000);
  patchState(s => {
    s.randomEvents.active = {
      ...event,
      id: `evt_${now}`,
      startedAt: now,
      endsAt: now + durationMs,
      participants: [],
      claimedBy: null,
      reward: null,
    };
    const minGap = Number(process.env.RANDOM_EVENT_INTERVAL_MIN_MS || 180000);
    const maxGap = Number(process.env.RANDOM_EVENT_INTERVAL_MAX_MS || 420000);
    s.randomEvents.nextAt = now + rand(minGap, maxGap);
  });
  return getState().randomEvents.active;
}

export function expireRandomEvent() {
  const state = getState();
  const active = state.randomEvents?.active;
  if (!active) return null;
  if (Date.now() < active.endsAt) return null;
  let msg = null;
  patchState(s => {
    const ended = s.randomEvents.active;
    if (!ended) return;
    if (!ended.claimedBy) msg = `Event expired. Nobody typed !abi ${ended.command} fast enough.`;
    s.randomEvents.history.push({ ...ended, expiredAt: Date.now() });
    s.randomEvents.history = s.randomEvents.history.slice(-30);
    s.randomEvents.active = null;
  });
  return msg;
}

export function getActiveEvent() {
  return getState().randomEvents?.active || null;
}

export function tryParticipate(username, action) {
  let result = null;
  patchState(s => {
    const active = s.randomEvents.active;
    if (!active) { result = { ok: false, message: 'No random event is active right now.' }; return; }
    if (Date.now() > active.endsAt) { result = { ok: false, message: `Too slow — the ${active.type} event just ended.` }; return; }
    if (String(action).toLowerCase() !== String(active.command).toLowerCase()) { result = { ok: false, message: `Wrong move. Current event needs !abi ${active.command}.` }; return; }
    const user = ensureUser(s, username);
    if (active.claimedBy) { result = { ok: false, message: `${active.claimedBy} already stole it. Speed matters, chief.` }; return; }
    const reward = rand(active.rewardMin, active.rewardMax);
    active.claimedBy = username;
    active.reward = reward;
    active.participants.push(username);
    user.koen = Number(user.koen || 0) + reward;
    user.profit = Number(user.profit || 0) + reward;
    s.economy.lifetimeProfit = Number(s.economy.lifetimeProfit || 0) + reward;
    s.randomEvents.history.push({ ...active, resolvedAt: Date.now() });
    s.randomEvents.history = s.randomEvents.history.slice(-30);
    s.randomEvents.active = null;
    result = { ok: true, message: active.resolve(username, reward), reward };
  });
  return result;
}

export function randomEventStatus() {
  const active = getActiveEvent();
  if (!active) return null;
  const secs = Math.max(0, Math.ceil((active.endsAt - Date.now()) / 1000));
  return `${active.announce} ${secs}s left.`;
}
