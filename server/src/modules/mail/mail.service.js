import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';

const testOutbox = [];

const hasSmtpConfig = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM);

const createTransport = () => {
  if (env.NODE_ENV === 'test') {
    return nodemailer.createTransport({
      jsonTransport: true,
    });
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
    throw new Error('SMTP configuration is required in production.');
  }

  return nodemailer.createTransport({
    jsonTransport: true,
  });
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

const buildVerificationEmail = ({ name, verificationUrl, expiresInMinutes }) => {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(verificationUrl);
  const subject = 'Verify your Findly account';
  const text = [
    `Hi ${name},`,
    '',
    'Verify your Findly account to unlock your workspace and initial Opportunity Credits.',
    `Verification link: ${verificationUrl}`,
    '',
    `This link expires in ${expiresInMinutes} minutes.`,
    'If you did not create a Findly account, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8f6;font-family:Arial,sans-serif;color:#000;">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
      <div style="background:#fff;border:1px solid #e8e8e8;border-radius:28px;padding:34px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1px;">findly<span style="color:#A6FF00;">.</span></div>
        <h1 style="font-size:34px;line-height:1.05;margin:34px 0 12px;">Verify your account.</h1>
        <p style="font-size:16px;line-height:1.7;color:#2E3238;margin:0 0 24px;">
          Hi ${safeName}, verify your Findly account to unlock your workspace and initial Opportunity Credits.
        </p>
        <a href="${safeUrl}" style="display:inline-block;background:#A6FF00;color:#000;text-decoration:none;border-radius:999px;padding:15px 24px;font-weight:800;">
          Verify account
        </a>
        <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:28px 0 0;">
          This link expires in ${expiresInMinutes} minutes. If the button does not work, paste this link into your browser:
        </p>
        <p style="font-size:13px;line-height:1.7;word-break:break-all;color:#2E3238;">${safeUrl}</p>
        <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:20px 0 0;">
          If you did not create a Findly account, you can ignore this email.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
};

export const buildPasswordResetEmail = ({ name, resetUrl, expiresInMinutes }) => {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const subject = 'Reset your Findly password';
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your Findly password.',
    `Reset link: ${resetUrl}`,
    '',
    `This link expires in ${expiresInMinutes} minutes and can be used once.`,
    'If you did not request this password reset, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f8f6;font-family:Arial,sans-serif;color:#000;">
    <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
      <div style="background:#fff;border:1px solid #e8e8e8;border-radius:28px;padding:34px;">
        <div style="font-size:28px;font-weight:800;letter-spacing:-1px;">findly<span style="color:#A6FF00;">.</span></div>
        <h1 style="font-size:34px;line-height:1.05;margin:34px 0 12px;">Reset your password.</h1>
        <p style="font-size:16px;line-height:1.7;color:#2E3238;margin:0 0 24px;">
          Hi ${safeName}, use this secure one-time link to set a new Findly password.
        </p>
        <a href="${safeUrl}" style="display:inline-block;background:#A6FF00;color:#000;text-decoration:none;border-radius:999px;padding:15px 24px;font-weight:800;">
          Reset password
        </a>
        <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:28px 0 0;">
          This link expires in ${expiresInMinutes} minutes and can be used once. If the button does not work, paste this link into your browser:
        </p>
        <p style="font-size:13px;line-height:1.7;word-break:break-all;color:#2E3238;">${safeUrl}</p>
        <p style="font-size:13px;line-height:1.7;color:#5f6672;margin:20px 0 0;">
          If you did not request this password reset, you can ignore this email.
        </p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
};

export const sendVerificationEmail = async ({ to, name, verificationUrl, expiresInMinutes }) => {
  const email = buildVerificationEmail({ name, verificationUrl, expiresInMinutes });
  const from = env.EMAIL_FROM || 'Findly <no-reply@findly.local>';

  const result = await getTransport().sendMail({
    from,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (env.NODE_ENV === 'test') {
    testOutbox.push({
      to,
      verificationUrl,
      ...email,
      result,
    });
  }

  return result;
};

export const sendPasswordResetEmail = async ({ to, name, resetUrl, expiresInMinutes }) => {
  const email = buildPasswordResetEmail({ name, resetUrl, expiresInMinutes });
  const from = env.EMAIL_FROM || 'Findly <no-reply@findly.local>';

  const result = await getTransport().sendMail({
    from,
    to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  if (env.NODE_ENV === 'test') {
    testOutbox.push({
      to,
      resetUrl,
      ...email,
      result,
    });
  }

  return result;
};

export const getTestOutbox = () => testOutbox;

export const clearTestOutbox = () => {
  testOutbox.length = 0;
};
