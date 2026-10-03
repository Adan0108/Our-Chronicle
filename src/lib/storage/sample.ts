import type { Book, BookElement } from "@/types/book";

const text = (
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  style: "heading" | "body" | "handwritten" | "label" = "body",
): BookElement => ({
  id,
  type: "text",
  text: value,
  x,
  y,
  width,
  height,
  style,
  rotation: 0,
});
const image = (
  id: string,
  filename: string,
  caption: string,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): BookElement => ({
  id,
  type: "image",
  filename,
  caption,
  x,
  y,
  width,
  height,
  rotation,
  frame: "polaroid",
});

export function createSampleBook(): Book {
  return {
    schemaVersion: 1,
    revision: 0,
    title: "Our Chronicle",
    subtitle: "Little moments. A life well remembered.",
    updatedAt: new Date().toISOString(),
    pages: [
      {
        id: "page-1",
        title: "The little things",
        paper: "cream",
        elements: [
          text("t1", "CHAPTER ONE · EVERYDAY MAGIC", 44, 44, 352, 26, "label"),
          text("t2", "The little things", 44, 92, 352, 56, "heading"),
          text(
            "t3",
            "Some days don’t need a grand adventure. Just a slow morning, a good cup of coffee, and you.",
            44,
            160,
            352,
            88,
          ),
          image(
            "i1",
            "sample-coffee.jpg",
            "our usual corner, our usual order",
            77,
            270,
            286,
            242,
            -3,
          ),
          text(
            "t4",
            "Here’s to taking the scenic route.",
            48,
            528,
            344,
            36,
            "handwritten",
          ),
        ],
      },
      {
        id: "page-2",
        title: "A Sunday kind of love",
        paper: "lined",
        elements: [
          image(
            "i2",
            "sample-cafe.jpg",
            "a table for two • sunday morning",
            50,
            49,
            340,
            258,
            2,
          ),
          text("t5", "A Sunday kind of love", 44, 344, 352, 54, "heading"),
          text(
            "t6",
            "Rain on the windows. A conversation about everything and nothing. A second cup, then a third.\n\nI hope we always make time for this.",
            44,
            407,
            352,
            144,
          ),
        ],
      },
      {
        id: "page-3",
        title: "Somewhere by the sea",
        paper: "sage",
        elements: [
          text("t7", "CHAPTER TWO · OUT OF OFFICE", 44, 44, 352, 26, "label"),
          text("t8", "Somewhere by the sea", 44, 94, 352, 60, "heading"),
          image(
            "i3",
            "sample-coast.jpg",
            "salt in the air, sand in our shoes",
            44,
            185,
            352,
            245,
            -2,
          ),
          text(
            "t9",
            "No itinerary. No hurry.\nJust the sound of the waves.",
            48,
            478,
            344,
            68,
            "handwritten",
          ),
        ],
      },
      {
        id: "page-4",
        title: "Things to remember",
        paper: "cream",
        elements: [
          text("t10", "A NOTE TO OUR FUTURE SELVES", 48, 52, 344, 26, "label"),
          text("t11", "Things to remember", 48, 106, 344, 60, "heading"),
          text(
            "t12",
            "The best stories are the ones we make together.\n\nSay yes to the impromptu road trip. Take the blurry photograph. Keep the ticket stub. Write down the funny thing before you forget it.\n\nThere is so much beauty in an ordinary day.",
            48,
            198,
            344,
            270,
          ),
          text(
            "t13",
            "More memories to come…",
            48,
            500,
            344,
            40,
            "handwritten",
          ),
        ],
      },
    ],
  };
}

// Offline fallback artwork used when initializing an empty storage directory.
export const sampleArtwork: Record<string, string> = {
  "sample-coffee.jpg": `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><rect width="900" height="650" fill="#ab7f59"/><path d="M0 100H900M0 310H900M0 520H900" stroke="#795238" stroke-width="5"/><rect x="570" y="90" width="220" height="380" rx="8" fill="#d4b99a" transform="rotate(12 680 280)"/><ellipse cx="350" cy="340" rx="210" ry="180" fill="#eae0cf"/><ellipse cx="350" cy="327" rx="130" ry="115" fill="#f7f0df"/><ellipse cx="350" cy="317" rx="105" ry="89" fill="#754a2e"/><path d="M320 352C190 250 310 230 350 280C395 223 504 268 370 355Z" fill="#e8c69e"/><path d="M486 295C570 255 570 390 480 360" fill="none" stroke="#f7f0df" stroke-width="26"/></svg>`,
  "sample-cafe.jpg": `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><rect width="900" height="650" fill="#cbb79b"/><rect x="80" y="45" width="500" height="420" fill="#536758"/><path d="M80 255H580M330 45V465" stroke="#eee0c8" stroke-width="22"/><rect x="640" y="95" width="180" height="180" fill="#91754f"/><rect x="0" y="485" width="900" height="165" fill="#875c41"/><ellipse cx="310" cy="500" rx="190" ry="45" fill="#d9bf91"/><path d="M470 650V400H600V650" fill="#544936"/><path d="M220 475V390H350V475" fill="#f3e8d5"/><ellipse cx="285" cy="390" rx="65" ry="15" fill="#67412e"/><path d="M712 485V350" stroke="#667348" stroke-width="10"/><ellipse cx="673" cy="368" rx="55" ry="23" fill="#667348" transform="rotate(30 673 368)"/><ellipse cx="752" cy="335" rx="60" ry="25" fill="#667348" transform="rotate(-35 752 335)"/><path d="M667 450H760L745 520H682Z" fill="#c58b67"/></svg>`,
  "sample-coast.jpg": `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="650"><rect width="900" height="650" fill="#ccd9d0"/><circle cx="700" cy="130" r="55" fill="#f8e5bd"/><path d="M0 275Q300 235 900 270V650H0Z" fill="#658b89"/><path d="M0 435Q350 335 900 420V650H0Z" fill="#e6d2af"/><path d="M0 430Q350 330 900 410" fill="none" stroke="#f7f0db" stroke-width="22"/><path d="M0 335Q300 300 620 350" fill="none" stroke="#a9c7bb" stroke-width="9"/><path d="M0 200L190 340L0 385Z" fill="#788270"/></svg>`,
};
