const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

if (process.env.NODE_ENV === "development") {
    initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Skip ESLint during `next build` to save ~5-10s. Lint errors are warnings
    // (not errors) inside next build, so this doesn't loosen the deploy gate.
    // TypeScript checking (tsc) still runs and is the real type-safety gate.
    // Developers can still run `npm run lint` locally.
    eslint: {
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**.cloudflare.com",
            },
            {
                protocol: "https",
                hostname: "**.r2.cloudflarestorage.com",
            },
        ],
    },
};

module.exports = nextConfig;
