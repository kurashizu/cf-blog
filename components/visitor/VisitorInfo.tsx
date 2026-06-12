import { type VisitorInfo as VisitorInfoType } from "@/lib/visitor";

interface VisitorInfoCardProps {
    info: VisitorInfoType;
}

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

/**
 * Visitor info block — 3 text lines, no emoji or flag images.
 *
 *   Your IP info:
 *   Neptune Internet · Sydney, Australia
 *   [#] 2401:dc20:...
 *
 * ISP and region are joined on line 2 with " · " so the region info
 * isn't duplicated by the IANA timezone identifier.
 */
export function VisitorInfo({ info }: VisitorInfoCardProps) {
    const location = [info.city, info.country].filter(Boolean).join(", ");
    const ispAndRegion = [info.isp, location].filter(Boolean).join(" · ");

    return (
        <div
            className="hero-bio animate-fade-up space-y-1"
            style={{ animationDelay: "1500ms" }}
        >
            <div>Your IP info:</div>
            {ispAndRegion && <div>{ispAndRegion}</div>}
            {info.ip && (
                <div className="flex items-center gap-2">
                    <HashIcon />
                    <span className="font-mono">{info.ip}</span>
                </div>
            )}
        </div>
    );
}
