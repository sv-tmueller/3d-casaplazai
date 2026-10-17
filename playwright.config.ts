import { defineConfig } from '@playwright/test';

// Unique port + strictPort defeats the preview-squatting hazard (advisor
// port-hygiene ruling: stray servers from other worktrees poisoned e2e runs).
const PORT = 4199;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['line']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview -- --port 4199 --strictPort',
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
