'use strict';

const { login } = require('./login');
const { navigateToTransfer } = require('./navigate');

(async () => {
  let session;
  try {
    session = await login();
  } catch (err) {
    console.error('\nStopped before reaching the account.');
    process.exitCode = 1;
    return;
  }

  try {
    await navigateToTransfer(session.page);
  } catch (err) {
    console.error(`\nNavigation failed: ${err.message}`);
  }

  console.log('\n✅ Ready. Browser is open.');
  console.log('   Press Ctrl+C to close.');

  await new Promise(() => {});
})();
