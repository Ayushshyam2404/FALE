export function replySubject(originalSubject) {
  const subject = String(originalSubject || '').trim() || '(no subject)';
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}
