"use client";
import { useEffect, useRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { PAGE_WIDTH, PAGE_HEIGHT, type Book } from "@/types/book";
import { PageRenderer } from "./page-renderer";
import { Cover } from "./cover";
import { Leaf } from "lucide-react";
export type ReaderHandle = {
  navigate: (page: number) => void;
  next: () => void;
  previous: () => void;
  open: () => void;
  close: () => void;
};
type Props = {
  book: Book;
  startPage: number;
  onFlip: (page: number) => void;
  controlsRef: React.RefObject<ReaderHandle | null>;
  allowPageGestures: boolean;
  closed: boolean;
};
type FlipEngine = {
  flip: (page: number) => void;
  flipNext: () => void;
  flipPrev: () => void;
  getCurrentPageIndex: () => number;
  destroy: () => void;
  off: (event: string) => void;
};
export function Reader({
  book,
  startPage,
  onFlip,
  controlsRef,
  allowPageGestures,
  closed,
}: Props) {
  const flip = useRef<{ pageFlip: () => FlipEngine }>(null);
  const engine = useRef<FlipEngine | null>(null);
  useEffect(
    () => () => {
      // react-pageflip does not dispose its engine when the editor replaces the reader.
      const instance = engine.current;
      if (instance) {
        for (const event of ["flip", "changeState", "init", "update"])
          instance.off(event);
        instance.destroy();
      }
      controlsRef.current = null;
    },
    [controlsRef],
  );
  return (
    <HTMLFlipBook
      ref={flip}
      width={PAGE_WIDTH}
      height={PAGE_HEIGHT}
      size="fixed"
      minWidth={PAGE_WIDTH}
      maxWidth={PAGE_WIDTH}
      minHeight={PAGE_HEIGHT}
      maxHeight={PAGE_HEIGHT}
      startPage={startPage + 1}
      drawShadow
      flippingTime={650}
      usePortrait={false}
      startZIndex={1}
      autoSize
      maxShadowOpacity={0.25}
      showCover
      mobileScrollSupport={false}
      clickEventForward
      useMouseEvents={allowPageGestures}
      swipeDistance={30}
      showPageCorners
      disableFlipByClick={false}
      className="flipbook"
      style={{}}
      onInit={() => {
        const instance = flip.current?.pageFlip();
        if (!instance) return;
        engine.current = instance;
        controlsRef.current = {
          // Native page zero is the cover; saved scrapbook pages still start at zero.
          navigate: (page) => flip.current?.pageFlip().flip(page + 1),
          next: () => flip.current?.pageFlip().flipNext(),
          previous: () => flip.current?.pageFlip().flipPrev(),
          open: () => {
            if (instance.getCurrentPageIndex() === 0) instance.flipNext();
          },
          close: () => {
            if (instance.getCurrentPageIndex() === 1) instance.flipPrev();
          },
        };
        onFlip(instance.getCurrentPageIndex() - 1);
      }}
      onFlip={(event) => {
        const page = Number(event.data);
        if (page > 0) onFlip(page - 1);
      }}
      onChangeState={(event) => {
        // Wait for native animation cleanup before changing the surrounding closed-book UI.
        if (
          event.data === "read" &&
          engine.current?.getCurrentPageIndex() === 0
        )
          onFlip(-1);
      }}
    >
      {[
        <Cover
          key="front-cover"
          book={book}
          closed={closed}
          allowPageGestures={allowPageGestures}
          onOpen={() => controlsRef.current?.open()}
        />,
        ...book.pages.map((page, index) => (
          <PageRenderer key={page.id} page={page} number={index + 1} />
        )),
        // react-pageflip clones every child, including null/false, so omit absent pages entirely.
        ...(book.pages.length % 2 === 1
          ? [
              <div key="blank-leaf" className="book-page blank-page">
                <Leaf size={25} />
                <span>Room for another memory.</span>
              </div>,
            ]
          : []),
      ]}
    </HTMLFlipBook>
  );
}
