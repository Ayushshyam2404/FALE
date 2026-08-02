import { chatCompletion, extractJson } from './openrouter.js';
import { replySubject } from '../../utils/emailSubject.js';
import { logger } from '../logging.js';

const SYSTEM_PROMPT = `You are Falcon AI, an executive email assistant. You write professional email replies.

The email must be a complete, natural email of 3 to 6 sentences, no matter what.

Strict rules:
- Reply ONLY to the single email message provided below. Do not mention or answer topics from other emails.
- If the email asks one question, answer only that question. Do not combine answers to older or unrelated questions.
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

export async function generateDraft({ instruction, thread, senderName, originalSubject, replyQuestion }) {
  const user = [
    'Executive instruction:',
    String(instruction || 'Compose a professional, concise reply.').trim(),
    '',
    replyQuestion ? `Question to answer (ONLY this): ${replyQuestion}` : '',
    replyQuestion ? '' : null,
    'Email to reply to (answer ONLY this message — ignore any other context):',
    '------------------------------',
    String(thread || '').slice(0, 12000),
    '------------------------------',
    '',
    `Sender of the reply: ${senderName || 'Falcon AI'}`,
  ].filter((line) => line !== null).join('\n');

  const content = await chatCompletion({ system: SYSTEM_PROMPT, user, maxTokens: 1200 });
  const raw = extractJson(content);

  let subject = String(raw.subject || '').trim();
  const body = String(raw.body || '').trim();
  if (!body) {
    throw new Error('AI draft generation returned incomplete output');
  }
  if (!subject && originalSubject) {
    subject = replySubject(originalSubject);
  }
  if (!subject) {
    throw new Error('AI draft generation returned incomplete output');
  }

  logger.info('ai.draft_generated', 'Draft generated', { subject });
  return { subject, body };
}
