import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
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
