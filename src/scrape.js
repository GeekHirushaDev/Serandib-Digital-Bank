'use strict';

// Reads the wallet balance from the ComBank "overview" totals block.
async function getBalance(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('ul.totals strong.amount-0');
      return el && el.textContent.trim().length > 0;
    },
    { timeout: 30000 }
  );

  return page.evaluate(() => {
    const read = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent.trim() : null;
    };
    return {
      availableFunds: read('ul.totals strong.amount-0'),
      availableOverdraft: read('ul.totals strong.amount-2'),
      currentFunds: read('ul.totals strong.amount-1'),
    };
  });
}

module.exports = { getBalance };
