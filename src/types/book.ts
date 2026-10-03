import { z } from "zod";

export const PAGE_WIDTH = 440;
export const PAGE_HEIGHT = 580;
export const imageNameSchema = z
  .string()
  .regex(/^[a-z0-9-]{1,80}\.(?:jpg|png|webp)$/);
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
  rotation: z.number().finite().min(-30).max(30),
};
export const elementSchema = z.discriminatedUnion("type", [
  z.object({
    ...geometry,
    type: z.literal("text"),
    text: z.string().max(4000),
    style: z.enum(["heading", "body", "handwritten", "label"]),
  }),
  z.object({
    ...geometry,
    type: z.literal("image"),
    filename: imageNameSchema,
    caption: z.string().max(200),
    frame: z.enum(["polaroid", "plain"]),
  }),
]);
export const pageSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(100),
  paper: z.enum(["cream", "lined", "sage"]),
  elements: z.array(elementSchema).max(60),
});
export const bookSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    title: z.string().min(1).max(100),
    subtitle: z.string().max(200),
    updatedAt: z.iso.datetime(),
    pages: z.array(pageSchema).min(2).max(100),
  })
  .superRefine((book, ctx) => {
    const ids = new Set<string>();
    for (const page of book.pages) {
      for (const value of [page, ...page.elements]) {
        if (ids.has(value.id))
          ctx.addIssue({ code: "custom", message: "IDs must be unique" });
        ids.add(value.id);
      }
      for (const el of page.elements) {
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
export type BookElement = z.infer<typeof elementSchema>;
export type ImageElement = Extract<BookElement, { type: "image" }>;
