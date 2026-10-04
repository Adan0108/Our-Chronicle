"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  ImagePlus,
  Layers,
  Lock,
  Sparkles,
  Type,
} from "lucide-react";
import { DECORATIONS } from "@/lib/decorations";
import type { BookElement } from "@/types/book";

type Props = {
  elements: BookElement[];
  selectedIds: string[];
  busy: boolean;
  cover?: boolean;
  onSelect: (id: string, additive?: boolean) => void;
  onReorder?: (ids: string[]) => void;
};

export function layerLabel(element: BookElement) {
  const name =
    element.type === "text"
      ? element.text
      : element.type === "image"
        ? element.caption || element.filename || ""
        : element.label || DECORATIONS[element.asset].label;
  return (
    name.replace(/\s+/g, " ").trim().slice(0, 45) ||
    (element.type === "image"
      ? element.kind === "decoration"
        ? "Untitled decoration"
        : "Untitled photo"
      : "Empty text")
  );
}

function LayerIcon({ element }: { element: BookElement }) {
  return element.type === "image" ? (
    <ImagePlus size={13} aria-hidden="true" />
  ) : element.type === "sticker" ? (
    <Sparkles size={13} aria-hidden="true" />
  ) : (
    <Type size={13} aria-hidden="true" />
  );
}

function LayerRow({
  element,
  layer,
  selected,
  disabled,
  onSelect,
}: {
  element: BookElement;
  layer: number;
  selected: boolean;
  disabled: boolean;
  onSelect: Props["onSelect"];
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: element.id, disabled });
  const label = layerLabel(element);
  return (
    <div
      ref={setNodeRef}
      role="listitem"
      className={`layer-row ${selected ? "selected" : ""} ${isDragging ? "sorting" : ""}`}
      data-testid={`layer-row-${element.id}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="layer-drag-handle"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Reorder layer: ${label}`}
        data-testid={`layer-drag-${element.id}`}
        title="Drag to reorder. Press Space, then use arrow keys."
      >
        <GripVertical size={14} aria-hidden="true" />
      </button>
      <button
        className={`layer-button ${selected ? "selected" : ""}`}
        aria-label={`Select layer: ${label} (layer ${layer})`}
        aria-pressed={selected}
        data-testid={`layer-${element.id}`}
        onClick={(event) =>
          onSelect(element.id, event.shiftKey || event.ctrlKey || event.metaKey)
        }
      >
        <LayerIcon element={element} />
        <span>{label}</span>
        {element.locked && <Lock size={12} aria-label="Position locked" />}
        <span className="layer-number">{layer}</span>
      </button>
    </div>
  );
}

export function LayersPanel({
  elements,
  selectedIds,
  busy,
  cover,
  onSelect,
  onReorder,
}: Props) {
  const frontFirst = [...elements].reverse();
  const ids = frontFirst.map((element) => element.id);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const dragged = frontFirst.find((element) => element.id === draggedId);
  function endDrag({ active, over }: DragEndEvent) {
    setDraggedId(null);
    if (!over || active.id === over.id || !onReorder || busy) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0) onReorder(arrayMove(ids, from, to));
  }
  return (
    <details className="inspector-section layers-section" open>
      <summary>
        <Layers size={14} /> Layers <span>{elements.length}</span>
      </summary>
      <p className="field-hint">
        Frontmost first. Drag a handle to reorder. Shift-click to select more,
        including covered or locked elements.
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setDraggedId(String(active.id))}
        onDragEnd={endDrag}
        onDragCancel={() => setDraggedId(null)}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To reorder a layer, press Space. Use Up and Down to move it, Space to finish, or Escape to cancel. The first layer is frontmost.",
          },
          announcements: {
            onDragStart: ({ active }) =>
              `Picked up ${layerLabel(frontFirst.find((item) => item.id === active.id)!)}.`,
            onDragOver: ({ over }) =>
              over
                ? `Position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}, frontmost first.`
                : undefined,
            onDragEnd: ({ over }) =>
              over
                ? `Layer placed at position ${ids.indexOf(String(over.id)) + 1} of ${ids.length}.`
                : "Layer order unchanged.",
            onDragCancel: () => "Reordering cancelled. Layer order unchanged.",
          },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="layer-list" role="list" aria-label="Scrapbook layers">
            {frontFirst.map((item, index) => (
              <LayerRow
                key={item.id}
                element={item}
                layer={elements.length - index}
                selected={selectedIds.includes(item.id)}
                disabled={busy || !onReorder}
                onSelect={onSelect}
              />
            ))}
            {!elements.length && (
              <p className="field-hint">
                {cover
                  ? "Your cover is a fresh start."
                  : "This page is a fresh start."}
              </p>
            )}
          </div>
        </SortableContext>
        {dragged &&
          createPortal(
            <DragOverlay dropAnimation={null}>
              <div className="layer-drag-preview" aria-hidden="true">
                <GripVertical size={14} />
                <LayerIcon element={dragged} />
                <span>{layerLabel(dragged)}</span>
              </div>
            </DragOverlay>,
            document.body,
          )}
      </DndContext>
    </details>
  );
}
