"use client";
import {
  createContext,
  forwardRef,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import Image from "next/image";
import { Rnd } from "react-rnd";
import { ImageIcon, LockKeyhole } from "lucide-react";
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
  if (!element.filename)
    return (
      <div className="photo-image photo-placeholder">
        <ImageIcon size={27} strokeWidth={1} aria-hidden="true" />
        <span>A photograph to remember</span>
      </div>
    );
  const crop = element.crop;
  const image = (
    <Image
      src={`/api/images/${element.filename}${failed ? `?v=${revision}` : ""}`}
      alt={element.caption || "Scrapbook photograph"}
      fill
      unoptimized
      sizes="400px"
      draggable={false}
      onError={() => setFailed(true)}
      onLoad={(event) => {
        const node = event.currentTarget;
        setIntrinsic({ width: node.naturalWidth, height: node.naturalHeight });
      }}
      style={crop ? { objectFit: "fill" } : undefined}
    />
  );
  if (!crop) return <div className="photo-image">{image}</div>;

  // The crop is a window into the original image, not a rewritten image file.
  // Keep that window's natural aspect ratio, then cover the resized photo frame.
  const aspect =
    (intrinsic.width * crop.width) / (intrinsic.height * crop.height);
  const frameWidth = element.width - (element.frame === "polaroid" ? 20 : 0);
  const frameHeight = element.height - (element.frame === "polaroid" ? 45 : 0);
  const width = Math.max(frameWidth, frameHeight * aspect);
  const height = Math.max(frameHeight, frameWidth / aspect);
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
  return (
    <figure
      className={`scrap-photo frame-${element.frame}`}
      style={{ transform: `rotate(${element.rotation}deg)` }}
    >
      <Photograph key={element.filename} element={element} />
      {element.frame === "polaroid" && (
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
};

// Keep elements as direct children of their canvas: react-rnd's parent bounds
// and the native page-flip event surface stay the same for pages and covers.
export function ElementLayer({
  elements,
  editing = false,
  selectedId,
  onSelect,
  onChange,
}: ElementLayerProps) {
  return (
    <>
      {elements.map((element, index) =>
        editing ? (
          <Rnd
            key={element.id}
            size={{ width: element.width, height: element.height }}
            position={{ x: element.x, y: element.y }}
            bounds="parent"
            minWidth={40}
            minHeight={30}
            enableResizing={selectedId === element.id && !element.locked}
            disableDragging={selectedId !== element.id || element.locked}
            style={{ zIndex: index + 1 }}
            data-element-id={element.id}
            data-testid={`element-${element.id}`}
            data-locked={Boolean(element.locked)}
            className={`scrap-element editable-element ${selectedId === element.id ? "selected-element" : ""} ${element.locked ? "locked-element" : ""}`}
            onClick={(event: MouseEvent<HTMLDivElement>) => {
              event.stopPropagation();
              onSelect?.(element.id);
            }}
            onDragStop={(_event, data) => {
              if (element.locked) return;
              onChange?.(element.id, {
                x: Math.max(0, Math.min(PAGE_WIDTH - element.width, data.x)),
                y: Math.max(0, Math.min(PAGE_HEIGHT - element.height, data.y)),
              });
            }}
            onResizeStop={(_event, _direction, node, _delta, position) => {
              if (element.locked) return;
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
              aria-label={
                element.type === "text"
                  ? `Edit text: ${element.text.slice(0, 45)}`
                  : `Select image: ${element.caption || "photograph"}`
              }
              onClick={(event) => {
                event.stopPropagation();
                onSelect?.(element.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect?.(element.id);
                }
              }}
            >
              <ElementContent element={element} />
            </div>
            {element.locked && selectedId === element.id && (
              <span className="element-lock-mark" aria-hidden="true">
                <LockKeyhole size={10} />
              </span>
            )}
          </Rnd>
        ) : (
          <div
            key={element.id}
            className="scrap-element"
            data-element-id={element.id}
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
        ),
      )}
    </>
  );
}

export const PageRenderer = forwardRef<HTMLDivElement, Props>(
  function PageRenderer(
    { page, number, editing = false, selectedId, active, onSelect, onChange },
    ref,
  ) {
    const backgroundPointer = useRef(false);
    return (
      <div
        ref={ref}
        className={`book-page page-${number % 2 ? "left" : "right"} paper-${page.paper} ${editing ? "editable-page" : ""} ${active ? "active-page" : ""}`}
        data-testid={`page-${number}`}
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
        onPointerDown={(event) => {
          if (editing)
            backgroundPointer.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (
            editing &&
            backgroundPointer.current &&
            event.target === event.currentTarget
          )
            onSelect?.(null);
          backgroundPointer.current = false;
        }}
      >
        <div className="page-grain" aria-hidden="true" />
        <ElementLayer
          elements={page.elements}
          editing={editing}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={onChange}
        />
        <span className="page-number">{String(number).padStart(2, "0")}</span>
      </div>
    );
  },
);
