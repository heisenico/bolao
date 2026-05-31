import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // `server-only` throws on import outside React Server Components; under the
      // node test environment its `react-server` export condition is inactive, so
      // map it to the package's own empty no-op stub for tests. The stub is not in
      // the package `exports` map, so reference it by absolute path.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
      // Next 16 dropped the package `exports` map, so the bare `next/server`
      // specifier (imported by next-auth's runtime) no longer resolves under
      // Vite's node resolver. Point it at the real file so importing `@/auth`
      // (which pulls in the NextAuth runtime) works in the test environment.
      "next/server": fileURLToPath(
        new URL("./node_modules/next/server.js", import.meta.url)
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Integration test files share one Postgres `schema=test`, and the global
    // `afterEach` cleanup in vitest.setup.ts truncates every table. Running test
    // files in parallel lets one file's cleanup delete rows another file is mid-
    // test on (FK violations / "Invite code not found"). Serialize files so the
    // shared-schema cleanup is correct; tests within a file already run in order.
    fileParallelism: false,
    // beforeAll runs `prisma migrate deploy` against remote Neon (sa-east-1) and
    // afterEach truncates over the network; the 10s default hook timeout flakes
    // (Vitest then marks the file's tests "skipped"). Give the network room.
    hookTimeout: 60000,
    testTimeout: 30000,
    server: {
      deps: {
        // Inline next-auth so Vite (not Node's native resolver) processes its
        // runtime and applies the `next/server` alias above. Next 16 removed the
        // package `exports` map, so next-auth's bare `next/server` import fails
        // under Node ESM unless Vite rewrites it.
        inline: ["next-auth", "@auth/core"],
      },
    },
  },
});
