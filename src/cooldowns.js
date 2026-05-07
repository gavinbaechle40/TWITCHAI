const cleanupIntervalMs = 60_000;
const defaultMs = Number(process.env.COMMAND_COOLDOWN_MS || 1500);
const heavyMs = Number(process.env.HEAVY_COMMAND_COOLDOWN_MS || 5000);
const scope = new Map();

const heavyCommands = new Set(['compare','meta','value','worth','loadout','shouldipush','fightcheck']);

function commandBucket(text = '') {
  const normalized = String(text).trim().toLowerCase();
  const [head] = normalized.split(/\s+/);
  return head || 'unknown';
}

function ttlFor(command) {
  return heavyCommands.has(command) ? heavyMs : defaultMs;
}

export function getCooldownStatus(username, rawInput) {
  const user = String(username || 'unknown').toLowerCase();
  const command = commandBucket(rawInput);
  const key = `${user}:${command}`;
  const until = scope.get(key) || 0;
  const now = Date.now();
  if (until > now) return { blocked: true, remainingMs: until - now, command };
  scope.set(key, now + ttlFor(command));
  return { blocked: false, remainingMs: 0, command };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, until] of scope.entries()) if (until <= now) scope.delete(key);
}, cleanupIntervalMs).unref();
