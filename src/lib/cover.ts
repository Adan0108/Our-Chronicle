import type { Book, BookCover, BookElement, TextElement } from "@/types/book";

export const COVER_STYLES = {
  leather: {
    label: "Coffee leather",
    backgroundColor: "#72523c",
    textColor: "#ecd9b8",
  },
  linen: {
    label: "Cream linen",
    backgroundColor: "#ded2bc",
    textColor: "#594d3e",
  },
  sage: {
    label: "Muted sage",
    backgroundColor: "#7f8973",
    textColor: "#faf1de",
  },
  rose: {
    label: "Dusty rose",
    backgroundColor: "#b18b84",
    textColor: "#fff3e3",
  },
  ivory: {
    label: "Minimal ivory",
    backgroundColor: "#eee7d7",
    textColor: "#5b5042",
  },
} as const;

/** Persisted elements only; legacy cover artwork has no image references. */
export function bookElements(book: Book): BookElement[] {
  return [
    ...(book.cover?.elements ?? []),
    ...book.pages.flatMap((page) => page.elements),
  ];
}

/** Old books get an editable default without changing their JSON on load. */
export function resolveCover(book: Book): BookCover {
  if (book.cover) return book.cover;
  const usedIds = new Set([
    ...book.pages.map((page) => page.id),
    ...bookElements(book).map((element) => element.id),
  ]);
  const id = (name: string) => {
    const base = `cover-default-${name}`;
    let candidate = base;
    let suffix = 1;
    while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`;
    usedIds.add(candidate);
    return candidate;
  };
  const text = (
    name: string,
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    style: TextElement["style"],
    italic = false,
  ): TextElement => ({
    id: id(name),
    type: "text",
    text: value,
    style,
    x,
    y,
    width,
    height,
    rotation: 0,
    fontSize,
    fontFamily: style === "label" ? "sans" : "serif",
    color: COVER_STYLES.leather.textColor,
    align: "center",
    italic,
    bold: false,
  });
  return {
    style: "leather",
    backgroundColor: COVER_STYLES.leather.backgroundColor,
    elements: [
      text("topline", "A COLLECTION OF OUR DAYS", 42, 52, 356, 24, 9, "label"),
      text("title", book.title, 66, 248, 308, 120, 46, "heading"),
      text("subtitle", book.subtitle, 85, 382, 270, 64, 14, "body", true),
      text(
        "bottom",
        "COLLECT MOMENTS, KEEP THEM CLOSE",
        42,
        514,
        356,
        24,
        8,
        "label",
      ),
    ],
  };
}
