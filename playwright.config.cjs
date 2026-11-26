const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: { channel: 'chrome', headless: true },
});
