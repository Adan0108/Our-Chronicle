"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Headphones,
  LoaderCircle,
  Pause,
  Play,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import type { BookAudio } from "@/types/book";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const NEW_TRACK_VOLUME = 0.4;

type Props = {
  audio?: BookAudio;
  editing: boolean;
  disabled?: boolean;
  onChange: (audio: BookAudio | undefined) => void;
  onBusyChange?: (busy: boolean) => void;
};

export function BookAmbience({
  audio,
  editing,
  disabled = false,
  onChange,
  onBusyChange,
}: Props) {
  const popoverId = useId();
  const volumeId = `${popoverId}-volume`;
  const mediaRef = useRef<HTMLAudioElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uploadingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [playback, setPlayback] = useState({ filename: "", active: false });
  const playing = playback.filename === audio?.filename && playback.active;
  const blocked = disabled || uploading;

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = audio?.volume ?? NEW_TRACK_VOLUME;
    media.loop = audio?.loop ?? true;
  }, [audio?.filename, audio?.volume, audio?.loop]);

  useEffect(() => {
    const media = mediaRef.current;
    // Replacing/removing a track pauses the previous element. A new source
    // deliberately waits for another explicit Play gesture.
    return () => media?.pause();
  }, [audio?.filename]);

  const stopPlayback = (filename: string) => {
    setPlayback((previous) =>
      previous.filename === filename
        ? { ...previous, active: false }
        : previous,
    );
  };

  const showPlaybackError = (message: string) => {
    setError(message);
    const popover = popoverRef.current;
    if (popover && !popover.matches(":popover-open")) popover.showPopover();
  };

  const togglePlayback = async () => {
    const media = mediaRef.current;
    if (!media || !audio || blocked) return;
    setError("");
    if (!media.paused) media.pause();
    else {
      try {
        if (media.error) media.load();
        await media.play();
      } catch (cause) {
        // Pause or replacement can intentionally interrupt a pending Play.
        if (
          media !== mediaRef.current ||
          (cause instanceof DOMException && cause.name === "AbortError")
        )
          return;
        showPlaybackError(
          "This track could not play. Try another MP3, WAV, or Ogg file.",
        );
      }
    }
  };

  const upload = async (file: File) => {
    if (uploadingRef.current || disabled) return;
    setError("");
    if (!/\.(?:mp3|wav|ogg)$/i.test(file.name)) {
      setError("Choose an MP3, WAV, or Ogg audio file.");
      return;
    }
    if (!file.size || file.size > MAX_AUDIO_BYTES) {
      setError("Choose a non-empty audio file smaller than 20 MB.");
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    onBusyChange?.(true);
    try {
      const form = new FormData();
      form.append("audio", file);
      const response = await fetch("/api/audio", {
        method: "POST",
        body: form,
      });
      const result: { filename?: string; error?: string } =
        await response.json();
      if (!response.ok || !result.filename)
        throw new Error(
          result.error ?? "This audio file could not be uploaded.",
        );
      const title = (file.name.split(/[/\\]/).at(-1) ?? file.name)
        .replace(/\.(?:mp3|wav|ogg)$/i, "")
        .trim()
        .slice(0, 120);
      onChange({
        filename: result.filename,
        title: title || "My ambience",
        // Every newly chosen track starts gently, including replacements.
        // Existing saved settings are never changed merely by loading a book.
        volume: NEW_TRACK_VOLUME,
        loop: audio?.loop ?? true,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The audio could not be uploaded.",
      );
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div className="ambience-control">
      {audio && (
        <audio
          key={audio.filename}
          ref={mediaRef}
          src={`/api/audio/${audio.filename}`}
          preload="none"
          loop={audio.loop}
          data-testid="ambience-audio"
          onPlay={() => setPlayback({ filename: audio.filename, active: true })}
          onPause={() => stopPlayback(audio.filename)}
          onEnded={() => stopPlayback(audio.filename)}
          onError={(event) => {
            if (event.currentTarget !== mediaRef.current) return;
            stopPlayback(audio.filename);
            showPlaybackError(
              "This track could not be read. Choose another audio file.",
            );
          }}
        />
      )}
      <div
        className={`ambience-toolbar ${playing ? "ambience-playing" : ""}`}
        role="group"
        aria-label="Music controls"
      >
        <button
          ref={triggerRef}
          className="ambience-trigger"
          popoverTarget={popoverId}
          aria-label="Music settings"
          aria-expanded={open}
          aria-controls={popoverId}
          title={
            audio ? `Music settings: ${audio.title}` : "Add music or ambience"
          }
          disabled={blocked}
        >
          <Headphones size={16} aria-hidden="true" />
          <span className="ambience-summary">
            <span className="ambience-label">Music</span>
            <span
              className="ambience-state"
              data-testid="music-playback-status"
              aria-live="polite"
              aria-atomic="true"
            >
              {!audio ? "Not configured" : playing ? "Playing" : "Paused"}
            </span>
          </span>
        </button>
        <button
          className="ambience-quick-play"
          aria-label={playing ? "Pause music" : "Play music"}
          title={
            !audio
              ? "Add a track in Music settings first"
              : playing
                ? "Pause music"
                : "Play music"
          }
          disabled={!audio || blocked}
          onClick={() => void togglePlayback()}
        >
          {playing ? (
            <Pause size={14} aria-hidden="true" />
          ) : (
            <Play size={14} aria-hidden="true" />
          )}
          <span>{playing ? "Pause" : "Play"}</span>
        </button>
      </div>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="ambience-popover"
        role="dialog"
        aria-label="Music and ambience"
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <div className="ambience-heading">
          <h2>Music &amp; ambience</h2>
          <button
            aria-label="Close ambience"
            onClick={() => {
              popoverRef.current?.hidePopover();
              triggerRef.current?.focus({ preventScroll: true });
            }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        {audio ? (
          <>
            <p className="ambience-track-title" title={audio.title}>
              {audio.title}
            </p>
            <button
              className="secondary-button ambience-play"
              aria-label={playing ? "Pause ambience" : "Play ambience"}
              onClick={() => void togglePlayback()}
              disabled={blocked}
            >
              {playing ? <Pause size={15} /> : <Play size={15} />}
              {playing ? "Pause" : "Play"}
            </button>
            <label className="ambience-volume">
              <Volume2 size={14} aria-hidden="true" /> Volume
              <input
                id={volumeId}
                type="range"
                aria-label="Ambience volume"
                min={0}
                max={100}
                step={1}
                value={Math.round(audio.volume * 100)}
                aria-valuetext={`${Math.round(audio.volume * 100)}%`}
                disabled={blocked}
                onChange={(event) => {
                  const volume = Number(event.currentTarget.value) / 100;
                  if (mediaRef.current) mediaRef.current.volume = volume;
                  onChange({
                    ...audio,
                    volume,
                  });
                }}
              />
              <output htmlFor={volumeId}>
                {Math.round(audio.volume * 100)}%
              </output>
            </label>
            {editing && (
              <label className="ambience-loop">
                <input
                  type="checkbox"
                  aria-label="Loop ambience"
                  checked={audio.loop}
                  disabled={blocked}
                  onChange={(event) =>
                    onChange({ ...audio, loop: event.currentTarget.checked })
                  }
                />
                Repeat this track
              </label>
            )}
          </>
        ) : (
          <p className="ambience-empty">
            {editing
              ? "Upload a local track to accompany your memories."
              : "Choose Edit scrapbook to add a local track to your book."}{" "}
            Playback starts only when you choose Play.
          </p>
        )}
        {editing && (
          <div className="ambience-settings">
            <label
              className={`secondary-button ambience-upload ${blocked ? "disabled" : ""}`}
            >
              {uploading ? (
                <LoaderCircle size={14} className="spinning" />
              ) : (
                <Upload size={14} />
              )}
              {audio ? "Replace audio" : "Upload audio"}
              <input
                type="file"
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                aria-label={audio ? "Replace audio" : "Upload audio"}
                disabled={blocked}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
            {audio && (
              <button
                className="danger-button"
                aria-label="Remove audio"
                disabled={blocked}
                onClick={() => {
                  mediaRef.current?.pause();
                  setError("");
                  onChange(undefined);
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> Remove audio
              </button>
            )}
            <p className="field-hint">
              MP3, WAV, or Ogg, up to 20 MB. New tracks start at 40% volume.
              Saved with your book.
            </p>
          </div>
        )}
        {uploading && (
          <p className="field-hint" aria-live="polite">
            Adding your audio…
          </p>
        )}
        {error && (
          <p className="ambience-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
