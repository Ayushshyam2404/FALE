import { chatCompletion, extractJson } from './openrouter.js';
import { CATEGORIES, PRIORITIES, ACTIONS } from '../../config/constants.js';
import { logger } from '../logging.js';

const SYSTEM_PROMPT = `You are Falcon AI, an executive email assistant. You analyze incoming emails and return a classification.

Respond with a single valid JSON object and nothing else. The object must contain exactly these keys:
- "category": one of: ${CATEGORIES.join(', ')}
- "priority": one of: ${PRIORITIES.join(', ')}. Use "Critical" for legal matters, invoices due, urgent customers, deadlines, security alerts, or meetings starting soon.
- "action": one of: ${ACTIONS.join(', ')}. Use "Ignore" for spam, newsletters, and promotions.
- "importance": true or false. true if this email should be escalated to the executive on WhatsApp immediately.
- "summary": who sent it, why they emailed, what they need, important dates, money mentioned, deadlines, and a suggested next action. Maximum 120 words.
- "suggested_action": one short sentence with the suggested next action.

Never include text outside the JSON object.`;

export async function classifyEmail(parsed) {
  const user = [
    `Subject: ${parsed.subject || ''}`,
    `From: ${parsed.from?.name || ''} <${parsed.from?.address || ''}>`,
    `To: ${(parsed.recipients || []).filter((r) => r.type === 'to').map((r) => r.address).join(', ')}`,
    `Date: ${parsed.date || ''}`,
    '',
    'Body:',
    `${(parsed.bodyText || '').slice(0, 6000)}`,
  ].join('\n');

  const content = await chatCompletion({ system: SYSTEM_PROMPT, user, maxTokens: 700 });
  const raw = extractJson(content);

  const category = CATEGORIES.includes(raw.category) ? raw.category : 'Other';
  const priority = PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium';
  const action = ACTIONS.includes(raw.action) ? raw.action : 'Informational';

  const result = {
    category,
    priority,
    action,
    importance: Boolean(raw.importance),
    summary: String(raw.summary || '').trim(),
    suggestedAction: String(raw.suggested_action || raw.suggestedAction || '').trim(),
  };

  logger.info('ai.classified', `Classified email as ${category}/${priority}/${action}`, result);
  return result;
}
