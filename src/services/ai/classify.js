import { chatCompletion, extractJson } from './openrouter.js';
import { CATEGORIES, PRIORITIES, ACTIONS } from '../../config/constants.js';
import { shouldIgnore } from './filters.js';
import { logger } from '../logging.js';

const SYSTEM_PROMPT = `You are Falcon AI, an executive email assistant. You analyze incoming emails and return a classification.

Respond with a single valid JSON object and nothing else. The object must contain exactly these keys:
- "category": one of: ${CATEGORIES.join(', ')}
- "priority": one of: ${PRIORITIES.join(', ')}. Use "Critical" for legal matters, invoices due, urgent customers, deadlines, security alerts, or meetings starting soon.
- "action": one of: ${ACTIONS.join(', ')}. Use "Ignore" for spam, newsletters, and promotions.
- "importance": true or false. true if this email should be escalated to the executive on WhatsApp immediately.
- "summary": who sent it, why they emailed, what they need, important dates, money mentioned, deadlines, and a suggested next action. Maximum 120 words.
- "suggested_action": one short sentence with the suggested next action.
- "reply_question": the single main question or request in this email that needs an answer. One sentence. If there is no clear question, describe what the sender wants in one sentence.

Never include text outside the JSON object.`;

function heuristicClassification(parsed) {
  const filtered = shouldIgnore(parsed, 'Other');
  if (filtered.ignore) {
    return {
      category: 'Other',
      priority: 'Low',
      action: 'Ignore',
      importance: false,
      summary: `Filtered locally (${filtered.reason}): ${parsed.subject || '(no subject)'}`,
      suggestedAction: 'No action required.',
      replyQuestion: '',
    };
  }

  return {
    category: 'Other',
    priority: 'Medium',
    action: 'Informational',
    importance: false,
    summary: `From ${parsed.from?.address || 'unknown'}: ${parsed.subject || '(no subject)'}`,
    suggestedAction: 'Review when convenient.',
    replyQuestion: parsed.subject || '',
  };
}

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

  let raw;
  try {
    const content = await chatCompletion({ system: SYSTEM_PROMPT, user, maxTokens: 700 });
    raw = extractJson(content);
  } catch (err) {
    logger.warn('ai.classify_fallback', `AI classification failed, using heuristics: ${err.message}`, {
      messageId: parsed.messageId,
    });
    return heuristicClassification(parsed);
  }

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
    replyQuestion: String(raw.reply_question || raw.replyQuestion || '').trim(),
  };

  logger.info('ai.classified', `Classified email as ${category}/${priority}/${action}`, result);
  return result;
}
