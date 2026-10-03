"use client";
import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Type,
  Trash2,
  Upload,
  Plus,
  SlidersHorizontal,
  ArrowUp,
  ArrowDown,
  Copy,
  Crop,
  Lock,
  LockOpen,
  Layers,
  Bold,
  Italic,
  LayoutTemplate,
} from "lucide-react";
import {
  TEXT_PRESETS,
  type Book,
  type BookCover,
  type BookPage,
  type BookElement,
  type PageTemplate,
} from "@/types/book";
import { COVER_STYLES } from "@/lib/cover";
import { CropDialog } from "./crop-dialog";
import { TemplateDialog } from "./template-dialog";

type Props = {
  book: Book;
  page: BookPage;
  element?: BookElement;
  busy: boolean;
  onBookChange: (changes: Partial<Book>) => void;
  onPageChange: (changes: Partial<BookPage>) => void;
  onElementChange: (changes: Partial<BookElement>) => void;
  onSelectElement: (id: string) => void;
  onAddText: () => void;
  onUpload: (file: File, replace?: boolean) => void;
  onDeleteElement: () => void;
  onDuplicateElement: () => void;
  onLayerElement: (direction: "forward" | "backward") => void;
  onAddPage: (template?: PageTemplate) => void;
  onDeletePage: () => void;
  onDuplicatePage: () => void;
  onMovePage: (direction: -1 | 1) => void;
  onReturnToBook: () => void;
  cover?: BookCover;
  onCoverChange?: (changes: Partial<BookCover>) => void;
  onEditCover?: () => void;
  onEditPages?: () => void;
};

function layerLabel(element: BookElement) {
  const name = element.type === "text" ? element.text : element.caption;
  return (
    name.replace(/\s+/g, " ").trim().slice(0, 45) ||
    (element.type === "image" ? "Untitled photo" : "Empty text")
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (inputRef.current) inputRef.current.value = String(value);
  }, [value]);
  return (
    <input
      ref={inputRef}
      type="number"
      aria-label={label}
      min={min}
      max={max}
      defaultValue={value}
      onChange={(event) => {
        const next = event.target.valueAsNumber;
        if (Number.isFinite(next) && next >= min && next <= max) onChange(next);
      }}
      onBlur={(event) => {
        const next = event.target.valueAsNumber;
        const valid = Number.isFinite(next)
          ? Math.max(min, Math.min(max, next))
          : value;
        event.target.value = String(valid);
        if (valid !== value) onChange(valid);
      }}
    />
  );
}

export function Inspector({
  book,
  page,
  element,
  busy,
  onBookChange,
  onPageChange,
  onElementChange,
  onSelectElement,
  onAddText,
  onUpload,
  onDeleteElement,
  onDuplicateElement,
  onLayerElement,
  onAddPage,
  onDeletePage,
  onDuplicatePage,
  onMovePage,
  onReturnToBook,
  cover,
  onCoverChange,
  onEditCover,
  onEditPages,
}: Props) {
  const [cropping, setCropping] = useState(false);
  const [choosingTemplate, setChoosingTemplate] = useState(false);
  const elements = cover?.elements ?? page.elements;
  const elementIndex = elements.findIndex((item) => item.id === element?.id);
  const pageIndex = book.pages.findIndex((item) => item.id === page.id);
  const textDefaults =
    element?.type === "text" ? TEXT_PRESETS[element.style] : null;

  return (
    <aside
      id="scrapbook-editor"
      className="inspector"
      aria-label={cover ? "Cover editor" : "Scrapbook editor"}
      aria-busy={busy}
    >
      <div className="inspector-heading">
        <SlidersHorizontal size={15} />
        <span>{cover ? "Your book cover" : "Make it yours"}</span>
        <span className="tiny-pill">EDITING</span>
      </div>
      <button className="return-to-book" onClick={onReturnToBook}>
        <ArrowUp size={13} /> {cover ? "Back to the cover" : "Back to the page"}
      </button>
      {(cover ? onEditPages : onEditCover) && (
        <button
          className="secondary-button editor-target-button"
          disabled={busy}
          onClick={cover ? onEditPages : onEditCover}
        >
          <LayoutTemplate size={14} /> {cover ? "Edit pages" : "Edit cover"}
        </button>
      )}
      {cover && onCoverChange && (
        <section className="inspector-section cover-appearance">
          <span className="section-label">THE FEEL OF YOUR COVER</span>
          <label>
            Cover style
            <select
              aria-label="Cover style"
              value={cover.style}
              disabled={busy}
              onChange={(event) => {
                const style = event.target.value as BookCover["style"];
                const previous = COVER_STYLES[cover.style];
                const next = COVER_STYLES[style];
                onCoverChange({
                  style,
                  backgroundColor: next.backgroundColor,
                  elements: elements.map((item) =>
                    item.type === "text" &&
                    item.color?.toLowerCase() ===
                      previous.textColor.toLowerCase()
                      ? { ...item, color: next.textColor }
                      : item,
                  ),
                });
              }}
            >
              {Object.entries(COVER_STYLES).map(([value, preset]) => (
                <option value={value} key={value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cover color
            <input
              type="color"
              aria-label="Cover color"
              value={cover.backgroundColor}
              disabled={busy}
              onChange={(event) =>
                onCoverChange({ backgroundColor: event.target.value })
              }
            />
          </label>
          <p className="field-hint">
            Choose a texture, then make the color your own. Preview the cover
            when you are ready to open your book.
          </p>
        </section>
      )}
      <section className="inspector-section">
        <span className="section-label">ADD A LITTLE SOMETHING</span>
        <div className="tool-grid">
          <button onClick={onAddText} disabled={busy || elements.length >= 60}>
            <Type size={20} />
            Text
          </button>
          <label
            className={`upload-tool ${busy || elements.length >= 60 ? "disabled" : ""}`}
          >
            <ImagePlus size={20} />
            Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload image"
              disabled={busy || elements.length >= 60}
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
        <section
          id="selected-element-controls"
          className="inspector-section element-inspector"
        >
          <span className="section-label">
            {element.type === "text" ? "YOUR WORDS" : "YOUR PHOTOGRAPH"}
          </span>
          {element.type === "text" && textDefaults ? (
            <>
              <label>
                Text content
                <textarea
                  aria-label="Text content"
                  maxLength={4000}
                  rows={4}
                  value={element.text}
                  onChange={(event) =>
                    onElementChange({ text: event.target.value })
                  }
                />
              </label>
              <label>
                Text style
                <select
                  aria-label="Text style"
                  value={element.style}
                  onChange={(event) => {
                    const style = event.target.value as typeof element.style;
                    onElementChange({
                      style,
                      ...TEXT_PRESETS[style],
                      ...(cover
                        ? {
                            color:
                              element.color ??
                              COVER_STYLES[cover.style].textColor,
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="heading">Journal heading</option>
                  <option value="body">Body text</option>
                  <option value="handwritten">Handwritten note</option>
                  <option value="label">Small label</option>
                </select>
              </label>
              <details className="text-appearance" open>
                <summary>Typography</summary>
                <label>
                  Font family
                  <select
                    aria-label="Font family"
                    value={element.fontFamily ?? textDefaults.fontFamily}
                    onChange={(event) =>
                      onElementChange({
                        fontFamily: event.target.value as "serif",
                      })
                    }
                  >
                    <option value="serif">Classic journal</option>
                    <option value="handwritten">Handwritten note</option>
                    <option value="sans">Clean captions</option>
                  </select>
                </label>
                <div className="inspector-field-grid">
                  <label>
                    Font size
                    <NumberField
                      key={element.id}
                      label="Font size"
                      min={8}
                      max={72}
                      value={element.fontSize ?? textDefaults.fontSize}
                      onChange={(fontSize) => onElementChange({ fontSize })}
                    />
                  </label>
                  <label>
                    Text color
                    <input
                      type="color"
                      aria-label="Text color"
                      value={element.color ?? textDefaults.color}
                      onChange={(event) =>
                        onElementChange({ color: event.target.value })
                      }
                    />
                  </label>
                </div>
                <div className="text-toggle-row">
                  <button
                    className="secondary-button"
                    aria-label="Bold"
                    aria-pressed={element.bold ?? textDefaults.bold}
                    onClick={() =>
                      onElementChange({
                        bold: !(element.bold ?? textDefaults.bold),
                      })
                    }
                  >
                    <Bold size={15} />
                  </button>
                  <button
                    className="secondary-button"
                    aria-label="Italic"
                    aria-pressed={element.italic ?? textDefaults.italic}
                    onClick={() =>
                      onElementChange({
                        italic: !(element.italic ?? textDefaults.italic),
                      })
                    }
                  >
                    <Italic size={15} />
                  </button>
                  <label>
                    Alignment
                    <select
                      aria-label="Text alignment"
                      value={element.align ?? textDefaults.align}
                      onChange={(event) =>
                        onElementChange({ align: event.target.value as "left" })
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                </div>
              </details>
            </>
          ) : element.type === "image" ? (
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
                  aria-label="Photo frame"
                  value={element.frame}
                  onChange={(event) =>
                    onElementChange({ frame: event.target.value as "polaroid" })
                  }
                >
                  <option value="polaroid">Polaroid</option>
                  <option value="plain">No frame</option>
                </select>
              </label>
              <div className="element-actions photo-actions">
                <button
                  className="secondary-button"
                  disabled={busy || !element.filename}
                  onClick={() => setCropping(true)}
                >
                  <Crop size={14} /> Crop photo
                </button>
                {element.crop && (
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => onElementChange({ crop: null })}
                  >
                    Reset crop
                  </button>
                )}
              </div>
              <label
                className={`secondary-button replace-button ${busy ? "disabled" : ""}`}
              >
                <Upload size={14} />
                {element.filename ? "Replace photo" : "Add photo to frame"}
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
          ) : null}
          <label className="rotation-label">
            Rotation (degrees)
            <NumberField
              key={element.id}
              label="Rotation (degrees)"
              min={-180}
              max={180}
              value={element.rotation}
              onChange={(rotation) => onElementChange({ rotation })}
            />
          </label>
          <input
            type="range"
            aria-label="Element rotation"
            min={-180}
            max={180}
            value={element.rotation}
            onChange={(event) =>
              onElementChange({ rotation: Number(event.target.value) })
            }
          />
          <div className="element-actions">
            <button
              className="secondary-button"
              onClick={onDuplicateElement}
              disabled={busy || elements.length >= 60}
            >
              <Copy size={14} /> Duplicate{" "}
              {element.type === "image" ? "image" : "text"}
            </button>
            <button
              className="secondary-button"
              onClick={() => onElementChange({ locked: !element.locked })}
              disabled={busy}
              aria-pressed={!!element.locked}
            >
              {element.locked ? <LockOpen size={14} /> : <Lock size={14} />}
              {element.locked ? "Unlock position" : "Lock position"}
            </button>
            <button
              className="secondary-button"
              onClick={() => onLayerElement("forward")}
              disabled={busy || elementIndex >= elements.length - 1}
            >
              <ArrowUp size={14} /> Bring forward
            </button>
            <button
              className="secondary-button"
              onClick={() => onLayerElement("backward")}
              disabled={busy || elementIndex <= 0}
            >
              <ArrowDown size={14} /> Send backward
            </button>
          </div>
          {element.locked && (
            <p className="field-hint">
              Position and size are locked. You can still edit its appearance.
            </p>
          )}
          <button
            className="danger-button"
            onClick={onDeleteElement}
            disabled={busy}
          >
            <Trash2 size={14} /> Delete{" "}
            {element.type === "text" ? "text" : "image"}
          </button>
        </section>
      )}
      <details className="inspector-section layers-section" open>
        <summary>
          <Layers size={14} /> Layers <span>{elements.length}</span>
        </summary>
        <p className="field-hint">
          Frontmost first. Select a layer even when it is covered or locked.
        </p>
        <div className="layer-list">
          {[...elements].reverse().map((item, index) => (
            <button
              key={item.id}
              className={`layer-button ${item.id === element?.id ? "selected" : ""}`}
              aria-label={`Select layer: ${layerLabel(item)} (layer ${elements.length - index})`}
              aria-pressed={item.id === element?.id}
              data-testid={`layer-${item.id}`}
              onClick={() => onSelectElement(item.id)}
            >
              {item.type === "image" ? (
                <ImagePlus size={13} />
              ) : (
                <Type size={13} />
              )}
              <span>{layerLabel(item)}</span>
              {item.locked && <Lock size={12} aria-label="Position locked" />}
              <span className="layer-number">{elements.length - index}</span>
            </button>
          ))}
          {!elements.length && (
            <p className="field-hint">
              {cover
                ? "Your cover is a fresh start."
                : "This page is a fresh start."}
            </p>
          )}
        </div>
      </details>
      {!cover && (
        <>
          <section className="inspector-section">
            <span className="section-label">THIS PAGE</span>
            <label>
              Page name
              <input
                aria-label="Page name"
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
                aria-label="Paper"
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
                onClick={() => onAddPage()}
                disabled={busy || book.pages.length >= 100}
              >
                <Plus size={14} /> Add page
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
            <button
              className="secondary-button template-picker-button"
              onClick={() => setChoosingTemplate(true)}
              disabled={busy || book.pages.length >= 100}
            >
              <LayoutTemplate size={14} /> New page from template
            </button>
            <div className="element-actions page-extra-actions">
              <button
                className="secondary-button"
                onClick={onDuplicatePage}
                disabled={busy || book.pages.length >= 100}
              >
                <Copy size={14} /> Duplicate page
              </button>
              <span className="page-position">
                Page {pageIndex + 1} of {book.pages.length}
              </span>
              <button
                className="secondary-button"
                onClick={() => onMovePage(-1)}
                disabled={busy || pageIndex <= 0}
              >
                <ArrowUp size={14} /> Move page earlier
              </button>
              <button
                className="secondary-button"
                onClick={() => onMovePage(1)}
                disabled={busy || pageIndex >= book.pages.length - 1}
              >
                <ArrowDown size={14} /> Move page later
              </button>
            </div>
            {book.pages.length <= 2 && (
              <p className="field-hint">
                Keep at least two pages in your book.
              </p>
            )}
          </section>
          <details className="inspector-section cover-settings">
            <summary>Book cover details</summary>
            <label>
              Book title
              <input
                aria-label="Book title"
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
                aria-label="Subtitle"
                rows={2}
                maxLength={200}
                value={book.subtitle}
                onChange={(event) =>
                  onBookChange({ subtitle: event.target.value })
                }
              />
            </label>
          </details>
        </>
      )}
      {cropping && element?.type === "image" && element.filename && (
        <CropDialog
          element={element}
          onCancel={() => setCropping(false)}
          onApply={(crop) => {
            onElementChange({ crop });
            setCropping(false);
          }}
        />
      )}
      {!cover && choosingTemplate && (
        <TemplateDialog
          onCancel={() => setChoosingTemplate(false)}
          onChoose={(template) => {
            onAddPage(template);
            setChoosingTemplate(false);
          }}
        />
      )}
    </aside>
  );
}
