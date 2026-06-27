'use strict';

function log(step, msg) {
  console.log(`[${step}] ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Type into a field using real key events (for AngularJS ng-model binding).
async function typeField(page, selector, text) {
  const el = await page.$(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.focus();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(selector, text, { delay: 30 });
}

// Type into a field found by tabindex attribute.
async function typeByTabindex(page, tabindex, text, label) {
  const sel = `input[tabindex="${tabindex}"], textarea[tabindex="${tabindex}"]`;
  await page.waitForSelector(sel, { timeout: 10000 });
  await sleep(300);
  log('fill', `typing ${label}…`);
  await typeField(page, sel, text);
}

async function navigateToTransfer(page, options = {}) {
  const { amount, toAccount, senderDescription, beneficiaryDescription } = options;

  // Step 8: Click "Payments & Transfers" in the main menu
  log('8', 'clicking "Payments & Transfers" menu…');
  await page.waitForFunction(
    () => {
      const links = [...document.querySelectorAll('a.ng-binding')];
      return links.some((a) => a.textContent.includes('Payments') && a.textContent.includes('Transfers'));
    },
    { timeout: 30000 }
  );
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a.ng-binding')];
    const menu = links.find((a) => a.textContent.includes('Payments') && a.textContent.includes('Transfers'));
    if (menu) menu.click();
  });
  await sleep(700);

  // Step 9: Click the "Payments & Transfers" submenu item
  log('9', 'clicking "Payments & Transfers" submenu…');
  await page.waitForFunction(
    () => {
      const links = [...document.querySelectorAll('a[ng-click*="performRedirection"]')];
      return links.some((a) => a.textContent.includes('Payments') && a.textContent.includes('Transfers'));
    },
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[ng-click*="performRedirection"]')];
    const sub = links.find((a) => a.textContent.includes('Payments') && a.textContent.includes('Transfers'));
    if (sub) sub.click();
  });
  await sleep(700);

  // Step 10: Click the "Select an option" dropdown
  log('10', 'opening "Select an option" dropdown…');
  await page.waitForSelector('span.plain-list-drop-down-selected-content', { timeout: 15000 });
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span.plain-list-drop-down-selected-content')];
    const opt = spans.find((s) => s.textContent.includes('Select an option'));
    if (opt) opt.click();
  });
  await sleep(500);

  // Step 11: Select "Transfer Funds to an Account within the Bank"
  log('11', 'selecting "Transfer Funds to an Account within the Bank"…');
  await page.waitForFunction(
    () => {
      const items = [...document.querySelectorAll('span.sub.ng-binding')];
      return items.some((s) => s.textContent.includes('Transfer Funds to an Account within the Bank'));
    },
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('span.sub.ng-binding')];
    const item = items.find((s) => s.textContent.includes('Transfer Funds to an Account within the Bank'));
    if (item) item.click();
  });
  await sleep(700);

  // Step 12: Click the "Select account" dropdown (source account)
  log('12', 'opening "Select account" dropdown…');
  await page.waitForFunction(
    () => {
      const spans = [...document.querySelectorAll('span.plain-list-drop-down-selected-content')];
      return spans.some((s) => s.textContent.includes('Select account'));
    },
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span.plain-list-drop-down-selected-content')];
    const acc = spans.find((s) => s.textContent.includes('Select account'));
    if (acc) acc.click();
  });
  await sleep(500);

  // Step 13: Select "SaveHirusha (8012153110)"
  log('13', 'selecting "SaveHirusha (8012153110)"…');
  await page.waitForFunction(
    () => {
      const items = [...document.querySelectorAll('span.ng-binding')];
      return items.some((s) => s.textContent.includes('8012153110'));
    },
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('span.ng-binding')];
    const item = items.find((s) => s.textContent.includes('8012153110'));
    if (item) item.click();
  });
  await sleep(700);
  log('13', 'source account selected.');

  // Step 14: Enter recipient account number (tabindex 8)
  if (toAccount) {
    await typeByTabindex(page, 8, toAccount, 'recipient account');
    await sleep(500);
  }

  // Step 15: Enter amount (tabindex 11)
  if (amount) {
    await typeByTabindex(page, 11, String(amount), 'amount');
    await sleep(500);
  }

  // Step 16: Sender account description (tabindex 15)
  const senderDesc = senderDescription || 'Serendib Transfer';
  await typeByTabindex(page, 15, senderDesc, 'sender description');
  await sleep(300);

  // Step 17: Beneficiary account description (textarea#beneficiaryComments)
  // Use Angular's own scope to set the ng-model value directly.
  const benefDesc = beneficiaryDescription || 'Serendib Transfer';
  log('fill', 'typing beneficiary description…');
  await page.waitForSelector('textarea#beneficiaryComments', { timeout: 10000 });
  await sleep(500);
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea#beneficiaryComments');
    const scope = angular.element(ta).scope();
    scope.$apply(() => {
      scope.ngModelWrapper.ngModel = text;
    });
    ta.value = text;
    ta.classList.remove('ng-empty');
    ta.classList.add('ng-dirty', 'ng-valid', 'ng-not-empty');
  }, benefDesc);
  await sleep(500);

  // Step 18: Select "Purpose of payment" → "Miscellaneous Payments"
  log('18', 'selecting purpose of payment…');
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('span.plain-list-drop-down-selected-content')];
    const pp = spans.find((s) => s.textContent.includes('Select purpose of payment'));
    if (pp) pp.click();
  });
  await sleep(500);
  await page.waitForFunction(
    () => {
      const items = [...document.querySelectorAll('span.ng-binding.middle-text')];
      return items.some((s) => s.textContent.includes('Miscellaneous Payments'));
    },
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('span.ng-binding.middle-text')];
    const item = items.find((s) => s.textContent.includes('Miscellaneous Payments'));
    if (item) item.click();
  });
  await sleep(500);
  log('18', 'purpose selected.');

  // Step 19: Click "I agree with the terms of use"
  log('19', 'accepting terms…');
  await page.evaluate(() => {
    const lbl = document.querySelector('label[for="terms-checkbox"]');
    if (lbl) lbl.click();
  });
  await sleep(300);

  // Step 20: Click Submit
  log('20', 'clicking Submit…');
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('input[type="submit"][value="Submit"]');
      return btn && !btn.disabled;
    },
    { timeout: 10000 }
  );
  await page.click('input[type="submit"][value="Submit"]');
  log('20', 'transfer submitted — waiting for transaction OTP page…');

  // After Submit, the bank shows a transaction OTP field. We pause here
  // and return — the server will call confirmTransfer() with the OTP later.
}

// Step 21-22: Type the transaction OTP and click Confirm.
async function confirmTransfer(page, otp) {
  const otpSel = 'input[placeholder="OTP via SMS alert"]';
  log('21', 'waiting for transaction OTP field…');
  await page.waitForSelector(otpSel, { timeout: 60000 });
  await sleep(500);

  log('21', 'entering transaction OTP…');
  const el = await page.$(otpSel);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.focus();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type(otpSel, otp, { delay: 30 });
  await sleep(300);

  log('22', 'clicking Confirm…');
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('input[type="submit"][value="Confirm"]');
      return btn && !btn.disabled;
    },
    { timeout: 10000 }
  );
  await page.click('input[type="submit"][value="Confirm"]');
  log('22', 'transfer confirmed.');
}

module.exports = { navigateToTransfer, confirmTransfer };
