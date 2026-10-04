"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { DECORATIONS } from "@/lib/decorations";
import { StickerArt } from "@/components/book/sticker";
import type { StickerAsset } from "@/types/book";

export function DecorationDialog({
  onCancel,
  onChoose,
  onUpload,
}: {
  onCancel: () => void;
  onChoose: (asset: StickerAsset) => void;
  onUpload: (file: File) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  const cancel = () => {
    dialogRef.current?.close();
    onCancel();
  };

  return (
    <dialog
      ref={dialogRef}
      className="decoration-dialog"
      aria-labelledby="decoration-dialog-title"
      aria-describedby="decoration-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <h2 id="decoration-dialog-title">Add a decoration</h2>
      <p id="decoration-dialog-description" className="field-hint">
        A little paper, ink, or something pressed between the pages.
      </p>
      <div className="decoration-options">
        {(
          Object.entries(DECORATIONS) as [
            StickerAsset,
            (typeof DECORATIONS)[StickerAsset],
          ][]
        ).map(([asset, preset]) => (
          <button
            key={asset}
            className="decoration-option"
            aria-label={`Add ${preset.label.toLowerCase()}`}
            onClick={() => {
              dialogRef.current?.close();
              onChoose(asset);
            }}
          >
            <span className="decoration-preview" aria-hidden="true">
              <StickerArt
                asset={asset}
                color={preset.color}
                label={asset === "date-label" ? "A day to remember" : undefined}
              />
            </span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
      <label className="secondary-button custom-decoration-upload">
        <Upload size={14} aria-hidden="true" /> Upload your own decoration
        <input
          type="file"
          accept="image/png,image/webp"
          aria-label="Upload decoration"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setError("");
            if (!["image/png", "image/webp"].includes(file.type)) {
              setError("Choose a transparent PNG or WebP image.");
              return;
            }
            if (file.size > 10 * 1024 * 1024) {
              setError("Choose a decoration smaller than 10 MB.");
              return;
            }
            dialogRef.current?.close();
            onUpload(file);
          }}
        />
      </label>
      <p className="field-hint">
        PNG or WebP, up to 10 MB. Transparent pixels stay transparent. You can
        move, resize, rotate, and layer every decoration.
      </p>
      {error && (
        <p className="decoration-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="secondary-button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
