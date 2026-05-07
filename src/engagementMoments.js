import { config } from "./config.js";
import { pick } from "./utils.js";

const HYPE_LINES = {
  kill: [
    "NAHHH YOU FRYING 😤",
    "that man got absolutely deleted 💀",
    "mrnutt3r certified beam moment"
  ],
  wipe: [
    "whole squad evaporated 😭",
    "SOMEONE CLIP THAT RIGHT NOW",
    "that was a federal offense"
  ],
  clutch: [
    "plot armor ACTIVATED 😤",
    "he was NOT supposed to win that",
    "nah that's a lobby-breaking clutch"
  ],
  extract: [
    "we got out with the groceries 😤",
    "clean extract, no donation today",
    "bags secured, rent paid"
  ],
  won: [
    "DUB SECURED 😤",
    "send them back to lobby class",
    "that fight got graded and they failed"
  ],
  died: [
    "yeah... that one was tragic 😭",
    "gear donation completed",
    "we're calling that tactical philanthropy"
  ]
};

export function maybeHypeCallout(trigger) {
  if (!config.hypeCalloutsEnabled) return null;
  if (Math.random() > config.hypeCalloutChance) return null;
  const list = HYPE_LINES[trigger];
  if (!list?.length) return null;
  return pick(list);
}
