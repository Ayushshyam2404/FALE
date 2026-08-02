import { WHATSAPP_COMMANDS } from '../../config/constants.js';
import { inferQuotedType } from './threadLink.js';

/**
 * Parses a WhatsApp message into a command.
 *
 * Context-aware routing (quotedType from the message being replied to):
 * - notification + plain text  → /send (draft & send immediately)
 * - draft + plain text         → EDIT (revise draft, preview first)
 * - notification/draft + SEND  → send pending draft
 * - STATUS                     → list open email threads
 */
export function parseWhatsAppCommand(text, { quotedType, quotedText } = {}) {
  const trimmed = String(text || '').trim();
  const upper = trimmed.toUpperCase();
  const effectiveQuotedType = quotedType || inferQuotedType(quotedText);

  if (upper === 'STATUS' || upper === 'PENDING' || upper === 'LIST') {
    return { type: WHATSAPP_COMMANDS.STATUS };
  }

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

  // Swipe-reply to a draft → revise it (preview mode).
  if (effectiveQuotedType === 'draft' && trimmed) {
    return { type: WHATSAPP_COMMANDS.EDIT, instruction: trimmed };
  }

  if (effectiveQuotedType === 'notification' && trimmed) {
    return { type: WHATSAPP_COMMANDS.SEND, instruction: trimmed };
  }

  return { type: 'INSTRUCTION', instruction: trimmed };
}

/**
 * Builds the instruction passed to the AI draft generator.
 */
export function buildDraftInstruction(emailDoc, userInstruction) {
  const user = String(userInstruction || '').trim();
  if (user) return user;

  const question = String(emailDoc.replyQuestion || '').trim();
  const suggested = String(emailDoc.suggestedAction || '').trim();

  if (question && suggested) {
    return `Answer only this question: "${question}". Guidance: ${suggested}`;
  }
  if (question) return `Answer only this question: "${question}"`;
  if (suggested) return suggested;
  return 'Compose a professional, concise reply to this email.';
}
