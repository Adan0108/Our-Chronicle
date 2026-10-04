"use client";
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type HTMLAttributes,
  type MouseEvent,
} from "react";
import Image from "next/image";
import { Rnd } from "react-rnd";
import { ImageIcon, LockKeyhole } from "lucide-react";
import { DECORATIONS } from "@/lib/decorations";
import {
  canvasPoint,
  moveSelection,
  type CanvasPoint,
  type ElementMove,
  type SnapGuide,
} from "@/lib/editor-geometry";
import { CanvasEditorContext } from "@/components/editor/editor-context";
import { StickerArt } from "./sticker";
import {
  type BookPage,
  type BookElement,
  type ImageElement,
  FONT_FAMILIES,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "@/types/book";

export const ImageRevisionContext = createContext(0);

type Props = {
  page: BookPage;
  number: number;
  editing?: boolean;
  selectedId?: string | null;
  active?: boolean;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, changes: Partial<BookElement>) => void;
};

function Photograph({ element }: { element: ImageElement }) {
  const [intrinsic, setIntrinsic] = useState({ width: 1, height: 1 });
  const [failed, setFailed] = useState(false);
  const revision = useContext(ImageRevisionContext);
  const decoration = element.kind === "decoration";
  if (!element.filename)
    return (
      <div className="photo-image photo-placeholder">
        <ImageIcon size={27} strokeWidth={1} aria-hidden="true" />
        <span>
          {decoration ? "A little decoration" : "A photograph to remember"}
        </span>
      </div>
    );
  const crop = element.crop;
  const image = (
    <Image
      src={`/api/images/${element.filename}${failed ? `?v=${revision}` : ""}`}
      alt={
        element.caption ||
        (decoration ? "Scrapbook decoration" : "Scrapbook photograph")
      }
      fill
      unoptimized
      sizes="400px"
      draggable={false}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const node = event.currentTarget;
        setIntrinsic({ width: node.naturalWidth, height: node.naturalHeight });
      }}
      style={
        crop
          ? { objectFit: "fill" }
          : decoration
            ? { objectFit: "contain" }
            : undefined
      }
    />
  );
  if (!crop) return <div className="photo-image">{image}</div>;

  // The crop is a window into the original image, not a rewritten image file.
  // Keep that window's natural aspect ratio, then cover the resized photo frame.
  const aspect =
    (intrinsic.width * crop.width) / (intrinsic.height * crop.height);
  const frameWidth = Math.max(
    1,
    element.width -
      (decoration
        ? 0
        : element.frame === "polaroid"
          ? 20
          : element.frame === "paper"
            ? 24
            : 0),
  );
  const frameHeight = Math.max(
    1,
    element.height -
      (decoration
        ? 0
        : element.frame === "polaroid"
          ? 45
          : element.frame === "paper"
            ? 24
            : 0),
  );
  const width = decoration
    ? Math.min(frameWidth, frameHeight * aspect)
    : Math.max(frameWidth, frameHeight * aspect);
  const height = width / aspect;
  return (
    <div className="photo-image" data-cropped="true">
      <div className="cropped-source" style={{ width, height }}>
        <div
          className="crop-full-image"
          style={{
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
            width: `${10000 / crop.width}%`,
            height: `${10000 / crop.height}%`,
          }}
        >
          {image}
        </div>
      </div>
    </div>
  );
}

function ElementContent({ element }: { element: BookElement }) {
  if (element.type === "text")
    return (
      <div
        className={`scrap-text text-${element.style}`}
        style={
          {
            transform: `rotate(${element.rotation}deg)`,
            fontFamily: element.fontFamily
              ? FONT_FAMILIES[element.fontFamily]
              : undefined,
            fontSize: element.fontSize,
            color: element.color,
            fontWeight:
              element.bold === undefined ? undefined : element.bold ? 700 : 400,
            fontStyle:
              element.italic === undefined
                ? undefined
                : element.italic
                  ? "italic"
                  : "normal",
            textAlign: element.align,
          } satisfies CSSProperties
        }
      >
        {element.text}
      </div>
    );
  if (element.type === "sticker")
    return (
      <div
        className="scrap-sticker"
        role="img"
        aria-label={element.label || DECORATIONS[element.asset].label}
        data-sticker-asset={element.asset}
        style={{ transform: `rotate(${element.rotation}deg)` }}
      >
        <StickerArt
          asset={element.asset}
          color={element.color}
          label={element.label}
        />
      </div>
    );
  const decoration = element.kind === "decoration";
  return (
    <figure
      className={`scrap-photo ${decoration ? "scrap-decoration frame-borderless" : `frame-${element.frame}`}`}
      data-image-kind={decoration ? "decoration" : "photo"}
      style={{ transform: `rotate(${element.rotation}deg)` }}
    >
      <Photograph key={element.filename} element={element} />
      {!decoration && element.frame === "polaroid" && (
        <figcaption>{element.caption}</figcaption>
      )}
    </figure>
  );
}

type ElementLayerProps = Pick<
  Props,
  "editing" | "selectedId" | "onSelect" | "onChange"
> & {
  elements: BookElement[];
  surfaceId?: string;
};

export function useCanvasSurface(
  surfaceId: string,
  editing: boolean,
  onSelect?: (id: string | null) => void,
) {
  const editor = useContext(CanvasEditorContext);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);
  const backgroundPointer = useRef(false);
  const disabled = Boolean(editor?.disabled);
  const hasFiles = (event: DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).includes("Files");
  const acceptsFiles = (event: DragEvent<HTMLDivElement>) =>
    !disabled && editor && hasFiles(event);
  const handlers: Pick<
    HTMLAttributes<HTMLDivElement>,
    | "onPointerDown"
    | "onClick"
    | "onDragEnter"
    | "onDragOver"
    | "onDragLeave"
    | "onDrop"
  > = editing
    ? {
        onPointerDown: (event) => {
          backgroundPointer.current = event.target === event.currentTarget;
        },
        onClick: (event) => {
          if (
            !disabled &&
            backgroundPointer.current &&
            event.target === event.currentTarget
          ) {
            if (editor) editor.select(surfaceId, null);
            else onSelect?.(null);
          }
          backgroundPointer.current = false;
        },
        onDragEnter: (event) => {
          if (!acceptsFiles(event)) return;
          event.preventDefault();
          dragDepth.current += 1;
          setDropActive(true);
        },
        onDragOver: (event) => {
          if (!editor || !hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
        },
        onDragLeave: (event) => {
          if (!editor || !hasFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDropActive(false);
        },
        onDrop: (event) => {
          if (!editor || !hasFiles(event)) return;
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDropActive(false);
          const files = Array.from(event.dataTransfer.files);
          if (!files.length || disabled) return;
          const point = canvasPoint(
            event.currentTarget.getBoundingClientRect(),
            {
              x: event.clientX,
              y: event.clientY,
            },
          );
          editor.dropFiles(surfaceId, files, point);
        },
      }
    : {};
  return { handlers, dropActive: editing && dropActive && !disabled, disabled };
}

export function CanvasHints({
  surfaceId,
  elements,
  dropActive,
}: {
  surfaceId: string;
  elements: BookElement[];
  dropActive: boolean;
}) {
  const editor = useContext(CanvasEditorContext);
  if (!editor) return null;
  return (
    <>
      {elements.length === 0 && !dropActive && (
        <div className="canvas-empty-hint" data-testid="empty-page-hint">
          <ImageIcon size={25} strokeWidth={1} aria-hidden="true" />
          <p>A fresh page for your memories</p>
          <span>Drop an image here, or start with a little something.</span>
          <div className="canvas-empty-actions">
            <button
              type="button"
              disabled={editor.disabled}
              onClick={(event) => {
                event.stopPropagation();
                editor.select(surfaceId, null);
                editor.addText(surfaceId);
              }}
              aria-label="Add text to empty page"
            >
              Add text
            </button>
            <button
              type="button"
              disabled={editor.disabled}
              onClick={(event) => {
                event.stopPropagation();
                editor.select(surfaceId, null);
                editor.addDecoration(surfaceId);
              }}
              aria-label="Add decoration to empty page"
            >
              Decoration
            </button>
          </div>
        </div>
      )}
      {dropActive && (
        <div
          className="canvas-drop-highlight"
          data-testid="canvas-drop-highlight"
          aria-hidden="true"
        >
          <ImageIcon size={27} strokeWidth={1} />
          <span>Place your image here</span>
        </div>
      )}
    </>
  );
}

type DragSession = {
  anchor: BookElement;
  elements: BookElement[];
  selectedIds: string[];
  moved: boolean;
};
type DragPreview = {
  anchorId: string;
  raw: CanvasPoint;
  changes: ElementMove[];
  guides: SnapGuide[];
};

function EditingElements({
  elements,
  selectedId,
  surfaceId = "",
  onSelect,
  onChange,
}: ElementLayerProps) {
  const editor = useContext(CanvasEditorContext);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const dragSession = useRef<DragSession | null>(null);
  const suppressClick = useRef<string | null>(null);
  const selectedIds = editor
    ? editor.activeSurfaceId === surfaceId
      ? editor.selectedIds
      : []
    : selectedId
      ? [selectedId]
      : [];
  const disabled = Boolean(editor?.disabled);
  const select = (id: string, additive = false) => {
    if (disabled) return;
    if (editor) editor.select(surfaceId, id, additive);
    else onSelect?.(id);
  };
  const clicked = (event: MouseEvent<HTMLDivElement>, id: string) => {
    event.stopPropagation();
    if (suppressClick.current === id) {
      suppressClick.current = null;
      return;
    }
    // A click on a member keeps the group intact for the next drag.
    if (event.shiftKey || !selectedIds.includes(id) || selectedIds.length < 2)
      select(id, event.shiftKey);
  };
  const menu = (id: string, point: CanvasPoint) => {
    if (!editor || disabled) return;
    editor.contextMenu(surfaceId, id, point);
  };
  return (
    <>
      {elements.map((element, index) => {
        const selected = selectedIds.includes(element.id);
        const draft = preview?.changes.find(
          (change) => change.id === element.id,
        );
        const anchor = preview?.anchorId === element.id;
        const position = anchor && preview ? preview.raw : draft || element;
        return (
          <Rnd
            key={element.id}
            size={{ width: element.width, height: element.height }}
            position={{ x: position.x, y: position.y }}
            bounds="parent"
            minWidth={40}
            minHeight={30}
            enableResizing={
              selected &&
              selectedIds.length === 1 &&
              !element.locked &&
              !disabled
            }
            disableDragging={Boolean(element.locked) || disabled}
            style={{
              zIndex: index + 1,
              // react-draggable owns transform during the gesture. A separate
              // translation keeps the anchor aligned with its snapped group.
              translate:
                anchor && draft
                  ? `${draft.x - position.x}px ${draft.y - position.y}px`
                  : undefined,
            }}
            data-element-id={element.id}
            data-element-type={element.type}
            data-testid={`element-${element.id}`}
            data-locked={Boolean(element.locked)}
            data-selected={selected}
            data-group-member={selected && selectedIds.length > 1}
            data-dragging={Boolean(draft)}
            className={`scrap-element editable-element ${selected ? "selected-element" : ""} ${element.locked ? "locked-element" : ""} ${selected && selectedIds.length > 1 ? "group-selected-element" : ""}`}
            onClick={(event: MouseEvent<HTMLDivElement>) =>
              clicked(event, element.id)
            }
            onContextMenu={(event: MouseEvent<HTMLDivElement>) => {
              if (!editor || disabled) return;
              event.preventDefault();
              event.stopPropagation();
              menu(element.id, { x: event.clientX, y: event.clientY });
            }}
            onDragStart={(event) => {
              if (disabled || element.locked || event.shiftKey) return false;
              suppressClick.current = null;
              if (!selected) select(element.id);
              dragSession.current = {
                anchor: element,
                elements,
                selectedIds: selected ? selectedIds : [element.id],
                moved: false,
              };
            }}
            onDrag={(event, data) => {
              const session = dragSession.current;
              if (!session) return;
              const delta = {
                x: data.x - session.anchor.x,
                y: data.y - session.anchor.y,
              };
              session.moved ||= Math.abs(delta.x) + Math.abs(delta.y) >= 2;
              const result = moveSelection(
                session.elements,
                session.selectedIds,
                delta,
                { snap: !event.altKey },
              );
              setPreview({
                anchorId: element.id,
                raw: { x: data.x, y: data.y },
                ...result,
              });
            }}
            onDragStop={(event, data) => {
              const session = dragSession.current;
              dragSession.current = null;
              setPreview(null);
              if (!session?.moved || disabled || element.locked) return;
              const result = moveSelection(
                session.elements,
                session.selectedIds,
                { x: data.x - session.anchor.x, y: data.y - session.anchor.y },
                { snap: !event.altKey },
              );
              suppressClick.current = element.id;
              if (editor) editor.move(surfaceId, result.changes);
              else
                for (const change of result.changes)
                  onChange?.(change.id, { x: change.x, y: change.y });
            }}
            onResizeStop={(_event, _direction, node, _delta, position) => {
              if (element.locked || disabled) return;
              onChange?.(element.id, {
                x: Math.max(0, position.x),
                y: Math.max(0, position.y),
                width: Math.min(
                  PAGE_WIDTH - Math.max(0, position.x),
                  node.offsetWidth,
                ),
                height: Math.min(
                  PAGE_HEIGHT - Math.max(0, position.y),
                  node.offsetHeight,
                ),
              });
            }}
          >
            <div
              className="element-hit-area"
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-disabled={disabled}
              aria-label={
                element.type === "text"
                  ? `Edit text: ${element.text.slice(0, 45)}`
                  : element.type === "sticker"
                    ? `Select sticker: ${DECORATIONS[element.asset].label}`
                    : element.kind === "decoration"
                      ? `Select decoration: ${element.caption || "uploaded asset"}`
                      : `Select image: ${element.caption || "photograph"}`
              }
              onPointerDown={() => {
                suppressClick.current = null;
              }}
              onClick={(event) => clicked(event, element.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  select(element.id, event.shiftKey);
                } else if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  menu(element.id, {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  });
                }
              }}
            >
              <ElementContent element={element} />
            </div>
            {element.locked && (
              <span
                className="element-lock-mark"
                aria-hidden="true"
                title="Position locked"
              >
                <LockKeyhole size={10} />
              </span>
            )}
          </Rnd>
        );
      })}
      {preview?.guides.map((guide) => (
        <span
          key={guide.axis}
          className={`canvas-snap-guide guide-${guide.axis}`}
          data-testid={`snap-guide-${guide.axis}`}
          data-position={guide.position}
          style={
            guide.axis === "x"
              ? { left: guide.position }
              : { top: guide.position }
          }
          aria-hidden="true"
        />
      ))}
    </>
  );
}

// Keep elements as direct children of their canvas: react-rnd's parent bounds
// and the native page-flip event surface stay the same for pages and covers.
export function ElementLayer({
  elements,
  editing = false,
  selectedId,
  surfaceId,
  onSelect,
  onChange,
}: ElementLayerProps) {
  if (editing)
    return (
      <EditingElements
        elements={elements}
        selectedId={selectedId}
        surfaceId={surfaceId}
        onSelect={onSelect}
        onChange={onChange}
      />
    );
  return (
    <>
      {elements.map((element, index) => (
        <div
          key={element.id}
          className="scrap-element reading-element"
          data-element-id={element.id}
          data-element-type={element.type}
          data-testid={`element-${element.id}`}
          style={{
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            zIndex: index + 1,
          }}
        >
          <ElementContent element={element} />
        </div>
      ))}
    </>
  );
}

export const PageRenderer = forwardRef<HTMLDivElement, Props>(
  function PageRenderer(
    { page, number, editing = false, selectedId, active, onSelect, onChange },
    ref,
  ) {
    const canvas = useCanvasSurface(page.id, editing, onSelect);
    return (
      <div
        ref={ref}
        className={`book-page page-${number % 2 ? "left" : "right"} paper-${page.paper} ${editing ? "editable-page" : ""} ${active ? "active-page" : ""} ${canvas.dropActive ? "canvas-drop-active" : ""}`}
        data-testid={`page-${number}`}
        data-editor-surface={editing ? page.id : undefined}
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
        {...canvas.handlers}
      >
        <div className="page-grain" aria-hidden="true" />
        <ElementLayer
          elements={page.elements}
          surfaceId={page.id}
          editing={editing}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={onChange}
        />
        {editing && (
          <CanvasHints
            surfaceId={page.id}
            elements={page.elements}
            dropActive={canvas.dropActive}
          />
        )}
        <span className="page-number">{String(number).padStart(2, "0")}</span>
      </div>
    );
  },
);
