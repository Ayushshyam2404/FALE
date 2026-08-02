import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/services/ai/openrouter.js';
import { parseWhatsAppCommand, buildDraftInstruction } from '../src/services/whatsapp/commands.js';
import { inferQuotedType } from '../src/services/whatsapp/threadLink.js';
import { replySubject } from '../src/utils/emailSubject.js';
import { WHATSAPP_COMMANDS } from '../src/config/constants.js';

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    const result = extractJson('{"subject":"Hi","body":"Hello"}');
    assert.equal(result.subject, 'Hi');
    assert.equal(result.body, 'Hello');
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = extractJson('```json\n{"category":"Work"}\n```');
    assert.equal(result.category, 'Work');
  });

  it('parses JSON with trailing commas', () => {
    const result = extractJson('{"subject":"Hi","body":"Hello",}');
    assert.equal(result.body, 'Hello');
  });

  it('throws when no JSON object is present', () => {
    assert.throws(() => extractJson('no json here'), /No JSON object found/);
  });
});

describe('parseWhatsAppCommand', () => {
  it('recognizes SEND', () => {
    assert.deepEqual(parseWhatsAppCommand('SEND'), { type: WHATSAPP_COMMANDS.SEND });
  });

  it('recognizes /send with instruction', () => {
    const cmd = parseWhatsAppCommand('/send I am available at 5pm');
    assert.equal(cmd.type, WHATSAPP_COMMANDS.SEND);
    assert.equal(cmd.instruction, 'I am available at 5pm');
  });

  it('treats free text as drafting instruction without quote context', () => {
    const cmd = parseWhatsAppCommand('Please decline politely');
    assert.equal(cmd.type, 'INSTRUCTION');
    assert.equal(cmd.instruction, 'Please decline politely');
  });

  it('auto-sends when swipe-replying to a notification', () => {
    const quoted =
      'New Email: Re: IMPORTANT MEETING ROOM REQUEST\n\nFrom: Ayush <ayush@test.com>';
    const cmd = parseWhatsAppCommand('Yes, we can accommodate 50 people', {
      quotedText: quoted,
    });
    assert.equal(cmd.type, WHATSAPP_COMMANDS.SEND);
    assert.equal(cmd.instruction, 'Yes, we can accommodate 50 people');
  });

  it('infers notification type from quoted text', () => {
    assert.equal(
      inferQuotedType('New Email: Meeting request\n\nFrom: someone@test.com'),
      'notification',
    );
  });

  it('edits draft when swipe-replying to a draft', () => {
    const cmd = parseWhatsAppCommand('Make it shorter', { quotedType: 'draft' });
    assert.equal(cmd.type, WHATSAPP_COMMANDS.EDIT);
    assert.equal(cmd.instruction, 'Make it shorter');
  });

  it('recognizes STATUS command', () => {
    assert.deepEqual(parseWhatsAppCommand('STATUS'), { type: WHATSAPP_COMMANDS.STATUS });
  });
});

describe('buildDraftInstruction', () => {
  it('prefers user instruction when provided', () => {
    assert.equal(buildDraftInstruction({ replyQuestion: 'Q?' }, 'My answer'), 'My answer');
  });

  it('uses reply question when no user instruction', () => {
    const result = buildDraftInstruction({
      replyQuestion: 'How many people?',
      suggestedAction: 'Give capacity',
    });
    assert.match(result, /How many people/);
  });
});

describe('replySubject', () => {
  it('adds Re: when missing', () => {
    assert.equal(replySubject('Meeting tomorrow'), 'Re: Meeting tomorrow');
  });

  it('does not duplicate Re:', () => {
    assert.equal(replySubject('Re: Meeting tomorrow'), 'Re: Meeting tomorrow');
  });
});
