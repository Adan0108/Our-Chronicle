"use client";

import { forwardRef, type CSSProperties } from "react";
import { Leaf } from "lucide-react";
import {
  PAGE_HEIGHT,
  PAGE_WIDTH,
  type Book,
  type BookCover,
  type BookElement,
} from "@/types/book";
import { resolveCover } from "@/lib/cover";
import { CanvasHints, ElementLayer, useCanvasSurface } from "./page-renderer";

type Props = {
  book: Book;
  closed: boolean;
  allowPageGestures: boolean;
  onOpen: () => void;
};

function appearance(cover: BookCover): CSSProperties {
  return { "--cover-color": cover.backgroundColor } as CSSProperties;
}

function CoverFace({ cover }: { cover: BookCover }) {
  // StPageFlip replaces the outer page's inline styles on every frame. Keep
  // persistent appearance on a child outside its transform/style ownership.
  return (
    <div className="cover-face" style={appearance(cover)} aria-hidden="true" />
  );
}

function CoverDecoration() {
  return (
    <div className="cover-decoration" aria-hidden="true">
      <span className="cover-spine" />
      <span className="cover-border" />
      <span className="cover-emblem">
        <Leaf size={47} strokeWidth={1} />
        <span className="emblem-star">✦</span>
      </span>
      <span className="cover-rule" />
      <span className="bookmark-ribbon" />
    </div>
  );
}

export function EditableCover({
  book,
  selectedId,
  onSelect,
  onChange,
}: {
  book: Book;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, changes: Partial<BookElement>) => void;
}) {
  const cover = resolveCover(book);
  const canvas = useCanvasSurface("front-cover", true, onSelect);
  return (
    <div
      className={`book-cover editable-cover cover-style-${cover.style} ${canvas.dropActive ? "canvas-drop-active" : ""}`}
      style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }}
      data-testid="cover-editor-surface"
      data-editor-surface="front-cover"
      role="region"
      aria-label="Cover editing canvas"
      {...canvas.handlers}
    >
      <CoverFace cover={cover} />
      <CoverDecoration />
      <ElementLayer
        elements={cover.elements}
        surfaceId="front-cover"
        editing
        selectedId={selectedId}
        onSelect={onSelect}
        onChange={onChange}
      />
      <CanvasHints
        surfaceId="front-cover"
        elements={cover.elements}
        dropActive={canvas.dropActive}
      />
    </div>
  );
}

// A div lets StPageFlip receive mouse gestures; native buttons are excluded by its event forwarding.
export const Cover = forwardRef<HTMLDivElement, Props>(function Cover(
  { book, closed, allowPageGestures, onOpen },
  ref,
) {
  const cover = resolveCover(book);
  return (
    <div
      ref={ref}
      className={`book-cover native-cover cover-style-${cover.style}`}
      data-density="hard"
      role="button"
      tabIndex={closed ? 0 : -1}
      aria-label="Open scrapbook"
      aria-hidden={!closed}
      onClick={() => {
        if (!allowPageGestures) onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <CoverFace cover={cover} />
      <CoverDecoration />
      <ElementLayer elements={cover.elements} />
    </div>
  );
});
