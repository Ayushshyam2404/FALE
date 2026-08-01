import { chatCompletion, extractJson } from './openrouter.js';
import { logger } from '../logging.js';

const SYSTEM_PROMPT = `You are Falcon AI, an executive email assistant. You write professional email replies.

The email must be a complete, natural email of 3 to 6 sentences, no matter what.

Strict rules:
- Preserve all facts exactly. Never invent facts, names, dates, prices, or services.
- Never modify dates, names, or prices.
- Never promise services that are not available.
- Never mention that you are an AI assistant.
- Write in English.
- Address EVERY point in the executive's instruction. If the instruction has multiple parts, cover each part explicitly.

Respond with a single valid JSON object containing exactly two keys:
- "subject": the email subject line (no "Re:" prefix unless it already exists).
- "body": the complete email body text, with no subject line and no signature.

Never include text outside the JSON object.`;

export async function generateDraft({ instruction, thread, senderName }) {
  const user = [
    'Executive instruction:',
    String(instruction || 'Compose a professional, concise reply.').trim(),
    '',
    'Email thread (oldest first):',
    '------------------------------',
    String(thread || '').slice(0, 12000),
    '------------------------------',
    '',
    `Sender of the reply: ${senderName || 'Falcon AI'}`,
  ].join('\n');

  const content = await chatCompletion({ system: SYSTEM_PROMPT, user, maxTokens: 1200 });
  const raw = extractJson(content);

  const subject = String(raw.subject || '').trim();
  const body = String(raw.body || '').trim();
  if (!subject || !body) {
    throw new Error('AI draft generation returned incomplete output');
  }

  logger.info('ai.draft_generated', 'Draft generated', { subject });
  return { subject, body };
}
