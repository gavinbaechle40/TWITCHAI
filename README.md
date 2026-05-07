# mrnutt3r ABI Bot

A Twitch bot for Arena Breakout Infinite that:
- answers gun/ammo/armor questions from a local spreadsheet
- falls back to the live ABI Fandom wiki for broader game info
- uses OpenAI for concise funny replies and small talk
- supports mention replies like `@mrnutt3r`
- remembers short conversational context
- tracks stream stats and viewer stats
- runs random viewer events
- supports mod-only admin controls

## Install

```bash
npm install
```

## Configure

Copy `.env.example` to `.env` and fill in:

- `TWITCH_USERNAME`
- `TWITCH_OAUTH`
- `TWITCH_CHANNEL`
- `OPENAI_API_KEY` if you want AI replies
- leave `BOT_NAME=mrnutt3r` unless you want a different identity

## Run

```bash
npm start
```

## Main commands

### Game info
- `!abi compare akm vs m4a1`
- `!abi value m995`
- `!abi shouldipush mp5 ap vs t5`
- `!abi ratekit akm ps t3`
- `!abi loadout budget`
- `!abi meta`
- `!abi worth gpu vs gold watch`

### Context
- `!abi setmap tv station`
- `!abi setkit mp5 ap t4`
- `!abi context`
- `!abi memory`

### Viewer / stream tracking
- `!abi setkitvalue 75000`
- `!abi setextractvalue 120000`
- `!abi died`
- `!abi extract`
- `!abi won`
- `!abi stats`
- `!abi mystats`
- `!abi leaderboard`

### Events
- `!abi loot`
- `!abi secure`
- `!abi evac`
- `!abi event`

### Personality / admin
- `!abi personality funny`
- `!abi toggle roast`
- `!abi toggle hype`
- `!abi resetstats`
- `!abi voteresult`
- `!abi votedown`

## Mention behavior

When someone mentions the bot:
- `@mrnutt3r how are you`
- `@mrnutt3r should i push with mp5 ap vs t5`

The bot replies tagging them back:
- `@viewername ...`

## Threading behavior

If a user asks a follow-up shortly after mentioning the bot, the bot keeps the context:
- `@mrnutt3r should i push with mp5 ap vs t5`
- `what about class 4?`
- `and on tv station?`

## Notes

- Local spreadsheet answers are fastest.
- OpenAI is only used for conversational polish and open-ended replies.
- `data/state.json` is created automatically on first run.
- backup snapshots go in `data/backups/`.


## Live wiki fallback

If the answer is not in the local spreadsheet, the bot now:
1. searches the live Arena Breakout Infinite Fandom wiki through its MediaWiki API
2. picks the best page match
3. fetches the page intro/summary
4. uses that as fallback context for the final reply

This keeps local stat lookups fast while still letting the bot answer broader ABI questions.


## Safety / Twitch-friendly behavior

The bot now has a built-in safety layer:

- blocks political and controversial real-world topics
- avoids religion, hate, sexual content, extremist content, and self-harm topics
- redirects risky questions back to Arena Breakout Infinite
- keeps the AI prompt game-focused and Twitch-friendlier

Examples:
- `@mrnutt3r what do you think about politics`
- bot reply: `@user we keeping it ABI-only in here 😤`

This happens before the AI reply step, so risky topics get filtered early.


## Real meta system

The bot now uses a real meta layer instead of just vibe-based guesses.

How meta is determined:
- local spreadsheet stats are checked first
- ammo penetration is mapped into meta bands
- weapon handling / recoil shape is used for weapon meta tiers
- armor classes feed defensive meta tiers
- fight advice compares ammo meta against enemy armor tier
- map context can slightly shift the verdict for CQB maps like TV Station and Armory

Examples:
- `!abi meta m995`
- `!abi meta akm`
- `!abi shouldipush mp5 ap vs t5`
- `!abi ratekit m4a1 m855 t4`
- `!abi compare akm vs m4a1`

Important:
- OpenAI explains the result in a concise funny way
- the actual meta decision comes from the local rule system, not from AI guessing


## Meta cache

On startup, the bot now auto-ranks every local spreadsheet item and writes:

- `data/meta_cache.json`

This makes repeated meta lookups faster and more consistent.

You can confirm it loaded with:
- `!abi metacache`

What gets cached:
- every weapon with a meta tier/style
- every ammo row with a meta tier/pen band
- every armor row with a meta tier
- every helmet row with a meta tier


## Smart gating + intelligence layer

The bot now avoids replying to every normal chat message.

How it decides to respond:
1. `!abi ...` commands always respond
2. `@mrnutt3r ...` mentions always respond
3. short follow-ups inside the thread window respond
4. normal non-command chat only responds when:
   - a high-confidence ABI intent is detected
   - the message looks like a question
   - it looks game-related
   - and it passes the natural reply chance gate

### Added intelligence features
- **Intent detection** for natural questions like `is mp5 good vs t5`
- **Response priority system**:
  1. response cache
  2. local sheet / meta logic
  3. live wiki fallback
  4. OpenAI polish
- **Confidence scoring** on routed answers
- **Context autofill** for weapon, ammo, map, and enemy tier
- **AI rate limiting + dedupe** so repeated AI questions do not pile up

### New env knobs
- `NATURAL_INTENT_CHANCE`
- `INTENT_REPLY_MIN_CONFIDENCE`
- `AI_MAX_CALLS_PER_MINUTE`
- `AI_DEDUPE_TTL_MS`
- `RESPONSE_CACHE_TTL_MS`


## Meta learning

The bot now learns from your actual stream outcomes.

How it works:
1. you ask a question like `!abi shouldipush mp5 ap vs t5`
2. the bot stores that scenario
3. later you mark the outcome with:
   - `!abi died`
   - `!abi extract`
   - `!abi won`
4. the bot records whether that scenario turned out good or bad
5. future advice for the same or very similar scenario is biased by that learned history

Example learned scenario shape:
- `mp5 ap | t5 | tv station -> bad`

Useful commands:
- `!abi learning`
- `!abi shouldipush mp5 ap vs t5`
- `!abi ratekit akm ps t4`

Notes:
- the learned signal adjusts the meta verdict, it does not fully replace the stat/meta system
- more repeated outcomes make the learning confidence stronger


## Final refinement pass

This build adds the last big refinement layer without sacrificing speed.

### Added
- fast-path replies for common meta questions
- learning decay so old outcomes fade over time
- confidence labels like `high confidence`
- `!abi why` to explain the last decision
- `!abi mode coach|funny|roast|hype|demon|chill`
- auto insight messages from learned outcomes
- smarter natural-language gating
- AI rate limiting + deduping to keep latency low

### Viewer-friendly behavior
- `!abi` commands always respond
- `@mrnutt3r` mentions always respond
- short follow-ups respond inside the thread window
- normal chat only gets a response if the bot is reasonably sure it is ABI-related and the reply gate allows it

### Low-latency design
- fast path first
- local sheet / meta cache before wiki
- wiki before OpenAI
- OpenAI only when actually useful


## Stability pass

This build adds:
- error logging to `logs/bot.log`
- startup validation for env + dataset
- `!abi status`
- `!abi export`
- command aliases:
  - `!abi sp`
  - `!abi rk`
- manual learning correction:
  - `!abi mark last good`
  - `!abi mark last bad`
  - `!abi unlearn last`
- hot-reloadable runtime config:
  - `!abi reloadconfig`

### Suggested use
- use `!abi status` before going live
- use `!abi why` after advice
- use `!abi mark last good/bad` if the regular result commands are not the right signal
- use `!abi export` after stream for a summary snapshot


## Reliability pack

Added:
- dry-run mode with `BOT_DRY_RUN=true`
- spreadsheet schema checks on startup
- `!abi version`
- hard max reply clamp
- duplicate-send protection
- admin audit log in `audit/admin.log`
- heartbeat file in `heartbeat/last_alive.json`
- smoke test:
  - `npm run test:smoke`

Recommended:
- run `npm run test:smoke` after edits
- use `!abi status` and `!abi version` before stream
- use dry-run mode for live validation without sending messages


## Viewer engagement upgrades

Added:
- hype callouts layered onto:
  - `!abi kill`
  - `!abi wipe`
  - `!abi clutch`
  - `!abi won`
  - `!abi extract`
  - `!abi died`
- funnier auto-insights from learned outcomes

New env settings:
- `HYPE_CALLOUTS_ENABLED=true`
- `FUNNY_INSIGHTS_ENABLED=true`
- `HYPE_CALLOUT_CHANCE=0.85`

This keeps the bot useful but gives it more stream personality without adding much latency.


## Chat momentum hype

The bot now watches for crowd reactions in chat using a strict whitelist and unique-user threshold.

Supported hype terms:
- slammed
- cooked
- fried
- beamed
- wiped
- rolled
- smoked
- deleted
- clip it
- clipped

Guardrails:
- unique viewers only
- short rolling time window
- cooldown between hype triggers
- whitelist only, so random spam does not trigger it

New env settings:
- `CHAT_MOMENTUM_ENABLED=true`
- `CHAT_MOMENTUM_WINDOW_MS=10000`
- `CHAT_MOMENTUM_MIN_UNIQUE_USERS=3`
- `CHAT_MOMENTUM_COOLDOWN_MS=25000`


Patch note: added working `!abi status` and `!abi version` commands.


## Koen economy commands

All Koen commands use the strict `!abi` prefix so random chat words do not trigger games.

### Balance / help
- `!abi balance`
- `!abi koen commands`
- `!abi koen leaderboard`

### Give Koen
- `!abi give @viewer 5000`
- `!abi give @viewer 50%`
- `!abi give @viewer all`
- `!abi give @viewer half`

### Gambling cooldown
All Koen gambling/robbing actions use a 1 minute cooldown by default.

Affected commands:
- `!abi bet <amount>`
- `!abi spin <amount>`
- `!abi blackjack <amount>`
- `!abi roulette <bet> <amount>`
- `!abi duck <amount>`
- `!abi rob @viewer`

### Pause / resume gambling
Mods and broadcaster can pause all Koen gambling/robbing:

- `!abi pause` toggles pause/resume
- `!abi pause on` pauses gambling
- `!abi pause off` resumes gambling

While paused, balance, give, title, and color commands still work. Active blackjack hands can still be finished.

### Hat colors
Hat color changes cost 10,000 Koen.

Use:

```txt
!abi color red
```

The bot sends the matching MixItUp command, for example:

```txt
!red
```

Plain words like `red`, `clean`, or `!abi clean` do not trigger color changes.

### Blackjack
- `!abi blackjack <amount|all|50%>`
- `!abi bj <amount|all|50%>`
- `!abi hit`
- `!abi stand`
- `!abi double`
- `!abi split`

### Roulette
- `!abi roulette red <amount|all|50%>`
- `!abi roulette black <amount|all|50%>`
- `!abi roulette green <amount|all|50%>`
- `!abi roulette even <amount|all|50%>`
- `!abi roulette odd <amount|all|50%>`
- `!abi roulette low <amount|all|50%>`
- `!abi roulette high <amount|all|50%>`
- `!abi roulette number 17 <amount|all|50%>`

### Duck road
- `!abi duck <amount|all|50%>`
- `!abi duck step`
- `!abi duck cashout`

