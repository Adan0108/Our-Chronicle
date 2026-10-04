import { PAGE_HEIGHT, PAGE_WIDTH, type BookElement } from "@/types/book";

export const EDITOR_MARGIN = 24;
export const SNAP_THRESHOLD = 6;
export type CanvasPoint = { x: number; y: number };
export type ElementMove = CanvasPoint & { id: string };
export type SnapGuide = { axis: "x" | "y"; position: number };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const rounded = (value: number) => Math.round(value * 100) / 100;

function snapAxis(
  delta: number,
  anchors: number[],
  targets: number[],
  min: number,
  max: number,
  threshold: number,
) {
  let distance = Infinity;
  let result = { delta, guide: undefined as number | undefined };
  for (const anchor of anchors) {
    for (const target of targets) {
      const next = target - anchor;
      const difference = Math.abs(next - delta);
      if (
        next >= min &&
        next <= max &&
        difference <= threshold &&
        difference < distance
      ) {
        distance = difference;
        result = { delta: next, guide: target };
      }
    }
  }
  return result;
}

// Saved element boxes are unrotated. Use those same boxes for bounds and guides
// so a group keeps its spacing, and locked members never join a move.
export function moveSelection(
  elements: BookElement[],
  selectedIds: string[],
  delta: CanvasPoint,
  options: { snap?: boolean; threshold?: number; margin?: number } = {},
): { changes: ElementMove[]; guides: SnapGuide[] } {
  const moving = elements.filter(
    (element) => selectedIds.includes(element.id) && !element.locked,
  );
  if (!moving.length) return { changes: [], guides: [] };
  const minX = Math.min(...moving.map((element) => element.x));
  const minY = Math.min(...moving.map((element) => element.y));
  const maxX = Math.max(...moving.map((element) => element.x + element.width));
  const maxY = Math.max(...moving.map((element) => element.y + element.height));
  const limits = {
    left: -minX,
    right: PAGE_WIDTH - maxX,
    top: -minY,
    bottom: PAGE_HEIGHT - maxY,
  };
  let x = clamp(
    Number.isFinite(delta.x) ? delta.x : 0,
    limits.left,
    limits.right,
  );
  let y = clamp(
    Number.isFinite(delta.y) ? delta.y : 0,
    limits.top,
    limits.bottom,
  );
  const guides: SnapGuide[] = [];
  if (options.snap !== false) {
    const margin = options.margin ?? EDITOR_MARGIN;
    const threshold = options.threshold ?? SNAP_THRESHOLD;
    const stationary = elements.filter((element) => !moving.includes(element));
    const horizontal = snapAxis(
      x,
      [minX, (minX + maxX) / 2, maxX],
      [
        0,
        PAGE_WIDTH / 2,
        PAGE_WIDTH,
        margin,
        PAGE_WIDTH - margin,
        ...stationary.flatMap((element) => [
          element.x,
          element.x + element.width / 2,
          element.x + element.width,
        ]),
      ],
      limits.left,
      limits.right,
      threshold,
    );
    const vertical = snapAxis(
      y,
      [minY, (minY + maxY) / 2, maxY],
      [
        0,
        PAGE_HEIGHT / 2,
        PAGE_HEIGHT,
        margin,
        PAGE_HEIGHT - margin,
        ...stationary.flatMap((element) => [
          element.y,
          element.y + element.height / 2,
          element.y + element.height,
        ]),
      ],
      limits.top,
      limits.bottom,
      threshold,
    );
    x = horizontal.delta;
    y = vertical.delta;
    if (horizontal.guide !== undefined)
      guides.push({ axis: "x", position: horizontal.guide });
    if (vertical.guide !== undefined)
      guides.push({ axis: "y", position: vertical.guide });
  }
  return {
    changes: moving.map((element) => ({
      id: element.id,
      x: rounded(element.x + x),
      y: rounded(element.y + y),
    })),
    guides,
  };
}

export function canvasPoint(rect: DOMRect, client: CanvasPoint): CanvasPoint {
  return {
    x: clamp(
      ((client.x - rect.left) / (rect.width || PAGE_WIDTH)) * PAGE_WIDTH,
      0,
      PAGE_WIDTH,
    ),
    y: clamp(
      ((client.y - rect.top) / (rect.height || PAGE_HEIGHT)) * PAGE_HEIGHT,
      0,
      PAGE_HEIGHT,
    ),
  };
}
