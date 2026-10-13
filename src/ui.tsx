import { lockPageScroll } from "./modalScroll";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  X,
  MoreHorizontal,
  Heart,
  Play,
  Music2,
  Users,
  Share2,
  Plus,
  ThumbsDown,
  Download,
  ListPlus,
  Radio,
} from "lucide-react";
import { api, artwork } from "./client";
import { artworkCandidates } from "./artworkQuality";
import { native } from "./native";
import { dislike, useCloud } from "./cloud";
import { useApp, go, run, notify, toggleLike } from "./state";
import { play, enqueue, usePlayer } from "./player";
import { artist, type Track, type Playlist } from "./types";
export const useText = () => {
  const english = useCloud((s) => s.cloud.preferences.language) === "English";
  return (ru: string, en: string) => (english ? en : ru);
};
export function useResource<T>(
  load: () => Promise<T>,
  deps: unknown[],
  initial?: T,
) {
  const [value, setValue] = useState<T | undefined>(initial),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const revision = useApp((s) => s.revision);
  const identity = JSON.stringify(deps);
  const previousIdentity = useRef(identity);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    if (previousIdentity.current !== identity) {
      setValue(initial);
      previousIdentity.current = identity;
    }
    load()
      .then((v) => {
        if (alive) setValue(v);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [...deps, revision]);
  return { value, error, loading };
}
export function RemoteImage({
  src,
  alt = "",
  className = "",
  pixels = 200,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  pixels?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const placeholder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!placeholder.current || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    observer.observe(placeholder.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    let highReady = false;
    setUrl(null);
    if (src && pixels > 500)
      void artwork(artworkCandidates(src, 200)[0])
        .then((value) => {
          if (alive && !highReady) setUrl(value);
        })
        .catch(() => {});
    if (src)
      void (async () => {
        for (const candidate of artworkCandidates(src, pixels)) {
          if (!alive) return null;
          try {
            return await artwork(candidate);
          } catch {
            /* Try a supported smaller rendition if the original is absent. */
          }
        }
        return null;
      })()
        .then((value) => {
          highReady = true;
          if (alive && value) setUrl(value);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, [src, pixels, visible]);
  return url ? (
    <img
      className={className}
      src={url}
      alt={alt}
      loading={pixels > 500 ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  ) : (
    <span ref={placeholder} className={"image-placeholder " + className}>
      <Music2 size={22} />
    </span>
  );
}
export function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  const t = useText();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    close.current?.focus();
    const handler = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (
        close.current?.closest('[role="dialog"]') !==
        dialogs[dialogs.length - 1]
      )
        return;
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const root = close.current?.closest('[role="dialog"]');
        const targets = root?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]",
        );
        if (targets?.length) {
          const first = targets[0],
            last = targets[targets.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", handler);
      before?.focus();
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header>
          <h2>{title}</h2>
          <button
            ref={close}
            className="icon-button"
            aria-label={t("Закрыть", "Close")}
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function Status({
  error,
  loading,
}: {
  error?: string;
  loading?: boolean;
}) {
  const t = useText();
  return error ? (
    <div role="alert" className="error-card">
      {error}
      <button
        onClick={() => useApp.setState((s) => ({ revision: s.revision + 1 }))}
      >
        {t("Повторить", "Retry")}
      </button>
    </div>
  ) : loading ? (
    <div className="skeleton" aria-label={t("Загрузка", "Loading")} />
  ) : null;
}
export async function share(item: Track | Playlist, kind = "track") {
  useApp.setState({
    shareRequest: { item, kind: kind === "track" ? "track" : "playlist" },
  });
}
export function TrackList({
  tracks,
  onPlay,
  removable,
  onRemove,
}: {
  tracks: Track[];
  onPlay?: (index: number) => void;
  removable?: boolean;
  onRemove?: (track: Track) => void;
}) {
  const t = useText();
  const likes = useApp((s) => s.likes);
  const current = usePlayer((s) => s.state.queue[s.state.index]?.id);
  const [menu, setMenu] = useState<Track | null>(null);
  return (
    <>
      <div className="track-list">
        {tracks.map((track, index) => (
          <div
            className={"track-row " + (current === track.id ? "current" : "")}
            key={`${track.id}-${index}`}
          >
            <button
              className="track-main"
              onClick={() =>
                onPlay ? onPlay(index) : void run(() => play(tracks, index))
              }
            >
              <RemoteImage
                src={track.artwork_url || track.artwork?.["500x500"]}
                className="artwork"
              />
              <span>
                <strong>{track.title}</strong>
                <small>{artist(track)}</small>
              </span>
            </button>
            <button
              className={
                "icon-button " +
                (likes.some((l) => l.id === track.id) ? "liked" : "")
              }
              aria-label={t("Нравится", "Like")}
              onClick={() => void run(() => toggleLike(track))}
            >
              <Heart
                size={19}
                fill={
                  likes.some((l) => l.id === track.id) ? "currentColor" : "none"
                }
              />
            </button>
            <button
              className="icon-button"
              aria-label={t("Действия с треком", "Track actions")}
              onClick={() => setMenu(track)}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        ))}
      </div>
      {menu && (
        <TrackMenu
          track={menu}
          onClose={() => setMenu(null)}
          onRemove={removable ? () => onRemove?.(menu) : undefined}
        />
      )}
    </>
  );
}
export function TrackMenu({
  track,
  onClose,
  onRemove,
}: {
  track: Track;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const t = useText();
  const playlists = useApp((s) => s.playlists);
  const [choose, setChoose] = useState(false);
  const rated = useCloud(
    (s) => s.cloud.trackFeedback[String(track.id)]?.disliked,
  );
  const action = (task: () => Promise<unknown>) => {
    onClose();
    void run(task);
  };
  return (
    <Sheet title={track.title} onClose={onClose}>
      {choose ? (
        <div className="menu-list">
          {playlists.map((list) => (
            <button
              key={list.id}
              onClick={() =>
                action(async () => {
                  const full = await api.playlist(list.id);
                  await api.editPlaylist(full, [
                    ...new Set([
                      ...(full.tracks || []).map((t) => t.id),
                      track.id,
                    ]),
                  ]);
                  notify(t("Добавлено", "Added"));
                })
              }
            >
              {list.title}
            </button>
          ))}
        </div>
      ) : (
        <div className="menu-list">
          <button
            onClick={() =>
              action(async () => {
                const { openTrack } = await import("./musicNavigation");
                openTrack(track);
              })
            }
          >
            <Music2 />
            {t("Открыть трек", "Open track")}
          </button>
          <button
            onClick={() =>
              action(async () => {
                const { openTrackArtist } = await import("./musicNavigation");
                await openTrackArtist(track);
              })
            }
          >
            <Users />
            {t("Открыть артиста", "Open artist")}
          </button>
          <button onClick={() => action(() => enqueue(track, true))}>
            <ListPlus />
            {t("Играть следующим", "Play next")}
          </button>
          <button onClick={() => action(() => enqueue(track))}>
            <Plus />
            {t("В очередь", "Add to queue")}
          </button>
          <button onClick={() => setChoose(true)}>
            <Plus />
            {t("В плейлист", "Add to playlist")}
          </button>
          <button
            onClick={() =>
              action(async () => {
                const { startStation } = await import("./player");
                await startStation([track], "track");
              })
            }
          >
            <Radio />
            {t("Волна по треку", "Track radio")}
          </button>
          <button onClick={() => action(() => share(track))}>
            <Share2 />
            {t("Поделиться", "Share")}
          </button>
          <button
            onClick={() =>
              action(async () => {
                notify(t("Скачиваем…", "Downloading…"));
                await native.download({ track });
                notify(t("Трек сохранён", "Track saved"));
              })
            }
          >
            <Download />
            {t("Сохранить офлайн", "Download")}
          </button>
          <button onClick={() => action(() => dislike(track, !rated))}>
            <ThumbsDown />
            {rated
              ? t("Убрать дизлайк", "Remove dislike")
              : t("Не рекомендовать", "Do not recommend")}
          </button>
          {track.user && artist(track) !== track.user.username && (
            <button
              onClick={() => {
                go("artist", track.user as never);
                onClose();
              }}
            >
              <Music2 />
              {t("Кто загрузил трек", "Uploader profile")}
            </button>
          )}
          {onRemove && (
            <button
              className="danger"
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              {t("Удалить из плейлиста", "Remove from playlist")}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
export function PlaylistCards({ lists }: { lists: Playlist[] }) {
  const t = useText();
  return (
    <div className="playlist-grid">
      {lists.map((list) => (
        <button
          className="playlist-card"
          key={list.id}
          onClick={() => go("playlist", list)}
        >
          <RemoteImage
            src={list.artwork_url || list.tracks?.[0]?.artwork_url}
            className="cover"
            pixels={500}
          />
          <strong>{list.title}</strong>
          <small>
            {list.track_count != null
              ? `${list.track_count} ${t("треков", "tracks")}`
              : list.tracks
                ? `${list.tracks.length} ${t("треков", "tracks")}`
                : t("Плейлист", "Playlist")}{" "}
            · {list.user?.username}
          </small>
        </button>
      ))}
    </div>
  );
}
export const time = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function InputDialog({
  title,
  onClose,
  onSubmit,
  initial = "",
  placeholder = "",
}: {
  title: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<unknown>;
  initial?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const t = useText();
  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 100);
  }, []);
  return (
    <Sheet title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          void onSubmit(value.trim())
            .then(onClose)
            .catch((e) => notify(String(e)))
            .finally(() => setBusy(false));
        }}
      >
        <input
          ref={ref}
          value={value}
          maxLength={128}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="primary" disabled={busy || !value.trim()}>
          {t("Сохранить", "Save")}
        </button>
      </form>
    </Sheet>
  );
}
