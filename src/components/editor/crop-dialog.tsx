"use client";
import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { ImageCrop, ImageElement } from "@/types/book";

export function CropDialog({
  element,
  onCancel,
  onApply,
}: {
  element: ImageElement;
  onCancel: () => void;
  onApply: (crop: ImageCrop) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [crop, setCrop] = useState<ImageCrop | null>(null);
  const decoration = element.kind === "decoration";
  const photoWidth =
    element.width -
    (decoration
      ? 0
      : element.frame === "polaroid"
        ? 20
        : element.frame === "paper"
          ? 24
          : 0);
  const photoHeight =
    element.height -
    (decoration
      ? 0
      : element.frame === "polaroid"
        ? 45
        : element.frame === "paper"
          ? 24
          : 0);
  const aspect = Math.max(1, photoWidth) / Math.max(1, photoHeight);

  const openDialog = useCallback((dialog: HTMLDialogElement | null) => {
    if (!dialog) return;
    dialogRef.current = dialog;
    dialog.showModal();
    // Mount the cropper after the native dialog has a measurable viewport.
    setReady(true);
    return () => {
      dialog.close();
      dialogRef.current = null;
    };
  }, []);

  const cancel = () => {
    dialogRef.current?.close();
    onCancel();
  };

  return (
    <dialog
      ref={openDialog}
      className="crop-dialog"
      aria-labelledby="crop-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <h2 id="crop-dialog-title">
        {decoration ? "Crop your decoration" : "Frame your photograph"}
      </h2>
      <p className="field-hint" id="crop-instructions">
        Drag to choose the moment you want to keep. Zoom for a closer look. Your
        original {decoration ? "asset" : "photo"} stays intact. You can also use
        arrow keys in the crop frame.
      </p>
      <div
        className={`crop-stage ${decoration ? "decoration-crop-stage" : ""}`}
        role="group"
        aria-label={
          decoration ? "Decoration crop preview" : "Photo crop preview"
        }
        aria-describedby="crop-instructions"
      >
        {ready && (
          <Cropper
            image={`/api/images/${element.filename}`}
            crop={position}
            zoom={zoom}
            minZoom={1}
            maxZoom={5}
            aspect={aspect}
            initialCroppedAreaPercentages={element.crop ?? undefined}
            onCropChange={setPosition}
            onZoomChange={setZoom}
            onCropComplete={(area) => setCrop(area)}
            showGrid
            objectFit="contain"
          />
        )}
      </div>
      <div className="crop-toolbar">
        <label>
          Crop zoom <span>{zoom.toFixed(1)}×</span>
          <input
            type="range"
            aria-label="Crop zoom"
            min={1}
            max={5}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
      </div>
      <div className="dialog-actions">
        <button className="secondary-button" onClick={cancel}>
          Cancel crop
        </button>
        <button
          className="primary-button"
          disabled={!crop}
          onClick={() => {
            if (crop) {
              dialogRef.current?.close();
              onApply({
                x: Math.max(0, Math.min(100 - crop.width, crop.x)),
                y: Math.max(0, Math.min(100 - crop.height, crop.y)),
                width: crop.width,
                height: crop.height,
              });
            }
          }}
        >
          Apply crop
        </button>
      </div>
    </dialog>
  );
}
