"use client";
import { useRef } from "react";
import HTMLFlipBook from "react-pageflip";
import { PAGE_WIDTH, PAGE_HEIGHT, type Book } from "@/types/book";
import { PageRenderer } from "./page-renderer";
export type ReaderHandle = {
  navigate: (page: number) => void;
  next: () => void;
  previous: () => void;
};
type Props = {
  book: Book;
  startPage: number;
  onFlip: (page: number) => void;
  controlsRef: React.RefObject<ReaderHandle | null>;
  allowPageGestures: boolean;
};
type FlipEngine = {
  flip: (page: number) => void;
  flipNext: () => void;
  flipPrev: () => void;
};
export function Reader({
  book,
  startPage,
  onFlip,
  controlsRef,
  allowPageGestures,
}: Props) {
  const flip = useRef<{ pageFlip: () => FlipEngine }>(null);
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
      startPage={startPage}
      drawShadow
      flippingTime={650}
      usePortrait={false}
      startZIndex={1}
      autoSize
      maxShadowOpacity={0.25}
      showCover={false}
      mobileScrollSupport={false}
      clickEventForward
      useMouseEvents={allowPageGestures}
      swipeDistance={30}
      showPageCorners
      disableFlipByClick={false}
      className="flipbook"
      style={{}}
      onInit={() => {
        controlsRef.current = {
          navigate: (page) => flip.current?.pageFlip().flip(page),
          next: () => flip.current?.pageFlip().flipNext(),
          previous: () => flip.current?.pageFlip().flipPrev(),
        };
      }}
      onFlip={(event) => onFlip(Number(event.data))}
    >
      {book.pages.map((page, index) => (
        <PageRenderer key={page.id} page={page} number={index + 1} />
      ))}
    </HTMLFlipBook>
  );
}
