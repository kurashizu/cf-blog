import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

if (process.env.NODE_ENV === "development") {
    initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    // Same rationale as cf-blog/next.config.js: lint errors are warnings inside
    // next build, and `tsc` is the real type-safety gate. Running `npx next lint`
    // locally still works.
    eslint: {
        ignoreDuringBuilds: true,
    },
};

export default nextConfig;
