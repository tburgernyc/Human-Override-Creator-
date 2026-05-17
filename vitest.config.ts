import { defineConfig } from 'vitest/config';

// Vitest setup for the test migration (audit slice — test infra).
// - Picks up *.test.ts under /tests as well as the legacy *.test.mts scripts
//   so the migration can land without renaming every file on day one.
// - Node environment for everything: none of the tested modules require a DOM
//   yet (gemini.ts is mocked, costEstimator/narrationHash/lutMigration are pure).
//   Switch individual suites to 'jsdom' via `// @vitest-environment jsdom`
//   when we start covering React components.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.mts'],
    // verify-mp4 fixture test shells out to ffmpeg; give it room to breathe.
    testTimeout: 60_000,
  },
});
