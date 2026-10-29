/**
 * Sends transactional email (password reset and verification codes).
 * Production: Resend's HTTP API when RESEND_API_KEY and MAIL_FROM are set.
 * Development: printed to the console instead, so the flows work without an email account.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export type MailTransport = (mail: Mail) => Promise<void>;

export class MailNotConfiguredError extends Error {
  constructor() {
    super('Email is not configured. Set RESEND_API_KEY and MAIL_FROM.');
    this.name = 'MailNotConfiguredError';
  }
}

const resendTransport: MailTransport = async (mail) => {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Email provider responded with status ${res.status}`);
};

const consoleTransport: MailTransport = async (mail) => {
  console.log(`[Mail:dev] To ${mail.to} — ${mail.subject}\n${mail.text}`);
};

let override: MailTransport | null = null;

/** Tests capture outgoing mail with this. Pass null to restore the default. */
export function setMailTransport(transport: MailTransport | null): void {
  override = transport;
}

export function mailConfigured(): boolean {
  return Boolean(override || (process.env.RESEND_API_KEY && process.env.MAIL_FROM) || process.env.NODE_ENV !== 'production');
}

export async function sendMail(mail: Mail): Promise<void> {
  if (override) return override(mail);
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) return resendTransport(mail);
  if (process.env.NODE_ENV !== 'production') return consoleTransport(mail);
  throw new MailNotConfiguredError();
}
