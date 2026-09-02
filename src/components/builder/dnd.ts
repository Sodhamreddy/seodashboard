import type { Widget } from '@/lib/builder/types';

/**
 * Drag payload channel.
 *
 * `dataTransfer.getData` is deliberately unreadable during `dragover` in every
 * browser, but the drop indicator has to know *what* is being dragged in order to
 * decide whether a slot is legal. A module-scoped payload alongside the real
 * dataTransfer entry is the standard way out: dataTransfer keeps the drag valid
 * (and carries a text/plain fallback), this carries the detail.
 */

export type DragPayload =
  | { type: 'move'; sectionId: string; widgetId: string }
  | { type: 'new'; widget: Omit<Widget, 'id'> }
  | { type: 'section'; sectionId: string };

export const DRAG_MIME = 'application/x-seodash-builder';

let current: DragPayload | null = null;

export function setDragPayload(payload: DragPayload) {
  current = payload;
}

export function getDragPayload() {
  return current;
}

export function clearDragPayload() {
  current = null;
}

/** Which half of the target the pointer is on — before it, or after it. */
export function dropSide(event: { clientX: number }, rect: DOMRect) {
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}
