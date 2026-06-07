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
 * Visitor info block — 3 lines, sits below the slogan + divider.
 *
 *   [flag] You are visiting from: City, Country
 *   [wifi] ISP
 *   [hash] IP
 *
 * The label "You are visiting from:" is muted; the city/country is the
 * primary info (text-text-primary). The remaining lines inherit the
 * hero-bio muted color. The IANA timezone (e.g. "Australia/Sydney") is
 * intentionally omitted — it duplicates the city/country on line 1.
 */
export function VisitorInfo({ info }: VisitorInfoCardProps) {
    const location = [info.city, info.country].filter(Boolean).join(", ");
    const flagUrl = info.countryCode
        ? `https://flagcdn.com/${info.countryCode.toLowerCase()}.svg`
        : null;

    return (
        <div
            className="hero-bio animate-fade-up space-y-1"
            style={{ animationDelay: "1500ms" }}
        >
            {/* Line 1 — location with label */}
            <div className="flex items-center gap-1.5">
                {flagUrl ? (
                    <img
                        src={flagUrl}
                        alt=""
                        className="inline-block w-4 h-3 rounded-sm object-cover bg-bg-card shrink-0"
                        width={16}
                        height={12}
                        loading="lazy"
                    />
                ) : (
                    <GlobeIcon />
                )}
                <span>
                    You are visiting from:{" "}
                    <span className="text-text-primary">
                        {location || "Unknown"}
                    </span>
                </span>
            </div>

            {/* Line 2 — ISP */}
            {info.isp && (
                <div className="flex items-center gap-2">
                    <WifiIcon />
                    <span>{info.isp}</span>
                </div>
            )}

            {/* Line 3 — IP (timezone omitted; would duplicate the city/country on line 1) */}
            {info.ip && (
                <div className="flex items-center gap-2">
                    <HashIcon />
                    <span className="font-mono">{info.ip}</span>
                </div>
            )}
        </div>
    );
}
