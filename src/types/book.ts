import { z } from "zod";

export const PAGE_WIDTH = 440;
export const PAGE_HEIGHT = 580;
export const FONT_FAMILIES = {
  serif: 'Georgia, "Times New Roman", serif',
  handwritten: '"Segoe Print", "Bradley Hand", cursive',
  sans: "Arial, Helvetica, sans-serif",
} as const;
export const TEXT_PRESETS = {
  heading: {
    fontFamily: "serif",
    fontSize: 31,
    color: "#514431",
    bold: false,
    italic: false,
    align: "left",
  },
  body: {
    fontFamily: "serif",
    fontSize: 16,
    color: "#514431",
    bold: false,
    italic: false,
    align: "left",
  },
  handwritten: {
    fontFamily: "handwritten",
    fontSize: 17,
    color: "#697355",
    bold: false,
    italic: false,
    align: "left",
  },
  label: {
    fontFamily: "sans",
    fontSize: 10,
    color: "#88724f",
    bold: false,
    italic: false,
    align: "left",
  },
} as const;
export const cropSchema = z
  .object({
    x: z.number().finite().min(0).max(100),
    y: z.number().finite().min(0).max(100),
    width: z.number().finite().min(0.01).max(100),
    height: z.number().finite().min(0.01).max(100),
  })
  .refine(
    (crop) => crop.x + crop.width <= 100.001 && crop.y + crop.height <= 100.001,
    "Crop must stay inside the image",
  );
export const imageNameSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,80}\.(?:jpg|png|webp)$/);
export const audioNameSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,80}\.(?:mp3|wav|ogg)$/);
export const themeSchema = z.enum([
  "cafe",
  "vintage",
  "ivory",
  "wedding",
  "campus",
]);
export const audioSchema = z.object({
  filename: audioNameSchema,
  title: z.string().min(1).max(120),
  volume: z.number().finite().min(0).max(1),
  loop: z.boolean(),
});
const geometry = {
  id: z.string().min(1).max(100),
  x: z
    .number()
    .finite()
    .min(0)
    .max(PAGE_WIDTH - 20),
  y: z
    .number()
    .finite()
    .min(0)
    .max(PAGE_HEIGHT - 20),
  width: z.number().finite().min(20).max(PAGE_WIDTH),
  height: z.number().finite().min(20).max(PAGE_HEIGHT),
  rotation: z.number().finite().min(-180).max(180),
  locked: z.boolean().optional(),
};
export const elementSchema = z.discriminatedUnion("type", [
  z.object({
    ...geometry,
    type: z.literal("text"),
    text: z.string().max(4000),
    style: z.enum(["heading", "body", "handwritten", "label"]),
    fontFamily: z.enum(["serif", "handwritten", "sans"]).optional(),
    fontSize: z.number().finite().min(8).max(72).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
  }),
  z.object({
    ...geometry,
    type: z.literal("image"),
    kind: z.enum(["photo", "decoration"]).optional(),
    filename: imageNameSchema.optional(),
    caption: z.string().max(200),
    frame: z.enum([
      "polaroid",
      "plain",
      "soft-shadow",
      "paper",
      "taped",
      "borderless",
    ]),
    crop: cropSchema.nullable().optional(),
  }),
  z.object({
    ...geometry,
    type: z.literal("sticker"),
    asset: z.enum([
      "masking-tape",
      "paper-tape",
      "heart",
      "star",
      "sparkles",
      "arrow",
      "flower",
      "leaf",
      "coffee",
      "handwritten",
      "date-label",
      "paper-scrap",
    ]),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    label: z.string().max(40).optional(),
  }),
]);
export const pageSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  paper: z.enum(["cream", "lined", "sage"]),
  elements: z.array(elementSchema).max(60),
});
export const coverSchema = z.object({
  style: z.enum(["leather", "linen", "sage", "rose", "ivory"]),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  elements: z.array(elementSchema).max(60),
});
export const bookSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    title: z.string().min(1).max(100),
    subtitle: z.string().max(200),
    updatedAt: z.iso.datetime(),
    cover: coverSchema.optional(),
    theme: themeSchema.optional(),
    audio: audioSchema.optional(),
    pages: z.array(pageSchema).min(2).max(100),
  })
  .superRefine((book, ctx) => {
    const ids = new Set<string>();
    const surfaces = [...(book.cover ? [book.cover] : []), ...book.pages];
    for (const surface of surfaces) {
      for (const value of [
        ...("id" in surface ? [surface] : []),
        ...surface.elements,
      ]) {
        if (ids.has(value.id))
          ctx.addIssue({ code: "custom", message: "IDs must be unique" });
        ids.add(value.id);
      }
      for (const el of surface.elements) {
        if (
          el.x + el.width > PAGE_WIDTH + 1 ||
          el.y + el.height > PAGE_HEIGHT + 1
        )
          ctx.addIssue({
            code: "custom",
            message: "Elements must fit on the page",
          });
      }
    }
  });
export type Book = z.infer<typeof bookSchema>;
export type BookPage = z.infer<typeof pageSchema>;
export type BookCover = z.infer<typeof coverSchema>;
export type CoverStyle = BookCover["style"];
export type BookElement = z.infer<typeof elementSchema>;
export type ImageElement = Extract<BookElement, { type: "image" }>;
export type TextElement = Extract<BookElement, { type: "text" }>;
export type StickerElement = Extract<BookElement, { type: "sticker" }>;
export type StickerAsset = StickerElement["asset"];
export type BookTheme = z.infer<typeof themeSchema>;
export type BookAudio = z.infer<typeof audioSchema>;
export type ImageCrop = z.infer<typeof cropSchema>;
export type PageTemplate =
  "blank" | "journal" | "single-photo" | "two-photos" | "collage";
