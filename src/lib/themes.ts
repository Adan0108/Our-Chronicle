import type { BookTheme } from "@/types/book";

export const THEMES: Record<BookTheme, { label: string; description: string }> =
  {
    cafe: {
      label: "Café",
      description: "Warm cream paper, coffee tones, and olive accents.",
    },
    vintage: {
      label: "Vintage Journal",
      description: "Aged ivory paper and mellow sepia surroundings.",
    },
    ivory: {
      label: "Minimal Ivory",
      description: "Quiet neutral tones and clean, pale paper.",
    },
    wedding: {
      label: "Wedding",
      description: "Soft blush surroundings with delicate ivory pages.",
    },
    campus: {
      label: "Campus Diary",
      description: "Fresh sage accents and softly toned notebook paper.",
    },
  };
