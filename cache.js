export const config = {
  prefix: process.env.COMMAND_PREFIX || "!abi",
  botName: process.env.BOT_NAME || "mrnutt3r",
  botAliases: (process.env.BOT_ALIASES || "mrnutt3r,mrnutter,nutt3r,nutter")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  threadingEnabled: process.env.THREADING_ENABLED !== "false",
  threadingWindowMs: Number(process.env.THREADING_WINDOW_MS || 90000),
  openAIEnabled: process.env.OPENAI_ENABLED === "true",
  reactiveReplyChance: Number(process.env.REACTIVE_REPLY_CHANCE || 0.02),
  roastMode: process.env.ROAST_MODE !== "false",
  hypeMode: process.env.HYPE_MODE !== "false",
  stateBackupIntervalMs: Number(process.env.STATE_BACKUP_INTERVAL_MS || 600000),
  maxStateBackups: Number(process.env.MAX_STATE_BACKUPS || 24),
  stateSaveDebounceMs: Number(process.env.STATE_SAVE_DEBOUNCE_MS || 750),
  randomEventsEnabled: process.env.RANDOM_EVENTS_ENABLED !== "false",
  randomEventPollMs: Number(process.env.RANDOM_EVENT_POLL_MS || 15000),
  randomEventIntervalMinMs: Number(process.env.RANDOM_EVENT_INTERVAL_MIN_MS || 180000),
  randomEventIntervalMaxMs: Number(process.env.RANDOM_EVENT_INTERVAL_MAX_MS || 420000),
  randomEventDurationMs: Number(process.env.RANDOM_EVENT_DURATION_MS || 45000),
  messageConcurrency: Number(process.env.MESSAGE_CONCURRENCY || 3),
  messageQueueMaxPending: Number(process.env.MESSAGE_QUEUE_MAX_PENDING || 200),
  commandCooldownMs: Number(process.env.COMMAND_COOLDOWN_MS || 1500),
  heavyCommandCooldownMs: Number(process.env.HEAVY_COMMAND_COOLDOWN_MS || 5000),
  naturalIntentChance: Number(process.env.NATURAL_INTENT_CHANCE || 0.2),
  intentReplyMinConfidence: Number(process.env.INTENT_REPLY_MIN_CONFIDENCE || 0.72),
  aiMaxCallsPerMinute: Number(process.env.AI_MAX_CALLS_PER_MINUTE || 20),
  aiDedupeTtlMs: Number(process.env.AI_DEDUPE_TTL_MS || 15000),
  responseCacheTtlMs: Number(process.env.RESPONSE_CACHE_TTL_MS || 180000)
};
