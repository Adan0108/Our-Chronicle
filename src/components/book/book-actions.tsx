"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Download,
  LoaderCircle,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";

const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;
type ActionView = "options" | "import" | "reset";

type BookActionsProps = {
  onPrepare: () => Promise<number | null>;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
};

async function responseError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (typeof error === "string") return error;
  }
  return "The operation could not be completed. Your current book is unchanged.";
}

export function BookActions({
  onPrepare,
  onBusyChange,
  disabled = false,
}: BookActionsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ActionView>("options");
  const [archive, setArchive] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [open]);

  useEffect(() => {
    if (open)
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-initial-focus]")
        ?.focus();
  }, [open, view]);

  const dismiss = () => {
    if (runningRef.current) return;
    dialogRef.current?.close();
    setOpen(false);
    setArchive(null);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const changeView = (next: ActionView) => {
    setView(next);
    setArchive(null);
    setError("");
    setMessage("");
  };

  const perform = async (action: "export" | "import" | "reset") => {
    if (runningRef.current || (action === "import" && !archive)) return;
    runningRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setError("");
    setMessage("");
    let replacing = false;
    try {
      const revision = await onPrepare();
      if (revision === null) {
        throw new Error(
          "Your latest edits could not be saved. Please resolve the save error before continuing.",
        );
      }
      if (action === "export") {
        const response = await fetch(`/api/book/export?revision=${revision}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(await responseError(response));
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const filename = response.headers
          .get("Content-Disposition")
          ?.match(/filename="([a-zA-Z0-9._-]+\.zip)"/)?.[1];
        link.download =
          filename ??
          `our-chronicle-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage(
          "Your book has been downloaded. Keep the ZIP somewhere safe as a backup, or import it on another machine.",
        );
      } else {
        const response =
          action === "import"
            ? await fetch("/api/book/import", {
                method: "POST",
                headers: {
                  "Content-Type": "application/zip",
                  "X-Book-Revision": String(revision),
                  "X-Confirm-Replacement": "true",
                },
                body: archive,
              })
            : await fetch("/api/book/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ revision, confirm: true }),
              });
        if (!response.ok) throw new Error(await responseError(response));
        const result: { backupFilename: string } = await response.json();
        replacing = true;
        window.history.replaceState(
          window.history.state,
          "",
          `/?restored=${action}&backup=${encodeURIComponent(result.backupFilename)}`,
        );
        // Reload server data and begin a fresh editor history after replacement.
        window.location.reload();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The operation could not be completed. Please try again.",
      );
    } finally {
      if (!replacing) {
        runningRef.current = false;
        setBusy(false);
        onBusyChange(false);
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className="book-options-toggle"
        aria-label="Book options"
        aria-haspopup="dialog"
        title="Book options: export, import, and reset"
        disabled={disabled}
        onClick={() => {
          changeView("options");
          setOpen(true);
        }}
      >
        <Archive size={17} aria-hidden="true" />
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          className="book-actions-dialog"
          aria-labelledby="book-actions-title"
          aria-describedby="book-actions-description"
          aria-busy={busy}
          onCancel={(event) => {
            event.preventDefault();
            dismiss();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) dismiss();
          }}
        >
          <div className="book-actions-heading">
            <h2 id="book-actions-title">
              {view === "options"
                ? "Keep your memories safe"
                : view === "import"
                  ? "Import your book"
                  : "Start a fresh book?"}
            </h2>
            <button
              className="book-actions-close"
              aria-label="Close book options"
              onClick={dismiss}
              disabled={busy}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <p id="book-actions-description" className="book-actions-description">
            {view === "options"
              ? "Your memories stay on this machine. Export a portable copy for safekeeping or moving to another computer."
              : view === "import"
                ? "Choose an Our Chronicle ZIP. Importing replaces your book, images, and audio after the archive is validated. A local safety backup is saved first."
                : "Your book, photos, decorations, theme, and audio will be replaced with the original sample scrapbook. A local safety backup is saved first."}
          </p>

          {view === "options" ? (
            <div className="book-action-options">
              <button
                className="book-action-option"
                aria-label="Export Book"
                disabled={busy}
                onClick={() => void perform("export")}
              >
                <Download size={20} aria-hidden="true" />
                <span>
                  <strong>Export Book</strong>
                  <small>
                    A complete ZIP backup, including images and audio.
                  </small>
                </span>
              </button>
              <button
                className="book-action-option"
                aria-label="Import Book"
                disabled={busy}
                onClick={() => changeView("import")}
              >
                <Upload size={20} aria-hidden="true" />
                <span>
                  <strong>Import Book</strong>
                  <small>Restore a book from an exported ZIP.</small>
                </span>
              </button>
              <button
                className="book-action-option book-action-reset"
                aria-label="Reset Book"
                disabled={busy}
                onClick={() => changeView("reset")}
              >
                <RotateCcw size={20} aria-hidden="true" />
                <span>
                  <strong>Reset Book</strong>
                  <small>Replace this book with the sample pages.</small>
                </span>
              </button>
            </div>
          ) : (
            <>
              {view === "import" && (
                <label className="archive-picker">
                  Exported book (.zip)
                  <input
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    aria-label="Import archive"
                    data-initial-focus
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      setError("");
                      setArchive(null);
                      if (file && file.size > MAX_ARCHIVE_BYTES) {
                        setError(
                          "Please choose a ZIP archive smaller than 250 MB.",
                        );
                        event.currentTarget.value = "";
                      } else setArchive(file);
                    }}
                  />
                </label>
              )}
              <p className="book-actions-backup-hint">
                Safety backups are kept in <code>storage/backups/</code>. You
                can import one later. Importing or resetting starts a new undo
                session.
              </p>
            </>
          )}

          {error && (
            <p className="book-action-error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="book-action-success" role="status">
              {message}
            </p>
          )}
          {busy && (
            <p className="book-action-progress" role="status">
              <LoaderCircle size={15} className="spinning" aria-hidden="true" />
              {view === "options"
                ? "Preparing your download…"
                : view === "import"
                  ? "Checking your archive and restoring your book…"
                  : "Saving a safety backup and restoring the sample book…"}
            </p>
          )}
          <div className="dialog-actions">
            {view === "options" ? (
              <button
                className="secondary-button"
                disabled={busy}
                onClick={dismiss}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  className="secondary-button"
                  disabled={busy}
                  data-initial-focus={view === "reset" ? "true" : undefined}
                  onClick={() => changeView("options")}
                >
                  <ArrowLeft size={14} aria-hidden="true" />
                  Cancel
                </button>
                <button
                  className={`primary-button${view === "reset" ? " delete-confirm" : ""}`}
                  disabled={busy || (view === "import" && !archive)}
                  onClick={() => void perform(view)}
                >
                  {view === "import"
                    ? "Import and replace"
                    : "Reset to sample book"}
                </button>
              </>
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
