"use client";
import { forwardRef } from "react";
import Image from "next/image";
import { Rnd } from "react-rnd";
import {
  type BookPage,
  type BookElement,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "@/types/book";

type Props = {
  page: BookPage;
  number: number;
  editing?: boolean;
  selectedId?: string | null;
  active?: boolean;
  onSelect?: (id: string | null) => void;
  onChange?: (id: string, changes: Partial<BookElement>) => void;
};

function ElementContent({ element }: { element: BookElement }) {
  if (element.type === "text")
    return (
      <div
        className={`scrap-text text-${element.style}`}
        style={{ transform: `rotate(${element.rotation}deg)` }}
      >
        {element.text}
      </div>
    );
  return (
    <figure
      className={`scrap-photo frame-${element.frame}`}
      style={{ transform: `rotate(${element.rotation}deg)` }}
    >
      <div className="photo-image">
        <Image
          src={`/api/images/${element.filename}`}
          alt={element.caption || "Scrapbook photograph"}
          fill
          unoptimized
          sizes="400px"
          draggable={false}
        />
      </div>
      {element.frame === "polaroid" && (
        <figcaption>{element.caption}</figcaption>
      )}
    </figure>
  );
}

export const PageRenderer = forwardRef<HTMLDivElement, Props>(
  function PageRenderer(
    { page, number, editing = false, selectedId, active, onSelect, onChange },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className={`book-page page-${number % 2 ? "left" : "right"} paper-${page.paper} ${editing ? "editable-page" : ""} ${active ? "active-page" : ""}`}
        data-testid={`page-${number}`}
        style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
        onClick={() => editing && onSelect?.(null)}
      >
        <div className="page-grain" aria-hidden="true" />
        {page.elements.map((element) =>
          editing ? (
            <Rnd
              key={element.id}
              size={{ width: element.width, height: element.height }}
              position={{ x: element.x, y: element.y }}
              bounds="parent"
              minWidth={40}
              minHeight={30}
              enableResizing={selectedId === element.id}
              disableDragging={selectedId !== element.id}
              className={`scrap-element editable-element ${selectedId === element.id ? "selected-element" : ""}`}
              onDragStop={(_event, data) =>
                onChange?.(element.id, {
                  x: Math.max(0, Math.min(PAGE_WIDTH - element.width, data.x)),
                  y: Math.max(
                    0,
                    Math.min(PAGE_HEIGHT - element.height, data.y),
                  ),
                })
              }
              onResizeStop={(_event, _direction, node, _delta, position) =>
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
                })
              }
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
            </Rnd>
          ) : (
            <div
              key={element.id}
              className="scrap-element"
              style={{
                left: element.x,
                top: element.y,
                width: element.width,
                height: element.height,
              }}
            >
              <ElementContent element={element} />
            </div>
          ),
        )}
        <span className="page-number">{String(number).padStart(2, "0")}</span>
      </div>
    );
  },
);
