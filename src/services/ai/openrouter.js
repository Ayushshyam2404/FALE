import env from '../../config/env.js';
import { logger } from '../logging.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(err) {
  return /(empty content|ECONN|aborted|timeout|fetch failed)/i.test(err.message);
}

async function request(payload, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  let res;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENROUTER.API_KEY}`,
        'HTTP-Referer': env.OPENROUTER.SITE_URL,
        'X-Title': env.OPENROUTER.APP_NAME,
      },
      body: JSON.stringify({ model: env.OPENROUTER.MODEL, ...payload }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (attempt < MAX_ATTEMPTS - 1 && isRetryable(err)) {
      await sleep(1500 * 2 ** attempt);
      return request(payload, attempt + 1);
    }
    throw err;
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`OpenRouter request failed (${res.status}): ${errText.slice(0, 500)}`);
    if (res.status >= 429 || res.status >= 500) {
      if (attempt < MAX_ATTEMPTS - 1) {
        logger.warn('openrouter.retry', `Status ${res.status}, retrying`, { attempt });
        await sleep(2000 * 2 ** attempt);
        return request(payload, attempt + 1);
      }
    }
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) {
    const err = new Error('OpenRouter returned empty content');
    if (attempt < MAX_ATTEMPTS - 1) {
      logger.warn('openrouter.retry', 'Empty content, retrying', { attempt });
      await sleep(1500 * 2 ** attempt);
      return request(payload, attempt + 1);
    }
    throw err;
  }
  return content;
}

export async function chatCompletion({ system, user, temperature = 0.2, maxTokens = 1200 }) {
  const content = await request({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  });
  return content;
}

export function extractJson(text) {
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('No JSON object found in AI response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
