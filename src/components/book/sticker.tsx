import type { ReactNode } from "react";
import type { StickerAsset } from "@/types/book";
import { DECORATIONS } from "@/lib/decorations";

// Original local vector artwork. No external requests, fonts, filters, or
// repeating SVG IDs: many copies can share a page without extra rendering work.
export function StickerArt({
  asset,
  color,
  label,
}: {
  asset: StickerAsset;
  color?: string;
  label?: string;
}) {
  let art: ReactNode;
  let viewBox = "0 0 160 120";
  switch (asset) {
    case "masking-tape":
      viewBox = "0 0 180 52";
      art = (
        <>
          <path
            d="m5 6 16-3 17 3 18-3 19 2 17-2 19 3 17-3 25 3 5 9-5 7 5 8-5 8 2 8-19-2-16 3-20-2-18 2-17-3-19 3-18-2-17 2-15-3 2-8-4-7 4-8-3-9Z"
            fill="currentColor"
            fillOpacity=".72"
          />
          <path
            d="m20 5-6 40M43 5l-6 42M66 5l-6 40M89 5l-6 41M112 5l-6 40M135 5l-6 40M158 5l-6 40"
            stroke="#fff9e7"
            strokeWidth="3"
            opacity=".17"
          />
        </>
      );
      break;
    case "paper-tape":
      viewBox = "0 0 180 52";
      art = (
        <>
          <path
            d="M6 5 27 4 48 6 71 4 92 6 115 4 140 5 171 4 175 14 172 24 176 34 173 46 147 47 123 45 99 48 76 46 52 48 29 46 7 47 5 36 8 26 4 15Z"
            fill="currentColor"
            fillOpacity=".65"
          />
          <path
            d="M12 13h153M12 39h153"
            stroke="#fffdf3"
            opacity=".38"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
          <path
            d="m24 22 4 4-4 4m24-8 4 4-4 4m24-8 4 4-4 4m24-8 4 4-4 4m24-8 4 4-4 4m24-8 4 4-4 4"
            fill="none"
            stroke="#faf3df"
            strokeWidth="2"
            opacity=".65"
          />
        </>
      );
      break;
    case "heart":
      viewBox = "0 0 100 100";
      art = (
        <>
          <path
            d="M50 86C35 74 11 59 12 36c1-22 25-25 38-7C64 10 88 14 88 37c0 22-25 39-38 49Z"
            fill="currentColor"
            fillOpacity=".22"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M24 38c0-7 5-12 11-11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            opacity=".65"
          />
        </>
      );
      break;
    case "star":
      viewBox = "0 0 100 100";
      art = (
        <path
          d="m51 8 11 28 29 2-22 19 7 30-26-16-26 17 7-31L8 39l31-3Z"
          fill="currentColor"
          fillOpacity=".27"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      );
      break;
    case "sparkles":
      viewBox = "0 0 120 110";
      art = (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        >
          <path d="m48 16 8 28 25 8-25 8-8 29-8-29-25-8 25-8Z" />
          <path d="m94 5 4 15 14 4-14 5-4 15-5-15-14-5 14-4Z" />
          <path d="m92 73 3 10 9 3-9 3-3 11-3-11-10-3 10-3Z" />
          <path d="M12 17h5m-2-2v5M65 99h5m-2-2v5" />
        </g>
      );
      break;
    case "arrow":
      viewBox = "0 0 180 70";
      art = (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 55c22-30 52-39 73-29 30 15-20 42-22 16-1-14 26-25 100-19" />
          <path d="m147 9 17 15-20 10" />
        </g>
      );
      break;
    case "flower":
      viewBox = "0 0 90 160";
      art = (
        <>
          <path
            d="M40 150c4-32 6-63 5-97M44 113c-15-1-21-14-20-27 12 5 18 12 20 27ZM43 131c18-1 25-11 23-24-14 5-20 14-23 24Z"
            fill="#8c9574"
            fillOpacity=".62"
            stroke="#788363"
            strokeWidth="1.5"
          />
          <g
            transform="translate(45 42)"
            fill="currentColor"
            fillOpacity=".57"
            stroke="currentColor"
            strokeWidth=".8"
          >
            <ellipse cy="-14" rx="11" ry="21" />
            <ellipse cy="-14" rx="11" ry="21" transform="rotate(72)" />
            <ellipse cy="-14" rx="11" ry="21" transform="rotate(144)" />
            <ellipse cy="-14" rx="11" ry="21" transform="rotate(216)" />
            <ellipse cy="-14" rx="11" ry="21" transform="rotate(288)" />
            <circle r="8" fill="#beaa76" fillOpacity=".85" stroke="none" />
          </g>
        </>
      );
      break;
    case "leaf":
      viewBox = "0 0 90 160";
      art = (
        <g
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="currentColor"
          fillOpacity=".42"
        >
          <path d="M43 150c0-51 3-85 13-135" fill="none" strokeWidth="2" />
          <path d="M46 115C23 115 14 96 15 80c20 4 29 15 31 35ZM48 90C67 91 78 75 79 61c-19 1-29 11-31 29ZM50 69C29 68 22 55 25 39c15 5 23 12 25 30ZM54 48C71 45 77 31 75 17 61 23 55 34 54 48Z" />
        </g>
      );
      break;
    case "coffee":
      viewBox = "0 0 130 120";
      art = (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M27 46h62l-5 39c-2 16-48 18-52 0Z"
            fill="currentColor"
            fillOpacity=".1"
          />
          <path d="M89 54c27-8 33 21-3 23M18 98c22 12 68 12 87-1M38 40c-14-14 14-15 2-29M58 38c-14-14 13-14 3-30M78 40c-14-14 13-15 2-29" />
          <path d="M43 62c10 5 24 5 34 0" strokeWidth="1.3" opacity=".6" />
        </g>
      );
      break;
    case "handwritten":
      viewBox = "0 0 180 80";
      art = (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 42c20-25 37-13 21-2-17 12-15 13 2 11 27-4 48-18 41-18-10 0-28 24-7 20 33-7 51-31 43-31-12 0-30 29-4 27l35-7" />
          <path
            d="m153 28 7 5 8-7M160 33l-2 14M38 64c37-8 65-5 91-8"
            opacity=".7"
          />
        </g>
      );
      break;
    case "date-label":
      viewBox = "0 0 180 70";
      art = (
        <>
          <path
            d="M7 8 171 6l4 12-3 12 3 13-4 18L8 63l-3-14 3-14-3-13Z"
            fill="#f3e9d3"
            stroke="currentColor"
            strokeWidth="1"
            strokeOpacity=".35"
          />
          <path
            d="M17 16h147v37H17Z"
            fill="none"
            stroke="currentColor"
            strokeOpacity=".55"
            strokeDasharray="2 3"
          />
          <text
            x="90"
            y="39"
            textAnchor="middle"
            fill="currentColor"
            fontFamily="Georgia, serif"
            fontStyle="italic"
            fontSize={(label?.length ?? 0) > 24 ? 9 : 12}
            textLength={(label?.length ?? 0) > 16 ? 140 : undefined}
            lengthAdjust="spacingAndGlyphs"
          >
            {label || "A day to remember"}
          </text>
        </>
      );
      break;
    case "paper-scrap":
      viewBox = "0 0 180 130";
      art = (
        <>
          <path
            d="m9 10 18-3 16 3 19-2 16 3 19-3 18 2 18-3 19 3 18-1-3 18 3 17-2 17 3 18-4 18 2 19-20-3-18 3-17-2-18 3-19-2-17 3-18-3-20 2 3-18-4-17 3-19-2-17Z"
            fill="currentColor"
            fillOpacity=".85"
          />
          <path
            d="M23 35h131M23 55h130M23 75h132M23 95h97"
            stroke="#968667"
            strokeOpacity=".18"
            strokeWidth="1"
          />
        </>
      );
      break;
  }
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      style={{ color: color ?? DECORATIONS[asset].color }}
      aria-hidden="true"
      focusable="false"
    >
      {art}
    </svg>
  );
}
