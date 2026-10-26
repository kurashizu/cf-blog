const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");

if (process.env.NODE_ENV === "development") {
    initOpenNextCloudflareForDev();
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        formats: ["image/avif"],
        remotePatterns: [
            {
                protocol: "https",
                hostname: "**.cloudflare.com",
            },
            {
                protocol: "https",
                hostname: "**.r2.cloudflarestorage.com",
            },
            // Public R2 bucket (BUCKET_URL in shared/site-config.ts) — cover
            // images and anything uploaded via the admin media manager.
            {
                protocol: "https",
                hostname: "bucket.krsz.in",
            },
        ],
    },
};

module.exports = nextConfig;
