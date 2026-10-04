"use client";

import { useId, useRef, useState } from "react";
import { Wind, X } from "lucide-react";

export type MotionSettingsProps = {
  userReduced: boolean;
  systemReduced: boolean;
  reducedMotion: boolean;
  onChange: (reduced: boolean) => void;
};

export function MotionSettings({
  userReduced,
  systemReduced,
  reducedMotion,
  onChange,
}: MotionSettingsProps) {
  const popoverId = useId();
  const descriptionId = `${popoverId}-description`;
  const systemId = `${popoverId}-system`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="motion-settings">
      <button
        ref={triggerRef}
        className="motion-settings-button"
        aria-label="Motion settings"
        title="Motion settings"
        popoverTarget={popoverId}
        aria-controls={popoverId}
        aria-expanded={open}
        data-reduced-motion={reducedMotion}
      >
        <Wind size={16} strokeWidth={1.6} aria-hidden="true" />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="motion-settings-popover"
        role="dialog"
        aria-label="Motion settings"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <div className="motion-settings-heading">
          <h2>A quieter reading experience</h2>
          <button
            aria-label="Close motion settings"
            onClick={() => {
              popoverRef.current?.hidePopover();
              triggerRef.current?.focus({ preventScroll: true });
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <label className="motion-settings-toggle">
          <span>Reduce motion</span>
          <input
            type="checkbox"
            aria-label="Reduce motion"
            checked={userReduced}
            aria-describedby={`${descriptionId}${systemReduced ? ` ${systemId}` : ""}`}
            onChange={(event) => onChange(event.currentTarget.checked)}
          />
        </label>
        <p id={descriptionId}>
          Quiet decorative movement and shorten color transitions. Native book
          turns and editing remain available.
        </p>
        {systemReduced && (
          <p id={systemId} className="motion-system-note">
            Your device requests reduced motion. It stays on here even when this
            switch is off.
          </p>
        )}
        <p className="motion-settings-local">
          This browser only. This preference is separate from your book and
          exports.
        </p>
      </div>
    </div>
  );
}
