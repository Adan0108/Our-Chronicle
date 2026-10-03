"use client";
import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
export function DeletePageDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className="confirm-dialog"
      aria-labelledby="delete-title"
      onCancel={onCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <h2 id="delete-title">Remove this page?</h2>
      <p>
        “{title}” and its elements will be removed from your book. You can undo
        this during your current editing session.
      </p>
      <div>
        <button autoFocus className="secondary-button" onClick={onCancel}>
          <ArrowLeft size={14} />
          Keep page
        </button>
        <button className="primary-button delete-confirm" onClick={onConfirm}>
          Delete page
        </button>
      </div>
    </dialog>
  );
}
