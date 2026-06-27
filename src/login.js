'use strict';

const readline = require('readline');
const config = require('./config');
const { getLatestOtp, deleteExistingOtpEmails } = require('./otp');

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

// Ask a question in the terminal and resolve with the typed answer.
// Used for the OTP — the code is read live and never stored.
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Wait until a submit button matching `value` exists AND is not ng-disabled,
// then click it. AngularJS keeps these buttons disabled until the field validates.
async function clickEnabledSubmit(page, value, step) {
  const selector = `input[type="submit"][value="${value}"]`;
  log(step, `waiting for "${value}" button to become enabled…`);
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return el && !el.disabled && el.getAttribute('disabled') === null;
    },
    { timeout: 60000 },
    selector
  );
  await page.click(selector);
  log(step, `clicked "${value}".`);
}

// Type into the first visible input matching one of the candidate selectors.
// Uses real key events (page.type) so AngularJS ng-model updates — setting
// .value directly would NOT trigger Angular's binding.
async function typeIntoField(page, candidates, text, step, label) {
  log(step, `waiting for the ${label} field…`);
  const selector = await waitForAnySelector(page, candidates, 60000);
  // Bring it into view and focus via the element handle (avoids the
  // "Node is not clickable" error when something briefly overlaps it).
  const el = await page.$(selector);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.focus();
  // Clear any existing text, then type with real key events for ng-model.
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, text, { delay: config.typeDelayMs });
  log(step, `entered ${label}.`);
  return selector;
}

// Resolve as soon as ANY candidate selector matches a VISIBLE element
// (waits out the loading splash, which keeps fields hidden in the DOM).
async function waitForAnySelector(page, selectors, timeout) {
  const result = await page.waitForFunction(
    (sels) => {
      for (const s of sels) {
        const el = document.querySelector(s);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none') {
          return s;
        }
      }
      return false;
    },
    { timeout, polling: 200 },
    selectors
  );
  return result.jsonValue();
}

async function screenshotSafe(page, name) {
  try {
    await page.screenshot({ path: `debug-${name}.png`, fullPage: true });
    log('debug', `saved screenshot debug-${name}.png`);
  } catch (_) {
    /* page may be closed — ignore */
  }
}

// ---------------------------------------------------------------------------
// Main login flow
// ---------------------------------------------------------------------------

// Logs into Commercial Bank digital banking and returns { browser, page }
// with an authenticated session, so later phases can scrape transactions.
async function login(opts = {}) {
  const puppeteer = require('puppeteer');
  const headless = opts.headless !== undefined ? opts.headless : config.headless;

  log('1', `launching browser (headless: ${headless})…`);
  const browser = await puppeteer.launch({
    headless,
    defaultViewport: { width: 1280, height: 800 },
    args: ['--window-size=1300,900', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();

  // Speed: skip downloading images, fonts and media — not needed for automation.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const type = req.resourceType();
    if (type === 'image' || type === 'font' || type === 'media') req.abort();
    else req.continue();
  });

  try {
    log('1', `opening ${config.loginUrl}`);
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Step 2: username
    await typeIntoField(
      page,
      ['input[placeholder="Username"]', 'input[type="text"][ng-model]'],
      config.username,
      '2',
      'username'
    );

    // Step 3: Continue
    await clickEnabledSubmit(page, 'Continue', '3');

    // Step 4: password
    await typeIntoField(
      page,
      ['input[placeholder="Password"]', 'input[type="password"][ng-model]'],
      config.password,
      '4',
      'password'
    );

    // Step 5: Before clicking Login, delete all existing ComBank OTP emails
    // from Gmail so the ONLY one found after Login is the fresh one.
    if (config.gmail.enabled) {
      log('5', 'clearing old ComBank OTP emails from Gmail…');
      try {
        const deleted = await deleteExistingOtpEmails({
          user: config.gmail.user,
          pass: config.gmail.appPassword,
        });
        log('5', `deleted ${deleted} old OTP email(s).`);
      } catch (err) {
        log('5', `could not clear old OTPs: ${err.message} — continuing anyway.`);
      }
    }

    await clickEnabledSubmit(page, 'Login', '5');

    // Step 6: OTP — detect the field, get the code (Gmail auto or terminal),
    // type and submit.
    await handleOtp(page);

    // Give the post-login page a moment to settle.
    await page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 })
      .catch(() => {});

    // Step 7: Close all notification/dialog popups that appear after login.
    await dismissDialogs(page);

    log('done', `logged in. Current URL: ${page.url()}`);
    await screenshotSafe(page, 'loggedin');

    return { browser, page };
  } catch (err) {
    console.error(`\nLogin failed: ${err.message}`);
    await screenshotSafe(page, 'error');
    throw err;
  }
}

// Detects an OTP input after Login. If one appears, gets the code — automatically
// from Gmail when configured, otherwise by asking in the terminal — then types it
// and submits. If no OTP field shows up shortly, assumes the account opened directly.
async function handleOtp(page) {
  const otpCandidates = [
    'input[placeholder="OTP"]',
    'input[autocomplete="one-time-code"]',
    'input[placeholder*="OTP" i]',
    'input[placeholder*="code" i]',
    'input[type="tel"][ng-model]',
  ];

  log('6', 'checking for an OTP / second-factor step…');
  let otpSelector;
  try {
    otpSelector = await waitForAnySelector(page, otpCandidates, 15000);
  } catch (_) {
    log('6', 'no OTP field detected — continuing.');
    return;
  }

  let code;
  if (config.gmail.enabled) {
    log('6', 'OTP field found — fetching the latest ComBank OTP from Gmail…');
    try {
      code = await getLatestOtp({
        user: config.gmail.user,
        pass: config.gmail.appPassword,
      });
    } catch (err) {
      log('6', `auto-fetch failed (${err.message}). Falling back to manual entry.`);
    }
  }
  if (!code) {
    code = await ask('\n>>> Enter the OTP you received: ');
  }
  if (!code) {
    log('6', 'no code available — continuing without submitting OTP.');
    return;
  }

  await page.click(otpSelector, { clickCount: 3 });
  await page.type(otpSelector, code, { delay: config.typeDelayMs });
  log('6', 'OTP entered.');

  // Try common submit buttons for the OTP step; fall back to Enter.
  const submitValues = ['Login', 'Submit', 'Continue', 'Verify', 'Confirm'];
  for (const value of submitValues) {
    const sel = `input[type="submit"][value="${value}"]`;
    const exists = await page.$(sel);
    if (exists) {
      await clickEnabledSubmit(page, value, '6').catch(() => {});
      return;
    }
  }
  await page.keyboard.press('Enter');
  log('6', 'submitted OTP via Enter.');
}

async function dismissDialogs(page) {
  log('7', 'closing notification dialogs…');
  let closed = 0;
  // Keep clicking close buttons until none remain (some appear sequentially).
  for (let round = 0; round < 10; round++) {
    await new Promise((r) => setTimeout(r, 1500));
    const buttons = await page.$$('button.ui-dialog-titlebar-close');
    if (buttons.length === 0) break;
    for (const btn of buttons) {
      try {
        await btn.click();
        closed++;
      } catch (_) {}
    }
  }
  log('7', closed > 0 ? `closed ${closed} dialog(s).` : 'no dialogs found.');
}

module.exports = { login };
