"use client";
import { useEffect, useRef } from "react";
import { BookOpen, Image, Images, LayoutGrid } from "lucide-react";
import type { PageTemplate } from "@/types/book";

const templates = [
  {
    id: "journal",
    name: "Journal",
    description: "A heading and room for your words.",
    icon: BookOpen,
  },
  {
    id: "single-photo",
    name: "Single photo",
    description: "One photograph with a personal note.",
    icon: Image,
  },
  {
    id: "two-photos",
    name: "Two photos",
    description: "A pair of memories on one page.",
    icon: Images,
  },
  {
    id: "collage",
    name: "Collage",
    description: "Three photos, a little tilt, and a note.",
    icon: LayoutGrid,
  },
] as const;

export function TemplateDialog({
  onCancel,
  onChoose,
}: {
  onCancel: () => void;
  onChoose: (template: PageTemplate) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
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
      className="template-dialog"
      aria-labelledby="template-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <h2 id="template-dialog-title">Start a new page</h2>
      <p className="field-hint">
        A starting point for your own memories. Every element can be edited,
        replaced, or moved.
      </p>
      <div className="template-options">
        {templates.map(({ id, name, description, icon: Icon }) => (
          <button
            key={id}
            className="template-option"
            aria-label={`${name} template`}
            onClick={() => {
              dialogRef.current?.close();
              onChoose(id);
            }}
          >
            <span
              className={`template-swatch template-${id}`}
              aria-hidden="true"
            >
              <Icon size={26} />
            </span>
            <span>
              <strong>{name}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="secondary-button" onClick={cancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
}
