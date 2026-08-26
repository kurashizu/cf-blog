import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname),
            "@shared": path.resolve(__dirname, "shared"),
        },
    },
    test: {
        environment: "node",
        globals: true,
        include: [
            "lib/**/*.test.ts",
            "shared/**/*.test.ts",
            "agent-worker/lib/**/*.test.ts",
            // Pure logic extracted from components (e.g. the editor's
            // markdown transforms) is testable too.
            "components/**/*.test.ts",
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
        },
    },
});
