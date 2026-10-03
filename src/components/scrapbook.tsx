"use client";
import { useEffect, useRef, useState } from "react";
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
  X,
} from "lucide-react";
import { useBook } from "@/hooks/use-book";
import { type Book, type BookElement, type BookPage } from "@/types/book";
import { Reader, type ReaderHandle } from "./book/reader";
import { PageRenderer } from "./book/page-renderer";
import { Inspector } from "./editor/inspector";
import { DeletePageDialog } from "./editor/delete-page-dialog";

export function Scrapbook({ initialBook }: { initialBook: Book }) {
  const { book, update, save, status, error } = useBook(initialBook);
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const [spread, setSpread] = useState(0);
  const [activePageId, setActivePageId] = useState(book.pages[0].id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [deletePage, setDeletePage] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const reader = useRef<ReaderHandle | null>(null);
  const spreadScrollRef = useRef<HTMLDivElement>(null);
  const wasOpened = useRef(false);
  const [needsPan, setNeedsPan] = useState(false);
  useEffect(() => {
    const closed = !opened && wasOpened.current;
    wasOpened.current = opened;
    if (closed) {
      // The wrapper reconciles/reinserts its page nodes in effects; hand off focus after that work.
      const frame = requestAnimationFrame(() =>
        spreadScrollRef.current
          ?.querySelector<HTMLElement>(".native-cover")
          ?.focus({ preventScroll: true }),
      );
      return () => cancelAnimationFrame(frame);
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
  const selectedElement = activePage.elements.find(
    (element) => element.id === selectedId,
  );
  const spreadStart = Math.min(
    Math.floor(spread / 2) * 2,
    Math.floor((book.pages.length - 1) / 2) * 2,
  );

  function selectPage(index: number) {
    setContentsOpen(false);
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
    update((previous) => ({
      ...previous,
      pages: previous.pages.map((page) =>
        page.id === id ? { ...page, ...changes } : page,
      ),
    }));
  }
  function changeElement(
    pageId: string,
    id: string,
    changes: Partial<BookElement>,
  ) {
    update((previous) => ({
      ...previous,
      pages: previous.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              elements: page.elements.map((element) =>
                element.id === id
                  ? ({ ...element, ...changes } as BookElement)
                  : element,
              ),
            }
          : page,
      ),
    }));
  }
  function addText() {
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
    };
    changePage(activePage.id, { elements: [...activePage.elements, element] });
    setSelectedId(element.id);
  }
  async function upload(file: File, replace = false) {
    if (file.size > 10 * 1024 * 1024) {
      setNotice("Choose an image smaller than 10 MB.");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setNotice("Choose a JPEG, PNG, or WebP image.");
      return;
    }
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
        });
      else {
        const width = 280;
        const height = Math.min(
          350,
          Math.max(120, (width * result.height) / result.width + 42),
        );
        const element: BookElement = {
          id: crypto.randomUUID(),
          type: "image",
          filename: result.filename,
          caption: "A moment worth keeping",
          x: 80,
          y: 100,
          width,
          height,
          rotation: -2,
          frame: "polaroid",
        };
        update((previous) => ({
          ...previous,
          pages: previous.pages.map((page) =>
            page.id === activePage.id
              ? { ...page, elements: [...page.elements, element] }
              : page,
          ),
        }));
        setSelectedId(element.id);
      }
      await save();
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Could not upload this image.",
      );
    } finally {
      setBusy(false);
    }
  }
  function addPage() {
    const page: BookPage = {
      id: crypto.randomUUID(),
      title: "A new memory",
      paper: "cream",
      elements: [
        {
          id: crypto.randomUUID(),
          type: "text",
          text: "A new memory",
          x: 40,
          y: 70,
          width: 360,
          height: 70,
          style: "heading",
          rotation: 0,
        },
      ],
    };
    update((previous) => ({ ...previous, pages: [...previous.pages, page] }));
    setActivePageId(page.id);
    setSelectedId(null);
    setSpread(Math.floor(book.pages.length / 2) * 2);
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
    setContentsOpen(false);
    setOpened(true);
    setEditing(!editing);
    setSelectedId(null);
    setActivePageId(book.pages[spreadStart].id);
    if (editing) void save();
  }
  function returnToBeginning() {
    setContentsOpen(false);
    setSelectedId(null);
    if (editing) {
      void save();
      setEditing(false);
      setOpened(true);
      setSpread(0);
    } else if (opened && spreadStart > 0) reader.current?.navigate(0);
    else reader.current?.close();
  }

  return (
    <div
      className={`app-shell ${opened ? "book-open" : "book-closed"} ${editing ? "mode-editing" : "mode-reading"}`}
    >
      <header className="app-header">
        <button
          className="brand"
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
            className={`save-status status-${busy ? "saving" : status}`}
            role="status"
            aria-live="polite"
          >
            {busy || status === "saving" ? (
              <LoaderCircle size={14} className="spinning" />
            ) : status === "saved" ? (
              <Check size={14} />
            ) : (
              <span className="status-dot" />
            )}
            {busy
              ? "Adding photograph…"
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
            onClick={toggleEdit}
          >
            {editing ? <Check size={15} /> : <Pencil size={15} />}
            {editing ? "Done editing" : "Edit scrapbook"}
          </button>
        </div>
      </header>
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
            onClick={returnToBeginning}
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
                    {photo?.type === "image" ? (
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
          {!opened && (
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
            <div className="notice" role="alert" aria-label="Scrapbook message">
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
            className={`book-stage ${opened ? "stage-open" : "stage-cover"}`}
          >
            <div
              className="spread-scroll"
              ref={spreadScrollRef}
              tabIndex={0}
              role="region"
              aria-label="Book spread"
            >
              <div className="book-spread">
                {editing ? (
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
                      setActivePageId(book.pages[page]?.id || book.pages[0].id);
                    }}
                    controlsRef={reader}
                  />
                )}
                {opened && <div className="book-binding" aria-hidden="true" />}
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
              {opened ? (
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
                    disabled={editing && spreadStart === 0}
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
                  <span className="page-indicator" data-testid="page-indicator">
                    {spreadStart + 1} –{" "}
                    {Math.min(spreadStart + 2, book.pages.length)}{" "}
                    <span>of {book.pages.length}</span>
                  </span>
                  <button
                    className="round-button"
                    aria-label="Next pages"
                    disabled={spreadStart + 2 >= book.pages.length}
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
            {opened && editing && (
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
                {selectedElement ? "Edit selected item" : "Go to page tools"}
              </button>
            )}
            <p className="interaction-hint">
              {busy ? (
                <>
                  <LoaderCircle size={13} className="spinning" />
                  Adding your photograph…
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
            book={book}
            page={activePage}
            element={selectedElement}
            busy={busy}
            onReturnToBook={() =>
              spreadScrollRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              })
            }
            onBookChange={(changes) =>
              update((previous) => ({ ...previous, ...changes }))
            }
            onPageChange={(changes) => changePage(activePage.id, changes)}
            onElementChange={(changes) =>
              selectedId && changeElement(activePage.id, selectedId, changes)
            }
            onAddText={addText}
            onUpload={upload}
            onDeleteElement={() => {
              changePage(activePage.id, {
                elements: activePage.elements.filter(
                  (element) => element.id !== selectedId,
                ),
              });
              setSelectedId(null);
            }}
            onAddPage={addPage}
            onDeletePage={() => setDeletePage(true)}
          />
        )}
      </div>
      {deletePage && (
        <DeletePageDialog
          title={activePage.title}
          onCancel={() => setDeletePage(false)}
          onConfirm={removePage}
        />
      )}
    </div>
  );
}
