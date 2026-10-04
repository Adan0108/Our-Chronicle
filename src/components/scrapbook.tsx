"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  BookX,
  Check,
  ChevronLeft,
  ChevronRight,
  Feather,
  Leaf,
  LoaderCircle,
  Pencil,
  Save,
  Sparkles,
  Undo2,
  Redo2,
  X,
  Gift,
  Maximize,
  Minimize,
} from "lucide-react";
import { useBook } from "@/hooks/use-book";
import {
  type Book,
  type BookElement,
  type BookCover,
  type BookPage,
  type PageTemplate,
  type StickerAsset,
  type BookAudio,
  type BookTheme,
  PAGE_WIDTH,
  PAGE_HEIGHT,
} from "@/types/book";
import {
  createPageFromTemplate,
  duplicateBookPage,
  duplicateElement,
} from "@/lib/editor";
import { COVER_STYLES, resolveCover } from "@/lib/cover";
import { EditableCover } from "./book/cover";
import { Reader, type ReaderHandle } from "./book/reader";
import { PageRenderer, ImageRevisionContext } from "./book/page-renderer";
import { Inspector } from "./editor/inspector";
import { DeletePageDialog } from "./editor/delete-page-dialog";
import { BookActions } from "./book/book-actions";
import { BookAmbience } from "./book/ambience";
import { createSticker } from "@/lib/decorations";
import {
  CanvasEditorContext,
  type CanvasPoint,
  type ElementPosition,
} from "./editor/editor-context";
import { ImageImportDialog } from "./editor/image-import-dialog";
import { DecorationDialog } from "./editor/decoration-dialog";
import { QuickTools } from "./editor/quick-tools";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const INPUT_TARGETS =
  "input, textarea, select, [contenteditable], dialog[open], [role='dialog'], [role='menu'], [role='slider'], [role='combobox'], [data-editor-shortcuts='ignore']";

export function Scrapbook({
  initialBook,
  initialNotice = "",
}: {
  initialBook: Book;
  initialNotice?: string;
}) {
  const {
    book,
    update,
    save,
    getRevision,
    status,
    error,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useBook(initialBook);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingTarget, setEditingTarget] = useState<"pages" | "cover">(
    "pages",
  );
  const [spread, setSpread] = useState(0);
  const [activePageId, setActivePageId] = useState(book.pages[0].id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedId = selectedIds.at(-1) ?? null;
  const [contextPoint, setContextPoint] = useState<CanvasPoint | null>(null);
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIds(id ? [id] : []);
    setContextPoint(null);
  }, []);
  const [imageImport, setImageImport] = useState<{
    files: File[];
    surfaceId: string;
    point: CanvasPoint;
  } | null>(null);
  const [decorationSurface, setDecorationSurface] = useState<string | null>(
    null,
  );
  const uploading = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [transferBusy, setTransferBusy] = useState(false);
  const [deletePage, setDeletePage] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [presentation, setPresentation] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const presentationButton = useRef<HTMLButtonElement>(null);
  const exitPresentationButton = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const reader = useRef<ReaderHandle | null>(null);
  const spreadScrollRef = useRef<HTMLDivElement>(null);
  const wasOpened = useRef(false);
  const [needsPan, setNeedsPan] = useState(false);
  const assetBusy = busy || audioBusy;
  const exitPresentation = useCallback(() => {
    setPresentation(false);
    if (document.fullscreenElement) void document.exitFullscreen();
    requestAnimationFrame(() => presentationButton.current?.focus());
  }, []);
  useEffect(() => {
    const changed = () => {
      const active = Boolean(document.fullscreenElement);
      setFullscreen(active);
      if (wasFullscreen.current && !active) exitPresentation();
      wasFullscreen.current = active;
    };
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, [exitPresentation]);
  useEffect(() => {
    if (!presentation) return;
    exitPresentationButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Let the native ambience popover consume its first Escape.
      if (document.querySelector(":popover-open, dialog[open]")) return;
      event.preventDefault();
      exitPresentation();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [presentation, exitPresentation]);
  useEffect(() => {
    const closed = !opened && wasOpened.current;
    wasOpened.current = opened;
    if (closed) {
      const focusCover = () => {
        const cover =
          spreadScrollRef.current?.querySelector<HTMLElement>(".native-cover");
        if (cover?.getAttribute("aria-hidden") === "false")
          cover.focus({ preventScroll: true });
      };
      const pages = spreadScrollRef.current?.querySelector(".stf__block");
      // The wrapper removes/reinserts page nodes in a later React effect, dropping
      // focus even when the cover node is unchanged. Restore it after that batch.
      const observer = new MutationObserver(() => {
        focusCover();
        observer.disconnect();
      });
      if (pages) observer.observe(pages, { childList: true });
      focusCover();
      return () => observer.disconnect();
    }
  }, [opened]);
  useEffect(() => {
    const node = spreadScrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const spread = node.querySelector<HTMLElement>(".book-spread");
      if (!spread) return;
      const style = getComputedStyle(node);
      const availableWidth =
        node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      // Page curls and shadows inflate scrollWidth; only real layout width should change reader mode.
      setNeedsPan(spread.offsetWidth > availableWidth + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [opened, editing]);
  useEffect(() => {
    if (!editing && needsPan) {
      const node = spreadScrollRef.current;
      if (node)
        node.scrollLeft = opened
          ? 0
          : (node.scrollWidth - node.clientWidth) / 2;
    }
  }, [opened, editing, needsPan]);
  const activePage =
    book.pages.find((page) => page.id === activePageId) || book.pages[0];
  const coverEditing = editing && editingTarget === "cover";
  const cover = resolveCover(book);
  const editorPage: BookPage = coverEditing
    ? {
        id: "front-cover",
        title: "Front cover",
        paper: "cream",
        elements: cover.elements,
      }
    : activePage;
  const selectedElement = editorPage.elements.find(
    (element) => element.id === selectedId,
  );
  const selectedElements = editorPage.elements.filter((element) =>
    selectedIds.includes(element.id),
  );
  const activeSurfaceId = coverEditing ? "front-cover" : activePage.id;
  const spreadStart = Math.min(
    Math.floor(spread / 2) * 2,
    Math.floor((book.pages.length - 1) / 2) * 2,
  );
  const applyHistory = useCallback(
    (direction: "undo" | "redo") => {
      if (assetBusy || transferBusy) return;
      const restored = direction === "undo" ? undo() : redo();
      if (!restored) return;
      if (coverEditing) {
        const elements = resolveCover(restored).elements;
        const added = elements.filter(
          (element) =>
            !cover.elements.some((current) => current.id === element.id),
        );
        const retained = selectedIds.filter((id) =>
          elements.some((element) => element.id === id),
        );
        setSelectedIds(
          retained.length ? retained : added.map((element) => element.id),
        );
        setContextPoint(null);
        return;
      }
      const restoredPage = restored.pages.find(
        (page) => !book.pages.some((current) => current.id === page.id),
      );
      let index = restored.pages.findIndex(
        (page) => page.id === (restoredPage?.id ?? activePageId),
      );
      if (index < 0)
        index = Math.min(
          book.pages.findIndex((page) => page.id === activePageId),
          restored.pages.length - 1,
        );
      index = Math.max(0, index);
      const page = restored.pages[index];
      setActivePageId(page.id);
      setSpread(Math.floor(index / 2) * 2);
      const restoredElements =
        !restoredPage &&
        page.elements.filter(
          (element) =>
            !book.pages.some((current) =>
              current.elements.some((item) => item.id === element.id),
            ),
        );
      const retained = selectedIds.filter((id) =>
        page.elements.some((element) => element.id === id),
      );
      setSelectedIds(
        retained.length
          ? retained
          : restoredElements
            ? restoredElements.map((element) => element.id)
            : [],
      );
      setContextPoint(null);
    },
    [
      activePageId,
      book.pages,
      assetBusy,
      transferBusy,
      coverEditing,
      cover.elements,
      redo,
      selectedIds,
      undo,
    ],
  );
  useEffect(() => {
    if (!editing) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        event.defaultPrevented ||
        target?.closest(INPUT_TARGETS) ||
        document.querySelector(
          "dialog[open], :popover-open, .layers-section .layer-row.sorting",
        )
      )
        return;
      const key = event.key.toLowerCase();
      const command = event.ctrlKey || event.metaKey;
      if (command && (key === "z" || key === "y")) {
        event.preventDefault();
        applyHistory(key === "y" || event.shiftKey ? "redo" : "undo");
      } else if (key === "escape") {
        event.preventDefault();
        if (contextPoint) setContextPoint(null);
        else setSelectedId(null);
      } else if (!assetBusy && !transferBusy && selectedElements.length) {
        if (command && key === "d") {
          event.preventDefault();
          copyElement();
        } else if (!command && (key === "delete" || key === "backspace")) {
          event.preventDefault();
          removeElements();
        } else if (event.altKey && (key === "arrowup" || key === "arrowdown")) {
          event.preventDefault();
          layerElement(key === "arrowup" ? "forward" : "backward");
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  useEffect(() => {
    if (!editing) return;
    const paste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        assetBusy ||
        transferBusy ||
        imageImport ||
        target?.closest(INPUT_TARGETS) ||
        document.querySelector("dialog[open], :popover-open")
      )
        return;
      const files = Array.from(event.clipboardData?.items ?? [])
        .filter(
          (item) => item.kind === "file" && item.type.startsWith("image/"),
        )
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file));
      if (!files.length) return;
      event.preventDefault();
      queueImages(activeSurfaceId, files, {
        x: PAGE_WIDTH / 2,
        y: PAGE_HEIGHT / 2,
      });
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  useEffect(() => {
    if (!editing || !selectedIds.length) return;
    const outside = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target?.closest(".main-workspace") ||
        target.closest(
          ".editable-element, button, input, textarea, select, dialog",
        )
      )
        return;
      setSelectedId(null);
    };
    window.addEventListener("pointerdown", outside);
    return () => window.removeEventListener("pointerdown", outside);
  }, [editing, selectedIds.length, setSelectedId]);

  function selectPage(index: number) {
    if (assetBusy || transferBusy) return;
    setContentsOpen(false);
    setEditingTarget("pages");
    setOpened(true);
    setActivePageId(book.pages[index].id);
    setSelectedId(null);
    if (editing) setSpread(Math.floor(index / 2) * 2);
    else reader.current?.navigate(index);
    spreadScrollRef.current?.scrollTo({
      left: index % 2 ? spreadScrollRef.current.scrollWidth : 0,
      behavior: "smooth",
    });
  }
  function changePage(id: string, changes: Partial<BookPage>) {
    update(
      (previous) => ({
        ...previous,
        pages: previous.pages.map((page) =>
          page.id === id ? { ...page, ...changes } : page,
        ),
      }),
      Object.keys(changes).length === 1 && "title" in changes
        ? `page:${id}:title`
        : undefined,
    );
  }
  function changeCover(changes: Partial<BookCover>) {
    update(
      (previous) => ({
        ...previous,
        cover: { ...resolveCover(previous), ...changes },
      }),
      Object.keys(changes).length === 1 && "backgroundColor" in changes
        ? "cover:backgroundColor"
        : undefined,
    );
  }
  function updateSurface(
    surfaceId: string,
    transform: (elements: BookElement[]) => BookElement[],
  ) {
    update((previous) =>
      surfaceId === "front-cover"
        ? {
            ...previous,
            cover: {
              ...resolveCover(previous),
              elements: transform(resolveCover(previous).elements),
            },
          }
        : {
            ...previous,
            pages: previous.pages.map((page) =>
              page.id === surfaceId
                ? { ...page, elements: transform(page.elements) }
                : page,
            ),
          },
    );
  }
  function selectSurface(
    surfaceId: string,
    id: string | null,
    additive = false,
  ) {
    if (!editing) return;
    if (surfaceId !== "front-cover") setActivePageId(surfaceId);
    setSelectedIds((previous) => {
      if (!id) return [];
      if (!additive || surfaceId !== activeSurfaceId) return [id];
      return previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id];
    });
    setContextPoint(null);
  }
  function moveElements(surfaceId: string, positions: ElementPosition[]) {
    if (assetBusy || transferBusy) return;
    const changes = new Map(
      positions.map((position) => [position.id, position]),
    );
    updateSurface(surfaceId, (elements) =>
      elements.map((element) => {
        const position = changes.get(element.id);
        return !position || element.locked
          ? element
          : {
              ...element,
              x: Math.max(0, Math.min(PAGE_WIDTH - element.width, position.x)),
              y: Math.max(
                0,
                Math.min(PAGE_HEIGHT - element.height, position.y),
              ),
            };
      }),
    );
  }
  function openContextMenu(surfaceId: string, id: string, point: CanvasPoint) {
    if (assetBusy || transferBusy) return;
    if (surfaceId !== activeSurfaceId || !selectedIds.includes(id))
      selectSurface(surfaceId, id);
    setContextPoint(point);
  }
  function reorderElements(frontmostIds: string[]) {
    if (assetBusy || transferBusy) return;
    updateSurface(activeSurfaceId, (elements) => {
      const byId = new Map(elements.map((element) => [element.id, element]));
      if (
        frontmostIds.length !== elements.length ||
        new Set(frontmostIds).size !== elements.length ||
        frontmostIds.some((id) => !byId.has(id))
      )
        return elements;
      return [...frontmostIds].reverse().map((id) => byId.get(id)!);
    });
  }
  function removeElements() {
    if (assetBusy || transferBusy || !selectedElements.length) return;
    const ids = new Set(selectedIds);
    updateSurface(activeSurfaceId, (elements) =>
      elements.filter((element) => !ids.has(element.id)),
    );
    setSelectedId(null);
  }
  function lockElements(locked: boolean) {
    if (assetBusy || transferBusy) return;
    const ids = new Set(selectedIds);
    updateSurface(activeSurfaceId, (elements) =>
      elements.map((element) =>
        ids.has(element.id) ? { ...element, locked } : element,
      ),
    );
  }
  function changeElement(
    pageId: string,
    id: string,
    changes: Partial<BookElement>,
  ) {
    const transformElements = (elements: BookElement[]) =>
      elements.map((element) =>
        element.id === id
          ? ({ ...element, ...changes } as BookElement)
          : element,
      );
    update(
      (previous) =>
        coverEditing
          ? {
              ...previous,
              cover: {
                ...resolveCover(previous),
                elements: transformElements(resolveCover(previous).elements),
              },
            }
          : {
              ...previous,
              pages: previous.pages.map((page) =>
                page.id === pageId
                  ? { ...page, elements: transformElements(page.elements) }
                  : page,
              ),
            },
      Object.keys(changes).length === 1 &&
        ["text", "caption", "fontSize", "rotation", "color"].includes(
          Object.keys(changes)[0],
        )
        ? `element:${id}:${Object.keys(changes)[0]}`
        : undefined,
    );
  }
  function addText(surfaceId = activeSurfaceId) {
    if (assetBusy || transferBusy) return;
    const surfaceElements =
      surfaceId === "front-cover"
        ? cover.elements
        : book.pages.find((page) => page.id === surfaceId)?.elements;
    if (!surfaceElements || surfaceElements.length >= 60) return;
    const element: BookElement = {
      id: crypto.randomUUID(),
      type: "text",
      text: "A little moment to remember…",
      x: 55,
      y: 80,
      width: 330,
      height: 110,
      rotation: 0,
      style: "body",
      ...(coverEditing ? { color: COVER_STYLES[cover.style].textColor } : {}),
    };
    updateSurface(surfaceId, (elements) => [...elements, element]);
    if (surfaceId !== "front-cover") setActivePageId(surfaceId);
    setSelectedId(element.id);
  }
  function addSticker(asset: StickerAsset, surfaceId = activeSurfaceId) {
    const surfaceElements =
      surfaceId === "front-cover"
        ? cover.elements
        : book.pages.find((page) => page.id === surfaceId)?.elements;
    if (
      assetBusy ||
      transferBusy ||
      !surfaceElements ||
      surfaceElements.length >= 60
    )
      return;
    const element = createSticker(asset);
    updateSurface(surfaceId, (elements) => [...elements, element]);
    if (surfaceId !== "front-cover") setActivePageId(surfaceId);
    setSelectedId(element.id);
  }
  function changeTheme(theme: BookTheme) {
    update((previous) => ({ ...previous, theme }));
  }
  function changeAudio(audio: BookAudio | undefined) {
    update((previous) => ({ ...previous, audio }), "audio:settings");
  }
  async function upload(file: File, replace = false, decoration = false) {
    if (assetBusy || transferBusy || uploading.current) return;
    if (file.size > 10 * 1024 * 1024) {
      setNotice("Choose an image smaller than 10 MB.");
      return;
    }
    if (!IMAGE_TYPES.includes(file.type)) {
      setNotice("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    uploading.current = true;
    setBusy(true);
    setNotice("");
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch("/api/images", {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (replace && selectedElement?.type === "image")
        changeElement(activePage.id, selectedElement.id, {
          filename: result.filename,
          crop: null,
        });
      else {
        const width = decoration ? 160 : 280;
        const height = Math.min(
          350,
          Math.max(
            decoration ? 40 : 120,
            (width * result.height) / result.width + (decoration ? 0 : 42),
          ),
        );
        const element: BookElement = {
          id: crypto.randomUUID(),
          type: "image",
          filename: result.filename,
          ...(decoration ? { kind: "decoration" as const } : {}),
          caption:
            file.name
              .replace(/\.(?:jpe?g|png|webp)$/i, "")
              .trim()
              .slice(0, 200) ||
            (decoration
              ? "A decoration to remember"
              : "A moment worth keeping"),
          x: 80,
          y: 100,
          width,
          height,
          rotation: decoration ? 0 : -2,
          frame: decoration ? "borderless" : "polaroid",
        };
        // Keep edits made while the upload was in flight, on its original target.
        update((previous) => {
          if (coverEditing) {
            const previousCover = resolveCover(previous);
            return {
              ...previous,
              cover: {
                ...previousCover,
                elements: [...previousCover.elements, element],
              },
            };
          }
          return {
            ...previous,
            pages: previous.pages.map((page) =>
              page.id === activePage.id
                ? { ...page, elements: [...page.elements, element] }
                : page,
            ),
          };
        });
        setSelectedId(element.id);
      }
      await save();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Could not upload this image.",
      );
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }
  function queueImages(surfaceId: string, files: File[], point: CanvasPoint) {
    if (
      !editing ||
      assetBusy ||
      transferBusy ||
      uploading.current ||
      imageImport
    )
      return;
    const supported = files.filter(
      (file) =>
        IMAGE_TYPES.includes(file.type) &&
        file.size > 0 &&
        file.size <= 10 * 1024 * 1024,
    );
    if (!supported.length) {
      setNotice(
        "Choose a non-empty JPEG, PNG, or WebP image smaller than 10 MB.",
      );
      return;
    }
    const elements =
      surfaceId === "front-cover"
        ? cover.elements
        : book.pages.find((page) => page.id === surfaceId)?.elements;
    if (!elements || elements.length + supported.length > 60) {
      setNotice(
        "This page can hold up to 60 elements. Make room before adding these images.",
      );
      return;
    }
    if (surfaceId !== "front-cover") setActivePageId(surfaceId);
    setContextPoint(null);
    setImageImport({ surfaceId, files: supported, point });
    setNotice(
      supported.length < files.length
        ? "Unsupported or oversized files were skipped. Choose JPEG, PNG, or WebP under 10 MB."
        : "",
    );
  }
  async function importImages(decoration: boolean) {
    const pending = imageImport;
    if (!pending || uploading.current) return;
    setImageImport(null);
    uploading.current = true;
    setBusy(true);
    const added: BookElement[] = [];
    const failures: string[] = [];
    try {
      for (const [index, file] of pending.files.entries()) {
        try {
          const form = new FormData();
          form.append("image", file);
          const response = await fetch("/api/images", {
            method: "POST",
            body: form,
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Could not upload this image.");
          const width = decoration ? 140 : 220;
          const height = Math.min(
            300,
            Math.max(
              decoration ? 40 : 100,
              (width * result.height) / result.width + (decoration ? 0 : 42),
            ),
          );
          const dx = (pending.point.x > PAGE_WIDTH / 2 ? -1 : 1) * index * 18;
          const dy = (pending.point.y > PAGE_HEIGHT / 2 ? -1 : 1) * index * 18;
          added.push({
            id: crypto.randomUUID(),
            type: "image",
            filename: result.filename,
            ...(decoration ? { kind: "decoration" as const } : {}),
            caption:
              file.name
                .replace(/\.(?:jpe?g|png|webp)$/i, "")
                .trim()
                .slice(0, 200) ||
              (decoration ? "Clipboard decoration" : "Clipboard photo"),
            x: Math.max(
              0,
              Math.min(PAGE_WIDTH - width, pending.point.x - width / 2 + dx),
            ),
            y: Math.max(
              0,
              Math.min(PAGE_HEIGHT - height, pending.point.y - height / 2 + dy),
            ),
            width,
            height,
            rotation: 0,
            frame: decoration ? "borderless" : "polaroid",
          });
        } catch (cause) {
          failures.push(
            `${file.name}: ${cause instanceof Error ? cause.message : "Could not upload this image."}`,
          );
        }
      }
      if (added.length) {
        // Commit the whole batch once, preserving intervening edits on its original surface.
        updateSurface(pending.surfaceId, (elements) => [...elements, ...added]);
        setSelectedIds(added.map((element) => element.id));
        await save();
      }
      if (failures.length) setNotice(failures.join(" "));
    } finally {
      uploading.current = false;
      setBusy(false);
    }
  }
  function addPage(template: PageTemplate = "blank") {
    if (book.pages.length >= 100) return;
    const page = createPageFromTemplate(template);
    update((previous) => ({ ...previous, pages: [...previous.pages, page] }));
    setActivePageId(page.id);
    setSelectedId(null);
    setSpread(Math.floor(book.pages.length / 2) * 2);
  }
  function copyElement() {
    if (assetBusy || transferBusy || !selectedElements.length) return;
    if (editorPage.elements.length + selectedElements.length > 60) {
      setNotice(
        "This page can hold up to 60 elements. Make room before duplicating.",
      );
      return;
    }
    const dx = Math.min(
      14,
      PAGE_WIDTH -
        Math.max(
          ...selectedElements.map((element) => element.x + element.width),
        ),
    );
    const dy = Math.min(
      14,
      PAGE_HEIGHT -
        Math.max(
          ...selectedElements.map((element) => element.y + element.height),
        ),
    );
    const copies = selectedElements.map((element) => ({
      ...duplicateElement(element, false),
      x: element.x + dx,
      y: element.y + dy,
      locked: false,
    }));
    updateSurface(activeSurfaceId, (elements) => [...elements, ...copies]);
    setSelectedIds(copies.map((element) => element.id));
    setContextPoint(null);
  }
  function layerElement(direction: "forward" | "backward" | "front" | "back") {
    if (assetBusy || transferBusy || !selectedElements.length) return;
    const ids = new Set(selectedIds);
    updateSurface(activeSurfaceId, (current) => {
      if (direction === "front")
        return [
          ...current.filter((element) => !ids.has(element.id)),
          ...current.filter((element) => ids.has(element.id)),
        ];
      if (direction === "back")
        return [
          ...current.filter((element) => ids.has(element.id)),
          ...current.filter((element) => !ids.has(element.id)),
        ];
      const elements = [...current];
      const forward = direction === "forward";
      for (
        let index = forward ? elements.length - 2 : 1;
        forward ? index >= 0 : index < elements.length;
        index += forward ? -1 : 1
      ) {
        const next = index + (forward ? 1 : -1);
        if (ids.has(elements[index].id) && !ids.has(elements[next].id))
          [elements[index], elements[next]] = [elements[next], elements[index]];
      }
      return elements;
    });
  }
  function copyPage() {
    if (book.pages.length >= 100) return;
    const index = book.pages.findIndex((page) => page.id === activePage.id);
    const copy = duplicateBookPage(activePage);
    update((previous) => ({
      ...previous,
      pages: [
        ...previous.pages.slice(0, index + 1),
        copy,
        ...previous.pages.slice(index + 1),
      ],
    }));
    setActivePageId(copy.id);
    setSelectedId(null);
    setSpread(Math.floor((index + 1) / 2) * 2);
  }
  function movePage(direction: -1 | 1) {
    const index = book.pages.findIndex((page) => page.id === activePage.id);
    const next = index + direction;
    if (next < 0 || next >= book.pages.length) return;
    update((previous) => {
      const pages = [...previous.pages];
      [pages[index], pages[next]] = [pages[next], pages[index]];
      return { ...previous, pages };
    });
    setSpread(Math.floor(next / 2) * 2);
  }
  function removePage() {
    const index = book.pages.findIndex((page) => page.id === activePage.id);
    const pages = book.pages.filter((page) => page.id !== activePage.id);
    update((previous) => ({ ...previous, pages }));
    const nextIndex = Math.min(index, pages.length - 1);
    setActivePageId(pages[nextIndex].id);
    setSpread(Math.floor(nextIndex / 2) * 2);
    setSelectedId(null);
    setDeletePage(false);
  }
  function navigate(direction: number) {
    if (assetBusy || transferBusy) return;
    setSelectedId(null);
    if (editing) {
      const next = Math.max(
        0,
        Math.min(
          Math.floor((book.pages.length - 1) / 2) * 2,
          spreadStart + direction * 2,
        ),
      );
      setSpread(next);
      setActivePageId(book.pages[next].id);
    } else if (direction > 0) reader.current?.next();
    else reader.current?.previous();
  }
  function toggleEdit() {
    if (presentation || assetBusy || transferBusy) return;
    setContentsOpen(false);
    if (!editing) setEditingTarget(opened ? "pages" : "cover");
    setEditing(!editing);
    setSelectedId(null);
    setActivePageId(book.pages[spreadStart].id);
    if (editing) void save();
  }
  function editCover() {
    if (presentation || assetBusy || transferBusy) return;
    setContentsOpen(false);
    setSelectedId(null);
    setOpened(false);
    setEditingTarget("cover");
    setEditing(true);
  }
  function editPages() {
    if (presentation || assetBusy || transferBusy) return;
    setSelectedId(null);
    setOpened(true);
    setEditingTarget("pages");
  }
  function returnToBeginning() {
    if (assetBusy || transferBusy) return;
    setContentsOpen(false);
    setSelectedId(null);
    if (editing) {
      void save();
      setEditing(false);
      setOpened(!coverEditing);
      setSpread(0);
    } else if (opened && spreadStart > 0) reader.current?.navigate(0);
    else reader.current?.close();
  }
  function enterPresentation() {
    if (editing || assetBusy || transferBusy) return;
    setContentsOpen(false);
    setPresentation(true);
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setNotice(
        "Fullscreen is unavailable. You can still present your book in this window.",
      );
    }
  }

  const canvasEditor = editing
    ? {
        selectedIds,
        activeSurfaceId,
        disabled: assetBusy || transferBusy,
        select: selectSurface,
        move: moveElements,
        contextMenu: openContextMenu,
        dropFiles: queueImages,
        addText,
        addDecoration: (surfaceId = activeSurfaceId) => {
          if (assetBusy || transferBusy) return;
          if (surfaceId !== "front-cover") setActivePageId(surfaceId);
          setDecorationSurface(surfaceId);
        },
      }
    : null;
  return (
    <ImageRevisionContext.Provider value={book.revision}>
      <div
        className={`app-shell theme-${book.theme ?? "cafe"} ${opened ? "book-open" : "book-closed"} ${editing ? "mode-editing" : "mode-reading"} ${presentation ? "mode-presentation" : ""}`}
      >
        <header className="app-header">
          <button
            className="brand"
            disabled={assetBusy || transferBusy}
            onClick={returnToBeginning}
            aria-label="Our Chronicle home"
          >
            <span className="brand-mark">
              <BookOpen size={22} strokeWidth={1.5} />
            </span>
            <span>
              our chronicle
              <span className="brand-caption">A HOME FOR YOUR MEMORIES</span>
            </span>
          </button>
          <div className="header-actions">
            <BookActions
              disabled={assetBusy || transferBusy}
              onBusyChange={setTransferBusy}
              onPrepare={async () => ((await save()) ? getRevision() : null)}
            />
            {editing && (
              <div className="history-controls" aria-label="Edit history">
                <button
                  className="history-button"
                  aria-label="Undo"
                  title="Undo (Ctrl/Cmd+Z)"
                  disabled={assetBusy || transferBusy || !canUndo}
                  onClick={() => applyHistory("undo")}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="history-button"
                  aria-label="Redo"
                  title="Redo (Ctrl/Cmd+Shift+Z)"
                  disabled={assetBusy || transferBusy || !canRedo}
                  onClick={() => applyHistory("redo")}
                >
                  <Redo2 size={16} />
                </button>
              </div>
            )}
            {!editing && (
              <button
                className="contents-toggle presentation-entry"
                ref={presentationButton}
                aria-label="Present book"
                disabled={assetBusy || transferBusy}
                onClick={enterPresentation}
              >
                <Gift size={15} /> Present
              </button>
            )}
            {!editing && (
              <button
                className="contents-toggle"
                aria-expanded={contentsOpen}
                aria-controls="book-contents"
                onClick={() => setContentsOpen(!contentsOpen)}
              >
                <BookOpen size={15} /> Contents
              </button>
            )}
            <span
              className={`save-status status-${assetBusy ? "saving" : status}`}
              role="status"
              aria-label="Book save status"
              aria-live="polite"
            >
              {assetBusy || status === "saving" ? (
                <LoaderCircle size={14} className="spinning" />
              ) : status === "saved" ? (
                <Check size={14} />
              ) : (
                <span className="status-dot" />
              )}
              {assetBusy
                ? audioBusy
                  ? "Adding ambience…"
                  : "Adding photograph…"
                : status === "saved"
                  ? "Saved on this device"
                  : status === "saving"
                    ? "Saving…"
                    : status === "error"
                      ? "Save needs attention"
                      : "Unsaved changes"}
            </span>
            {status !== "saved" && (
              <button
                className="icon-button"
                aria-label="Save now"
                title="Save now"
                onClick={() => void save()}
              >
                <Save size={17} />
              </button>
            )}
            <button
              className={`primary-button ${editing ? "editing-toggle" : ""}`}
              aria-pressed={editing}
              disabled={assetBusy || transferBusy}
              onClick={toggleEdit}
            >
              {editing ? <Check size={15} /> : <Pencil size={15} />}
              {coverEditing
                ? "Preview cover"
                : editing
                  ? "Done editing"
                  : "Edit scrapbook"}
            </button>
          </div>
        </header>
        {presentation && (
          <div
            className="presentation-controls"
            role="toolbar"
            aria-label="Presentation controls"
          >
            <span className="presentation-label">
              <Gift size={14} /> A book to share
            </span>
            <button
              className="icon-button"
              aria-label={fullscreen ? "Leave fullscreen" : "Enter fullscreen"}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
            </button>
            <button
              ref={exitPresentationButton}
              className="secondary-button"
              onClick={exitPresentation}
            >
              <X size={14} /> Exit presentation
            </button>
          </div>
        )}
        <div className="ambience-dock">
          <BookAmbience
            audio={book.audio}
            editing={editing}
            disabled={busy || transferBusy}
            onBusyChange={setAudioBusy}
            onChange={changeAudio}
          />
        </div>
        <div className="workspace">
          <aside
            id="book-contents"
            className={`contents-sidebar ${contentsOpen ? "contents-open" : ""}`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setContentsOpen(false);
            }}
          >
            <div className="sidebar-title">
              <span className="section-label">CONTENTS</span>
              <span className="book-count">{book.pages.length} pages</span>
            </div>
            <button
              className={`cover-nav ${!opened ? "nav-active" : ""}`}
              onClick={editing ? editCover : returnToBeginning}
              aria-label={editing ? "Customize front cover" : undefined}
            >
              <span className="mini-cover">
                <Leaf size={16} />
              </span>
              <span>
                The cover<small>Where our story begins</small>
              </span>
              <ChevronRight size={14} />
            </button>
            <div className="sidebar-divider">
              <span>THE CHAPTERS</span>
            </div>
            <nav className="pages-nav" aria-label="Book pages">
              {book.pages.map((page, index) => {
                const photo = page.elements.find(
                  (element) => element.type === "image",
                );
                const active =
                  opened &&
                  (editing
                    ? activePage.id === page.id
                    : index >= spreadStart && index <= spreadStart + 1);
                return (
                  <button
                    className={`page-nav ${active ? "nav-active" : ""}`}
                    key={page.id}
                    title={`${page.title} · Page ${String(index + 1).padStart(2, "0")}`}
                    aria-label={`${page.title} Page ${String(index + 1).padStart(2, "0")}`}
                    aria-current={active ? "page" : undefined}
                    onClick={() => selectPage(index)}
                  >
                    <span className={`page-thumbnail paper-${page.paper}`}>
                      {photo?.type === "image" && photo.filename ? (
                        <Image
                          src={`/api/images/${photo.filename}`}
                          alt=""
                          fill
                          unoptimized
                          sizes="40px"
                        />
                      ) : (
                        <Feather size={15} />
                      )}
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </span>
                    <span>
                      {page.title}
                      <small>Page {String(index + 1).padStart(2, "0")}</small>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>
          <main className="main-workspace">
            {!opened && !coverEditing && (
              <div className="workspace-heading">
                <div>
                  <div className="eyebrow">
                    <span /> THE ART OF KEEPING LITTLE THINGS
                  </div>
                  <h1>Good days, kept close.</h1>
                  <p>A collection of ordinary moments that mean everything.</p>
                </div>
              </div>
            )}
            {(error || notice) && (
              <div
                className={`notice ${!error && notice === initialNotice ? "notice-success" : ""}`}
                role="alert"
                aria-label="Scrapbook message"
              >
                <span>{error || notice}</span>
                {error ? (
                  <button onClick={() => void save()}>Retry save</button>
                ) : (
                  <button
                    aria-label="Dismiss message"
                    onClick={() => setNotice("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            <div
              className={`book-stage ${coverEditing ? "stage-cover-edit" : opened ? "stage-open" : "stage-cover"}`}
            >
              <div
                className="spread-scroll"
                ref={spreadScrollRef}
                tabIndex={0}
                role="region"
                aria-label="Book spread"
              >
                <div className="book-spread">
                  <CanvasEditorContext.Provider value={canvasEditor}>
                    {coverEditing ? (
                      <EditableCover
                        book={book}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onChange={(id, changes) =>
                          changeElement(editorPage.id, id, changes)
                        }
                      />
                    ) : editing ? (
                      <div className="editing-spread">
                        {book.pages
                          .slice(spreadStart, spreadStart + 2)
                          .map((page, offset) => (
                            <PageRenderer
                              key={page.id}
                              page={page}
                              number={spreadStart + offset + 1}
                              editing
                              selectedId={selectedId}
                              active={activePage.id === page.id}
                              onSelect={(id) => {
                                setActivePageId(page.id);
                                setSelectedId(id);
                              }}
                              onChange={(id, changes) =>
                                changeElement(page.id, id, changes)
                              }
                            />
                          ))}
                        {book.pages.length % 2 === 1 &&
                          spreadStart === book.pages.length - 1 && (
                            <div className="book-page blank-page">
                              <Leaf size={25} />
                              <span>Room for another memory.</span>
                            </div>
                          )}
                      </div>
                    ) : (
                      <Reader
                        key={needsPan ? "scrolling-reader" : "flipping-reader"}
                        book={book}
                        allowPageGestures={!needsPan}
                        startPage={opened ? spreadStart : -1}
                        closed={!opened}
                        onFlip={(page) => {
                          setOpened(page >= 0);
                          setSpread(Math.max(0, page));
                          setActivePageId(
                            book.pages[page]?.id || book.pages[0].id,
                          );
                        }}
                        controlsRef={reader}
                      />
                    )}
                    {opened && (
                      <div className="book-binding" aria-hidden="true" />
                    )}
                  </CanvasEditorContext.Provider>
                </div>
              </div>
              {opened && needsPan && (
                <div
                  className="spread-view-controls"
                  aria-label="View both sides of the spread"
                >
                  <button
                    onClick={() =>
                      spreadScrollRef.current?.scrollTo({
                        left: 0,
                        behavior: "smooth",
                      })
                    }
                  >
                    <ChevronLeft size={13} />
                    Show left page
                  </button>
                  <span>Scroll sideways to see more</span>
                  <button
                    onClick={() =>
                      spreadScrollRef.current?.scrollTo({
                        left: spreadScrollRef.current.scrollWidth,
                        behavior: "smooth",
                      })
                    }
                  >
                    Show right page
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
              <div className="book-controls">
                {coverEditing ? (
                  <span className="cover-edit-label">
                    Make the cover your own
                  </span>
                ) : opened ? (
                  <>
                    <button
                      className="round-button"
                      aria-label={
                        !editing && spreadStart === 0
                          ? "Close scrapbook"
                          : "Previous pages"
                      }
                      title={
                        !editing && spreadStart === 0
                          ? "Close book"
                          : "Previous pages"
                      }
                      disabled={
                        assetBusy ||
                        transferBusy ||
                        (editing && spreadStart === 0)
                      }
                      onClick={() =>
                        !editing && spreadStart === 0
                          ? reader.current?.close()
                          : navigate(-1)
                      }
                    >
                      {!editing && spreadStart === 0 ? (
                        <BookX size={17} />
                      ) : (
                        <ChevronLeft size={19} />
                      )}
                    </button>
                    <span
                      className="page-indicator"
                      data-testid="page-indicator"
                    >
                      {spreadStart + 1} –{" "}
                      {Math.min(spreadStart + 2, book.pages.length)}{" "}
                      <span>of {book.pages.length}</span>
                    </span>
                    <button
                      className="round-button"
                      aria-label="Next pages"
                      disabled={
                        assetBusy ||
                        transferBusy ||
                        spreadStart + 2 >= book.pages.length
                      }
                      onClick={() => navigate(1)}
                    >
                      <ChevronRight size={19} />
                    </button>
                  </>
                ) : (
                  <button
                    className="open-book-link"
                    onClick={() => reader.current?.open()}
                  >
                    Open your memory book <ArrowRight size={16} />
                  </button>
                )}
              </div>
              {editing && (
                <button
                  className="editor-jump-link"
                  onClick={() =>
                    document
                      .getElementById(
                        selectedElement
                          ? "selected-element-controls"
                          : "scrapbook-editor",
                      )
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                >
                  <Pencil size={13} />
                  {selectedElement
                    ? "Edit selected item"
                    : coverEditing
                      ? "Go to cover tools"
                      : "Go to page tools"}
                </button>
              )}
              <p className="interaction-hint">
                {busy ? (
                  <>
                    <LoaderCircle size={13} className="spinning" />
                    Adding your photograph…
                  </>
                ) : coverEditing ? (
                  <>
                    <Sparkles size={13} /> Arrange your cover, then choose
                    Preview cover to read
                  </>
                ) : opened ? (
                  editing ? (
                    <>
                      <Sparkles size={13} />
                      Click a page or element to make it yours
                    </>
                  ) : (
                    <>
                      <BookOpen size={13} />
                      {needsPan
                        ? "Use the arrows below to turn the pages"
                        : spreadStart === 0
                          ? "Drag a right corner to turn · drag a left corner to close"
                          : "Drag a corner or click a page to turn it"}
                    </>
                  )
                ) : (
                  <>
                    <Leaf size={12} />
                    Click the cover or drag its right corner to open
                  </>
                )}
              </p>
            </div>
          </main>
          {editing && (
            <Inspector
              key={coverEditing ? "cover-inspector" : "page-inspector"}
              book={book}
              page={editorPage}
              cover={coverEditing ? cover : undefined}
              onCoverChange={changeCover}
              onEditCover={editCover}
              onEditPages={editPages}
              element={selectedElement}
              selectedIds={selectedIds}
              onReorderElements={reorderElements}
              busy={assetBusy}
              onAddSticker={addSticker}
              onUploadDecoration={(file) => void upload(file, false, true)}
              onThemeChange={changeTheme}
              onReturnToBook={() =>
                spreadScrollRef.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "center",
                })
              }
              onBookChange={(changes) =>
                update(
                  (previous) => ({ ...previous, ...changes }),
                  `cover:${Object.keys(changes).join(",")}`,
                )
              }
              onPageChange={(changes) => changePage(activePage.id, changes)}
              onElementChange={(changes) =>
                selectedId && changeElement(activePage.id, selectedId, changes)
              }
              onAddText={() => addText()}
              onDuplicateElement={copyElement}
              onLayerElement={layerElement}
              onSelectElement={(id, additive) =>
                selectSurface(activeSurfaceId, id, additive)
              }
              onDuplicatePage={copyPage}
              onMovePage={movePage}
              onUpload={upload}
              onDeleteElement={removeElements}
              onAddPage={addPage}
              onDeletePage={() => setDeletePage(true)}
            />
          )}
        </div>
        {editing && selectedElements.length > 0 && (
          <QuickTools
            selection={selectedElements}
            busy={assetBusy || transferBusy}
            contextPoint={contextPoint}
            onCloseContext={() => setContextPoint(null)}
            onChange={(changes) =>
              selectedId && changeElement(editorPage.id, selectedId, changes)
            }
            onDuplicate={copyElement}
            onDelete={removeElements}
            onLock={lockElements}
            onLayer={layerElement}
            onUpload={upload}
          />
        )}
        {editing && imageImport && (
          <ImageImportDialog
            files={imageImport.files}
            onCancel={() => setImageImport(null)}
            onChoose={(decoration) => void importImages(decoration)}
          />
        )}
        {editing && decorationSurface && (
          <DecorationDialog
            onCancel={() => setDecorationSurface(null)}
            onChoose={(asset) => {
              addSticker(asset, decorationSurface);
              setDecorationSurface(null);
            }}
            onUpload={(file) => {
              queueImages(decorationSurface, [file], {
                x: PAGE_WIDTH / 2,
                y: PAGE_HEIGHT / 2,
              });
              setDecorationSurface(null);
            }}
          />
        )}
        {deletePage && (
          <DeletePageDialog
            title={activePage.title}
            onCancel={() => setDeletePage(false)}
            onConfirm={removePage}
          />
        )}
      </div>
    </ImageRevisionContext.Provider>
  );
}
