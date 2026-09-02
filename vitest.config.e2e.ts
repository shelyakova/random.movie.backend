import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // e2e spec files each bootstrap their own Nest app and clean/seed the
    // same shared Postgres database. Vitest runs test files in parallel
    // workers by default, so with more than one e2e spec file that leads to
    // one file's cleanDb()/inserts racing another's. Run files one at a
    // time so they don't stomp on each other's data.
    fileParallelism: false,
  },
});
