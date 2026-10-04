"use client";

import {
  memo,
  useId,
  useMemo,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { THEMES } from "@/lib/themes";
import type { BookTheme } from "@/types/book";
import { ThemeSignature } from "./theme-signatures";

function subscribeVisibility(changed: () => void) {
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
}
const hiddenSnapshot = () => document.visibilityState === "hidden";
const serverSnapshot = () => false;

export const ThemeAtmosphere = memo(function ThemeAtmosphere({
  theme,
  editing,
  presentation,
  reducedMotion,
}: {
  theme: BookTheme;
  editing: boolean;
  presentation: boolean;
  reducedMotion: boolean;
}) {
  const signatureId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hidden = useSyncExternalStore(
    subscribeVisibility,
    hiddenSnapshot,
    serverSnapshot,
  );
  const atmosphere = THEMES[theme].atmosphere;
  const particles = useMemo(() => {
    const definition = THEMES[theme].atmosphere;
    const count = reducedMotion
      ? 0
      : editing
        ? Math.ceil(definition.count / 2)
        : definition.count;
    return Array.from({ length: count }, (_, index) => {
      const kind =
        definition.particle === "petal" && index % 4 === 0
          ? "sparkle"
          : definition.particle === "paper" && index % 4 === 0
            ? "petal"
            : definition.particle;
      const size =
        kind === "dust"
          ? 2 + (index % 3)
          : kind === "sparkle"
            ? 6
            : 8 + (index % 4);
      const sakuraPetal = theme === "campus" && kind === "petal";
      return {
        kind,
        style: {
          left: `${sakuraPetal ? 87 + ((index * 3) % 9) : index % 2 ? 94 - (index % 3) * 3 : 3 + (index % 3) * 3}%`,
          top: `${sakuraPetal ? 10 + ((index * 7) % 14) : 12 + ((index * 19) % 65)}%`,
          width: size,
          height:
            kind === "paper"
              ? size * 1.4
              : kind === "petal"
                ? size * 0.65
                : size,
          "--travel-x": `${sakuraPetal ? -12 : index % 2 ? -18 : 24}px`,
          "--travel-y":
            kind === "petal"
              ? "clamp(150px, 38vh, 340px)"
              : `${kind === "dust" ? -45 : 90}px`,
          "--particle-angle": `${((index * 29) % 90) - 35}deg`,
          "--drift-time": `${28 + ((index * 7) % 19)}s`,
          "--drift-delay": `${-((index * 11) % 37)}s`,
        } as CSSProperties,
      };
    });
  }, [theme, editing, reducedMotion]);

  return (
    <div
      className={`theme-atmosphere atmosphere-${theme}`}
      data-testid="theme-atmosphere"
      data-theme={theme}
      data-mode={
        editing ? "editing" : presentation ? "presentation" : "reading"
      }
      data-motion={reducedMotion ? "reduced" : "animated"}
      data-reduced-motion={reducedMotion}
      data-visibility={hidden ? "hidden" : "visible"}
      aria-hidden="true"
      style={
        {
          "--ambient-ink": atmosphere.ink,
          "--ambient-petal": atmosphere.petal,
        } as CSSProperties
      }
    >
      <div className="atmosphere-backdrop" />
      <div
        className={`atmosphere-accent accent-${atmosphere.accent} accent-left`}
        data-testid="theme-signature"
        data-signature={atmosphere.accent}
        data-variant="secondary"
      >
        <ThemeSignature
          kind={atmosphere.accent}
          variant="secondary"
          idPrefix={`${signatureId}-secondary`}
        />
      </div>
      <div
        className={`atmosphere-accent accent-${atmosphere.accent} accent-right`}
        data-testid="theme-signature"
        data-signature={atmosphere.accent}
        data-variant="primary"
      >
        <ThemeSignature
          kind={atmosphere.accent}
          variant="primary"
          idPrefix={`${signatureId}-primary`}
        />
      </div>
      {particles.map((particle, index) => (
        <span
          key={index}
          className={`atmosphere-particle particle-${particle.kind}`}
          data-testid="ambient-particle"
          style={particle.style}
        />
      ))}
    </div>
  );
});
