import { IGNORED_CATEGORIES } from '../../config/constants.js';

const PROMO_SUBJECT_RE =
  /(newsletter|unsubscribe|offer|discount|sale|promo code|voucher|deal of the day|coupon)/i;

const NO_REPLY_SENDER_RE = /^(no[- ]?reply|donotreply|do[- ]not[- ]reply)@/i;

const PROMO_SENDER_RE =
  /@(mailchimp|mailerlite|sendinblue|brevo|klaviyo|hubspot|salesforce|constantcontact|campaignmonitor|mailjet|email-?blast|amazon-?ses)/i;

/**
 * Deterministic spam / newsletter / promotional heuristics.
 * The AI category check runs first; this is a defensive second pass.
 */
export function shouldIgnore(parsed, category) {
  if (IGNORED_CATEGORIES.includes(category)) {
    return { ignore: true, reason: `AI category: ${category}` };
  }

  const headers = parsed.headers || {};
  const subject = parsed.subject || '';
  const from = parsed.from?.address || '';

  if (headers.autoSubmitted && headers.autoSubmitted.toLowerCase().includes('auto-replied')) {
    return { ignore: true, reason: 'Auto-reply / auto-submitted header' };
  }
  if (headers.listId) {
    return { ignore: true, reason: 'Mailing list header present' };
  }
  if (headers.unsubscribe) {
    return { ignore: true, reason: 'Unsubscribe header present' };
  }
  if (NO_REPLY_SENDER_RE.test(from)) {
    return { ignore: true, reason: 'No-reply sender address' };
  }
  if (PROMO_SENDER_RE.test(from)) {
    return { ignore: true, reason: 'Promotional sender domain' };
  }
  if (PROMO_SUBJECT_RE.test(subject)) {
    return { ignore: true, reason: 'Promotional subject keywords' };
  }

  return { ignore: false };
}
