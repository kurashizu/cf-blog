import { BLOG_URL, MAIL_URL, SHARE_URL } from "$shared/site-config";

/** SVG icon paths (Lucide-style, 1.4px stroke, 24x24 viewBox). */
export type IconName = "notebook" | "mail" | "share" | "github";

export interface Portal {
    /** Numeric id, zero-padded display ("01") is rendered in the template. */
    id: string;
    /** Display name, lowercase. */
    name: string;
    /** One-line description shown under the name. */
    desc: string;
    /** Full https:// URL. */
    url: string;
    /** Icon component name. */
    icon: IconName;
}

export const PORTALS: readonly Portal[] = [
    {
        id: "01",
        name: "blog",
        desc: "writings, notes, technical deep-dives",
        url: BLOG_URL,
        icon: "notebook",
    },
    {
        id: "02",
        name: "mail",
        desc: "encrypted inbox, no third parties",
        url: MAIL_URL,
        icon: "mail",
    },
    {
        id: "03",
        name: "share",
        desc: "ephemeral files, links, screenshots",
        url: SHARE_URL,
        icon: "share",
    },
    {
        id: "04",
        name: "github",
        desc: "open source, side projects, forks",
        url: "https://github.com/kurashizu",
        icon: "github",
    },
];
