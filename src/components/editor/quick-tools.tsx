"use client";

import { useEffect, useRef, useState } from "react";
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from "@floating-ui/react";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Bold,
  Copy,
  Crop,
  Italic,
  Lock,
  LockOpen,
  MoreHorizontal,
  Sparkles,
  ImagePlus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  TEXT_PRESETS,
  type BookElement,
  type ImageElement,
  type TextElement,
} from "@/types/book";
import { CropDialog } from "./crop-dialog";
import { NumberField } from "./inspector";

export type QuickToolsProps = {
  selection: BookElement[];
  busy: boolean;
  contextPoint: { x: number; y: number } | null;
  onCloseContext: () => void;
  onChange: (changes: Partial<BookElement>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onLock: (locked: boolean) => void;
  onLayer: (direction: "forward" | "backward" | "front" | "back") => void;
  onUpload: (file: File, replace?: boolean) => void;
};

const frames: { value: ImageElement["frame"]; label: string }[] = [
  { value: "polaroid", label: "Polaroid" },
  { value: "plain", label: "No frame" },
  { value: "soft-shadow", label: "Soft shadow" },
  { value: "paper", label: "Paper frame" },
  { value: "taped", label: "Taped photo" },
  { value: "borderless", label: "Borderless" },
];

function selectedNodes(ids: string[]) {
  return ids.flatMap((id) => {
    const node = document.querySelector<HTMLElement>(
      `.editable-element[data-element-id="${CSS.escape(id)}"]`,
    );
    return node ? [node] : [];
  });
}

function selectionRect(ids: string[]) {
  const rects = selectedNodes(ids).flatMap((node) => {
    const content = node.querySelector<HTMLElement>(
      ".scrap-text, .scrap-photo, .scrap-sticker",
    );
    return content
      ? [node.getBoundingClientRect(), content.getBoundingClientRect()]
      : [node.getBoundingClientRect()];
  });
  if (!rects.length) return new DOMRect();
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

function editorPadding() {
  const header = document.querySelector(".app-header")?.getBoundingClientRect();
  return {
    top: Math.max(
      8,
      Math.min(window.innerHeight - 48, (header?.bottom ?? 0) + 8),
    ),
    bottom: 8,
    left: 8,
    right: 8,
  };
}

export function QuickTools({
  selection,
  busy,
  contextPoint,
  onCloseContext,
  onChange,
  onDuplicate,
  onDelete,
  onLock,
  onLayer,
  onUpload,
}: QuickToolsProps) {
  const selectionKey = JSON.stringify(selection.map((element) => element.id));
  const [more, setMore] = useState({ selectionKey: "", open: false });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [cropping, setCropping] = useState<ImageElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const single = selection.length === 1 ? selection[0] : undefined;
  const image = single?.type === "image" ? single : undefined;
  const text = single?.type === "text" ? single : undefined;
  const defaults = text ? TEXT_PRESETS[text.style] : undefined;
  const locked = selection.length > 0 && selection.every((item) => item.locked);
  const menuOpen =
    selection.length > 0 &&
    (!!contextPoint || (more.open && more.selectionKey === selectionKey));
  const {
    refs: {
      setFloating: setToolbarFloating,
      setPositionReference: setToolbarPosition,
    },
    floatingStyles: toolbarStyles,
    isPositioned: toolbarPositioned,
  } = useFloating({
    placement: "top-start",
    strategy: "fixed",
    middleware: [
      offset(10),
      flip(() => ({ padding: editorPadding() })),
      shift(() => ({ padding: editorPadding(), crossAxis: true })),
    ],
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, update, { animationFrame: true }),
  });
  const {
    refs: {
      setFloating: setMenuFloating,
      setReference: setMenuReference,
      setPositionReference: setMenuPosition,
      domReference: menuReference,
    },
    floatingStyles: menuStyles,
    context: menuContext,
  } = useFloating({
    open: menuOpen,
    onOpenChange: (open) => {
      setMore({ selectionKey, open });
      if (!open) onCloseContext();
    },
    placement: "bottom-end",
    strategy: "fixed",
    middleware: [
      offset(contextPoint ? 2 : 6),
      flip(() => ({ padding: editorPadding() })),
      shift(() => ({ padding: editorPadding(), crossAxis: true })),
      size(() => ({
        padding: editorPadding(),
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
        },
      })),
    ],
    whileElementsMounted: autoUpdate,
  });
  const click = useClick(menuContext);
  const dismiss = useDismiss(menuContext);
  const role = useRole(menuContext, { role: "menu" });
  const navigation = useListNavigation(menuContext, {
    listRef: itemRefs,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    focusItemOnOpen: true,
  });
  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions(
    [click, dismiss, role, navigation],
  );

  useEffect(() => {
    const ids: string[] = JSON.parse(selectionKey);
    const node = selectedNodes(ids)[0];
    setToolbarPosition(
      node
        ? {
            getBoundingClientRect: () => selectionRect(ids),
            contextElement: node,
          }
        : null,
    );
  }, [selectionKey, setToolbarPosition]);

  useEffect(() => {
    if (contextPoint) {
      setMenuPosition({
        getBoundingClientRect: () =>
          new DOMRect(contextPoint.x, contextPoint.y, 0, 0),
      });
    } else {
      setMenuPosition(menuReference.current);
    }
  }, [contextPoint, menuReference, setMenuPosition]);

  function closeMenu() {
    setMore({ selectionKey, open: false });
    onCloseContext();
  }

  const menuItems = [
    { label: "Duplicate", icon: Copy, action: "duplicate" },
    {
      label: locked ? "Unlock position" : "Lock position",
      icon: locked ? LockOpen : Lock,
      action: "lock",
    },
    { label: "Bring forward", icon: ArrowUp, action: "forward" },
    {
      label: "Send backward",
      icon: ArrowDown,
      action: "backward",
    },
    {
      label: "Bring to front",
      icon: ArrowUpToLine,
      action: "front",
    },
    {
      label: "Send to back",
      icon: ArrowDownToLine,
      action: "back",
    },
    ...(image
      ? [
          {
            label:
              image.kind === "decoration" ? "Crop decoration" : "Crop photo",
            icon: Crop,
            action: "crop",
            disabled: !image.filename,
          },
          {
            label: "Replace image",
            icon: Upload,
            action: "replace",
          },
          {
            label:
              image.kind === "decoration"
                ? "Use as photo"
                : "Use as decoration",
            icon: image.kind === "decoration" ? ImagePlus : Sparkles,
            action: "kind",
          },
        ]
      : []),
    { label: "Delete", icon: Trash2, action: "delete", danger: true },
  ];

  function runMenuAction(action: string) {
    if (action === "duplicate") onDuplicate();
    else if (action === "delete") onDelete();
    else if (action === "lock") onLock(!locked);
    else if (action === "crop" && image) setCropping(image);
    else if (action === "replace") fileRef.current?.click();
    else if (action === "kind" && image)
      onChange({ kind: image.kind === "decoration" ? "photo" : "decoration" });
    else if (
      action === "forward" ||
      action === "backward" ||
      action === "front" ||
      action === "back"
    )
      onLayer(action);
    closeMenu();
  }

  if (!selection.length) return null;

  return (
    <>
      <FloatingPortal>
        <div
          ref={setToolbarFloating}
          className="quick-tools"
          role="toolbar"
          aria-label="Quick editor actions"
          data-testid="quick-tools"
          style={{
            ...toolbarStyles,
            visibility: toolbarPositioned ? "visible" : "hidden",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {selection.length > 1 && (
            <span className="quick-selection-count">
              {selection.length} items
            </span>
          )}
          {text && defaults && (
            <>
              <select
                className="quick-font-family"
                aria-label="Quick font family"
                value={text.fontFamily ?? defaults.fontFamily}
                disabled={busy}
                onChange={(event) =>
                  onChange({
                    fontFamily: event.target.value as TextElement["fontFamily"],
                  })
                }
              >
                <option value="serif">Journal</option>
                <option value="handwritten">Handwritten</option>
                <option value="sans">Captions</option>
              </select>
              <NumberField
                key={text.id}
                label="Quick font size"
                min={8}
                max={72}
                disabled={busy}
                value={text.fontSize ?? defaults.fontSize}
                onChange={(fontSize) => onChange({ fontSize })}
              />
              <button
                aria-label="Quick bold"
                title="Bold"
                aria-pressed={text.bold ?? defaults.bold}
                disabled={busy}
                onClick={() =>
                  onChange({ bold: !(text.bold ?? defaults.bold) })
                }
              >
                <Bold size={15} />
              </button>
              <button
                aria-label="Quick italic"
                title="Italic"
                aria-pressed={text.italic ?? defaults.italic}
                disabled={busy}
                onClick={() =>
                  onChange({ italic: !(text.italic ?? defaults.italic) })
                }
              >
                <Italic size={15} />
              </button>
              <input
                type="color"
                aria-label="Quick text color"
                title="Text color"
                value={text.color ?? defaults.color}
                disabled={busy}
                onChange={(event) => onChange({ color: event.target.value })}
              />
              <span className="quick-divider" />
            </>
          )}
          {image && (
            <>
              <button
                aria-label={
                  image.kind === "decoration"
                    ? "Quick crop decoration"
                    : "Quick crop photo"
                }
                title="Crop"
                disabled={busy || !image.filename}
                onClick={() => setCropping(image)}
              >
                <Crop size={15} />
              </button>
              <button
                aria-label="Quick replace image"
                title="Replace image"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={15} />
              </button>
              {image.kind !== "decoration" && (
                <select
                  aria-label="Quick photo style"
                  value={image.frame}
                  disabled={busy}
                  onChange={(event) =>
                    onChange({
                      frame: event.target.value as ImageElement["frame"],
                    })
                  }
                >
                  {frames.map((frame) => (
                    <option key={frame.value} value={frame.value}>
                      {frame.label}
                    </option>
                  ))}
                </select>
              )}
              <span className="quick-divider" />
            </>
          )}
          <button
            aria-label="Quick duplicate"
            title="Duplicate"
            disabled={busy}
            onClick={onDuplicate}
          >
            <Copy size={15} />
          </button>
          <button
            aria-label={
              locked ? "Quick unlock position" : "Quick lock position"
            }
            title={locked ? "Unlock position" : "Lock position"}
            aria-pressed={locked}
            disabled={busy}
            onClick={() => onLock(!locked)}
          >
            {locked ? <LockOpen size={15} /> : <Lock size={15} />}
          </button>
          <button
            aria-label="Quick delete"
            title="Delete"
            className="quick-danger"
            disabled={busy}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
          <button
            ref={setMenuReference}
            {...getReferenceProps()}
            aria-label="Quick more options"
            title="More options"
            disabled={busy}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
        {menuOpen && (
          <FloatingFocusManager context={menuContext} modal={false}>
            <div
              ref={setMenuFloating}
              className="element-context-menu"
              style={menuStyles}
              {...getFloatingProps({
                "aria-label": "Element actions",
                onKeyDown: (event) => event.stopPropagation(),
              })}
              aria-labelledby={undefined}
              data-testid="element-context-menu"
            >
              <span className="quick-menu-heading" role="presentation">
                {selection.length > 1
                  ? `${selection.length} selected elements`
                  : "Element actions"}
              </span>
              {menuItems.map((item, index) => (
                <button
                  key={item.label}
                  ref={(node) => {
                    itemRefs.current[index] = node;
                  }}
                  {...getItemProps()}
                  role="menuitem"
                  tabIndex={activeIndex === index ? 0 : -1}
                  className={item.danger ? "quick-danger" : undefined}
                  disabled={busy || item.disabled}
                  onClick={() => {
                    runMenuAction(item.action);
                  }}
                >
                  <item.icon size={14} aria-hidden="true" /> {item.label}
                </button>
              ))}
              {image && image.kind !== "decoration" && (
                <label className="quick-menu-style" role="presentation">
                  Photo style
                  <select
                    aria-label="Context photo style"
                    value={image.frame}
                    disabled={busy}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") event.stopPropagation();
                    }}
                    onChange={(event) =>
                      onChange({
                        frame: event.target.value as ImageElement["frame"],
                      })
                    }
                  >
                    {frames.map((frame) => (
                      <option key={frame.value} value={frame.value}>
                        {frame.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
      <input
        ref={fileRef}
        type="file"
        className="quick-file-input"
        aria-label="Quick replacement file"
        tabIndex={-1}
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file, true);
          event.target.value = "";
        }}
      />
      {cropping && image?.id === cropping.id && cropping.filename && (
        <CropDialog
          element={cropping}
          onCancel={() => setCropping(null)}
          onApply={(crop) => {
            onChange({ crop });
            setCropping(null);
          }}
        />
      )}
    </>
  );
}
