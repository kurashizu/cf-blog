import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    preprocess: vitePreprocess(),
    kit: {
        adapter: adapter({
            routes: {
                include: ["/*"],
                exclude: ["<all>"],
            },
        }),
        alias: {
            // Lets routes/components import the shared site config
            // (e.g. `import { BLOG_URL } from '$shared/site-config'`)
            $shared: "../shared",
        },
    },
};

export default config;
