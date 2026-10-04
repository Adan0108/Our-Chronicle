"use client";

import { useCallback, useRef } from "react";
import { ImagePlus, Sparkles, X } from "lucide-react";

export function ImageImportDialog({
  files,
  onChoose,
  onCancel,
}: {
  files: File[];
  onChoose: (decoration: boolean) => void;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openDialog = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return;
    dialogRef.current = dialog;
    dialog.showModal();
    return () => {
      dialog.close();
      dialogRef.current = null;
    };
  }, []);
  return (
    <dialog
      ref={openDialog}
      className="image-import-dialog"
      aria-labelledby="image-import-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <button
        className="dialog-close"
        aria-label="Cancel adding images"
        onClick={onCancel}
      >
        <X size={16} />
      </button>
      <h2 id="image-import-title">Add images</h2>
      <p>
        {files.length === 1 ? files[0].name : `${files.length} images`} — choose
        how to keep them.
      </p>
      <div className="image-import-options">
        <button
          className="secondary-button"
          aria-label="Add as photos"
          onClick={() => onChoose(false)}
        >
          <ImagePlus size={20} /> Add as photos
          <small>A paper frame and caption, both editable.</small>
        </button>
        <button
          className="secondary-button"
          aria-label="Add as decorations"
          onClick={() => onChoose(true)}
        >
          <Sparkles size={20} /> Add as decorations
          <small>No frame. Transparent areas stay transparent.</small>
        </button>
      </div>
      <p className="field-hint">
        Images stay editable. You can change this choice later.
      </p>
    </dialog>
  );
}
