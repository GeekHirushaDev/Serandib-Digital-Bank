'use strict';

const path = require('path');
const express = require('express');
const config = require('./config');
const { login } = require('./login');
const { getBalance } = require('./scrape');
const { navigateToTransfer, confirmTransfer } = require('./navigate');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Single in-memory session (this is a local, single-user tool).
let session = null; // { browser, page }
let busy = false;

function ok(res, data) {
  res.json({ ok: true, ...data });
}
function fail(res, code, message) {
  res.status(code).json({ ok: false, error: message });
}

// Unlock with the portal passcode, then log into ComBank and read the balance.
app.post('/api/login', async (req, res) => {
  const { passcode, headless } = req.body || {};
  if (passcode !== config.portalPasscode) {
    return fail(res, 401, 'Incorrect passcode.');
  }
  if (busy) return fail(res, 429, 'Already working — please wait.');
  busy = true;
  try {
    if (!session) {
      console.log(`[server] starting ComBank login (headless: ${!!headless})…`);
      session = await login({ headless: !!headless });
    }
    const balance = await getBalance(session.page);
    ok(res, { balance });
  } catch (err) {
    console.error('[server] login error:', err.message);
    // Drop a broken session so the next try starts fresh.
    if (session && session.browser) await session.browser.close().catch(() => {});
    session = null;
    fail(res, 500, err.message);
  } finally {
    busy = false;
  }
});

// Refresh the balance from the live session.
app.get('/api/balance', async (req, res) => {
  if (!session) return fail(res, 401, 'Not logged in.');
  try {
    const balance = await getBalance(session.page);
    ok(res, { balance });
  } catch (err) {
    fail(res, 500, err.message);
  }
});

// Start a fund transfer to a ComBank account (within-bank transfer).
app.post('/api/transfer', async (req, res) => {
  if (!session) return fail(res, 401, 'Not logged in.');
  if (busy) return fail(res, 429, 'Already working — please wait.');
  const { amount, toAccount, senderDescription, beneficiaryDescription } = req.body || {};
  busy = true;
  try {
    await navigateToTransfer(session.page, { amount, toAccount, senderDescription, beneficiaryDescription });
    ok(res, { message: 'Transfer submitted. Enter the transaction OTP to confirm.' });
  } catch (err) {
    console.error('[server] transfer error:', err.message);
    fail(res, 500, err.message);
  } finally {
    busy = false;
  }
});

// Confirm a transfer with the transaction OTP.
app.post('/api/confirm-transfer', async (req, res) => {
  if (!session) return fail(res, 401, 'Not logged in.');
  if (busy) return fail(res, 429, 'Already working — please wait.');
  const { otp } = req.body || {};
  if (!otp) return fail(res, 400, 'OTP is required.');
  busy = true;
  try {
    await confirmTransfer(session.page, otp);
    ok(res, { message: 'Transfer confirmed successfully.' });
  } catch (err) {
    console.error('[server] confirm error:', err.message);
    fail(res, 500, err.message);
  } finally {
    busy = false;
  }
});

app.listen(config.port, () => {
  console.log(`\n  Serendib Digital Bank portal running:`);
  console.log(`  →  http://localhost:${config.port}\n`);
});
