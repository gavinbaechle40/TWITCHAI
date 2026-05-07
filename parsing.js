import fs from "fs";
import path from "path";
import { config } from "./config.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const STATE_PATH = path.join(DATA_DIR, "state.json");

const DEFAULT_STATE = {
  shared: {
    currentMap: null,
    currentKit: null,
    currentKitValue: 0,
    currentExtractValue: 0,
    personality: "funny",
    roastMode: true,
    hypeMode: true,
    lastSummaryAt: 0
  },
  stats: {
    raids: 0,
    deaths: 0,
    extracts: 0,
    wins: 0,
    totalProfit: 0,
    totalLoss: 0
  },
  votes: {
    push: 0,
    rotate: 0,
    extract: 0,
    hold: 0
  },
  users: {},
  memory: {
    global: [],
    perUser: {}
  },
  events: {
    active: null,
    nextAt: 0
  },
  metaLearning: {
    scenarios: {},
    totals: {
      good: 0,
      bad: 0,
      neutral: 0
    }
  }
};

let state = null;
let saveTimer = null;

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

export function loadState() {
  ensureDirs();
  if (!fs.existsSync(STATE_PATH)) {
    state = clone(DEFAULT_STATE);
    saveNow();
    return state;
  }
  try {
    state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    state = clone(DEFAULT_STATE);
    saveNow();
  }
  state.shared = { ...DEFAULT_STATE.shared, ...(state.shared || {}) };
  state.stats = { ...DEFAULT_STATE.stats, ...(state.stats || {}) };
  state.votes = { ...DEFAULT_STATE.votes, ...(state.votes || {}) };
  state.users = state.users || {};
  state.memory = state.memory || clone(DEFAULT_STATE.memory);
  state.events = state.events || clone(DEFAULT_STATE.events);
  state.metaLearning = state.metaLearning || clone(DEFAULT_STATE.metaLearning);
  return state;
}

export function getState() {
  if (!state) loadState();
  return state;
}

export function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, config.stateSaveDebounceMs);
}

export function saveNow() {
  ensureDirs();
  const tmp = STATE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

export function backupState() {
  ensureDirs();
  const backupPath = path.join(BACKUP_DIR, `state_${Date.now()}.json`);
  fs.copyFileSync(STATE_PATH, backupPath);
  const files = fs.readdirSync(BACKUP_DIR).sort();
  while (files.length > config.maxStateBackups) {
    const old = files.shift();
    fs.unlinkSync(path.join(BACKUP_DIR, old));
  }
}

export function ensureUser(username) {
  const key = String(username || "").toLowerCase();
  const s = getState();
  if (!s.users[key]) {
    s.users[key] = {
      raids: 0,
      deaths: 0,
      extracts: 0,
      wins: 0,
      totalProfit: 0,
      totalLoss: 0,
      kills: 0,
      wipes: 0,
      clutches: 0,
      clips: 0,
      votesCast: 0,
      pushCalls: 0,
      thread: {
        lastQuestionAt: 0,
        expiresAt: 0,
        weapon: null,
        ammo: null,
        enemyTier: null,
        map: null,
        kit: null,
        intent: null,
        lastQuestion: null,
        lastAnswer: null
      },
      pendingAdvice: null
    };
    queueSave();
  }
  return s.users[key];
}

export function addMemory(username, entry) {
  const s = getState();
  s.memory.global.push(entry);
  if (s.memory.global.length > 30) s.memory.global.shift();
  const key = String(username || "").toLowerCase();
  s.memory.perUser[key] = s.memory.perUser[key] || [];
  s.memory.perUser[key].push(entry);
  if (s.memory.perUser[key].length > 10) s.memory.perUser[key].shift();
  queueSave();
}

export function setShared(patch) {
  Object.assign(getState().shared, patch);
  queueSave();
}
