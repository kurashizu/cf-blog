import { Code, Mail, Tv, type LucideIcon } from "lucide-react";

export interface SocialLink {
    name: string;
    url: string;
    icon: LucideIcon;
}

export const SOCIAL_LINKS: SocialLink[] = [
    { name: "GitHub",   url: "https://github.com/kurashizu",        icon: Code },
    { name: "Gmail",    url: "mailto:kurashizu123@gmail.com",       icon: Mail },
    { name: "Bilibili", url: "https://space.bilibili.com/17886260", icon: Tv },
];
