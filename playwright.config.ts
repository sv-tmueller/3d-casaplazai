import { defineConfig } from '@playwright/test';

// Unique port + strictPort defeats the preview-squatting hazard (advisor
// port-hygiene ruling: stray servers from other worktrees poisoned e2e runs).
// E2E_PORT lets parallel worktrees run e2e simultaneously without colliding
// (AGENTS.md convention: main=4199, wt-editor=4201, wt-viewer=4202,
// wt-fixes=4203).
const PORT = Number(process.env.E2E_PORT ?? 4199);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['line']],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
});
