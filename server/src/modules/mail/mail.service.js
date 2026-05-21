import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const testOutbox = [];

const hasSmtpConfig = () => Boolean(
  env.EMAIL_PROVIDER === 'smtp'
  && env.SMTP_HOST
  && env.SMTP_USER
  && env.SMTP_PASS
  && env.EMAIL_FROM,
);

const createTransport = () => {
  if (env.NODE_ENV === 'test') {
    return nodemailer.createTransport({ jsonTransport: true });
  }

  if (hasSmtpConfig()) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  if (env.IS_PRODUCTION) {
    throw new Error('Transactional email configuration is required in production.');
  }

  return nodemailer.createTransport({ jsonTransport: true });
};

let transport;

const getTransport = () => {
  transport ??= createTransport();
  return transport;
};

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const buildEmailShell = ({
  title,
  greeting,
  intro,
  actionLabel = null,
  actionUrl = null,
  details = [],
  footer,
}) => {
  const safeTitle = escapeHtml(title);
  const safeGreeting = escapeHtml(greeting);
  const safeIntro = escapeHtml(intro);
  const safeActionLabel = actionLabel ? escapeHtml(actionLabel) : null;
  const safeActionUrl = actionUrl ? escapeHtml(actionUrl) : null;
  const safeFooter = footer ? escapeHtml(footer) : null;
  const detailLines = details.filter(Boolean);

  const text = [
    safeGreeting,
    '',
    intro,
    ...(actionUrl ? ['', `${actionLabel}: ${actionUrl}`] : []),
    ...(detailLines.length ? ['', ...detailLines] : []),
    ...(footer ? ['', footer] : []),
  ].join('\n');

  const htmlDetails = detailLines.length
    ? `<div style="margin:24px 0 0;">${detailLines.map((line) => `<p style="font-size:13px;line-height:1.7;color:#5f6672;margin:0 0 10px;">${escapeHtml(line)}</p>`).join('')}</div>`
    : '';

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8f6;font-family:Arial,sans-serif;color:#000;">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
      <div style="background:#fff;border:1px solid #e8e8e8;border-radius:28px;padding:34px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1px;">findly<span style="color:#A6FF00;">.</span></div>
        <h1 style="font-size:34px;line-height:1.05;margin:34px 0 12px;">${safeTitle}</h1>
        <p style="font-size:16px;line-height:1.7;color:#2E3238;margin:0 0 24px;">
          ${safeIntro}
        </p>
        ${safeActionUrl && safeActionLabel ? `
          <a href="${safeActionUrl}" style="display:inline-block;background:#A6FF00;color:#000;text-decoration:none;border-radius:999px;padding:15px 24px;font-weight:800;">
            ${safeActionLabel}
          </a>
        ` : ''}
        ${safeActionUrl ? `
          <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:28px 0 0;">
            If the button does not work, paste this link into your browser:
          </p>
          <p style="font-size:13px;line-height:1.7;word-break:break-all;color:#2E3238;">${safeActionUrl}</p>
        ` : ''}
        ${htmlDetails}
        ${safeFooter ? `
          <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:20px 0 0;">
            ${safeFooter}
          </p>
        ` : ''}
      </div>
    </div>
  </body>
</html>`;

  return { text, html };
};

const sendTransactionalEmail = async ({
  to,
  subject,
  text,
  html,
  from = env.EMAIL_FROM || 'Findly <no-reply@findly.local>',
  testMetadata = {},
}) => {
  const result = await getTransport().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });

  if (env.NODE_ENV === 'test') {
    testOutbox.push({
      to,
      subject,
      text,
      html,
      from,
      result,
      ...testMetadata,
    });
  }

  return result;
};

const getSecurityFrom = () => env.EMAIL_SECURITY_FROM || env.EMAIL_FROM || 'Findly Security <security@findly.local>';

const buildVerificationEmail = ({ name, verificationUrl, expiresInMinutes }) => {
  const subject = 'Verify your Findly account';
  const content = buildEmailShell({
    title: 'Verify your account.',
    greeting: `Hi ${name},`,
    intro: `Hi ${name}, verify your Findly account to unlock your workspace and initial Opportunity Credits.`,
    actionLabel: 'Verify account',
    actionUrl: verificationUrl,
    details: [`This link expires in ${expiresInMinutes} minutes.`],
    footer: 'If you did not create a Findly account, you can ignore this email.',
  });

  return { subject, ...content };
};

export const buildPasswordResetEmail = ({ name, resetUrl, expiresInMinutes }) => {
  const subject = 'Reset your Findly password';
  const content = buildEmailShell({
    title: 'Reset your password.',
    greeting: `Hi ${name},`,
    intro: `Hi ${name}, use this secure one-time link to set a new Findly password.`,
    actionLabel: 'Reset password',
    actionUrl: resetUrl,
    details: [`This link expires in ${expiresInMinutes} minutes and can be used once.`],
    footer: 'If you did not request this password reset, you can ignore this email.',
  });

  return { subject, ...content };
};

const buildSecurityNoticeEmail = ({ name, title, intro, details = [], footer = 'If you did not make this change, contact support immediately.' }) => {
  const subject = `Findly security notice: ${title}`;
  const content = buildEmailShell({
    title,
    greeting: `Hi ${name},`,
    intro,
    details,
    footer,
  });

  return { subject, ...content };
};

export const sendVerificationEmail = async ({ to, name, verificationUrl, expiresInMinutes }) => {
  const email = buildVerificationEmail({ name, verificationUrl, expiresInMinutes });
  return sendTransactionalEmail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { verificationUrl },
  });
};

export const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes }) => {
  const email = buildPasswordResetEmail({ name, resetUrl, expiresInMinutes });
  return sendTransactionalEmail({
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { resetUrl },
  });
};

export const sendPasswordChangedEmail = async ({ to, name }) => {
  const email = buildSecurityNoticeEmail({
    name,
    title: 'Your password was changed',
    intro: `Hi ${name}, your Findly password was changed successfully.`,
  });

  return sendTransactionalEmail({
    to,
    from: getSecurityFrom(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { category: 'password-changed' },
  });
};

export const sendTwoFactorEnabledEmail = async ({ to, name }) => {
  const email = buildSecurityNoticeEmail({
    name,
    title: 'Two-factor authentication enabled',
    intro: `Hi ${name}, two-factor authentication was enabled for your Findly account.`,
    details: ['Your account now requires an authenticator code during sign-in.'],
  });

  return sendTransactionalEmail({
    to,
    from: getSecurityFrom(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { category: 'two-factor-enabled' },
  });
};

export const sendTwoFactorDisabledEmail = async ({ to, name }) => {
  const email = buildSecurityNoticeEmail({
    name,
    title: 'Two-factor authentication disabled',
    intro: `Hi ${name}, two-factor authentication was disabled for your Findly account.`,
  });

  return sendTransactionalEmail({
    to,
    from: getSecurityFrom(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { category: 'two-factor-disabled' },
  });
};

export const sendTwoFactorBackupCodesRegeneratedEmail = async ({ to, name }) => {
  const email = buildSecurityNoticeEmail({
    name,
    title: 'Backup codes regenerated',
    intro: `Hi ${name}, your Findly backup codes were regenerated.`,
    details: ['Your old backup codes can no longer be used.'],
  });

  return sendTransactionalEmail({
    to,
    from: getSecurityFrom(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { category: 'two-factor-backup-codes-regenerated' },
  });
};

export const sendTwoFactorBackupCodeUsedEmail = async ({ to, name }) => {
  const email = buildSecurityNoticeEmail({
    name,
    title: 'Backup code used',
    intro: `Hi ${name}, a backup code was used to sign in to your Findly account.`,
    details: ['If this was you, regenerate your backup codes if you believe they may have been exposed.'],
  });

  return sendTransactionalEmail({
    to,
    from: getSecurityFrom(),
    subject: email.subject,
    text: email.text,
    html: email.html,
    testMetadata: { category: 'two-factor-backup-code-used' },
  });
};

export const getTestOutbox = () => testOutbox;

export const clearTestOutbox = () => {
  testOutbox.length = 0;
};
