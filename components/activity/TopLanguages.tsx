import { type Language } from "@/lib/languages";

interface TopLanguagesProps {
  languages: Language[];
}

const SIZE = 180;
const STROKE_WIDTH = 22;
const CENTER = SIZE / 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TopLanguages({ languages }: TopLanguagesProps) {
  if (languages.length === 0) return null;

  // Compute segment descriptors. We offset each segment to its midpoint so
  // the visual gap between segments lands exactly at the end of one arc /
  // start of the next.
  let cumulativePct = 0;
  const segments = languages.map((lang) => {
    const dashLength = (lang.percentage / 100) * CIRCUMFERENCE;
    const gapLength = CIRCUMFERENCE - dashLength;
    const offset = -((cumulativePct + lang.percentage / 2) / 100) * CIRCUMFERENCE;
    cumulativePct += lang.percentage;
    return {
      ...lang,
      dashArray: `${dashLength} ${gapLength}`,
      dashOffset: offset,
    };
  });

  const top = segments[0];

  return (
    <div className="top-languages">
      <div className="top-languages-donut">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label={`Top languages: ${segments.map((s) => `${s.name} ${s.percentage}%`).join(", ")}`}
        >
          <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={STROKE_WIDTH}
            />
            {segments.map((seg) => (
              <circle
                key={seg.name}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={seg.color}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
              />
            ))}
          </g>
          <text
            x={CENTER}
            y={CENTER - 2}
            textAnchor="middle"
            className="donut-center-name"
          >
            {top.name}
          </text>
          <text
            x={CENTER}
            y={CENTER + 18}
            textAnchor="middle"
            className="donut-center-label"
          >
            TOP
          </text>
        </svg>
      </div>

      <div className="top-languages-legend">
        {segments.map((lang) => (
          <div key={lang.name} className="top-languages-row">
            <span
              className="top-languages-swatch"
              style={{ backgroundColor: lang.color }}
            />
            <span className="top-languages-name">{lang.name}</span>
            <span className="top-languages-bar">
              <span
                className="top-languages-bar-fill"
                style={{
                  width: `${lang.percentage}%`,
                  backgroundColor: lang.color,
                }}
              />
            </span>
            <span className="top-languages-pct">{lang.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
