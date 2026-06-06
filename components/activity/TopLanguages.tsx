import { type Language } from "@/lib/languages";

interface TopLanguagesProps {
    languages: Language[];
}

export function TopLanguages({ languages }: TopLanguagesProps) {
    if (languages.length === 0) return null;

    return (
        <div className="top-languages">
            <div
                className="top-languages-bar"
                role="img"
                aria-label={`Top languages: ${languages
                    .map((l) => `${l.name} ${l.percentage}%`)
                    .join(", ")}`}
            >
                {languages.map((lang) => (
                    <div
                        key={lang.name}
                        className="top-languages-bar-segment"
                        style={{
                            flex: lang.percentage,
                            backgroundColor: lang.color,
                        }}
                        title={`${lang.name}: ${lang.percentage}%`}
                    />
                ))}
            </div>
            <div className="top-languages-legend">
                {languages.map((lang) => (
                    <span key={lang.name} className="top-languages-legend-item">
                        <span
                            className="top-languages-legend-dot"
                            style={{ backgroundColor: lang.color }}
                        />
                        {lang.name}
                    </span>
                ))}
            </div>
        </div>
    );
}
