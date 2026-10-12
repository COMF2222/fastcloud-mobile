import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import { playerSwipe, type SwipeAction } from "./playerSwipe";

export function usePlayerSwipe(trackId: number | undefined, change: (action: SwipeAction) => void) {
  const start = useRef<{ id: number; x: number; y: number; time: number; width: number } | null>(null);
  const suppressClick = useRef(false);
  const surface = useRef<HTMLElement | null>(null);
  const direction = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const settle = () => {
    const node = surface.current;
    if (!node) return;
    node.classList.remove("swipe-dragging");
    delete node.dataset.swipePhase;
    node.style.setProperty("--track-swipe-x", "0px");
  };
  useEffect(() => {
    start.current = null;
    const node = surface.current;
    if (!node || !direction.current || reduced()) { settle(); return; }
    node.classList.remove("swipe-dragging");
    node.dataset.swipePhase = "in";
    node.style.setProperty("--track-swipe-x", `${-direction.current * 32}px`);
    direction.current = 0;
    frame.current = requestAnimationFrame(() => { frame.current = requestAnimationFrame(settle); });
  }, [trackId]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (frame.current != null) cancelAnimationFrame(frame.current);
  }, []);
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      suppressClick.current = false;
      if (!event.isPrimary || event.pointerType === "mouse" || event.button !== 0 || !trackId) { start.current = null; return; }
      const interactive = (event.target as Element).closest("button,input,textarea,select,a,[role=slider]");
      if (interactive && interactive !== event.currentTarget) return;
      if (timer.current != null) return;
      surface.current = event.currentTarget;
      event.currentTarget.classList.add("swipe-surface");
      start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp, width: event.currentTarget.clientWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove(event: PointerEvent<HTMLElement>) {
      const initial = start.current;
      if (!initial || initial.id !== event.pointerId) return;
      const dx = event.clientX - initial.x, dy = event.clientY - initial.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start.current = null; settle(); return; }
      if (Math.abs(dx) > Math.abs(dy) && !reduced()) {
        event.currentTarget.classList.add("swipe-dragging");
        event.currentTarget.style.setProperty("--track-swipe-x", `${Math.max(-64, Math.min(64, dx * 0.35))}px`);
      }
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      const initial = start.current;
      start.current = null;
      if (!initial || initial.id !== event.pointerId) return;
      const action = playerSwipe(event.clientX - initial.x, event.clientY - initial.y, event.timeStamp - initial.time, initial.width);
      if (!action) { settle(); return; }
      suppressClick.current = true;
      event.preventDefault();
      if (reduced()) { settle(); change(action); return; }
      direction.current = action === "next" ? -1 : 1;
      event.currentTarget.classList.remove("swipe-dragging");
      event.currentTarget.dataset.swipePhase = "out";
      event.currentTarget.style.setProperty("--track-swipe-x", `${direction.current * 92}px`);
      timer.current = setTimeout(() => {
        timer.current = undefined;
        change(action);
        // Also restore the surface when there is no next track in the queue.
        timer.current = setTimeout(() => { timer.current = undefined; settle(); }, 280);
      }, 130);
    },
    onPointerCancel() { start.current = null; settle(); },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
      suppressClick.current = false;
    },
  };
}
