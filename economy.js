import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "../data/koen_db.json");

const STARTING_KOEN = Number(process.env.KOEN_STARTING_BALANCE || 500);
const ROB_COOLDOWN_MS = Number(process.env.KOEN_ROB_COOLDOWN_MS || 60000);
const GAMBLE_COOLDOWN_MS = Number(process.env.KOEN_GAMBLE_COOLDOWN_MS || 30000);
const BLACKJACK_SESSION_MS = Number(process.env.KOEN_BLACKJACK_SESSION_MS || 5 * 60 * 1000);
const HAT_COLOR_COST = Number(process.env.KOEN_HAT_COLOR_COST || 50000);
const TITLE_COST = Number(process.env.KOEN_TITLE_COST || 500000);
const CUSTOM_TITLE_COST = Number(process.env.KOEN_CUSTOM_TITLE_COST || 500000);
const MAX_TITLE_LENGTH = Number(process.env.KOEN_MAX_TITLE_LENGTH || 24);
const JACKPOT_THRESHOLD = Number(process.env.KOEN_JACKPOT_THRESHOLD || 20000);
const JACKPOT_JOIN_MS = Number(process.env.KOEN_JACKPOT_JOIN_MS || 60 * 1000);
const JACKPOT_LOSS_PERCENT = Number(process.env.KOEN_JACKPOT_LOSS_PERCENT || 0.10);
const BLACKJACK_MAX_SPLIT_HANDS = Number(process.env.KOEN_BLACKJACK_MAX_SPLIT_HANDS || 4);
const DUCK_SESSION_MS = Number(process.env.KOEN_DUCK_SESSION_MS || 3 * 60 * 1000);
const DUCK_MAX_STEPS = Number(process.env.KOEN_DUCK_MAX_STEPS || 10);

const HAT_COLORS = new Set([
  "red", "blue", "orange", "pink", "babyblue", "black", "green", "purple", "rainbow", "star",
  "hypno", "glitter", "420", "nebula", "pew", "purpflame", "babypink", "firework", "mandela",
  "sakura", "dvd", "bageldvd", "eagles", "capitals", "pats", "fire", "warcat", "therock",
  "monkey", "ravens", "cock", "thankyou", "christmas", "starfish", "buddyjesus", "honkers", "beer",
  "toast", "mustardtiger", "matrix", "white", "platypus", "phoque", "texas", "nick", "dave", "ry",
  "hornsdown", "utep", "johnp", "gorlock", "jesus", "walker", "ella", "bigmac", "plaster", "redtank",
  "beefcuratins", "loudnoises", "pups", "nana", "clean", "lion"
]);

function normalizeTitleKey(title) {
  return String(title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const TITLE_SHOP = [
  "Loot Goblin", "Koen Goblin", "Raid Rat", "Certified Menace", "Bag Chaser",
  "Extract Artist", "Thermal Gremlin", "Budget Demon", "Chad Lite", "Walking Donation",
  "Loot Lord", "Koen King", "Koen Queen", "ABI Scholar", "Rat King", "Vault Goblin",
  "Zero To Hero", "W Key Warrior", "Texas Menace", "Big Bag Energy"
];

const TITLE_ALIASES = new Map(TITLE_SHOP.map((title) => [normalizeTitleKey(title), title]));
const BANNED_TITLE_WORDS = ["slur", "nazi", "hitler", "rape", "kill", "kys", "suicide", "terrorist"];

function normalizeName(name) {
  return String(name || "").replace(/^@+/, "").trim().toLowerCase();
}

function normalizeColor(color) {
  return String(color || "").replace(/^!+/, "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function sanitizeTitle(title) {
  const cleaned = String(title || "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/[^a-zA-Z0-9 !?._-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TITLE_LENGTH);

  if (!cleaned) return { ok: false, reason: "title cannot be empty." };
  if (cleaned.length < 3) return { ok: false, reason: "title must be at least 3 characters." };
  const lower = cleaned.toLowerCase();
  if (BANNED_TITLE_WORDS.some((word) => lower.includes(word))) {
    return { ok: false, reason: "that title is too spicy for Twitch. Pick something stream-safe." };
  }
  return { ok: true, title: cleaned };
}

function titleTag(user) {
  return user?.title ? `[${user.title}] ` : "";
}

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { users: {}, jackpot: defaultJackpot() };
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return migrateDB(parsed && typeof parsed === "object" ? parsed : {});
  } catch {
    return { users: {}, jackpot: defaultJackpot() };
  }
}

function defaultJackpot() {
  return { pool: 0, active: false, entries: [], startedAt: 0, expiresAt: 0 };
}

function migrateDB(db) {
  db.users = db.users || {};
  db.jackpot = { ...defaultJackpot(), ...(db.jackpot || {}) };
  db.blackjack = db.blackjack && typeof db.blackjack === "object" ? db.blackjack : {};
  db.duck = db.duck && typeof db.duck === "object" ? db.duck : {};
  if (!Array.isArray(db.jackpot.entries)) db.jackpot.entries = [];
  for (const user of Object.values(db.users)) {
    if (!Array.isArray(user.titlesOwned)) user.titlesOwned = [];
    if (typeof user.title !== "string") user.title = "";
    user.customTitlesBought = Number(user.customTitlesBought || 0);
  }
  return db;
}

function saveDB(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(migrateDB(db), null, 2));
}

function getUser(db, username) {
  const name = normalizeName(username);
  if (!db.users[name]) {
    db.users[name] = {
      koen: STARTING_KOEN,
      level: 1,
      xp: 0,
      spins: 0,
      bets: 0,
      robs: 0,
      robbed: 0,
      hatChanges: 0,
      title: "",
      titlesOwned: [],
      customTitlesBought: 0,
      lastSeen: Date.now(),
      lastWatchRewardAt: Date.now(),
      lastGambleAt: 0,
      lastRobAt: 0
    };
  }
  if (!Array.isArray(db.users[name].titlesOwned)) db.users[name].titlesOwned = [];
  if (typeof db.users[name].title !== "string") db.users[name].title = "";
  db.users[name].customTitlesBought = Number(db.users[name].customTitlesBought || 0);
  db.users[name].koen = Number(db.users[name].koen || 0);
  db.users[name].xp = Number(db.users[name].xp || 0);
  db.users[name].level = Number(db.users[name].level || 1);
  db.users[name].lastSeen = Date.now();
  updateLevel(db.users[name]);
  return db.users[name];
}

function format(n) {
  return Math.floor(Number(n) || 0).toLocaleString();
}

function parseAmount(value, fallback = 50) {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/,/g, "")
    .replace(/[?!]+$/g, "")
    .trim();

  if (!raw) return fallback;
  if (["all", "max", "everything", "fullsend", "full-send"].includes(raw)) return "all";
  if (["half", "1/2"].includes(raw)) return { type: "percent", value: 50 };
  if (["quarter", "1/4"].includes(raw)) return { type: "percent", value: 25 };

  if (raw.endsWith("%")) {
    const pct = Number(raw.slice(0, -1));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
    return { type: "percent", value: pct };
  }

  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, n);
}

function resolveWager(userState, value, fallback = 50) {
  const parsed = parseAmount(value, fallback);
  const balance = Math.floor(Number(userState?.koen || 0));
  if (parsed === "all") return Math.max(0, balance);
  if (parsed && typeof parsed === "object" && parsed.type === "percent") {
    return Math.max(0, Math.floor(balance * (Number(parsed.value) / 100)));
  }
  return Math.max(0, Math.floor(Number(parsed) || 0));
}

function xpForLevel(level) {
  return Math.max(0, (Number(level || 1) - 1) * 10000);
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 10000) + 1);
}

function updateLevel(user) {
  const oldLevel = Number(user.level || 1);
  user.level = levelFromXp(user.xp || 0);
  return user.level > oldLevel;
}

function awardXp(user, amount) {
  user.xp = Number(user.xp || 0) + Math.max(0, Math.floor(Number(amount) || 0));
  return updateLevel(user);
}

function getLevelPerks(level) {
  const perks = [];
  if (level >= 5) perks.push("+5% robbery success");
  if (level >= 10) perks.push("10% cheaper hat colors");
  if (level >= 15) perks.push("+2% bet win chance");
  if (level >= 20) perks.push("VIP whale flex");
  return perks.length ? perks.join(", ") : "no perks yet — keep farming";
}

function hatCostFor(user) {
  return Number(user.level || 1) >= 10 ? Math.floor(HAT_COLOR_COST * 0.9) : HAT_COLOR_COST;
}

function gambleCooldownText(viewer) {
  const next = Number(viewer.lastGambleAt || 0) + GAMBLE_COOLDOWN_MS;
  const remaining = next - Date.now();
  return remaining > 0 ? `gamble cooldown: wait ${Math.ceil(remaining / 1000)}s.` : null;
}

function contributeToJackpot(db, lossAmount) {
  const contribution = Math.max(1, Math.floor(Number(lossAmount || 0) * JACKPOT_LOSS_PERCENT));
  db.jackpot.pool = Number(db.jackpot.pool || 0) + contribution;
  return contribution;
}

async function maybeStartJackpot(db, client, channel) {
  if (db.jackpot.active || Number(db.jackpot.pool || 0) < JACKPOT_THRESHOLD) return;
  const now = Date.now();
  db.jackpot.active = true;
  db.jackpot.entries = [];
  db.jackpot.startedAt = now;
  db.jackpot.expiresAt = now + JACKPOT_JOIN_MS;
  await client.say(channel, `💰 Koen jackpot is live: ${format(db.jackpot.pool)} Koen in the pool. Type !join in the next 60s to enter.`);
}


function newBlackjackDeck() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  const deck = [];
  for (const suit of suits) {
    for (const rank of ranks) deck.push({ rank, suit });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function drawCard(deck) {
  if (!Array.isArray(deck) || deck.length === 0) return newBlackjackDeck().pop();
  return deck.pop();
}

function cardValue(card) {
  if (!card) return 0;
  if (["J", "Q", "K"].includes(card.rank)) return 10;
  if (card.rank === "A") return 11;
  return Number(card.rank) || 0;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand || []) {
    total += cardValue(card);
    if (card?.rank === "A") aces += 1;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function isBlackjack(hand) {
  return Array.isArray(hand) && hand.length === 2 && handValue(hand) === 21;
}

function handText(hand, hideFirst = false) {
  if (!Array.isArray(hand) || !hand.length) return "none";
  return hand.map((card, i) => (hideFirst && i === 0 ? "[hidden]" : card.rank + card.suit)).join(" ");
}

function clearExpiredBlackjackSessions(db) {
  const now = Date.now();
  db.blackjack = db.blackjack && typeof db.blackjack === "object" ? db.blackjack : {};
  for (const [name, session] of Object.entries(db.blackjack)) {
    if (!session || now - Number(session.startedAt || 0) > BLACKJACK_SESSION_MS) delete db.blackjack[name];
  }
}

function clearExpiredDuckSessions(db) {
  const now = Date.now();
  db.duck = db.duck && typeof db.duck === "object" ? db.duck : {};
  for (const [name, session] of Object.entries(db.duck)) {
    if (!session || now - Number(session.startedAt || 0) > DUCK_SESSION_MS) delete db.duck[name];
  }
}

function duckSurvivalChance(nextStep) {
  const chance = 0.92 - (Math.max(1, Number(nextStep || 1)) - 1) * 0.055;
  return Math.max(0.34, Math.min(0.92, chance));
}

function duckMultiplier(steps) {
  const s = Math.max(0, Math.min(DUCK_MAX_STEPS, Number(steps || 0)));
  if (s <= 0) return 1;
  let mult = 1;
  for (let i = 1; i <= s; i++) mult *= 1 / duckSurvivalChance(i) * 0.96;
  return Math.max(1.05, Number(mult.toFixed(2)));
}

function duckStatus(username, session) {
  const steps = Number(session.steps || 0);
  const bet = Number(session.bet || 0);
  const cashout = Math.floor(bet * duckMultiplier(steps));
  if (steps >= DUCK_MAX_STEPS) return `@${username} duck crossed the whole road. Type !abi duck cashout to collect ${format(cashout)} Koen.`;
  const nextStep = steps + 1;
  const chance = Math.round(duckSurvivalChance(nextStep) * 100);
  const nextMult = duckMultiplier(nextStep).toFixed(2);
  return `@${username} 🦆 road run: step ${steps}/${DUCK_MAX_STEPS}, cashout ${format(cashout)} Koen (${duckMultiplier(steps).toFixed(2)}x). Next step: ${nextMult}x with ~${chance}% survival. Type !abi duck step or !abi duck cashout.`;
}


const ROULETTE_RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const ROULETTE_BLACK_NUMBERS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

function spinRouletteWheel() {
  const number = Math.floor(Math.random() * 37); // European roulette: 0-36
  const color = number === 0 ? "green" : ROULETTE_RED_NUMBERS.has(number) ? "red" : "black";
  return { number, color };
}

function normalizeRouletteBet(args) {
  const kind = String(args[0] || "").toLowerCase();
  if (!kind) return { ok: false, reason: "usage: !abi roulette red 5000 | black/even/odd/low/high/green | number 17 5000." };

  if (["red", "black", "green", "zero", "0", "even", "odd", "low", "high", "1-18", "19-36"].includes(kind)) {
    const betType = kind === "zero" || kind === "0" ? "green" : kind === "1-18" ? "low" : kind === "19-36" ? "high" : kind;
    return { ok: true, betType, amountToken: args[1] };
  }

  if (["number", "num", "straight"].includes(kind)) {
    const number = Math.floor(Number(String(args[1] || "").replace(/,/g, "")));
    if (!Number.isFinite(number) || number < 0 || number > 36) return { ok: false, reason: "roulette number bets must be 0-36. Example: !abi roulette number 17 5000." };
    return { ok: true, betType: "number", number, amountToken: args[2] };
  }

  if (["dozen1", "1st12", "first12"].includes(kind)) return { ok: true, betType: "dozen1", amountToken: args[1] };
  if (["dozen2", "2nd12", "second12"].includes(kind)) return { ok: true, betType: "dozen2", amountToken: args[1] };
  if (["dozen3", "3rd12", "third12"].includes(kind)) return { ok: true, betType: "dozen3", amountToken: args[1] };
  if (["column1", "col1"].includes(kind)) return { ok: true, betType: "column1", amountToken: args[1] };
  if (["column2", "col2"].includes(kind)) return { ok: true, betType: "column2", amountToken: args[1] };
  if (["column3", "col3"].includes(kind)) return { ok: true, betType: "column3", amountToken: args[1] };

  return { ok: false, reason: "unknown roulette bet. Try red, black, green, even, odd, low, high, number 17, dozen1/2/3, or column1/2/3." };
}

function rouletteResult(bet, roll) {
  const n = roll.number;
  let won = false;
  let multiplier = 0;

  if (bet.betType === "red") { won = roll.color === "red"; multiplier = 2; }
  else if (bet.betType === "black") { won = roll.color === "black"; multiplier = 2; }
  else if (bet.betType === "green") { won = n === 0; multiplier = 36; }
  else if (bet.betType === "even") { won = n !== 0 && n % 2 === 0; multiplier = 2; }
  else if (bet.betType === "odd") { won = n !== 0 && n % 2 === 1; multiplier = 2; }
  else if (bet.betType === "low") { won = n >= 1 && n <= 18; multiplier = 2; }
  else if (bet.betType === "high") { won = n >= 19 && n <= 36; multiplier = 2; }
  else if (bet.betType === "number") { won = n === bet.number; multiplier = 36; }
  else if (bet.betType === "dozen1") { won = n >= 1 && n <= 12; multiplier = 3; }
  else if (bet.betType === "dozen2") { won = n >= 13 && n <= 24; multiplier = 3; }
  else if (bet.betType === "dozen3") { won = n >= 25 && n <= 36; multiplier = 3; }
  else if (bet.betType === "column1") { won = n !== 0 && n % 3 === 1; multiplier = 3; }
  else if (bet.betType === "column2") { won = n !== 0 && n % 3 === 2; multiplier = 3; }
  else if (bet.betType === "column3") { won = n !== 0 && n % 3 === 0; multiplier = 3; }

  return { won, multiplier };
}

function rouletteBetLabel(bet) {
  if (bet.betType === "number") return `number ${bet.number}`;
  return bet.betType;
}

function normalizeBlackjackSession(session) {
  if (!session || typeof session !== "object") return session;
  if (!Array.isArray(session.hands)) {
    session.hands = [{
      cards: Array.isArray(session.playerHand) ? session.playerHand : [],
      bet: Number(session.bet || 0),
      doubled: Boolean(session.doubled),
      stood: false,
      busted: false,
      isSplit: false
    }];
    session.activeHand = 0;
  }
  session.hands = session.hands.map((hand) => ({
    cards: Array.isArray(hand.cards) ? hand.cards : [],
    bet: Number(hand.bet || session.bet || 0),
    doubled: Boolean(hand.doubled),
    stood: Boolean(hand.stood),
    busted: Boolean(hand.busted),
    isSplit: Boolean(hand.isSplit)
  }));
  session.activeHand = Math.max(0, Math.min(Number(session.activeHand || 0), session.hands.length - 1));
  return session;
}

function currentBlackjackHand(session) {
  normalizeBlackjackSession(session);
  return session.hands[session.activeHand];
}

function blackjackHandLabel(index, hand, activeIndex) {
  const marker = index === activeIndex ? "▶" : "";
  const status = hand.busted ? " busted" : hand.stood ? " stood" : "";
  return `${marker}H${index + 1}: ${handText(hand.cards)} (${handValue(hand.cards)})${status}`;
}

function canSplitBlackjackHand(session, hand) {
  normalizeBlackjackSession(session);
  if (!hand || !Array.isArray(hand.cards) || hand.cards.length !== 2) return false;
  if (session.hands.length >= BLACKJACK_MAX_SPLIT_HANDS) return false;
  return cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
}

function blackjackStatus(username, session) {
  normalizeBlackjackSession(session);
  const hands = session.hands.map((hand, i) => blackjackHandLabel(i, hand, session.activeHand)).join(" | ");
  const current = currentBlackjackHand(session);
  const splitHint = canSplitBlackjackHand(session, current) ? ", split" : "";
  return `@${username} blackjack | ${hands} | dealer: ${handText(session.dealerHand, true)}. Type !abi hit, !abi stand, !abi double${splitHint}.`;
}

function finishBlackjackRound(db, username, viewer, session, outcome, reason) {
  delete db.blackjack[username];
  normalizeBlackjackSession(session);
  const hand = session.hands?.[0] || { cards: session.playerHand || [], bet: Number(session.bet || 0) };
  const bet = Number(hand.bet || session.bet || 0);
  const playerCards = hand.cards || session.playerHand || [];
  const playerTotal = handValue(playerCards);
  const dealerTotal = handValue(session.dealerHand);
  let payout = 0;
  let resultText = "";

  if (outcome === "blackjack") {
    payout = bet + Math.floor(bet * 1.5);
    resultText = `BLACKJACK. Paid ${format(payout)} Koen.`;
  } else if (outcome === "win") {
    payout = bet * 2;
    resultText = `you won ${format(payout)} Koen.`;
  } else if (outcome === "push") {
    payout = bet;
    resultText = `push. Your ${format(bet)} Koen bet was returned.`;
  } else {
    contributeToJackpot(db, bet);
    resultText = `you lost ${format(bet)} Koen.`;
  }

  if (payout > 0) viewer.koen += payout;
  awardXp(viewer, Math.floor(bet / 15));
  return `@${username} ${reason} Your hand: ${handText(playerCards)} (${playerTotal}) | dealer: ${handText(session.dealerHand)} (${dealerTotal}) — ${resultText} Balance: ${format(viewer.koen)}.`;
}

function settleOneBlackjackHand(db, viewer, hand, dealerTotal) {
  const bet = Number(hand.bet || 0);
  const playerTotal = handValue(hand.cards);
  let text = "";

  if (hand.busted || playerTotal > 21) {
    contributeToJackpot(db, bet);
    text = `lost ${format(bet)}`;
  } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
    const payout = bet * 2;
    viewer.koen += payout;
    text = `won ${format(payout)}`;
  } else if (playerTotal === dealerTotal) {
    viewer.koen += bet;
    text = `pushed, returned ${format(bet)}`;
  } else {
    contributeToJackpot(db, bet);
    text = `lost ${format(bet)}`;
  }

  awardXp(viewer, Math.floor(bet / 15));
  return `${handText(hand.cards)} (${playerTotal}) ${text}`;
}

function settleDealerBlackjack(db, username, viewer, session) {
  normalizeBlackjackSession(session);
  while (handValue(session.dealerHand) < 17) session.dealerHand.push(drawCard(session.deck));
  const dealerTotal = handValue(session.dealerHand);
  const results = session.hands.map((hand, i) => `H${i + 1}: ${settleOneBlackjackHand(db, viewer, hand, dealerTotal)}`);
  delete db.blackjack[username];
  return `@${username} dealer: ${handText(session.dealerHand)} (${dealerTotal}) | ${results.join(" | ")}. Balance: ${format(viewer.koen)}.`;
}

function advanceBlackjackHandOrSettle(db, username, viewer, session) {
  normalizeBlackjackSession(session);
  const nextIndex = session.hands.findIndex((hand, i) => i > session.activeHand && !hand.stood && !hand.busted);
  if (nextIndex >= 0) {
    session.activeHand = nextIndex;
    return blackjackStatus(username, session);
  }
  return settleDealerBlackjack(db, username, viewer, session);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasAbiPrefix(message) {
  const raw = String(message || "").trim().toLowerCase();
  const prefix = String(config.prefix || "!abi").trim().toLowerCase();
  return raw === prefix || raw.startsWith(`${prefix} `);
}

function getCommandText(message) {
  let text = String(message || "").trim();
  if (!text || !hasAbiPrefix(text)) return "";

  const prefix = String(config.prefix || "!abi");
  text = text.slice(prefix.length).trim();

  for (const alias of config.botAliases || []) {
    const mention = new RegExp(`^@?${escapeRegExp(alias)}\b[:,]?\s*`, "i");
    text = text.replace(mention, "").trim();
  }

  return text;
}

function firstCommandWord(text) {
  return String(text || "").trim().split(/\s+/)[0]?.toLowerCase() || "";
}

function isKoenCommand(command) {
  return [
    "balance", "bal", "koen", "spin", "bet", "blackjack", "bj",
    "hit", "stand", "stay", "double", "split", "duck", "road",
    "roulette", "roul", "rob", "level", "perks", "colors", "color",
    "title", "titles", "commands", "help"
  ].includes(command);
}

export function isKoenColorCommand(message) {
  const text = getCommandText(message);
  const [rawCommand = "", rawColor = ""] = text.split(/\s+/);
  return rawCommand.toLowerCase() === "color" && HAT_COLORS.has(normalizeColor(rawColor));
}

export function markViewerActive(username) {
  const name = normalizeName(username);
  if (!name) return;
  const db = loadDB();
  getUser(db, name);
  saveDB(db);
}

export function addKoen(username, amount) {
  const db = loadDB();
  const viewer = getUser(db, username);
  const reward = Math.max(0, Math.floor(Number(amount) || 0));
  viewer.koen += reward;
  viewer.eventClaims = Number(viewer.eventClaims || 0) + 1;
  viewer.eventKoen = Number(viewer.eventKoen || 0) + reward;
  awardXp(viewer, Math.floor(reward / 10));
  saveDB(db);
  return viewer.koen;
}

export async function processJackpot(client, channel) {
  const db = loadDB();
  const jp = db.jackpot;
  if (!jp.active || Date.now() < Number(jp.expiresAt || 0)) return false;

  const entries = [...new Set(jp.entries || [])];
  const pool = Number(jp.pool || 0);

  if (!entries.length) {
    jp.active = false;
    jp.entries = [];
    saveDB(db);
    await client.say(channel, `💰 Jackpot closed with no entries. Pool rolls over: ${format(pool)} Koen.`);
    return true;
  }

  const winnerName = entries[Math.floor(Math.random() * entries.length)];
  const winner = getUser(db, winnerName);
  winner.koen += pool;
  winner.jackpotsWon = Number(winner.jackpotsWon || 0) + 1;
  awardXp(winner, Math.floor(pool / 5));

  db.jackpot = defaultJackpot();
  saveDB(db);
  await client.say(channel, `🎰 @${winnerName} won the Koen jackpot for ${format(pool)} Koen. Absolute loot goblin behavior.`);
  return true;
}

export async function handleKoenCommand({ client, channel, tags, message, say, userState }) {
  const username = normalizeName(tags?.username);
  if (!username) return false;

  const rawMessage = String(message || "").trim();

  const db = loadDB();
  const viewer = getUser(db, username);
  let response = "";

  if (/^!join$/i.test(rawMessage)) {
    if (!db.jackpot.active) response = "no Koen jackpot is live right now.";
    else if (Date.now() > Number(db.jackpot.expiresAt || 0)) response = "that jackpot entry window already closed.";
    else if (db.jackpot.entries.includes(username)) response = "you are already in the jackpot, greedy gremlin.";
    else {
      db.jackpot.entries.push(username);
      response = `@${username} joined the ${format(db.jackpot.pool)} Koen jackpot.`;
    }
    saveDB(db);
    await say(client, channel, tags, message, response, userState);
    return true;
  }

  if (!hasAbiPrefix(rawMessage)) return false;

  const text = getCommandText(message);
  if (!text) return false;

  const [rawCommand = "", ...args] = text.split(/\s+/);
  let command = rawCommand.toLowerCase();
  const normalizedCommand = normalizeColor(command);

  if (command === "koen") {
    const sub = String(args[0] || "").toLowerCase();
    if (["commands", "help"].includes(sub)) command = "commands";
    else if (["leaderboard"].includes(sub)) command = "koen_leaderboard";
    else if (["balance", "bal", ""].includes(sub)) command = "balance";
    else command = "commands";
  }

  if (command === "leaderboard" || command === "top") return false;
  if (command !== "koen_leaderboard" && !isKoenCommand(command)) return false;

  if (["balance", "bal"].includes(command)) {
    response = `${titleTag(viewer)}you have ${format(viewer.koen)} Koen | level ${viewer.level} | XP ${format(viewer.xp)}${viewer.title ? " | title equipped" : ""}.`;
  }

  if (command === "level") {
    const nextXp = xpForLevel(Number(viewer.level || 1) + 1);
    response = `level ${viewer.level} | XP ${format(viewer.xp)}/${format(nextXp)} | perks: ${getLevelPerks(viewer.level)}.`;
  }

  if (command === "perks") {
    response = `Koen perks: L5 better rob odds, L10 cheaper hat colors, L15 slightly better bets, L20 VIP flex. You are L${viewer.level}: ${getLevelPerks(viewer.level)}.`;
  }

  if (command === "commands" || (command === "help" && String(args[0] || "").toLowerCase() === "koen")) {
    response = `Koen commands: !abi balance, bet <amount>, spin <amount>, roulette red <amount|all|50%>, roulette number 17 <amount|all|50%>, blackjack <amount|all|50%>, hit, stand, double, split, duck <amount|all|50%>, duck step, duck cashout, rob @user, koen leaderboard, level, perks, colors, color <color>, title list, title buy <name>, title custom <your title>, title clear. Roulette supports red/black/green, even/odd, low/high, dozen1-3, column1-3, and number 0-36. Hat colors cost ${format(HAT_COLOR_COST)} Koen and only work with !abi color <color>. Preset titles cost ${format(TITLE_COST)}, custom titles cost ${format(CUSTOM_TITLE_COST)}. Use !abi koen leaderboard for the leaderboard. Type !join when jackpot opens.`;
  }

  if (["title", "titles"].includes(command)) {
    const action = String(args[0] || "").toLowerCase();

    if (!action || ["help", "commands"].includes(action)) {
      response = `Title shop: !abi title list | !abi title buy <preset> (${format(TITLE_COST)} Koen) | !abi title custom <text> (${format(CUSTOM_TITLE_COST)} Koen) | !abi title clear. Current: ${viewer.title || "none"}.`;
    } else if (["list", "shop"].includes(action)) {
      response = `Preset titles (${format(TITLE_COST)} Koen): ${TITLE_SHOP.join(", ")}. Or make your own with !abi title custom <text> for ${format(CUSTOM_TITLE_COST)} Koen.`;
    } else if (["clear", "remove", "none"].includes(action)) {
      viewer.title = "";
      response = `@${username} cleared their title.`;
    } else if (["buy", "equip", "set"].includes(action)) {
      const requested = args.slice(1).join(" ");
      const preset = TITLE_ALIASES.get(normalizeTitleKey(requested));

      if (!requested) response = `usage: !abi title buy Loot Goblin — use !abi title list to see presets.`;
      else if (!preset) response = `unknown preset title. Use !abi title list, or buy a custom one with !abi title custom ${requested}.`;
      else {
        const alreadyOwned = viewer.titlesOwned.includes(preset);
        if (!alreadyOwned && viewer.koen < TITLE_COST) response = `you need ${format(TITLE_COST)} Koen to buy [${preset}]. Balance: ${format(viewer.koen)}.`;
        else {
          if (!alreadyOwned) {
            viewer.koen -= TITLE_COST;
            viewer.titlesOwned.push(preset);
            awardXp(viewer, 1500);
          }
          viewer.title = preset;
          response = `@${username} ${alreadyOwned ? "equipped" : "bought and equipped"} the [${preset}] title. Balance: ${format(viewer.koen)}.`;
        }
      }
    } else if (["custom", "make", "create"].includes(action)) {
      const requested = args.slice(1).join(" ");
      const result = sanitizeTitle(requested);

      if (!requested) response = `usage: !abi title custom Big Bag Energy — costs ${format(CUSTOM_TITLE_COST)} Koen.`;
      else if (!result.ok) response = result.reason;
      else if (viewer.koen < CUSTOM_TITLE_COST) response = `you need ${format(CUSTOM_TITLE_COST)} Koen for a custom title. Balance: ${format(viewer.koen)}.`;
      else {
        viewer.koen -= CUSTOM_TITLE_COST;
        viewer.title = result.title;
        if (!viewer.titlesOwned.includes(result.title)) viewer.titlesOwned.push(result.title);
        viewer.customTitlesBought = Number(viewer.customTitlesBought || 0) + 1;
        awardXp(viewer, 3000);
        response = `@${username} created and equipped the custom [${result.title}] title. Balance: ${format(viewer.koen)}.`;
      }
    } else {
      response = `unknown title action. Try !abi title list, !abi title buy <preset>, !abi title custom <text>, or !abi title clear.`;
    }
  }

  if (command === "colors") {
    response = `hat colors: ${[...HAT_COLORS].join(", ")}`;
  }

  if (command === "color") {
    const requestedColor = normalizeColor(args[0]);
    const cost = hatCostFor(viewer);

    if (!requestedColor) response = `usage: !abi color red — costs ${format(cost)} Koen.`;
    else if (!HAT_COLORS.has(requestedColor)) response = `unknown hat color: ${requestedColor}. Use !abi colors to see the list.`;
    else if (viewer.koen < cost) response = `you need ${format(cost)} Koen to change the hat to ${requestedColor}. Balance: ${format(viewer.koen)}.`;
    else {
      viewer.koen -= cost;
      viewer.hatChanges = Number(viewer.hatChanges || 0) + 1;
      awardXp(viewer, 1000);
      saveDB(db);
      await client.say(channel, `!${requestedColor}`);
      await say(client, channel, tags, message, `@${username} spent ${format(cost)} Koen. Hat color changed to ${requestedColor}. Balance: ${format(viewer.koen)}.`, userState);
      return true;
    }
  }


  clearExpiredBlackjackSessions(db);
  clearExpiredDuckSessions(db);

  if (["duck", "road"].includes(command)) {
    const sub = String(args[0] || "").toLowerCase();
    const active = db.duck[username];

    if (["step", "cross", "walk", "waddle"].includes(sub)) {
      if (!active) response = `no active duck road run. Start one with !abi duck <amount>.`;
      else if (Number(active.steps || 0) >= DUCK_MAX_STEPS) response = duckStatus(username, active);
      else {
        const nextStep = Number(active.steps || 0) + 1;
        if (Math.random() < duckSurvivalChance(nextStep)) {
          active.steps = nextStep;
          if (active.steps >= DUCK_MAX_STEPS) response = `@${username} 🦆 MADE IT ACROSS THE ROAD. Type !abi duck cashout to claim ${format(Math.floor(active.bet * duckMultiplier(active.steps)))} Koen.`;
          else response = duckStatus(username, active);
        } else {
          const lost = Number(active.bet || 0);
          delete db.duck[username];
          contributeToJackpot(db, lost);
          awardXp(viewer, Math.floor(lost / 25));
          response = `@${username} 🦆 got flattened on step ${nextStep}. Lost ${format(lost)} Koen. The road remains undefeated.`;
          await maybeStartJackpot(db, client, channel);
        }
      }
    } else if (["cashout", "cash", "collect", "stop"].includes(sub)) {
      if (!active) response = `no active duck road run. Start one with !abi duck <amount>.`;
      else {
        const payout = Math.floor(Number(active.bet || 0) * duckMultiplier(active.steps));
        viewer.koen += payout;
        awardXp(viewer, Math.floor(payout / 20));
        delete db.duck[username];
        response = `@${username} cashed out the duck run after ${format(active.steps)} steps for ${format(payout)} Koen. Balance: ${format(viewer.koen)}.`;
      }
    } else {
      if (active) response = duckStatus(username, active);
      else {
        const cooldown = gambleCooldownText(viewer);
        const amount = resolveWager(viewer, args[0], 100);
        if (cooldown) response = cooldown;
        else if (amount <= 0) response = "you need Koen to send the duck across the road.";
        else if (viewer.koen < amount) response = `you only have ${format(viewer.koen)} Koen.`;
        else {
          viewer.koen -= amount;
          viewer.bets = Number(viewer.bets || 0) + 1;
          viewer.duckRuns = Number(viewer.duckRuns || 0) + 1;
          viewer.lastGambleAt = Date.now();
          awardXp(viewer, Math.floor(amount / 20));
          db.duck[username] = { bet: amount, steps: 0, startedAt: Date.now() };
          response = `@${username} started a duck road run for ${format(amount)} Koen. ${duckStatus(username, db.duck[username]).replace(/^@[^ ]+ /, "")}`;
        }
      }
    }
  }


  if (["roulette", "roul"].includes(command)) {
    const cooldown = gambleCooldownText(viewer);
    const bet = normalizeRouletteBet(args);
    const amount = bet.ok ? resolveWager(viewer, bet.amountToken, 100) : 0;

    if (cooldown) response = cooldown;
    else if (!bet.ok) response = bet.reason;
    else if (amount <= 0) response = "you need Koen to play roulette.";
    else if (viewer.koen < amount) response = `you only have ${format(viewer.koen)} Koen.`;
    else {
      viewer.koen -= amount;
      viewer.bets = Number(viewer.bets || 0) + 1;
      viewer.rouletteSpins = Number(viewer.rouletteSpins || 0) + 1;
      viewer.lastGambleAt = Date.now();
      awardXp(viewer, Math.floor(amount / 20));

      const roll = spinRouletteWheel();
      const result = rouletteResult(bet, roll);
      const rollText = `${roll.number} ${roll.color}`;

      if (result.won) {
        const payout = amount * result.multiplier;
        viewer.koen += payout;
        awardXp(viewer, Math.floor(payout / 50));
        response = `@${username} roulette hit ${rollText}. ${rouletteBetLabel(bet)} won ${format(payout)} Koen (${result.multiplier}x). Balance: ${format(viewer.koen)}.`;
      } else {
        contributeToJackpot(db, amount);
        response = `@${username} roulette hit ${rollText}. ${rouletteBetLabel(bet)} lost ${format(amount)} Koen. Balance: ${format(viewer.koen)}.`;
      }
      await maybeStartJackpot(db, client, channel);
    }
  }

  if (["blackjack", "bj"].includes(command)) {
    const active = db.blackjack[username];
    if (active) {
      response = blackjackStatus(username, active);
    } else {
      const cooldown = gambleCooldownText(viewer);
      const amount = resolveWager(viewer, args[0], 100);
      if (cooldown) response = cooldown;
      else if (amount <= 0) response = "you need Koen to play blackjack.";
      else if (viewer.koen < amount) response = `you only have ${format(viewer.koen)} Koen.`;
      else {
        const deck = newBlackjackDeck();
        const initialHand = [drawCard(deck), drawCard(deck)];
        const session = {
          bet: amount,
          deck,
          hands: [{ cards: initialHand, bet: amount, doubled: false, stood: false, busted: false, isSplit: false }],
          activeHand: 0,
          playerHand: initialHand,
          dealerHand: [drawCard(deck), drawCard(deck)],
          startedAt: Date.now(),
          doubled: false
        };
        viewer.koen -= amount;
        viewer.bets = Number(viewer.bets || 0) + 1;
        viewer.blackjackHands = Number(viewer.blackjackHands || 0) + 1;
        viewer.lastGambleAt = Date.now();
        awardXp(viewer, Math.floor(amount / 20));

        if (isBlackjack(session.hands[0].cards) && isBlackjack(session.dealerHand)) {
          response = finishBlackjackRound(db, username, viewer, session, "push", "both you and the dealer hit blackjack.");
        } else if (isBlackjack(session.hands[0].cards)) {
          response = finishBlackjackRound(db, username, viewer, session, "blackjack", "natural blackjack.");
        } else if (isBlackjack(session.dealerHand)) {
          response = finishBlackjackRound(db, username, viewer, session, "loss", "dealer had blackjack.");
        } else {
          db.blackjack[username] = session;
          response = blackjackStatus(username, session);
        }
        await maybeStartJackpot(db, client, channel);
      }
    }
  }

  if (["hit", "stand", "stay", "double", "split"].includes(command)) {
    const session = db.blackjack[username];
    if (!session) {
      response = `no active blackjack hand. Start one with !abi blackjack <amount>.`;
    } else {
      normalizeBlackjackSession(session);
      const hand = currentBlackjackHand(session);

      if (command === "hit") {
        hand.cards.push(drawCard(session.deck));
        const total = handValue(hand.cards);
        if (total > 21) {
          hand.busted = true;
          response = advanceBlackjackHandOrSettle(db, username, viewer, session);
          await maybeStartJackpot(db, client, channel);
        } else if (total === 21) {
          hand.stood = true;
          response = advanceBlackjackHandOrSettle(db, username, viewer, session);
          await maybeStartJackpot(db, client, channel);
        } else {
          response = blackjackStatus(username, session);
        }
      } else if (["stand", "stay"].includes(command)) {
        hand.stood = true;
        response = advanceBlackjackHandOrSettle(db, username, viewer, session);
        await maybeStartJackpot(db, client, channel);
      } else if (command === "double") {
        if (hand.doubled) response = "you already doubled this hand.";
        else if ((hand.cards || []).length !== 2) response = "you can only double before taking another card.";
        else if (viewer.koen < Number(hand.bet || 0)) response = `you need another ${format(hand.bet)} Koen to double. Balance: ${format(viewer.koen)}.`;
        else {
          viewer.koen -= Number(hand.bet || 0);
          hand.bet = Number(hand.bet || 0) * 2;
          hand.doubled = true;
          hand.cards.push(drawCard(session.deck));
          if (handValue(hand.cards) > 21) hand.busted = true;
          else hand.stood = true;
          response = advanceBlackjackHandOrSettle(db, username, viewer, session);
          await maybeStartJackpot(db, client, channel);
        }
      } else if (command === "split") {
        if (!canSplitBlackjackHand(session, hand)) response = `you can only split when your current hand has two matching-value cards, max ${BLACKJACK_MAX_SPLIT_HANDS} hands.`;
        else if (viewer.koen < Number(hand.bet || 0)) response = `you need another ${format(hand.bet)} Koen to split. Balance: ${format(viewer.koen)}.`;
        else {
          viewer.koen -= Number(hand.bet || 0);
          const secondCard = hand.cards.pop();
          hand.cards.push(drawCard(session.deck));
          hand.isSplit = true;
          hand.doubled = false;
          hand.stood = false;
          hand.busted = false;
          const newHand = {
            cards: [secondCard, drawCard(session.deck)],
            bet: Number(hand.bet || 0),
            doubled: false,
            stood: false,
            busted: false,
            isSplit: true
          };
          session.hands.splice(session.activeHand + 1, 0, newHand);
          viewer.bets = Number(viewer.bets || 0) + 1;
          awardXp(viewer, Math.floor(Number(hand.bet || 0) / 20));
          response = `@${username} split the hand for another ${format(hand.bet)} Koen. ${blackjackStatus(username, session).replace(/^@[^ ]+ /, "")}`;
        }
      }
    }
  }

  if (command === "spin") {
    const cooldown = gambleCooldownText(viewer);
    const amount = resolveWager(viewer, args[0], 50);
    if (cooldown) response = cooldown;
    else if (amount <= 0) response = "you need Koen to spin.";
    else if (viewer.koen < amount) response = `you only have ${format(viewer.koen)} Koen.`;
    else {
      viewer.koen -= amount;
      viewer.spins = Number(viewer.spins || 0) + 1;
      viewer.lastGambleAt = Date.now();
      awardXp(viewer, Math.floor(amount / 20));
      const roll = Math.random();
      if (roll < 0.50) {
        contributeToJackpot(db, amount);
        response = `spun ${format(amount)} Koen and lost. Balance: ${format(viewer.koen)}.`;
      } else if (roll < 0.92) {
        const payout = amount * 2;
        viewer.koen += payout;
        response = `spun ${format(amount)} Koen and won ${format(payout)}! Balance: ${format(viewer.koen)}.`;
      } else {
        const payout = amount * 5;
        viewer.koen += payout;
        response = `JACKPOT spin! Spun ${format(amount)} and won ${format(payout)} Koen. Balance: ${format(viewer.koen)}.`;
      }
      await maybeStartJackpot(db, client, channel);
    }
  }

  if (command === "bet") {
    const cooldown = gambleCooldownText(viewer);
    const amount = resolveWager(viewer, args[0], 50);
    const winChance = Number(viewer.level || 1) >= 15 ? 0.50 : 0.48;
    if (cooldown) response = cooldown;
    else if (amount <= 0) response = "you need Koen to bet.";
    else if (viewer.koen < amount) response = `you only have ${format(viewer.koen)} Koen.`;
    else {
      viewer.koen -= amount;
      viewer.bets = Number(viewer.bets || 0) + 1;
      viewer.lastGambleAt = Date.now();
      awardXp(viewer, Math.floor(amount / 20));
      if (Math.random() < winChance) {
        const payout = amount * 2;
        viewer.koen += payout;
        response = `won the bet for ${format(payout)} Koen. Balance: ${format(viewer.koen)}.`;
      } else {
        contributeToJackpot(db, amount);
        response = `lost the bet for ${format(amount)} Koen. Balance: ${format(viewer.koen)}.`;
      }
      await maybeStartJackpot(db, client, channel);
    }
  }

  if (command === "rob") {
    const targetName = normalizeName(args[0]);
    const now = Date.now();
    const nextAllowed = Number(viewer.lastRobAt || 0) + ROB_COOLDOWN_MS;

    if (!targetName) response = "usage: !abi rob @viewer";
    else if (targetName === username) response = "you cannot rob yourself, menace.";
    else if ((config.botAliases || []).includes(targetName)) response = "you cannot rob the bot bank.";
    else if (now < nextAllowed) response = `rob cooldown: wait ${Math.ceil((nextAllowed - now) / 1000)}s.`;
    else {
      const target = getUser(db, targetName);
      viewer.lastRobAt = now;
      viewer.robs = Number(viewer.robs || 0) + 1;
      const successChance = Number(viewer.level || 1) >= 5 ? 0.43 : 0.38;
      if (target.koen <= 0) response = `@${targetName} has no Koen to steal.`;
      else if (Math.random() < successChance) {
        const stolen = Math.min(target.koen, Math.max(25, Math.floor(target.koen * 0.15)), 250);
        target.koen -= stolen;
        viewer.koen += stolen;
        target.robbed = Number(target.robbed || 0) + 1;
        awardXp(viewer, 250);
        response = `robbed ${format(stolen)} Koen from @${targetName}. Balance: ${format(viewer.koen)}.`;
      } else {
        const penalty = Math.min(viewer.koen, 75);
        viewer.koen -= penalty;
        target.koen += penalty;
        target.robDefenses = Number(target.robDefenses || 0) + 1;
        awardXp(target, 150);
        response = `got caught trying to rob @${targetName} and paid them ${format(penalty)} Koen. Your balance: ${format(viewer.koen)}.`;
      }
    }
  }

  if (command === "koen_leaderboard") {
    const top = Object.entries(db.users)
      .sort((a, b) => (b[1].koen || 0) - (a[1].koen || 0))
      .slice(0, 5)
      .map(([name, data], i) => `${i + 1}. ${data.title ? `[${data.title}] ` : ""}${name}: ${format(data.koen || 0)} Koen L${data.level || 1}`)
      .join(" | ");
    response = top ? `Koen leaderboard — ${top}` : "No Koen leaderboard yet.";
  }

  if (!response) return false;
  saveDB(db);
  await say(client, channel, tags, message, response, userState);
  return true;
}
