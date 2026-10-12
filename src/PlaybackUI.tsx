import { lockPageScroll } from "./modalScroll";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronDown,
  Heart,
  Share2,
  ListMusic,
  Shuffle,
  Repeat,
  Timer,
  SlidersHorizontal,
} from "lucide-react";
import { usePlayer, control, play } from "./player";
import { useCloud, setPreference } from "./cloud";
import { useApp, go, run, toggleLike } from "./state";
import { api, request } from "./client";
import { native, supportsAudioEffects } from "./native";
import { artist, type LyricsRecord, type Track } from "./types";
import { parseLrc, currentLyricLine } from "./lyricsTiming";
import {
  RemoteImage,
  TrackList,
  Sheet,
  Status,
  Empty,
  share,
  time,
  useResource,
  useText,
} from "./ui";
export function MiniPlayer() {
  const t = useText();
  const state = usePlayer((s) => s.state),
    expanded = usePlayer((s) => s.expanded);
  const track = state.queue[state.index];
  if (!track || expanded) return null;
  return (
    <div className="mini-player">
      <button
        className="mini-main"
        onClick={() => usePlayer.setState({ expanded: true })}
      >
        <RemoteImage src={track.artwork_url} className="artwork" />
        <span>
          <strong>{track.title}</strong>
          <small>{artist(track)}</small>
        </span>
      </button>
      <button
        className="icon-button"
        aria-label={t("Поделиться", "Share")}
        onClick={() => void run(() => share(track))}
      >
        <Share2 size={18} />
      </button>
      <button
        className="icon-button"
        aria-label={state.playing ? t("Пауза", "Pause") : t("Играть", "Play")}
        onClick={() => void run(() => control("toggle"))}
      >
        {state.loading ? (
          <span className="spinner" aria-hidden="true" />
        ) : state.playing ? (
          <Pause fill="currentColor" size={22} />
        ) : (
          <Play fill="currentColor" size={22} />
        )}
      </button>
      <div
        className="mini-progress"
        style={{
          width: `${state.durationMs ? (state.positionMs / state.durationMs) * 100 : 0}%`,
        }}
      />
    </div>
  );
}
export function FullPlayer() {
  const t = useText();
  const state = usePlayer((s) => s.state);
  const track = state.queue[state.index];
  const [tab, setTab] = useState("cover"),
    [settings, setSettings] = useState(false),
    [sleep, setSleep] = useState(false);
  const liked = useApp((s) => s.likes.some((v) => v.id === track?.id));
  const [seek, setSeek] = useState<number | null>(null);
  useEffect(() => {
    if (!track) { usePlayer.setState({ expanded: false }); return; }
    const before = document.activeElement as HTMLElement | null;
    const unlockScroll = lockPageScroll();
    document
      .querySelector<HTMLButtonElement>(".full-player > header button")
      ?.focus();
    const escape = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      const dialog = dialogs[dialogs.length - 1] as HTMLElement | undefined;
      if (!dialog?.classList.contains("full-player")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        usePlayer.setState({ expanded: false });
      }
      if (event.key === "Tab") {
        const items = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
        const first = items[0], last = items[items.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", escape);
    return () => {
      unlockScroll();
      document.removeEventListener("keydown", escape);
      before?.focus();
    };
  }, [Boolean(track)]);
  if (!track) return null;
  return (
    <div
      className="full-player"
      role="dialog"
      aria-modal="true"
      aria-label={t("Плеер", "Player")}
    >
      <header>
        <button
          className="icon-button"
          aria-label={t("Свернуть плеер", "Close player")}
          onClick={() => usePlayer.setState({ expanded: false })}
        >
          <ChevronDown />
        </button>
        <span className="eyebrow">NOW PLAYING</span>
        <button
          className="icon-button"
          aria-label={t("Поделиться", "Share")}
          onClick={() => void run(() => share(track))}
        >
          <Share2 />
        </button>
      </header>
      <div className="player-tabs chips">
        {[
          ["cover", "Плеер", "Player"],
          ["lyrics", "Текст", "Lyrics"],
          ["comments", "Комментарии", "Comments"],
        ].map((row) => (
          <button
            key={row[0]}
            aria-pressed={tab === row[0]}
            onClick={() => setTab(row[0])}
          >
            {t(row[1], row[2])}
          </button>
        ))}
      </div>
      <div className="player-content">
        {tab === "cover" ? (
          <RemoteImage
            src={track.artwork_url || track.artwork?.["500x500"]}
            className="player-cover"
          />
        ) : tab === "lyrics" ? (
          <Lyrics track={track} />
        ) : (
          <Comments track={track} />
        )}
      </div>
      <div className="player-bottom">
        <div className="now-title">
          <span>
            <h2>{track.title}</h2>
            <p>{artist(track)}</p>
          </span>
          <button
            className={"icon-button " + (liked ? "liked" : "")}
            aria-label={t("Нравится", "Like")}
            onClick={() => void run(() => toggleLike(track))}
          >
            <Heart fill={liked ? "currentColor" : "none"} />
          </button>
        </div>
        <label className="seek">
          <input
            aria-label={t("Позиция воспроизведения", "Playback position")}
            type="range"
            min={0}
            max={Math.max(1, state.durationMs)}
            value={seek ?? state.positionMs}
            onChange={(e) => setSeek(Number(e.target.value))}
            onPointerUp={() => {
              if (seek !== null) void run(() => control("seek", seek));
              setSeek(null);
            }}
            onKeyUp={() => {
              if (seek !== null) void run(() => control("seek", seek));
              setSeek(null);
            }}
          />
          <span>
            <time>{time(seek ?? state.positionMs)}</time>
            <time>{time(state.durationMs)}</time>
          </span>
        </label>
        <div className="player-controls">
          <button
            className={"icon-button " + (state.shuffle ? "active" : "")}
            aria-label={t("Перемешать", "Shuffle")}
            onClick={() => void run(() => control("shuffle"))}
          >
            <Shuffle size={21} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Предыдущий", "Previous")}
            onClick={() => void run(() => control("previous"))}
          >
            <SkipBack fill="currentColor" size={28} />
          </button>
          <button
            className="play-button"
            aria-label={
              state.playing ? t("Пауза", "Pause") : t("Играть", "Play")
            }
            onClick={() => void run(() => control("toggle"))}
          >
            {state.loading ? (
              <span className="spinner" />
            ) : state.playing ? (
              <Pause fill="currentColor" size={30} />
            ) : (
              <Play fill="currentColor" size={30} />
            )}
          </button>
          <button
            className="icon-button"
            aria-label={t("Следующий", "Next")}
            onClick={() => void run(() => control("next"))}
          >
            <SkipForward fill="currentColor" size={28} />
          </button>
          <button
            className={"icon-button " + (state.repeat ? "active" : "")}
            aria-label={t("Повтор", "Repeat")}
            onClick={() => void run(() => control("repeat"))}
          >
            <Repeat size={21} />
            {state.repeat === 1 && <sup>1</sup>}
          </button>
        </div>
        <div className="player-tools">
          <button
            className="icon-button"
            aria-label={t("Таймер сна", "Sleep timer")}
            onClick={() => setSleep(true)}
          >
            <Timer />
          </button>
          <button
            className="icon-button"
            aria-label={t("Настройки звука", "Sound settings")}
            onClick={() => setSettings(true)}
          >
            <SlidersHorizontal />
          </button>
          <button
            className="icon-button"
            aria-label={t("Очередь", "Queue")}
            onClick={() => {
              usePlayer.setState({ expanded: false });
              go("queue");
            }}
          >
            <ListMusic />
          </button>
        </div>
        {state.error && (
          <p className="player-error">
            {t(
              "Не удалось воспроизвести. Нажми «Играть», чтобы повторить.",
              "Could not play. Press Play to retry.",
            )}
          </p>
        )}
      </div>
      {sleep && (
        <Sheet
          title={t("Таймер сна", "Sleep timer")}
          onClose={() => setSleep(false)}
        >
          <div className="menu-list">
            {[15, 30, 45, 60, 90, 0].map((minutes) => (
              <button
                key={minutes}
                onClick={() =>
                  void run(async () => {
                    await control("sleep", minutes * 60);
                    setSleep(false);
                  })
                }
              >
                {minutes
                  ? `${minutes} ${t("минут", "minutes")}`
                  : t("Выключить", "Off")}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {settings && (
        <Sheet title={t("Звук", "Sound")} onClose={() => setSettings(false)}>
          <p>{t("Скорость воспроизведения", "Playback speed")}</p>
          <div className="chips">
            {[0.75, 1, 1.25, 1.5, 2].map((value) => (
              <button
                key={value}
                aria-pressed={state.speed === value}
                onClick={() => void run(() => control("speed", value))}
              >
                {value}×
              </button>
            ))}
          </div>
          {supportsAudioEffects && (
            <>
              <p>{t("Эквалайзер", "Equalizer")}</p>
              <div className="chips">
                {[
                  ["flat", "Обычный", "Flat"],
                  ["bass", "Бас", "Bass"],
                  ["vocal", "Вокал", "Vocal"],
                  ["rock", "Рок", "Rock"],
                ].map((row) => (
                  <button
                    key={row[0]}
                    onClick={() =>
                      void run(() =>
                        control(
                          "eq",
                          row[0] === "bass"
                            ? 1
                            : row[0] === "vocal"
                              ? 2
                              : row[0] === "rock"
                                ? 3
                                : 0,
                        ),
                      )
                    }
                  >
                    {t(row[1], row[2])}
                  </button>
                ))}
              </div>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}
function Lyrics({ track }: { track: Track }) {
  const t = useText();
  const position = usePlayer((s) => s.state.positionMs),
    duration = usePlayer((s) => s.state.durationMs);
  const prefs = useCloud((s) => s.cloud.preferences);
  const result = useResource(
    () =>
      request<LyricsRecord | null>("/v1/mobile/lyrics", "POST", {
        action: "lookup",
        artist: artist(track),
        title: track.title,
        durationMs: duration || track.duration || 0,
        album: track.publisher_metadata?.album_title || null,
        isrc: track.publisher_metadata?.isrc || null,
      }),
    [track.id],
  );
  const lines = result.value?.syncedLyrics
    ? parseLrc(result.value.syncedLyrics)
    : [];
  const current = currentLyricLine(lines, position);
  const active = useRef<HTMLParagraphElement>(null);
  const auto = prefs.lyrics_auto_scroll !== false;
  useEffect(() => {
    if (auto)
      active.current?.scrollIntoView({
        block: "center",
        behavior: prefs.reduced_motion ? "instant" : "smooth",
      });
  }, [current, auto]);
  return (
    <div
      className={"lyrics " + (auto && lines.length ? "auto" : "manual")}
      style={{ fontSize: `${Number(prefs.lyrics_scale) || 1}em` }}
    >
      <Status error={result.error} loading={result.loading} />
      {result.value?.instrumental ? (
        <Empty>{t("Инструментальный трек", "Instrumental track")}</Empty>
      ) : lines.length ? (
        lines.map((line, index) => (
          <p
            key={`${line.time}-${index}`}
            ref={index === current ? active : null}
            className={
              index === current
                ? "current"
                : prefs.lyrics_blur_past !== false
                  ? "inactive blur"
                  : "inactive"
            }
          >
            {line.text || "♪"}
          </p>
        ))
      ) : result.value?.plainLyrics ? (
        <div className="plain-lyrics">{result.value.plainLyrics}</div>
      ) : (
        !result.loading &&
        !result.error && (
          <Empty>{t("Текст пока не найден", "Lyrics not found yet")}</Empty>
        )
      )}
      {result.value?.source && (
        <small className="lyric-source">{result.value.source}</small>
      )}
    </div>
  );
}
function Comments({ track }: { track: Track }) {
  const t = useText();
  const result = useResource(() => api.comments(track.id), [track.id]);
  const [text, setText] = useState("");
  return (
    <div className="comments">
      <Status error={result.error} loading={result.loading} />
      {result.value?.map((row) => (
        <div className="comment" key={row.id}>
          <RemoteImage src={row.user?.avatar_url} className="avatar" />
          <span>
            <strong>{row.user?.username}</strong>
            <p>{row.body}</p>
          </span>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim())
            void run(async () => {
              await api.comment(track.id, text.trim());
              setText("");
              useApp.setState((s) => ({ revision: s.revision + 1 }));
            });
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Комментарий", "Comment")}
        />
        <button disabled={!text.trim()}>{t("Отправить", "Send")}</button>
      </form>
    </div>
  );
}
export function Queue() {
  const t = useText(),
    state = usePlayer((s) => s.state);
  return (
    <>
      <h1>{t("Очередь", "Queue")}</h1>
      <TrackList
        tracks={state.queue}
        onPlay={(index) => void run(() => control("jump", undefined, index))}
      />
      <div className="queue-editor">
        {state.queue.map((track, index) => (
          <div key={`${track.id}-${index}`}>
            <span>{index + 1}</span>
            <strong>{track.title}</strong>
            <button
              disabled={index === 0}
              onClick={() =>
                void run(() => control("move", undefined, index, index - 1))
              }
            >
              ↑
            </button>
            <button
              onClick={() =>
                void run(() => control("remove", undefined, index))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
export function Offline() {
  const t = useText();
  const data = useResource(() => native.downloads(), []);
  return (
    <>
      <h1>{t("Офлайн", "Offline")}</h1>
      <p className="muted">
        {t(
          "Сохранённая музыка играет без интернета.",
          "Saved music plays without an internet connection.",
        )}
      </p>
      <Status error={data.error} loading={data.loading} />
      <TrackList tracks={data.value?.items.map((v) => v.track) || []} />
      <div className="menu-list">
        {data.value?.items.map((row) => (
          <button
            key={row.track.id}
            onClick={() =>
              void run(async () => {
                await native.removeDownload({ id: row.track.id });
                useApp.setState((s) => ({ revision: s.revision + 1 }));
              })
            }
          >
            {t("Удалить", "Remove")}: {row.track.title}
            <small>{(row.bytes / 1048576).toFixed(1)} MiB</small>
          </button>
        ))}
      </div>
    </>
  );
}
