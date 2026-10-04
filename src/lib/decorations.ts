import type { StickerAsset, StickerElement } from "@/types/book";

export const DECORATIONS: Record<
  StickerAsset,
  {
    label: string;
    category: string;
    color: string;
    width: number;
    height: number;
  }
> = {
  "masking-tape": {
    label: "Masking tape",
    category: "Paper",
    color: "#c8b180",
    width: 150,
    height: 42,
  },
  "paper-tape": {
    label: "Paper tape",
    category: "Paper",
    color: "#b7b59a",
    width: 150,
    height: 44,
  },
  heart: {
    label: "Little heart",
    category: "Marks",
    color: "#bd8277",
    width: 78,
    height: 76,
  },
  star: {
    label: "Golden star",
    category: "Marks",
    color: "#be9a58",
    width: 74,
    height: 74,
  },
  sparkles: {
    label: "Tiny sparkles",
    category: "Marks",
    color: "#b89b65",
    width: 100,
    height: 90,
  },
  arrow: {
    label: "Hand-drawn arrow",
    category: "Marks",
    color: "#8b7255",
    width: 150,
    height: 60,
  },
  flower: {
    label: "Pressed flower",
    category: "Botanical",
    color: "#b78b92",
    width: 86,
    height: 150,
  },
  leaf: {
    label: "Pressed leaf",
    category: "Botanical",
    color: "#788365",
    width: 78,
    height: 132,
  },
  coffee: {
    label: "Coffee doodle",
    category: "Marks",
    color: "#977252",
    width: 110,
    height: 100,
  },
  handwritten: {
    label: "Handwritten flourish",
    category: "Marks",
    color: "#8e775f",
    width: 140,
    height: 64,
  },
  "date-label": {
    label: "Date label",
    category: "Paper",
    color: "#8b7355",
    width: 166,
    height: 62,
  },
  "paper-scrap": {
    label: "Paper scrap",
    category: "Paper",
    color: "#e2d5b9",
    width: 166,
    height: 122,
  },
};

export function createSticker(asset: StickerAsset): StickerElement {
  const preset = DECORATIONS[asset];
  return {
    id: crypto.randomUUID(),
    type: "sticker",
    asset,
    x: 130,
    y: 130,
    width: preset.width,
    height: preset.height,
    rotation: asset === "masking-tape" || asset === "paper-tape" ? -5 : 0,
    color: preset.color,
    ...(asset === "date-label" ? { label: "A day to remember" } : {}),
  };
}
