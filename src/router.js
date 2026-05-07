import { parseSimpleCommand } from "./parsing.js";
import { detectIntent, shouldNaturalReply, buildIntentCommand, autofillContextFromMessage } from "./intelligence.js";
import { isMentioned } from "./reply.js";

export function routeIncoming({ prefix, message, user, username }) {
  let parsed = parseSimpleCommand(prefix, message);
  autofillContextFromMessage(username, message);

  if (parsed) return { type: "command", parsed };

  const mentioned = isMentioned(message);
  const followUp = Date.now() <= (user?.thread?.expiresAt || 0);
  const intent = detectIntent(message);
  if (!shouldNaturalReply({ message, user })) {
    return { type: "ignore", parsed: null, intent };
  }

  const natural = buildIntentCommand(message);
  if (natural) return { type: "intent", parsed: natural, intent, mentioned, followUp };
  return { type: "conversation", parsed: null, intent, mentioned, followUp };
}
