import { type VisitorInfo as VisitorInfoType } from "@/lib/visitor";

interface VisitorInfoCardProps {
    info: VisitorInfoType;
}

// Inline lucide-style SVG icons — no emoji anywhere.
const GlobeIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block shrink-0"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

const WifiIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block shrink-0"
        aria-hidden="true"
    >
        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
);

const HashIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block shrink-0"
        aria-hidden="true"
    >
        <line x1="4" y1="9" x2="20" y2="9" />
        <line x1="4" y1="15" x2="20" y2="15" />
        <line x1="10" y1="3" x2="8" y2="21" />
        <line x1="16" y1="3" x2="14" y2="21" />
    </svg>
);

const ClockIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="inline-block shrink-0"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);

/**
 * Visitor info block — replaces the hero subtitle + bio.
 *
 * Layout (4 lines, total height ≈ 7.5rem, matches original ~7.25rem):
 *   [flag] City, Country       ← hero-subtitle style (1.125rem)
 *   ─────────
 *   [wifi] ISP
 *   [hash] IP
 *   [clock] Timezone
 */
export function VisitorInfo({ info }: VisitorInfoCardProps) {
    const location = [info.city, info.country].filter(Boolean).join(", ");
    const flagUrl = info.countryCode
        ? `https://flagcdn.com/${info.countryCode.toLowerCase()}.svg`
        : null;

    return (
        <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            {/* Location — hero-subtitle style */}
            <p className="hero-subtitle mb-3 flex items-center gap-1.5">
                {flagUrl ? (
                    <img
                        src={flagUrl}
                        alt=""
                        className="inline-block w-5 h-[15px] rounded-sm object-cover bg-bg-card"
                        width={20}
                        height={15}
                        loading="lazy"
                    />
                ) : (
                    <GlobeIcon />
                )}
                <span>{location || "Unknown location"}</span>
            </p>

            {/* Divider */}
            <div className="border-t border-border/40 mb-3" />

            {/* Details — hero-bio style */}
            <div className="hero-bio space-y-1">
                {info.isp && (
                    <div className="flex items-center gap-2">
                        <WifiIcon />
                        <span>{info.isp}</span>
                    </div>
                )}
                {info.ip && (
                    <div className="flex items-center gap-2">
                        <HashIcon />
                        <span className="font-mono">{info.ip}</span>
                    </div>
                )}
                {info.timezone && (
                    <div className="flex items-center gap-2">
                        <ClockIcon />
                        <span>{info.timezone}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
