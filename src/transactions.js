'use strict';

// Navigates My Money → My Portfolio → (savings account) and scrapes the
// account transaction history table that ComBank renders for that account.

function log(step, msg) {
  console.log(`[txn:${step}] ${msg}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTransactions(page) {
  // Step A: Click the "My Money" main menu item.
  log('A', 'clicking "My Money" menu…');
  await page.waitForFunction(
    () => [...document.querySelectorAll('a')].some((a) => a.textContent.trim() === 'My Money'),
    { timeout: 30000 }
  );
  await page.evaluate(() => {
    const menu = [...document.querySelectorAll('a')].find((a) => a.textContent.trim() === 'My Money');
    if (menu) menu.click();
  });
  await sleep(800);

  // Step B: Click the "My Portfolio" submenu (performRedirection link).
  log('B', 'clicking "My Portfolio" submenu…');
  await page.waitForFunction(
    () => {
      const links = [...document.querySelectorAll('a[ng-click*="performRedirection"]')];
      return links.some((a) => a.textContent.includes('My Portfolio'));
    },
    { timeout: 15000 }
  );
  await page.evaluate(() => {
    const links = [...document.querySelectorAll('a[ng-click*="performRedirection"]')];
    const sub = links.find((a) => a.textContent.includes('My Portfolio'));
    if (sub) sub.click();
  });
  await sleep(1000);

  // Step C: Click an account in the portfolio list. Prefer a savings account,
  // otherwise fall back to the first account shown.
  log('C', 'opening account details…');
  await page.waitForSelector('li[ng-click="showAccountDetails(account)"]', { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => {
    const accounts = [...document.querySelectorAll('li[ng-click="showAccountDetails(account)"]')];
    const savings = accounts.find((li) => li.className.toLowerCase().includes('savings'));
    (savings || accounts[0])?.click();
  });

  // Step D: Wait for the transactions table to render its rows.
  log('D', 'waiting for transaction history…');
  await page.waitForFunction(
    () => {
      const t = document.querySelector('table.transactions tbody');
      return t && t.querySelectorAll('tr').length > 0;
    },
    { timeout: 20000 }
  );
  await sleep(500);

  // Step E: Scrape the rows.
  log('E', 'reading rows…');
  const rows = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const out = [];
    document.querySelectorAll('table.transactions tbody tr').forEach((tr) => {
      const cells = tr.querySelectorAll('td');
      if (cells.length < 4) return; // skip empty / placeholder rows

      // Direction: the first cell has "credit" or "debit".
      const type = clean(cells[0].textContent).toLowerCase().includes('credit') ? 'credit' : 'debit';

      // Description: first text node of the .no-border block (before the .extra div).
      const descBlock = cells[2].querySelector('.no-border');
      let description = '';
      if (descBlock) {
        const node = [...descBlock.childNodes].find((n) => n.nodeType === 3 && clean(n.textContent));
        description = node ? clean(node.textContent) : clean(descBlock.textContent);
      } else {
        description = clean(cells[2].textContent);
      }

      // Extra reference details (account/reference numbers), if present.
      const extra = clean(cells[2].querySelector('.extra')?.textContent || '');

      const date = clean(cells[1].textContent);
      const amount = clean(cells[3].textContent);
      const balance = cells[4] ? clean(cells[4].textContent) : '';

      out.push({ type, date, description, extra, amount, balance });
    });
    return out;
  });

  log('E', `found ${rows.length} transactions.`);
  return rows;
}

module.exports = { getTransactions };
