'use strict';

// Loads and validates configuration from the local .env file.
// Credentials are NEVER hardcoded — they live only in .env (git-ignored).

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing "${name}" in your .env file.\n` +
        `Copy .env.example to .env and fill in your Commercial Bank credentials.`
    );
  }
  return value;
}

const config = {
  loginUrl: 'https://www.combankdigital.com/#/login',
  username: required('COMBANK_USERNAME'),
  password: required('COMBANK_PASSWORD'),
  headless: String(process.env.HEADLESS).toLowerCase() === 'true',
  // Fast but reliable typing for AngularJS ng-model + validation.
  typeDelayMs: 20,
  // Local web portal
  port: Number(process.env.PORT) || 3000,
  portalPasscode: process.env.PORTAL_PASSCODE || '123',
  // Gmail (IMAP) for automatic OTP retrieval. Optional — if either is missing,
  // the script falls back to asking you for the OTP in the terminal.
  gmail: {
    user: process.env.GMAIL_USER || '',
    appPassword: process.env.GMAIL_APP_PASSWORD || '',
    get enabled() {
      return Boolean(this.user && this.appPassword);
    },
  },
};

module.exports = config;
