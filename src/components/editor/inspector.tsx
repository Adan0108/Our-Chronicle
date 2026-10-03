"use client";
import {
  ImagePlus,
  Type,
  Trash2,
  Upload,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import type { Book, BookPage, BookElement } from "@/types/book";

type Props = {
  book: Book;
  page: BookPage;
  element?: BookElement;
  busy: boolean;
  onBookChange: (changes: Partial<Book>) => void;
  onPageChange: (changes: Partial<BookPage>) => void;
  onElementChange: (changes: Partial<BookElement>) => void;
  onAddText: () => void;
  onUpload: (file: File, replace?: boolean) => void;
  onDeleteElement: () => void;
  onAddPage: () => void;
  onDeletePage: () => void;
};
export function Inspector({
  book,
  page,
  element,
  busy,
  onBookChange,
  onPageChange,
  onElementChange,
  onAddText,
  onUpload,
  onDeleteElement,
  onAddPage,
  onDeletePage,
}: Props) {
  return (
    <aside className="inspector" aria-label="Scrapbook editor">
      <div className="inspector-heading">
        <SlidersHorizontal size={15} />
        <span>Make it yours</span>
        <span className="tiny-pill">EDITING</span>
      </div>
      <section className="inspector-section">
        <span className="section-label">ADD A LITTLE SOMETHING</span>
        <div className="tool-grid">
          <button
            onClick={onAddText}
            disabled={busy || page.elements.length >= 60}
          >
            <Type size={20} />
            Text
          </button>
          <label
            className={`upload-tool ${busy || page.elements.length >= 60 ? "disabled" : ""}`}
          >
            <ImagePlus size={20} />
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload image"
              disabled={busy || page.elements.length >= 60}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUpload(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="field-hint">
          Select an element to edit it. Drag it into place, then resize from a
          corner.
        </p>
      </section>
      {element && (
        <section className="inspector-section element-inspector">
          <span className="section-label">
            {element.type === "text" ? "YOUR WORDS" : "YOUR PHOTOGRAPH"}
          </span>
          {element.type === "text" ? (
            <>
              <label>
                Text content
                <textarea
                  aria-label="Text content"
                  maxLength={4000}
                  rows={5}
                  value={element.text}
                  onChange={(event) =>
                    onElementChange({ text: event.target.value })
                  }
                />
              </label>
              <label>
                Text style
                <select
                  value={element.style}
                  onChange={(event) =>
                    onElementChange({ style: event.target.value as "body" })
                  }
                >
                  <option value="heading">Journal heading</option>
                  <option value="body">Body text</option>
                  <option value="handwritten">Handwritten note</option>
                  <option value="label">Small label</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                Photo caption
                <input
                  aria-label="Photo caption"
                  maxLength={200}
                  value={element.caption}
                  onChange={(event) =>
                    onElementChange({ caption: event.target.value })
                  }
                />
              </label>
              <label>
                Photo frame
                <select
                  value={element.frame}
                  onChange={(event) =>
                    onElementChange({ frame: event.target.value as "polaroid" })
                  }
                >
                  <option value="polaroid">Polaroid</option>
                  <option value="plain">No frame</option>
                </select>
              </label>
              <label
                className={`secondary-button replace-button ${busy ? "disabled" : ""}`}
              >
                <Upload size={14} />
                Replace photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Replace image"
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onUpload(file, true);
                    event.target.value = "";
                  }}
                />
              </label>
            </>
          )}
          <label className="rotation-label">
            A little tilt <span>{element.rotation}°</span>
            <input
              type="range"
              aria-label="Element rotation"
              min={-15}
              max={15}
              value={element.rotation}
              onChange={(event) =>
                onElementChange({ rotation: Number(event.target.value) })
              }
            />
          </label>
          <button
            className="danger-button"
            onClick={onDeleteElement}
            disabled={busy}
          >
            <Trash2 size={14} />
            Delete {element.type === "text" ? "text" : "image"}
          </button>
        </section>
      )}
      <section className="inspector-section">
        <span className="section-label">THIS PAGE</span>
        <label>
          Page name
          <input
            maxLength={100}
            value={page.title}
            onChange={(event) =>
              onPageChange({ title: event.target.value || "Untitled page" })
            }
          />
        </label>
        <label>
          Paper
          <select
            value={page.paper}
            onChange={(event) =>
              onPageChange({ paper: event.target.value as "cream" })
            }
          >
            <option value="cream">Warm cream</option>
            <option value="lined">Notebook lines</option>
            <option value="sage">Soft sage</option>
          </select>
        </label>
        <div className="page-actions">
          <button
            className="secondary-button"
            onClick={onAddPage}
            disabled={busy || book.pages.length >= 100}
          >
            <Plus size={14} />
            Add page
          </button>
          <button
            title="Delete selected page"
            aria-label="Delete selected page"
            className="icon-button danger-icon"
            onClick={onDeletePage}
            disabled={busy || book.pages.length <= 2}
          >
            <Trash2 size={15} />
          </button>
        </div>
        {book.pages.length <= 2 && (
          <p className="field-hint">Keep at least two pages in your book.</p>
        )}
      </section>
      <details className="inspector-section cover-settings">
        <summary>Book cover details</summary>
        <label>
          Book title
          <input
            maxLength={100}
            value={book.title}
            onChange={(event) =>
              onBookChange({ title: event.target.value || "Untitled book" })
            }
          />
        </label>
        <label>
          Subtitle
          <textarea
            rows={2}
            maxLength={200}
            value={book.subtitle}
            onChange={(event) => onBookChange({ subtitle: event.target.value })}
          />
        </label>
      </details>
    </aside>
  );
}
