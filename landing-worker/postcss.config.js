// Override the root postcss.config.js (which loads Tailwind for cf-blog).
// SvelteKit auto-detects postcss configs from the project root, so we
// shadow it here with an empty plugin set.
export default {
    plugins: {},
};
