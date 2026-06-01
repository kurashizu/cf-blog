export default {
  async scheduled(_event: ScheduledEvent, env: { CRON_SECRET: string; BLOG_URL: string }) {
    const url = env.BLOG_URL ?? 'https://cf-blog.kurashizu123.workers.dev';
    const res = await fetch(`${url}/api/cache/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const body = await res.text();
    console.log(`Cache refresh: ${res.status} — ${body}`);
  },
};
