import { expect, test } from "@playwright/test";
import { canvasPoint, moveSelection } from "../src/lib/editor-geometry";
import type { TextElement } from "../src/types/book";

function note(id: string, overrides: Partial<TextElement> = {}): TextElement {
  return {
    id,
    type: "text",
    text: "A fresh geometry test note",
    style: "body",
    x: 50,
    y: 50,
    width: 100,
    height: 80,
    rotation: 0,
    ...overrides,
  };
}

test("near-page center snaps precisely and an Alt-style bypass preserves free positioning", () => {
  const source = [note("new-note")];
  const snapped = moveSelection(source, ["new-note"], { x: 118, y: 199 });
  expect(snapped).toEqual({
    changes: [{ id: "new-note", x: 170, y: 250 }],
    guides: [
      { axis: "x", position: 220 },
      { axis: "y", position: 290 },
    ],
  });
  expect(
    moveSelection(source, ["new-note"], { x: 118, y: 199 }, { snap: false }),
  ).toEqual({
    changes: [{ id: "new-note", x: 168, y: 249 }],
    guides: [],
  });
});

test("page margins and outer edges snap inside the actual page bounds", () => {
  const source = [note("new-note")];
  expect(moveSelection(source, ["new-note"], { x: -28, y: -24 })).toEqual({
    changes: [{ id: "new-note", x: 24, y: 24 }],
    guides: [
      { axis: "x", position: 24 },
      { axis: "y", position: 24 },
    ],
  });
  expect(moveSelection(source, ["new-note"], { x: 288, y: 449 })).toEqual({
    changes: [{ id: "new-note", x: 340, y: 500 }],
    guides: [
      { axis: "x", position: 440 },
      { axis: "y", position: 580 },
    ],
  });
});

test("nearby element edges supply alignment targets without moving the reference", () => {
  const source = [
    note("moving", { y: 60 }),
    note("reference", { x: 280, y: 350, locked: true }),
  ];
  const original = structuredClone(source);
  expect(moveSelection(source, ["moving"], { x: 127, y: 212 })).toEqual({
    changes: [{ id: "moving", x: 180, y: 270 }],
    guides: [
      { axis: "x", position: 280 },
      { axis: "y", position: 350 },
    ],
  });
  expect(source).toEqual(original);
});

test("rotated elements retain stable document boxes for centers and bounds", () => {
  const rotated = [note("rotated", { rotation: 45 })];
  expect(moveSelection(rotated, ["rotated"], { x: 118, y: 199 })).toEqual(
    moveSelection([note("rotated")], ["rotated"], { x: 118, y: 199 }),
  );
  expect(
    moveSelection(
      rotated,
      ["rotated"],
      { x: 1_000, y: -1_000 },
      { snap: false },
    ).changes,
  ).toEqual([{ id: "rotated", x: 340, y: 0 }]);
});

test("group motion preserves spacing and respects shared bounds while locked selected members remain fixed", () => {
  const source = [
    note("first", { x: 40, y: 80 }),
    note("second", { x: 200, y: 260 }),
    note("locked", { x: 0, y: 0, locked: true }),
  ];
  const original = structuredClone(source);
  const result = moveSelection(
    source,
    ["first", "second", "locked"],
    { x: 1_000, y: 1_000 },
    { snap: false },
  );
  expect(result).toEqual({
    changes: [
      { id: "first", x: 180, y: 320 },
      { id: "second", x: 340, y: 500 },
    ],
    guides: [],
  });
  expect(result.changes[1].x - result.changes[0].x).toBe(160);
  expect(result.changes[1].y - result.changes[0].y).toBe(180);
  expect(moveSelection(source, ["locked"], { x: 30, y: 30 })).toEqual({
    changes: [],
    guides: [],
  });
  expect(source).toEqual(original);
});

test("missing selection is inert, nonfinite movement is safe, and unsnapped fractional movement remains available", () => {
  const source = [note("new-note")];
  expect(moveSelection(source, ["missing"], { x: 50, y: 50 })).toEqual({
    changes: [],
    guides: [],
  });
  expect(
    moveSelection(
      source,
      ["new-note"],
      { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      { snap: false },
    ).changes,
  ).toEqual([{ id: "new-note", x: 50, y: 50 }]);
  expect(
    moveSelection(
      source,
      ["new-note"],
      { x: 12.345, y: -9.876 },
      { snap: false },
    ),
  ).toEqual({
    changes: [{ id: "new-note", x: 62.35, y: 40.12 }],
    guides: [],
  });
});

test("movement outside the small snap threshold stays free and repeated movement uses the same stable targets", () => {
  const source = [note("new-note")];
  const free = moveSelection(source, ["new-note"], { x: 111, y: 190 });
  expect(free).toEqual({
    changes: [{ id: "new-note", x: 161, y: 240 }],
    guides: [],
  });
  for (let attempt = 0; attempt < 20; attempt++)
    expect(moveSelection(source, ["new-note"], { x: 118, y: 199 })).toEqual(
      moveSelection(source, ["new-note"], { x: 120, y: 200 }),
    );
});

test("pointer drop coordinates account for viewport scale and clamp outside the page", () => {
  const rect = { left: 100, top: 200, width: 220, height: 290 } as DOMRect;
  expect(canvasPoint(rect, { x: 210, y: 345 })).toEqual({ x: 220, y: 290 });
  expect(canvasPoint(rect, { x: 50, y: 150 })).toEqual({ x: 0, y: 0 });
  expect(canvasPoint(rect, { x: 500, y: 900 })).toEqual({ x: 440, y: 580 });
  expect(
    canvasPoint({ left: 0, top: 0, width: 0, height: 0 } as DOMRect, {
      x: 24,
      y: 36,
    }),
  ).toEqual({ x: 24, y: 36 });
});
