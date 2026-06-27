'use strict';

// Fetches the latest ComBank OTP from your Gmail inbox over IMAP.
// Uses a Google "app password" (not your normal password) stored in .env.

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newClient({ user, pass }) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });
}

// Pull the 6-digit code out of a ComBank OTP email body.
function extractCode(text) {
  if (!text) return null;
  const primary = text.match(/One[- ]?Time\s*Password\s*\(OTP\)\s*is[:\s]*([0-9]{4,8})/i);
  if (primary) return primary[1];
  const loose = text.match(/\bOTP\b[\s\S]{0,40}?\b([0-9]{6})\b/i);
  return loose ? loose[1] : null;
}

// Subject-based match using just the envelope (fast — no body download).
function subjectIsCombankOtp(subject) {
  const s = (subject || '').toLowerCase();
  return s.includes('otp') || s.includes('one-time password') || s.includes('combank');
}

// Polls Gmail until a fresh ComBank OTP arrives. Keeps ONE connection open for
// the whole poll loop (much faster than reconnecting every attempt).
async function getLatestOtp({ user, pass, timeoutMs = 120000, pollMs = 3000 }) {
  const client = newClient({ user, pass });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  try {
    while (Date.now() < deadline) {
      attempt += 1;
      console.log(`[otp] checking Gmail for the ComBank OTP (attempt ${attempt})…`);
      const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
      // Server-side narrow: recent + subject contains OTP.
      let uids = await client.search({ since: sinceDay, subject: 'OTP' }, { uid: true });
      if (!uids || uids.length === 0) {
        uids = await client.search({ since: sinceDay }, { uid: true });
      }

      if (uids && uids.length) {
        for (const uid of uids.slice(-10).reverse()) {
          const meta = await client.fetchOne(uid, { envelope: true }, { uid: true });
          if (!meta || !subjectIsCombankOtp(meta.envelope && meta.envelope.subject)) continue;
          const full = await client.fetchOne(uid, { source: true }, { uid: true });
          if (!full || !full.source) continue;
          const parsed = await simpleParser(full.source);
          const code = extractCode(`${parsed.text || ''}\n${parsed.html || ''}`);
          if (code) {
            console.log('[otp] found OTP in Gmail.');
            return code;
          }
        }
      }
      await sleep(pollMs);
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  throw new Error('Timed out waiting for the ComBank OTP email in Gmail.');
}

// Deletes recent ComBank OTP emails so only the fresh one (after Login) is found.
async function deleteExistingOtpEmails({ user, pass }) {
  const client = newClient({ user, pass });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  let deleted = 0;
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // Server-side subject filter, then confirm via envelope only (no body download).
    const uids = await client.search({ since, subject: 'OTP' }, { uid: true });
    if (!uids || uids.length === 0) return 0;

    const toDelete = [];
    for (const uid of uids) {
      const meta = await client.fetchOne(uid, { envelope: true }, { uid: true });
      if (meta && subjectIsCombankOtp(meta.envelope && meta.envelope.subject)) {
        toDelete.push(uid);
      }
    }
    if (toDelete.length > 0) {
      await client.messageDelete(toDelete, { uid: true });
      deleted = toDelete.length;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return deleted;
}

module.exports = { getLatestOtp, deleteExistingOtpEmails, extractCode };
