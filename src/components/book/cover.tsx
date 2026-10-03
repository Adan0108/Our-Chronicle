"use client";

import { forwardRef } from "react";
import { Leaf } from "lucide-react";
import type { Book } from "@/types/book";

type Props = {
  book: Book;
  closed: boolean;
  allowPageGestures: boolean;
  onOpen: () => void;
};

// A div lets StPageFlip receive mouse gestures; native buttons are excluded by its event forwarding.
export const Cover = forwardRef<HTMLDivElement, Props>(function Cover(
  { book, closed, allowPageGestures, onOpen },
  ref,
) {
  return (
    <div
      ref={ref}
      className="book-cover native-cover"
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
      <div className="cover-artwork">
        <span className="cover-spine" />
        <span className="cover-border" />
        <span className="cover-topline">A COLLECTION OF OUR DAYS</span>
        <span className="cover-emblem">
          <Leaf size={47} strokeWidth={1} />
          <span className="emblem-star">✦</span>
        </span>
        <span className="cover-title">{book.title}</span>
        <span className="cover-subtitle">{book.subtitle}</span>
        <span className="cover-rule" />
        <span className="cover-bottom">COLLECT MOMENTS, KEEP THEM CLOSE</span>
        <span className="bookmark-ribbon" />
      </div>
    </div>
  );
});
