"use client";

import { createContext } from "react";

export type CanvasPoint = { x: number; y: number };
export type ElementPosition = CanvasPoint & { id: string };

export type CanvasEditor = {
  selectedIds: string[];
  activeSurfaceId: string;
  disabled: boolean;
  select: (surfaceId: string, id: string | null, additive?: boolean) => void;
  move: (surfaceId: string, positions: ElementPosition[]) => void;
  contextMenu: (surfaceId: string, id: string, point: CanvasPoint) => void;
  dropFiles: (surfaceId: string, files: File[], point: CanvasPoint) => void;
  addText: (surfaceId?: string) => void;
  addDecoration: (surfaceId?: string) => void;
};

export const CanvasEditorContext = createContext<CanvasEditor | null>(null);
