export const QUEUE_NAMES = {
  EMAIL: 'falcon-email',
  WHATSAPP: 'falcon-whatsapp',
};

export const JOB_NAMES = {
  POLL_INBOX: 'poll-inbox',
  PROCESS_EMAIL: 'process-email',
  HANDLE_MESSAGE: 'handle-message',
};

export const CATEGORIES = [
  'Work',
  'Client',
  'Sales',
  'Hotel',
  'Finance',
  'Invoice',
  'Meeting',
  'Recruitment',
  'Support',
  'Legal',
  'Government',
  'Personal',
  'Newsletter',
  'Promotion',
  'Spam',
  'OTP',
  'Security',
  'Other',
];

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const ACTIONS = ['Needs Reply', 'Informational', 'Ignore', 'Archive'];

export const IGNORED_CATEGORIES = ['Newsletter', 'Promotion', 'Spam', 'OTP'];

export const EMAIL_STATUSES = [
  'new',
  'processed',
  'notified',
  'awaiting_approval',
  'sent',
  'ignored',
  'archived',
  'duplicate',
  'failed',
];

export const CONVERSATION_STATES = [
  'idle',
  'notified',
  'awaiting_approval',
  'sent',
  'cancelled',
];

export const DRAFT_STATUSES = [
  'draft',
  'generated',
  'approved',
  'cancelled',
  'sent',
  'failed',
];

export const LOG_LEVELS = ['info', 'warn', 'error', 'debug'];

export const WHATSAPP_COMMANDS = {
  SEND: 'SEND',
  EDIT: 'EDIT',
  CANCEL: 'CANCEL',
  STATUS: 'STATUS',
};
