import { useState } from "react";
import { Play, Pause, Heart, MoreHorizontal, Share2 } from "lucide-react";
import { api } from "./client";
import { usePlayer, play, control } from "./player";
import { useApp, run, toggleLike, go } from "./state";
import { openTrackArtist } from "./musicNavigation";
import { artist, type Track } from "./types";
import {
  RemoteImage,
  useResource,
  useText,
  Status,
  TrackList,
  TrackMenu,
  share,
  Empty,
} from "./ui";
import { StationButton } from "./StationButton";
import { Lyrics, Comments } from "./PlaybackUI";

export function TrackPage() {
  const t = useText();
  const selected = useApp((s) => s.detail) as Track;
  const data = useResource(
    () => api.track(selected.id),
    [selected.id],
    selected,
  );
  const related = useResource(
    () => api.related(selected.id),
    [selected.id],
    [],
  );
  const track = data.value || selected;
  const state = usePlayer((s) => s.state);
  const playing = state.queue[state.index]?.id === track.id && state.playing;
  const active = state.queue[state.index]?.id === track.id;
  const liked = useApp((s) => s.likes.some((row) => row.id === track.id));
  const [menu, setMenu] = useState(false),
    [tab, setTab] = useState("related");
  return (
    <>
      <section className="collection-hero track-detail-hero">
        <RemoteImage
          src={track.artwork_url || track.artwork?.["500x500"]}
          className="large-cover"
          pixels={1080}
        />
        <small>
          {t("Трек", "Track")}
          {track.genre ? ` · ${track.genre}` : ""}
        </small>
        <h1>{track.title}</h1>
        <button
          className="music-text-link"
          onClick={() => void run(() => openTrackArtist(track))}
        >
          {artist(track)}
        </button>
        <div className="collection-actions">
          <button
            className="primary"
            onClick={() =>
              void run(() => (active ? control("toggle") : play([track])))
            }
          >
            {playing ? (
              <Pause size={18} fill="currentColor" />
            ) : (
              <Play size={18} fill="currentColor" />
            )}
            {playing ? t("Пауза", "Pause") : t("Слушать", "Play")}
          </button>
          <StationButton kind="track" tracks={[track]} />
          <button
            className={"icon-button " + (liked ? "liked" : "")}
            aria-label={
              liked ? t("Убрать лайк", "Unlike") : t("Нравится", "Like")
            }
            aria-pressed={liked}
            onClick={() => void run(() => toggleLike(track))}
          >
            <Heart fill={liked ? "currentColor" : "none"} />
          </button>
          <button
            className="icon-button"
            aria-label={t("Поделиться", "Share")}
            onClick={() => void run(() => share(track))}
          >
            <Share2 />
          </button>
          <button
            className="icon-button"
            aria-label={t("Действия с треком", "Track actions")}
            onClick={() => setMenu(true)}
          >
            <MoreHorizontal />
          </button>
        </div>
        {track.user && artist(track) !== track.user.username && (
          <p>
            {t("Загрузил", "Uploaded by")}:{" "}
            <button
              className="music-text-link"
              onClick={() => go("artist", track.user!)}
            >
              {track.user.username}
            </button>
          </p>
        )}
      </section>
      <Status loading={data.loading} error={data.error} />
      <div className="chips" aria-label={t("О треке", "Track details")}>
        {(
          [
            ["related", "Похожее", "Similar"],
            ["lyrics", "Текст", "Lyrics"],
            ["comments", "Комментарии", "Comments"],
          ] as const
        ).map(([value, ru, en]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {t(ru, en)}
          </button>
        ))}
      </div>
      {tab === "lyrics" ? (
        <Lyrics track={track} />
      ) : tab === "comments" ? (
        <Comments track={track} />
      ) : (
        <>
          <Status loading={related.loading} error={related.error} />
          <TrackList
            tracks={(related.value || []).filter((row) => row.id !== track.id)}
          />
          {!related.loading && !related.error && !related.value?.length && (
            <Empty>
              {t("Похожих треков пока нет", "No similar tracks yet")}
            </Empty>
          )}
        </>
      )}
      {menu && <TrackMenu track={track} onClose={() => setMenu(false)} />}
    </>
  );
}
