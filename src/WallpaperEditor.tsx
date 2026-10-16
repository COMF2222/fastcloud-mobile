import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet, useText } from "./ui";
import {
  saveWallpaper,
  saveWallpaperPlacement,
  useWallpaper,
} from "./wallpaper";
import {
  defaultPlacement,
  normalizePlacement,
  panPlacement,
  placementStyle,
  zoomPlacement,
  type Placement,
  type Point,
  type Size,
} from "./wallpaperPlacement";

type Gesture = { placement: Placement; points: Point[] };
/** Non-destructive, device-local framing. Images and video retain their bytes. */
export function WallpaperEditor({
  file,
  onClose,
}: {
  file: File | null;
  onClose: () => void;
}) {
  const t = useText(),
    saved = useWallpaper();
  const [source, setSource] = useState(file ? "" : saved.url || "");
  const [value, setValue] = useState(() =>
    file ? { ...defaultPlacement } : normalizePlacement(saved.placement),
  );
  const latest = useRef(value);
  const setPlacement = (next: Placement) => {
    latest.current = next;
    setValue(next);
  };
  const [media, setMedia] = useState<Size>({ width: 0, height: 0 });
  const [frame, setFrame] = useState<Size>({ width: 0, height: 0 });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const preview = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>()),
    gesture = useRef<Gesture | null>(null);
  const video = file ? file.type.startsWith("video/") : saved.video;
  useEffect(() => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setInvalid(true);
      setError(
        t("Фон должен быть меньше 25 MiB.", "Choose a wallpaper under 25 MiB."),
      );
      return;
    }
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useLayoutEffect(() => {
    if (!preview.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrame({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
      pointers.current.clear();
      gesture.current = null;
    });
    observer.observe(preview.current);
    return () => observer.disconnect();
  }, []);
  const begin = () => {
    gesture.current = {
      placement: latest.current,
      points: [...pointers.current.values()].slice(0, 2),
    };
  };
  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = preview.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const center = (points: Point[]) => ({
    x: (points[0].x + points[1].x) / 2,
    y: (points[0].y + points[1].y) / 2,
  });
  const distance = (points: Point[]) =>
    Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const zoom = (amount: number) =>
    setPlacement(
      zoomPlacement(latest.current, frame, media, amount, {
        x: frame.width / 2,
        y: frame.height / 2,
      }),
    );
  return (
    <Sheet
      variant="fullscreen"
      title={t("Настроить фон", "Adjust wallpaper")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={preview}
        className="wallpaper-preview"
        role="group"
        tabIndex={0}
        aria-label={t("Положение фона", "Wallpaper position")}
        aria-describedby="wallpaper-help"
        onPointerDown={(event) => {
          if (busy) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          pointers.current.set(event.pointerId, local(event));
          begin();
        }}
        onPointerMove={(event) => {
          if (
            busy ||
            !pointers.current.has(event.pointerId) ||
            !gesture.current
          )
            return;
          pointers.current.set(event.pointerId, local(event));
          const current = [...pointers.current.values()].slice(0, 2),
            start = gesture.current;
          if (current.length === 2 && start.points.length === 2) {
            const ratio =
              distance(current) / Math.max(1, distance(start.points));
            setPlacement(
              zoomPlacement(
                start.placement,
                frame,
                media,
                start.placement.zoom * ratio,
                center(start.points),
                center(current),
              ),
            );
          } else if (current.length === 1 && start.points.length === 1)
            setPlacement(
              panPlacement(start.placement, frame, media, {
                x: current[0].x - start.points[0].x,
                y: current[0].y - start.points[0].y,
              }),
            );
        }}
        onPointerUp={(event) => {
          pointers.current.delete(event.pointerId);
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          begin();
        }}
        onPointerCancel={(event) => {
          pointers.current.delete(event.pointerId);
          begin();
        }}
        onKeyDown={(event) => {
          if (busy) return;
          const delta = {
            ArrowLeft: { x: -8, y: 0 },
            ArrowRight: { x: 8, y: 0 },
            ArrowUp: { x: 0, y: -8 },
            ArrowDown: { x: 0, y: 8 },
          }[event.key];
          if (delta) {
            event.preventDefault();
            setPlacement(panPlacement(value, frame, media, delta));
          }
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoom(value.zoom + 0.1);
          }
          if (event.key === "-") {
            event.preventDefault();
            zoom(value.zoom - 0.1);
          }
        }}
      >
        {source &&
          (video ? (
            <video
              src={source}
              style={placementStyle(value)}
              autoPlay
              muted
              playsInline
              loop
              onLoadedMetadata={(event) =>
                setMedia({
                  width: event.currentTarget.videoWidth,
                  height: event.currentTarget.videoHeight,
                })
              }
              onError={() => {
                setInvalid(true);
                setError(
                  t(
                    "Не удалось открыть этот фон. Выбери другой файл.",
                    "Could not open this wallpaper. Choose another file.",
                  ),
                );
              }}
            />
          ) : (
            <img
              src={source}
              style={placementStyle(value)}
              alt=""
              draggable={false}
              onLoad={(event) =>
                setMedia({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              onError={() => {
                setInvalid(true);
                setError(
                  t(
                    "Не удалось открыть этот фон. Выбери другой файл.",
                    "Could not open this wallpaper. Choose another file.",
                  ),
                );
              }}
            />
          ))}
      </div>
      <div className="wallpaper-controls">
        <p className="wallpaper-help" id="wallpaper-help">
          {t(
            "Двигай и приближай фон пальцами.",
            "Drag and pinch to adjust your wallpaper.",
          )}
        </p>
        <div
          id="wallpaper-tools"
          className="wallpaper-tools"
          hidden={!toolsOpen}
        >
          <div
            className="wallpaper-fit"
            role="group"
            aria-label={t("Размещение", "Placement")}
          >
            {(["cover", "contain"] as const).map((fit) => (
              <button
                key={fit}
                disabled={busy}
                aria-pressed={value.fit === fit}
                onClick={() => setPlacement({ ...defaultPlacement, fit })}
              >
                {fit === "cover"
                  ? t("Заполнить", "Fill screen")
                  : t("Целиком", "Fit image")}
              </button>
            ))}
          </div>
          <label className="range-setting">
            <span>
              {t("Масштаб", "Zoom")}
              <b>{Math.round(value.zoom * 100)}%</b>
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={value.zoom}
              onChange={(event) => zoom(Number(event.target.value))}
              disabled={!media.width || busy}
            />
          </label>
          <button
            disabled={busy}
            onClick={() => setPlacement({ ...defaultPlacement })}
          >
            {t("Сбросить", "Reset")}
          </button>
        </div>
        {error && (
          <p role="alert" className="error-card">
            {error}
          </p>
        )}
        <div className="settings-actions wallpaper-editor-actions">
          <button
            disabled={busy}
            aria-expanded={toolsOpen}
            aria-controls="wallpaper-tools"
            onClick={() => setToolsOpen(!toolsOpen)}
          >
            {toolsOpen
              ? t("Скрыть параметры", "Hide options")
              : t("Параметры", "Options")}
          </button>
          <button
            className="primary"
            disabled={busy || !media.width || invalid}
            onClick={() => {
              setError("");
              setBusy(true);
              void (
                file
                  ? saveWallpaper(file, value)
                  : saveWallpaperPlacement(value)
              )
                .then(onClose)
                .catch((error) =>
                  setError(
                    error instanceof Error ? error.message : String(error),
                  ),
                )
                .finally(() => setBusy(false));
            }}
          >
            {busy ? t("Сохраняем…", "Saving…") : t("Сохранить", "Save")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
