"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Feather,
  Heart,
  Leaf,
  LoaderCircle,
  LockKeyhole,
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
  const reader = useRef<ReaderHandle | null>(null);
  const spreadScrollRef = useRef<HTMLDivElement>(null);
  const [needsPan, setNeedsPan] = useState(false);
  useEffect(() => {
    const node = spreadScrollRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setNeedsPan(node.scrollWidth > node.clientWidth + 1);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [opened, editing]);
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
    setOpened(true);
    setActivePageId(book.pages[index].id);
    setSelectedId(null);
    if (editing || !opened) setSpread(Math.floor(index / 2) * 2);
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
    setOpened(true);
    setEditing(!editing);
    setSelectedId(null);
    setActivePageId(book.pages[spreadStart].id);
    if (editing) void save();
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => {
            setOpened(false);
            setEditing(false);
            void save();
          }}
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
          <span
            className={`save-status status-${status}`}
            role="status"
            aria-live="polite"
          >
            {status === "saving" ? (
              <LoaderCircle size={14} className="spinning" />
            ) : status === "saved" ? (
              <Check size={14} />
            ) : (
              <span className="status-dot" />
            )}
            {status === "saved"
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
        <aside className="contents-sidebar">
          <div className="sidebar-title">
            <span className="section-label">YOUR MEMORY BOOK</span>
            <span className="book-count">{book.pages.length} pages</span>
          </div>
          <button
            className={`cover-nav ${!opened ? "nav-active" : ""}`}
            onClick={() => {
              setOpened(false);
              setEditing(false);
              void save();
            }}
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
          <div className="sidebar-bottom">
            <Coffee size={23} strokeWidth={1.25} />
            <p>
              For the moments
              <br />
              you’d like to stay in.
            </p>
            <div className="privacy-note">
              <LockKeyhole size={11} />
              Private. Local. Yours.
            </div>
          </div>
        </aside>
        <main className="main-workspace">
          <div className="workspace-heading">
            <div>
              <div className="eyebrow">
                <span /> THE ART OF KEEPING LITTLE THINGS
              </div>
              <h1>
                {editing
                  ? "A little room for your story."
                  : "Good days, kept close."}
              </h1>
              <p>
                {editing
                  ? "Make a page feel like you. Every little detail belongs here."
                  : "A collection of ordinary moments that mean everything."}
              </p>
            </div>
            <div className="edition-stamp">
              <Leaf size={19} strokeWidth={1.2} />
              <span>
                MADE OF
                <br />
                MEMORIES
              </span>
            </div>
          </div>
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
            <div className="desk-note" aria-hidden="true">
              {editing
                ? "a story only you can tell"
                : "a few of our favorite things"}
              <svg viewBox="0 0 55 30">
                <path d="M2 2Q15 31 48 15M39 13L48 15L42 23" />
              </svg>
            </div>
            {!opened ? (
              <motion.button
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="book-cover"
                aria-label="Open scrapbook"
                onClick={() => {
                  setSpread(0);
                  setOpened(true);
                }}
              >
                <span className="cover-spine" />
                <span className="cover-border" />
                <span className="cover-topline">A COLLECTION OF OUR DAYS</span>
                <span className="cover-emblem">
                  <Leaf size={47} strokeWidth={1} />
                  <span className="emblem-star">✦</span>
                </span>
                <span className="cover-title">{book.title}</span>
                <span className="cover-subtitle">{book.subtitle}</span>
                <span className="cover-rule" />
                <span className="cover-bottom">
                  COLLECT MOMENTS, KEEP THEM CLOSE
                </span>
                <span className="bookmark-ribbon" />
              </motion.button>
            ) : (
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
                      startPage={spreadStart}
                      onFlip={(page) => {
                        setSpread(page);
                        setActivePageId(
                          book.pages[page]?.id || book.pages[0].id,
                        );
                      }}
                      controlsRef={reader}
                    />
                  )}
                  <div className="book-binding" aria-hidden="true" />
                </div>
              </div>
            )}
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
                    aria-label="Previous pages"
                    disabled={spreadStart === 0}
                    onClick={() => navigate(-1)}
                  >
                    <ChevronLeft size={19} />
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
                  onClick={() => setOpened(true)}
                >
                  Open your memory book <ArrowRight size={16} />
                </button>
              )}
            </div>
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
                      : "Drag a corner or click a page to turn it"}
                  </>
                )
              ) : (
                <>
                  <Heart size={12} />
                  Every ordinary day has a story worth keeping
                </>
              )}
            </p>
          </div>
          <footer className="workspace-footer">
            <span>YOUR STORY, ONE PAGE AT A TIME</span>
            <span>
              Made for slow moments <Heart size={10} />
            </span>
          </footer>
        </main>
        {editing && (
          <Inspector
            book={book}
            page={activePage}
            element={selectedElement}
            busy={busy}
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
