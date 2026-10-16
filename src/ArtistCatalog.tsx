import { useId, useState, type ReactNode } from "react";
import type { Playlist, Track } from "./types";
import { api } from "./client";
import {
  artistCollections,
  filterArtistItems,
  popularTracks,
  type ArtistSection,
} from "./artistCollections";
import {
  Empty,
  PlaylistCards,
  Status,
  TrackList,
  useResource,
  useText,
} from "./ui";
import { play } from "./player";
import { run } from "./state";
import { shuffled } from "./contracts";

type Resource<T> = { value?: T[]; loading: boolean; error: string };
function CatalogRows({
  resource,
  query,
  playlists = false,
}: {
  resource: Resource<Track | Playlist>;
  query: string;
  playlists?: boolean;
}) {
  const t = useText();
  const items = filterArtistItems(resource.value || [], query);
  return (
    <>
      <Status
        error={resource.error}
        loading={resource.loading && !resource.value?.length}
      />
      {items.length ? (
        playlists ? (
          <PlaylistCards lists={items as Playlist[]} />
        ) : (
          <TrackList tracks={items as Track[]} />
        )
      ) : (
        !resource.loading &&
        !resource.error && (
          <Empty>
            {query.trim()
              ? t(
                  "Ничего не найдено. Попробуй другой запрос.",
                  "No matches. Try another search.",
                )
              : t("Здесь пока пусто", "Nothing here yet")}
          </Empty>
        )
      )}
    </>
  );
}

/** Mounted on demand, so activity does not slow down opening a profile. */
function ProfileLikes({ userId, query }: { userId: number; query: string }) {
  const t = useText();
  const resource = useResource(() => api.userLikes(userId), [userId]);
  return (
    <>
      <button
        disabled={!resource.value?.length}
        onClick={() => void run(() => play(shuffled(resource.value || [])))}
      >
        {t("Перемешать всё", "Shuffle all")}
      </button>
      <CatalogRows resource={resource} query={query} />
    </>
  );
}
function ProfileReposts({ userId, query }: { userId: number; query: string }) {
  const t = useText();
  const tracks = useResource(() => api.userReposts(userId), [userId]);
  const lists = useResource(() => api.userRepostedPlaylists(userId), [userId]);
  return (
    <>
      <h2>{t("Репосты треков", "Reposted tracks")}</h2>
      <CatalogRows resource={tracks} query={query} />
      <h2>{t("Репосты плейлистов", "Reposted playlists")}</h2>
      <CatalogRows resource={lists} query={query} playlists />
    </>
  );
}
function SavedCollections({
  albums,
  query,
}: {
  albums: boolean;
  query: string;
}) {
  const t = useText();
  const saved = useResource(api.likedPlaylists, []);
  const collections = artistCollections(saved.value || []);
  return (
    <>
      <h2>
        {albums
          ? t("Сохранённые альбомы", "Saved albums")
          : t("Сохранённые плейлисты", "Saved playlists")}
      </h2>
      <CatalogRows
        resource={{
          ...saved,
          value: albums ? collections.albums : collections.playlists,
        }}
        query={query}
        playlists
      />
      <h2>
        {albums
          ? t("Мои альбомы", "My albums")
          : t("Мои плейлисты", "My playlists")}
      </h2>
    </>
  );
}

export function ArtistCatalog({
  userId,
  tracks,
  lists,
  ownSections,
}: {
  userId: number;
  tracks: Resource<Track>;
  lists: Resource<Playlist>;
  ownSections?: { following: ReactNode; dislikes: ReactNode };
}) {
  const t = useText(),
    id = useId();
  const [section, setSection] = useState<ArtistSection>("tracks");
  const [query, setQuery] = useState("");
  const collections = artistCollections(lists.value || []);
  const count = (resource: Resource<unknown>, items = resource.value) =>
    !resource.loading && !resource.error ? items?.length : undefined;
  const tabs: { key: ArtistSection; label: string; count?: number }[] = [
    { key: "tracks", label: t("Треки", "Tracks"), count: count(tracks) },
    { key: "popular", label: t("Популярное", "Popular") },
    {
      key: "albums",
      label: t("Альбомы", "Albums"),
      count: ownSections ? undefined : count(lists, collections.albums),
    },
    {
      key: "playlists",
      label: t("Плейлисты", "Playlists"),
      count: ownSections ? undefined : count(lists, collections.playlists),
    },
    { key: "likes", label: t("Лайки", "Likes") },
    { key: "reposts", label: t("Репосты", "Reposts") },
    ...(ownSections
      ? [
          { key: "following" as const, label: t("Подписки", "Following") },
          { key: "dislikes" as const, label: t("Дизлайки", "Dislikes") },
        ]
      : []),
  ];
  const choose = (key: ArtistSection) => {
    setSection(key);
    setQuery("");
  };
  const people = section === "following" || section === "dislikes";
  return (
    <section
      className="artist-catalog"
      aria-label={t("Музыка профиля", "Profile music")}
    >
      <div
        className="artist-tabs"
        role="tablist"
        aria-label={t("Разделы профиля", "Profile sections")}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-${tab.key}`}
            role="tab"
            aria-selected={section === tab.key}
            aria-controls={`${id}-panel`}
            tabIndex={section === tab.key ? 0 : -1}
            onClick={() => choose(tab.key)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % tabs.length
                  : event.key === "ArrowLeft"
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              choose(tabs[next].key);
              const target = document.getElementById(`${id}-${tabs[next].key}`);
              target?.focus({ preventScroll: true });
              target?.scrollIntoView({ block: "nearest", inline: "nearest" });
            }}
          >
            <span>{tab.label}</span>
            <small aria-hidden={tab.count == null ? true : undefined}>
              {tab.count ?? "\u00a0"}
            </small>
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-${section}`}
        tabIndex={0}
      >
        {!people && (
          <label className="artist-search">
            <span className="sr-only">
              {t("Поиск по музыке профиля", "Search profile music")}
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Найти в этом разделе", "Search this section")}
            />
          </label>
        )}
        {(section === "tracks" || section === "popular") && (
          <CatalogRows
            resource={{
              ...tracks,
              value:
                section === "popular"
                  ? popularTracks(tracks.value || [])
                  : tracks.value,
            }}
            query={query}
          />
        )}
        {(section === "albums" || section === "playlists") && (
          <>
            {ownSections && (
              <SavedCollections albums={section === "albums"} query={query} />
            )}
            <CatalogRows
              resource={{
                ...lists,
                value:
                  section === "albums"
                    ? collections.albums
                    : collections.playlists,
              }}
              query={query}
              playlists
            />
          </>
        )}
        {section === "likes" && (
          <ProfileLikes key={userId} userId={userId} query={query} />
        )}
        {section === "reposts" && (
          <ProfileReposts key={userId} userId={userId} query={query} />
        )}
        {section === "following" && ownSections?.following}
        {section === "dislikes" && ownSections?.dislikes}
      </div>
    </section>
  );
}
