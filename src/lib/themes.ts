import type { BookTheme } from "@/types/book";

export type ThemePersonality = {
  label: string;
  description: string;
  atmosphere: {
    particle: "dust" | "petal" | "paper" | "none";
    count: number;
    accent: "steam" | "postcard" | "serif" | "floral" | "notebook";
    ink: string;
    petal: string;
  };
};

export const THEMES: Record<BookTheme, ThemePersonality> = {
  cafe: {
    label: "Café",
    description:
      "Cream paper, warm lamplight, and a quiet café window with curling steam.",
    atmosphere: {
      particle: "dust",
      count: 10,
      accent: "steam",
      ink: "#8e6946",
      petal: "#dec69a",
    },
  },
  vintage: {
    label: "Vintage Journal",
    description:
      "Aged paper and an overlapping collage of postcards, stamps, and old notes.",
    atmosphere: {
      particle: "dust",
      count: 7,
      accent: "postcard",
      ink: "#80694b",
      petal: "#c8b38b",
    },
  },
  ivory: {
    label: "Minimal Ivory",
    description:
      "Clean ivory paper, quiet light, and softly embossed corner linework.",
    atmosphere: {
      particle: "none",
      count: 0,
      accent: "serif",
      ink: "#a39b89",
      petal: "#e0dbcf",
    },
  },
  wedding: {
    label: "Wedding",
    description:
      "Ivory pages framed by blush flowers, delicate leaves, and soft glints.",
    atmosphere: {
      particle: "petal",
      count: 10,
      accent: "floral",
      ink: "#927f72",
      petal: "#d6a59e",
    },
  },
  campus: {
    label: "Campus Diary",
    description:
      "Spring sakura branches, notebook paper, and handwritten diary keepsakes.",
    atmosphere: {
      particle: "paper",
      count: 8,
      accent: "notebook",
      ink: "#816c5c",
      petal: "#d69ba3",
    },
  },
};
