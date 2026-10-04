import type { ThemePersonality } from "@/lib/themes";

type SignatureKind = ThemePersonality["atmosphere"]["accent"];
type Variant = "primary" | "secondary";

function Leaf({
  x,
  y,
  angle = 0,
  scale = 1,
}: {
  x: number;
  y: number;
  angle?: number;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`}>
      <path
        d="M0 0C-21-9-28-28-24-46C-3-37 8-18 0 0Z"
        fill="#9ca58a"
        fillOpacity="0.6"
        stroke="#7f8c72"
        strokeWidth="1.1"
      />
      <path
        d="M0 0-17-34M-9-17l-9-4M-13-26l2-9"
        fill="none"
        stroke="#7b8a70"
        strokeWidth="0.8"
        opacity="0.7"
      />
    </g>
  );
}

function SakuraBranch({ prefix }: { prefix: string }) {
  const petal = `${prefix}-sakura-petal`;
  const blossom = `${prefix}-sakura-blossom`;
  return (
    <>
      <defs>
        <linearGradient id={petal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e1aba9" />
          <stop offset="0.62" stopColor="#f8d8d1" />
          <stop offset="1" stopColor="#fff0dd" />
        </linearGradient>
        <g id={blossom}>
          {[0, 72, 144, 216, 288].map((angle) => (
            <path
              key={angle}
              d="M0 3C-10 0-17-13-10-23C-6-29-2-29 0-23C3-29 7-28 11-22C17-12 10 0 0 3Z"
              transform={`rotate(${angle})`}
              fill={`url(#${petal})`}
              stroke="#c79691"
              strokeWidth="0.7"
            />
          ))}
          <path
            d="M0 0-6-11M0 0l7-10M0 0l11 4M0 0l-1 12M0 0l-12 3"
            fill="none"
            stroke="#b38871"
            strokeWidth="0.7"
          />
          <g fill="#b58b64">
            <circle cx="-6" cy="-11" r="1.1" />
            <circle cx="7" cy="-10" r="1.1" />
            <circle cx="11" cy="4" r="1.1" />
            <circle cx="-1" cy="12" r="1.1" />
            <circle cx="-12" cy="3" r="1.1" />
          </g>
          <circle r="3.1" fill="#c09877" />
        </g>
      </defs>
      <g fill="#9a7760">
        <path d="M421-15C397 57 365 121 303 181C235 248 164 305 75 364L62 353C145 301 225 240 291 171C355 109 383 43 400-15Z" />
        <path d="M330 160C337 117 329 77 306 32L299 25C318 71 326 114 321 166Z" />
        <path d="M281 204C273 165 249 124 218 95L213 93C241 127 263 165 272 213Z" />
        <path d="M234 248C265 258 298 268 329 307L332 315C296 278 261 265 225 257Z" />
        <path d="M191 286C184 247 173 220 150 193L146 192C166 223 175 252 183 294Z" />
        <path d="M125 329C128 363 147 390 170 420L174 428C143 397 121 371 115 335Z" />
        <path d="M80 359C65 390 46 408 14 432L6 435C38 404 55 385 69 359Z" />
        <path d="M376 96C391 105 405 118 421 147L421 156C400 124 390 113 371 105Z" />
      </g>
      <g fill="none" stroke="#a7856a" strokeWidth="2" strokeLinecap="round">
        <path d="M307 41 332 22M305 54l-29-16M223 109l18-32M220 111l-27-8M152 202l14-29M148 201l-34-8M317 292l22-27M319 294l15 42M161 409l-27 23M21 425l5 24" />
      </g>
      <Leaf x={324} y={129} angle={-25} scale={0.65} />
      <Leaf x={286} y={185} angle={80} scale={0.8} />
      <Leaf x={186} y={280} angle={-22} scale={0.72} />
      <Leaf x={273} y={272} angle={116} scale={0.82} />
      <Leaf x={118} y={344} angle={205} scale={0.58} />
      <g fill="#c4918d" stroke="#b17f79" strokeWidth="0.7">
        <path d="M334 23c-10-9-6-18 0-22 10 7 10 15 0 22ZM274 39c-12-2-17-9-14-16 12 0 18 6 14 16ZM242 79c-6-11-3-19 4-21 8 9 6 16-4 21ZM165 176c-4-11 0-18 7-20 6 10 3 16-7 20ZM340 267c-2-11 4-18 11-18 4 11 0 17-11 18ZM135 433c-12-1-18 5-18 12 12 2 17-2 18-12Z" />
      </g>
      <g>
        <use
          href={`#${blossom}`}
          transform="translate(308 48) rotate(-13) scale(1.18)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(341 83) rotate(22) scale(.88)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(218 108) rotate(-18) scale(1.08)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(253 144) rotate(16) scale(.9)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(388 126) rotate(9) scale(1.05)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(151 199) rotate(20) scale(.92)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(188 230) rotate(-20) scale(1.12)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(320 287) rotate(-12) scale(1.18)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(348 325) rotate(18) scale(.78)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(132 330) rotate(14) scale(.95)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(90 362) rotate(-17) scale(1.04)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(166 417) rotate(-9) scale(.9)"
        />
        <use
          href={`#${blossom}`}
          transform="translate(34 415) rotate(16) scale(.83)"
        />
      </g>
    </>
  );
}

function DiaryNote() {
  return (
    <g transform="rotate(-8 190 340)">
      <path
        d="M39 188 274 181 282 463 270 459 255 465 241 460 227 466 215 461 202 467 186 462 173 467 160 461 144 467 127 462 112 467 98 462 80 468 64 462 46 468Z"
        fill="#f9f4df"
        stroke="#bdb797"
        strokeWidth="1.2"
      />
      <path
        d="M53 202h205M68 221v227M48 256h221M48 284h221M48 312h221M48 340h221M48 368h221M48 396h221M48 424h221"
        stroke="#a1ac9338"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="m91 178 104-9 4 33-105 9Z"
        fill="#c9caa5"
        fillOpacity="0.65"
        stroke="#aaae86"
        strokeOpacity="0.5"
      />
      <text
        x="89"
        y="255"
        fill="#8b8467"
        fontFamily='"Segoe Print", Georgia, cursive'
        fontSize="17"
      >
        a little spring
      </text>
      <path
        d="M91 279c14-7 18 6 27 0s19 7 28 0 17 6 25 0 18 3 29-2M91 307c12-8 17 6 25 0s17 5 24 0 18 6 30 0M91 337c11-6 15 5 26 0s17 5 30 0"
        stroke="#969074"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <g transform="translate(186 393) rotate(14)">
        <path
          d="M0 0c-14-7-19-29-7-37 7-6 13 1 13 11 7-16 22-15 26-3 4 13-13 27-32 29Z"
          fill="#e6cdc0"
          stroke="#af9481"
          strokeWidth="1"
        />
        <path d="m0 0-8 15M4-8 17-18" fill="none" stroke="#a9967e" />
      </g>
      <path
        d="m70 494 147-13 4 3-6 10-146 6ZM65 494l-12 5 16 1"
        fill="#909879"
        stroke="#79856a"
        strokeWidth="1"
      />
    </g>
  );
}

function WeddingFlowers({
  prefix,
  secondary,
}: {
  prefix: string;
  secondary: boolean;
}) {
  const ivory = `${prefix}-ivory-petal`;
  const blush = `${prefix}-blush-petal`;
  const flower = `${prefix}-wedding-flower`;
  return (
    <g className={secondary ? undefined : "wedding-composition"}>
      <defs>
        <radialGradient id={ivory} cx="50%" cy="70%" r="75%">
          <stop stopColor="#efe1c9" />
          <stop offset=".55" stopColor="#fff9e9" />
          <stop offset="1" stopColor="#e8d0c3" />
        </radialGradient>
        <radialGradient id={blush} cx="50%" cy="75%" r="80%">
          <stop stopColor="#f6e6d6" />
          <stop offset=".6" stopColor="#edd0c5" />
          <stop offset="1" stopColor="#cea79f" />
        </radialGradient>
        <g id={flower}>
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <path
              key={angle}
              d="M0 5C-21 8-30-9-22-25C-15-39-2-40 9-31C22-21 24-4 0 5Z"
              transform={`rotate(${angle})`}
              fill="inherit"
              stroke="#b89987"
              strokeWidth=".65"
            />
          ))}
          <path
            d="M-13-7c2-15 23-14 25 0 1 9-12 15-19 8-6-6-2-14 5-14 8 0 10 8 4 12M-19 4c7 17 30 17 38-1"
            stroke="#bb9b85"
            strokeWidth=".8"
            fill="none"
          />
          <g fill="#b59d73">
            <circle r="3.5" />
            <circle cx="-5" cy="4" r="1.4" />
            <circle cx="4" cy="-4" r="1.3" />
            <circle cx="5" cy="5" r="1.1" />
          </g>
        </g>
      </defs>
      <g fill="none" stroke="#8b977b" strokeWidth="1.6" strokeLinecap="round">
        {secondary ? (
          <path d="M21 550c65-103 112-181 204-257M80 455c-1-65 14-120 64-165M140 372c54 17 98 5 139-34M83 451c50 23 94 17 130-7" />
        ) : (
          <path d="M417-12c-11 108-31 204-90 298C266 383 171 480 80 553M374 189c-63-38-97-75-121-124M305 319c54 9 84-12 112-49M231 406c-39-23-58-49-70-93M158 483c42 22 70 21 109 4" />
        )}
      </g>
      {secondary ? (
        <>
          <Leaf x={63} y={482} angle={-15} scale={1.2} />
          <Leaf x={116} y={405} angle={102} scale={1.05} />
          <Leaf x={183} y={333} angle={-25} scale={1.25} />
          <Leaf x={222} y={368} angle={112} scale={0.9} />
          <use
            href={`#${flower}`}
            fill={`url(#${ivory})`}
            transform="translate(145 292) rotate(9) scale(1.4)"
          />
          <use
            href={`#${flower}`}
            fill={`url(#${blush})`}
            transform="translate(237 329) rotate(-12) scale(1.03)"
          />
          <use
            href={`#${flower}`}
            fill={`url(#${ivory})`}
            transform="translate(208 444) rotate(20) scale(.83)"
          />
        </>
      ) : (
        <>
          <Leaf x={385} y={159} angle={-29} scale={1.35} />
          <Leaf x={323} y={291} angle={106} scale={1.35} />
          <Leaf x={280} y={355} angle={-26} scale={1.4} />
          <Leaf x={203} y={430} angle={113} scale={1.25} />
          <Leaf x={114} y={525} angle={-34} scale={1.05} />
          <Leaf x={371} y={308} angle={122} scale={1.1} />
          <use
            href={`#${flower}`}
            fill={`url(#${ivory})`}
            transform="translate(274 94) rotate(14) scale(1.68)"
          />
          <use
            href={`#${flower}`}
            fill={`url(#${blush})`}
            transform="translate(374 233) rotate(-12) scale(1.37)"
          />
          <use
            href={`#${flower}`}
            fill={`url(#${ivory})`}
            transform="translate(176 326) rotate(-8) scale(1.45)"
          />
          <use
            href={`#${flower}`}
            fill={`url(#${blush})`}
            transform="translate(268 483) rotate(18) scale(.97)"
          />
          <path
            d="M348 39c-12-16-11-28-1-35 14 11 15 23 1 35ZM245 224c-12-8-17-22-9-30 15 4 19 19 9 30ZM131 411c-8-14-4-26 7-29 11 14 6 24-7 29Z"
            fill="#dbc0b1"
            stroke="#b7a387"
            strokeWidth="1"
          />
          <path
            d="m356 451 3-7 3 7-3 7-3-7ZM118 183h8M122 179v8"
            stroke="#b5a379"
            strokeWidth="1.2"
            fill="none"
            opacity=".75"
          />
        </>
      )}
    </g>
  );
}

function CafeScene({
  prefix,
  secondary,
}: {
  prefix: string;
  secondary: boolean;
}) {
  const glow = `${prefix}-lamp-glow`;
  const cone = `${prefix}-lamp-cone`;
  return secondary ? (
    <>
      <path
        d="M52 353V118c0-70 227-70 227 0v235H52Z"
        fill="#f4e6c3"
        fillOpacity=".2"
        stroke="#ac9171"
        strokeWidth="3"
      />
      <path
        d="M64 341V120c0-56 203-56 203 0v221H64ZM166 72v270M65 192h203"
        fill="none"
        stroke="#baa180"
        strokeWidth="1.5"
      />
      <path
        d="M47 354h238l7 14H39l8-14Z"
        fill="#b89c7b"
        fillOpacity=".55"
        stroke="#a18b70"
      />
      <path
        d="M70 269c40-31 58-20 95-36 50-19 72-10 100-23M76 306c25-16 58-7 90-12 43-10 60-6 99-25"
        fill="none"
        stroke="#b8aa8a"
        strokeWidth="1.4"
        opacity=".55"
      />
      <g transform="translate(140 411)">
        <ellipse cx="36" cy="49" rx="65" ry="8" fill="#b89f7a" opacity=".28" />
        <path
          d="M0 2h73l-7 37c-4 13-54 13-59 0L0 2ZM72 9c31-3 29 28-5 28"
          fill="#f5e7cc"
          stroke="#a18b6a"
          strokeWidth="1.7"
        />
        <ellipse
          cx="36"
          cy="2"
          rx="36"
          ry="5"
          fill="#ad8560"
          fillOpacity=".65"
          stroke="#9c8061"
        />
        <path
          className="atmosphere-steam"
          d="M22-18c-18-24 20-33 5-56"
          fill="none"
          stroke="#ab9273"
          strokeWidth="1.5"
        />
        <path
          className="atmosphere-steam steam-second"
          d="M45-16c-14-20 21-32 7-50"
          fill="none"
          stroke="#ab9273"
          strokeWidth="1.3"
        />
      </g>
    </>
  ) : (
    <>
      <defs>
        <radialGradient id={glow}>
          <stop stopColor="#efcf88" stopOpacity=".54" />
          <stop offset=".5" stopColor="#edcc88" stopOpacity=".18" />
          <stop offset="1" stopColor="#edcc88" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={cone} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#edc575" stopOpacity=".27" />
          <stop offset="1" stopColor="#f0dbaa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="cafe-light">
        <ellipse cx="253" cy="277" rx="166" ry="243" fill={`url(#${glow})`} />
        <path d="M211 149 77 560h343L294 149H211Z" fill={`url(#${cone})`} />
      </g>
      <g className="cafe-fixture">
        <path d="M252-8v101" stroke="#897158" strokeWidth="2" />
        <path
          d="M240 89h24l8 27h-40l8-27Z"
          fill="#a0855d"
          stroke="#816b50"
          strokeWidth="1.3"
        />
        <path
          d="M231 111h42c4 15 17 27 40 39H190c22-12 36-24 41-39Z"
          fill="#a58a63"
          stroke="#826a4e"
          strokeWidth="1.5"
        />
        <path d="M197 145h109" stroke="#d6bd83" strokeWidth="1.1" />
        <ellipse
          cx="252"
          cy="151"
          rx="62"
          ry="8"
          fill="#f5dfaa"
          stroke="#b99a69"
          strokeWidth="1.2"
        />
        <path
          d="M210 147c14-9 70-9 85 0"
          stroke="#fbedc4"
          strokeWidth="2"
          fill="none"
        />
      </g>
      <path
        d="M355 19h56v401M362 30h40v382M355 167h56M355 298h56"
        stroke="#ad9778"
        strokeWidth="1.2"
        fill="none"
        opacity=".45"
      />
    </>
  );
}

function VintageCollage({ secondary }: { secondary: boolean }) {
  return (
    <g className={secondary ? undefined : "vintage-composition"}>
      <g
        transform={
          secondary
            ? "translate(-8 90) rotate(-4 170 300) scale(.84)"
            : "translate(0 -70) rotate(6 245 250)"
        }
      >
        <path
          d="m116 124 271 12-8 350-16-7-14 5-18-8-19 4-14-7-18 5-16-6-18 4-16-7-17 5-18-7-18 3-19-6-18 4-16-6Z"
          fill="#e4d4b6"
          stroke="#b29b75"
          strokeWidth="1.1"
        />
        <path
          d="M144 164h185M142 191h190M140 218h182M138 245h194M136 272h188M134 299h190M132 326h190M130 353h190M128 380h192M126 407h197"
          stroke="#ae9b781d"
          fill="none"
        />
        <g transform="rotate(-13 225 279)">
          <rect
            x="53"
            y="182"
            width="321"
            height="209"
            rx="2"
            fill="#f4e8cf"
            stroke="#967d59"
            strokeWidth="1.4"
          />
          <rect
            x="64"
            y="192"
            width="299"
            height="188"
            rx="1"
            fill="none"
            stroke="#b9a788"
            strokeWidth=".7"
          />
          <text
            x="177"
            y="219"
            fill="#957c58"
            fontFamily="Georgia, serif"
            fontSize="13"
            letterSpacing="3"
          >
            POST CARD
          </text>
          <path
            d="M212 238v125M228 294h102M228 316h100M228 337h82"
            stroke="#af9b76"
            strokeWidth="1.2"
            fill="none"
          />
          <path
            d="M83 254c12-16 22 12 35-1s15 14 26 1 19 9 28-2M81 274c17-12 16 9 27 0s17 8 31-1M81 293c11-11 21 9 32 1s13 9 23 0 19 7 30-1M81 314c16-13 19 8 28 0s20 8 34 0M81 336c15-7 20 6 35-3"
            stroke="#947a58"
            strokeWidth="1.6"
            strokeLinecap="round"
            fill="none"
            opacity=".7"
          />
          <path
            d="M293 234h45v43h-45V234Z"
            fill="#c3c9ab"
            stroke="#8f9a7d"
            strokeWidth="1.4"
            strokeDasharray="2 3"
          />
          <path
            d="M300 266c5-15 8-22 16-22s12 8 16 22h-32ZM315 245v21"
            stroke="#7d886e"
            strokeWidth="1"
            fill="none"
          />
          <circle
            cx="282"
            cy="252"
            r="28"
            fill="none"
            stroke="#9c8664"
            strokeWidth="1"
          />
          <circle
            cx="282"
            cy="252"
            r="24"
            fill="none"
            stroke="#9c8664"
            strokeWidth=".7"
          />
          <path
            d="M260 247h126M260 256h126M260 265h126"
            stroke="#9e8e71"
            strokeWidth=".8"
            strokeDasharray="8 4 15 3"
            fill="none"
          />
        </g>
        <g transform="rotate(10 109 407)">
          <path
            d="M24 330h145v174H24Z"
            fill="#f3e8d2"
            stroke="#aa9776"
            strokeWidth="1.2"
          />
          <path d="M35 341h123v126H35Z" fill="#bbb6a0" />
          <path
            d="m36 433 36-57 26 32 24-41 36 66v34H36Z"
            fill="#8e9882"
            opacity=".7"
          />
          <path
            d="M36 443c33-13 65-11 122-2"
            stroke="#d9d3ba"
            strokeWidth="3"
            fill="none"
          />
          <path d="M45 485h65" stroke="#b8a480" strokeWidth="1.1" fill="none" />
        </g>
        <path
          d="m104 160 120-15 5 37-120 17Z"
          fill="#b8a176"
          fillOpacity=".64"
          stroke="#a79165"
          strokeOpacity=".6"
        />
        <path
          d="m104 159 3 7 5-5 5 5 4-5M211 145l-2 7 5 2-3 6 6 4"
          stroke="#f7ebd18c"
          fill="none"
        />
      </g>
    </g>
  );
}

function IvoryEmboss({ secondary }: { secondary: boolean }) {
  return (
    <g
      fill="none"
      stroke="#b9b19d"
      strokeWidth="1.2"
      opacity=".76"
      transform={secondary ? "rotate(180 210 280)" : undefined}
    >
      <path d="M410 22H207M397 35H220M397 35v206M410 22v225" />
      <path d="M219 35c35 0 44 20 43 48 26-3 44 7 47 32 24 1 45 19 49 45 23 0 39 20 39 44M229 35c24 0 35 11 35 33M397 185c-15 0-27-9-29-26" />
      <path d="M289 92c8-20 23-15 28-3 6 15-5 27-13 22-8-5-4-15 3-14M359 120c-21-9-19-25-9-30 15-9 33 4 27 14-5 8-18 4-15-4" />
      <path
        d="m328 148 6-10 6 10-6 10-6-10ZM378 50l8 8-8 8-8-8 8-8Z"
        fill="#eee8da"
      />
      <path d="M220 35v6M397 240h-6" stroke="#fffaf0" strokeWidth="2.6" />
    </g>
  );
}

const ARTWORK: Record<SignatureKind, [string, string]> = {
  steam: ["cafe-lamp", "cafe-window"],
  postcard: ["vintage-collage", "vintage-postmark"],
  serif: ["ivory-emboss", "ivory-linework"],
  floral: ["wedding-floral", "wedding-sprig"],
  notebook: ["sakura-branch", "diary-note"],
};

export function ThemeSignature({
  kind,
  variant,
  idPrefix,
}: {
  kind: SignatureKind;
  variant: Variant;
  idPrefix: string;
}) {
  const secondary = variant === "secondary";
  return (
    <svg
      className="signature-art"
      data-artwork={ARTWORK[kind][secondary ? 1 : 0]}
      viewBox="0 0 420 560"
      preserveAspectRatio={secondary ? "xMidYMid meet" : "xMaxYMin slice"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: "none" }}
    >
      {kind === "notebook" &&
        (secondary ? <DiaryNote /> : <SakuraBranch prefix={idPrefix} />)}
      {kind === "floral" && (
        <WeddingFlowers prefix={idPrefix} secondary={secondary} />
      )}
      {kind === "steam" && (
        <CafeScene prefix={idPrefix} secondary={secondary} />
      )}
      {kind === "postcard" && <VintageCollage secondary={secondary} />}
      {kind === "serif" && <IvoryEmboss secondary={secondary} />}
    </svg>
  );
}
