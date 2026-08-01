import { WHATSAPP_COMMANDS } from '../../config/constants.js';

/**
 * Parses a WhatsApp message into a command.
 * - "/send <message>"    -> auto-generate a draft from the message and send it
 * - "SEND"               -> send the pending draft
 * - "EDIT <text>"        -> regenerate the draft with new instructions
 * - "CANCEL"             -> discard the pending draft
 * - anything else        -> treated as instructions for drafting a reply
 */
export function parseWhatsAppCommand(text) {
  const trimmed = String(text || '').trim();
  const upper = trimmed.toUpperCase();

  if (upper === WHATSAPP_COMMANDS.SEND) {
    return { type: WHATSAPP_COMMANDS.SEND };
  }

  if (upper === WHATSAPP_COMMANDS.CANCEL) {
    return { type: WHATSAPP_COMMANDS.CANCEL };
  }

  if (upper.startsWith(WHATSAPP_COMMANDS.EDIT)) {
    const instruction = trimmed.slice(WHATSAPP_COMMANDS.EDIT.length).trim();
    return { type: WHATSAPP_COMMANDS.EDIT, instruction };
  }

  const sendMatch = upper.match(/^\/SEND\b/);
  if (sendMatch) {
    const instruction = trimmed.slice(sendMatch[0].length).trim();
    return { type: WHATSAPP_COMMANDS.SEND, instruction };
  }

  return { type: 'INSTRUCTION', instruction: trimmed };
}
