export const metadata = {
  title: "About",
  description: "About Kurashizu - software engineer and writer.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="page-title">About Me</h1>

      <section className="mb-12">
        <h2 className="section-title">Hello, I&apos;m Kurashizu</h2>
        <div className="space-y-4 text-text-secondary">
          <p>
            I&apos;m a software engineer with a passion for building tools and
            systems that make developers&apos; lives easier. I&apos;ve spent
            years working with cloud infrastructure, automation, and developer
            tools.
          </p>
          <p>
            When I&apos;m not coding, you can find me writing about technology,
            experimenting with new frameworks, or exploring the intersection of
            software and human creativity.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="section-title">Technical Interests</h2>
        <ul className="space-y-3">
          <li className="flex items-center gap-2 text-text-secondary">
            <span style={{ color: "var(--accent)" }} aria-hidden="true">
              →
            </span>
            Cloud infrastructure and serverless architectures
          </li>
          <li className="flex items-center gap-2 text-text-secondary">
            <span style={{ color: "var(--accent)" }} aria-hidden="true">
              →
            </span>
            Developer tools and productivity automation
          </li>
          <li className="flex items-center gap-2 text-text-secondary">
            <span style={{ color: "var(--accent)" }} aria-hidden="true">
              →
            </span>
            Programming languages and runtime environments
          </li>
          <li className="flex items-center gap-2 text-text-secondary">
            <span style={{ color: "var(--accent)" }} aria-hidden="true">
              →
            </span>
            Web performance and accessibility
          </li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="section-title">This Blog</h2>
        <div className="space-y-4 text-text-secondary">
          <p>
            This blog is built with Next.js and deployed on Cloudflare Pages.
            Articles are stored in Cloudflare R2 and fetched at runtime. The
            design follows a minimal dark theme with accessibility as a
            priority.
          </p>
          <p>
            I write about things I&apos;m learning, building, or thinking about.
            Topics range from technical deep-dives to general observations
            about the software industry.
          </p>
        </div>
      </section>

      <section>
        <h2 className="section-title">Get in Touch</h2>
        <p className="text-text-secondary">
          Feel free to reach out if you&apos;d like to connect, collaborate, or
          just say hello. I&apos;m always interested in hearing about interesting
          projects and ideas.
        </p>
      </section>
    </div>
  );
}