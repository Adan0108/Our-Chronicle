import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  type BookElement,
  type BookPage,
  type PageTemplate,
} from "@/types/book";

export function duplicateElement(
  element: BookElement,
  offset = true,
): BookElement {
  return {
    ...element,
    id: crypto.randomUUID(),
    x: Math.min(PAGE_WIDTH - element.width, element.x + (offset ? 14 : 0)),
    y: Math.min(PAGE_HEIGHT - element.height, element.y + (offset ? 14 : 0)),
    locked: offset ? false : element.locked,
  };
}

export function duplicateBookPage(page: BookPage): BookPage {
  return {
    ...page,
    id: crypto.randomUUID(),
    title: `${page.title} (copy)`.slice(0, 100),
    elements: page.elements.map((element) => duplicateElement(element, false)),
  };
}

export function createPageFromTemplate(
  template: PageTemplate = "blank",
): BookPage {
  const text = (
    value: string,
    x: number,
    y: number,
    width: number,
    height: number,
    style: "heading" | "body" | "handwritten" | "label" = "body",
  ): BookElement => ({
    id: crypto.randomUUID(),
    type: "text",
    text: value,
    x,
    y,
    width,
    height,
    rotation: 0,
    style,
  });
  const photo = (
    caption: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number,
  ): BookElement => ({
    id: crypto.randomUUID(),
    type: "image",
    caption,
    x,
    y,
    width,
    height,
    rotation,
    frame: "polaroid",
  });
  const pages: Record<
    PageTemplate,
    { title: string; paper: BookPage["paper"]; elements: () => BookElement[] }
  > = {
    blank: {
      title: "A new memory",
      paper: "cream",
      elements: () => [text("A new memory", 40, 70, 360, 70, "heading")],
    },
    journal: {
      title: "A page from our journal",
      paper: "lined",
      elements: () => [
        text("A page from our journal", 40, 55, 360, 85, "heading"),
        text("THE DATE · THE PLACE · THE FEELING", 42, 155, 350, 30, "label"),
        text(
          "Start with a small moment. Where were you? What made you smile?\n\nWrite the details you want to remember…",
          42,
          205,
          350,
          240,
        ),
        text(
          "Some days deserve a page of their own.",
          42,
          485,
          350,
          55,
          "handwritten",
        ),
      ],
    },
    "single-photo": {
      title: "One moment, kept close",
      paper: "cream",
      elements: () => [
        text("One moment, kept close", 40, 55, 360, 70, "heading"),
        photo("A photograph worth keeping", 55, 145, 330, 320, -2),
        text(
          "The story behind this photograph…",
          50,
          490,
          340,
          55,
          "handwritten",
        ),
      ],
    },
    "two-photos": {
      title: "Two moments together",
      paper: "lined",
      elements: () => [
        text("Two moments together", 40, 50, 360, 65, "heading"),
        photo("The first little moment", 65, 130, 300, 170, -2),
        photo("And the next", 70, 330, 300, 170, 2),
        text(
          "A pair of memories, side by side in our story.",
          42,
          520,
          356,
          35,
          "handwritten",
        ),
      ],
    },
    collage: {
      title: "Little pieces of a day",
      paper: "sage",
      elements: () => [
        text("Little pieces of a day", 40, 55, 360, 65, "heading"),
        photo("A small detail", 40, 145, 175, 195, -4),
        photo("A favorite place", 235, 160, 165, 175, 4),
        photo("A feeling to remember", 80, 370, 275, 165, -2),
      ],
    },
  };
  const selected = pages[template];
  return {
    id: crypto.randomUUID(),
    title: selected.title,
    paper: selected.paper,
    elements: selected.elements(),
  };
}
