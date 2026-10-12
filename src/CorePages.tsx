import { useState } from "react";
import { SmartEditor } from "./SmartEditor";
import {
  Play,
  Search,
  Plus,
  Settings,
  ArrowRight,
  Shuffle,
  Share2,
  Heart,
  Users,
  ThumbsDown,
  Download,
  BarChart3,
  Trophy,
  LogOut,
  Music2,
} from "lucide-react";
import { api, request } from "./client";
import { useApp, go, run, signOut, refreshLibrary } from "./state";
import { useCloud, dislike, change } from "./cloud";
import { play, myWave } from "./player";
import { waveGreeting } from "./waveGreeting";
import {
  TrackList,
  PlaylistCards,
  RemoteImage,
  Status,
  Empty,
  Sheet,
  InputDialog,
  share,
  useResource,
  useText,
} from "./ui";
import { artist, type Track, type Playlist, type User } from "./types";
import { moodQuery } from "./mood";

export function Home() {
  const t = useText();
  const likes = useApp((s) => s.likes),
    recent = useApp((s) => s.recent),
    lists = useApp((s) => s.playlists);
  const preferences = useCloud((s) => s.cloud.preferences);
  const [busy, setBusy] = useState(false),
    [modeOpen, setModeOpen] = useState(false);
  const [variation] = useState(
    () => crypto.getRandomValues(new Uint32Array(1))[0] % 4,
  );
  const greeting = waveGreeting(
    new Date().getHours(),
    preferences.language === "English",
    variation,
  );
  const modes = [
    ["Balanced", "Моя волна", "My Wave"],
    ["Familiar", "Любимое", "Favourites"],
    ["Discover", "Открытия", "Discovery"],
    ["Mood", "По настроению", "By mood"],
    ["NoRepeats", "Без повторов", "No repeats"],
  ];
  const selected = modes.find(
    (row) => row[0] === (preferences.wave_mode || "Balanced"),
  )!;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VEIRUNE / FOR YOU</p>
          <h1>{greeting}</h1>
        </div>
        <button
          className="avatar-button"
          aria-label={t("Мой профиль", "My profile")}
          onClick={() => go("profile")}
        >
          <RemoteImage
            src={useApp((s) => s.me?.avatar_url)}
            className="avatar"
          />
        </button>
      </div>
      <section className="wave-card">
        <div className="wave-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <p>{t("Твоя музыка. Твой ритм.", "Your music. Your rhythm.")}</p>
        <h2>{t("Поймай свою волну", "Find your flow")}</h2>
        <small>
          {t(
            "Любимое и новые открытия, под твой вкус",
            "Favourites and discoveries, made for your taste",
          )}
        </small>
        <div className="wave-actions">
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void run(async () =>
                play(await myWave(likes, recent), 0, true),
              ).finally(() => setBusy(false));
            }}
          >
            <Play size={18} fill="currentColor" />
            {busy
              ? t("Готовим…", "Getting ready…")
              : t("Новая волна", "Start My Wave")}
          </button>
          <button className="wave-mode" onClick={() => setModeOpen(true)}>
            {t(selected[1], selected[2])} <span>⌄</span>
          </button>
        </div>
      </section>
      {recent.length > 0 && (
        <section>
          <div className="section-heading">
            <h2>{t("Продолжить слушать", "Continue listening")}</h2>
            <button className="text-button" onClick={() => go("library")}>
              {t("Все", "All")}
              <ArrowRight size={16} />
            </button>
          </div>
          <TrackList tracks={recent.slice(0, 5)} />
        </section>
      )}
      {lists.length > 0 && (
        <section>
          <h2>{t("Твои подборки", "Your playlists")}</h2>
          <PlaylistCards lists={lists.slice(0, 4)} />
        </section>
      )}
      {!likes.length && !recent.length && (
        <Empty>
          {t(
            "Найди любимый трек и поставь лайк — волна подстроится под тебя.",
            "Find a favourite track and like it. My Wave will learn your taste.",
          )}
        </Empty>
      )}
      {modeOpen && (
        <Sheet
          title={t("Настроить волну", "My Wave settings")}
          onClose={() => setModeOpen(false)}
        >
          <div className="menu-list">
            {modes.map((row) => (
              <button
                className={
                  row[0] === (preferences.wave_mode || "Balanced")
                    ? "selected"
                    : ""
                }
                key={row[0]}
                onClick={() =>
                  void run(() => change("preferences", "wave_mode", row[0]))
                }
              >
                {t(row[1], row[2])}
                {row[0] === (preferences.wave_mode || "Balanced") ? " ✓" : ""}
              </button>
            ))}
          </div>
          {preferences.wave_mode === "Mood" && (
            <div className="chips">
              {[
                ["Calm", "Спокойно", "Calm"],
                ["Sad", "Грустно", "Sad"],
                ["Happy", "Весело", "Happy"],
                ["Workout", "Тренировка", "Workout"],
                ["Road", "В дороге", "On the road"],
              ].map((row) => (
                <button
                  key={row[0]}
                  aria-pressed={preferences.wave_mood === row[0]}
                  onClick={() =>
                    void run(() => change("preferences", "wave_mood", row[0]))
                  }
                >
                  {t(row[1], row[2])}
                </button>
              ))}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

export function SearchPage() {
  const t = useText();
  const [text, setText] = useState(""),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("tracks");
  const result = useResource(
    async () => {
      if (!query) return [];
      if (query.startsWith("https://soundcloud.com/")) {
        const found = await api.resolve(query);
        return [found];
      }
      if (kind === "lyrics") {
        const matches = await request<{ track: Track; excerpt: string }[]>(
          "/v1/mobile/lyrics",
          "POST",
          { action: "fragment", query },
        );
        return matches.map((v) => ({ ...v.track, lyricExcerpt: v.excerpt }));
      }
      return api.search(moodQuery(query), kind);
    },
    [query, kind],
    [] as (Track | Playlist | User)[],
  );
  return (
    <>
      <h1>{t("Поиск", "Search")}</h1>
      <form
        className="search-input"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(text.trim());
        }}
      >
        <Search size={20} />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t(
            "Треки, настроение, строчка из песни…",
            "Tracks, mood, a line from a song…",
          )}
          aria-label={t("Поиск музыки", "Search music")}
        />
        <button className="icon-button" aria-label={t("Найти", "Search")}>
          <ArrowRight size={20} />
        </button>
      </form>
      <div className="chips">
        {[
          ["tracks", "Треки", "Tracks"],
          ["playlists", "Плейлисты", "Playlists"],
          ["users", "Люди", "People"],
          ["lyrics", "По тексту", "By lyrics"],
        ].map((row) => (
          <button
            aria-pressed={kind === row[0]}
            key={row[0]}
            onClick={() => setKind(row[0])}
          >
            {t(row[1], row[2])}
          </button>
        ))}
      </div>
      {!query ? (
        <>
          <h2>{t("Под настроение", "Find your mood")}</h2>
          <div className="mood-grid">
            {[
              ["грустно", "sad", "☾"],
              ["весело", "happy", "☀"],
              ["в дороге", "road trip", "↗"],
              ["на тренировке", "workout", "ϟ"],
              ["спокойно", "calm", "≈"],
              ["для работы", "focus", "◎"],
            ].map((row) => (
              <button
                key={row[0]}
                onClick={() => {
                  const q = t(row[0], row[1]);
                  setText(q);
                  setQuery(q);
                  setKind("tracks");
                }}
              >
                <span>{row[2]}</span>
                {t(row[0], row[1])}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <Status error={result.error} loading={result.loading} />
          {kind === "users" ? (
            <UserList users={(result.value as User[]) || []} />
          ) : kind === "playlists" ? (
            <PlaylistCards lists={(result.value as Playlist[]) || []} />
          ) : (
            <TrackList tracks={(result.value as Track[]) || []} />
          )}{" "}
          {!result.loading && !result.error && !result.value?.length && (
            <Empty>
              {t(
                "Ничего не найдено. Попробуй другой запрос.",
                "No results. Try another search.",
              )}
            </Empty>
          )}
        </>
      )}
    </>
  );
}

export function Library() {
  const t = useText();
  const [tab, setTab] = useState("likes"),
    [filter, setFilter] = useState(""),
    [create, setCreate] = useState(false),
    [folder, setFolder] = useState<string | null>(null);
  const [smartEditor, setSmartEditor] = useState<string | null>(null);
  const [renameFolder, setRenameFolder] = useState(false);
  const likes = useApp((s) => s.likes),
    lists = useApp((s) => s.playlists),
    recent = useApp((s) => s.recent),
    cloud = useCloud((s) => s.cloud);
  const matches = (title: string) =>
    title.toLocaleLowerCase().includes(filter.toLocaleLowerCase());
  const selected = folder ? cloud.folders[folder] : null;
  return (
    <>
      <div className="page-heading">
        <h1>{t("Моя музыка", "Your library")}</h1>
        <button
          className="icon-button"
          aria-label={t("Добавить", "Add")}
          onClick={() =>
            tab === "smart" ? setSmartEditor("") : setCreate(true)
          }
        >
          <Plus />
        </button>
      </div>
      <input
        className="filter-input"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t("Найти в библиотеке", "Search your library")}
      />
      <div className="chips">
        {[
          ["likes", "Лайки", "Likes"],
          ["playlists", "Плейлисты", "Playlists"],
          ["albums", "Альбомы", "Albums"],
          ["history", "История", "History"],
          ["folders", "Папки", "Folders"],
          ["smart", "Умные подборки", "Smart playlists"],
        ].map((row) => (
          <button
            key={row[0]}
            aria-pressed={tab === row[0]}
            onClick={() => {
              setTab(row[0]);
              setFolder(null);
            }}
          >
            {t(row[1], row[2])}
          </button>
        ))}
      </div>
      {tab === "likes" || tab === "history" ? (
        <TrackList
          tracks={(tab === "likes" ? likes : recent).filter((v) =>
            matches(v.title + " " + artist(v)),
          )}
        />
      ) : tab === "folders" ? (
        <>
          {selected ? (
            <>
              <button className="text-button" onClick={() => setFolder(null)}>
                ← {t("Папки", "Folders")}
              </button>
              <h2>{selected.name}</h2>
              <div className="settings-actions">
                <button onClick={() => setRenameFolder(true)}>
                  {t("Переименовать", "Rename")}
                </button>
                <button
                  onClick={() =>
                    void run(() =>
                      change("folders", folder!, {
                        ...selected,
                        pinned: !selected.pinned,
                      }),
                    )
                  }
                >
                  {selected.pinned
                    ? t("Открепить", "Unpin")
                    : t("Закрепить", "Pin")}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      await change("folders", folder!, null);
                      setFolder(null);
                    })
                  }
                >
                  {t("Удалить папку", "Delete folder")}
                </button>
              </div>
              <PlaylistCards
                lists={lists.filter((v) => selected.playlistIds.includes(v.id))}
              />
            </>
          ) : (
            <div className="menu-list">
              {Object.entries(cloud.folders)
                .filter(([, value]) => value)
                .sort(
                  ([, a], [, b]) =>
                    Number(b.pinned) - Number(a.pinned) || a.order - b.order,
                )
                .map(([id, value]) => (
                  <button key={id} onClick={() => setFolder(id)}>
                    {value.name} <small>{value.playlistIds.length}</small>
                  </button>
                ))}
              <button onClick={() => setCreate(true)}>
                <Plus />
                {t("Добавить папку", "Add folder")}
              </button>
            </div>
          )}
        </>
      ) : tab === "smart" ? (
        <div className="menu-list">
          {Object.entries(cloud.smartPlaylists)
            .filter(([, rule]) => rule)
            .map(([id, rule]) => (
              <div className="smart-row" key={id}>
                <button
                  onClick={() =>
                    void run(async () => {
                      const cutoff = Date.now() / 1000;
                      const tracks = likes
                        .filter(
                          (track) =>
                            (!rule.genre ||
                              (track.genre || "")
                                .toLowerCase()
                                .includes(rule.genre.toLowerCase())) &&
                            (!rule.addedDays ||
                              (cloud.likedAt[String(track.id)] || 0) >=
                                cutoff - rule.addedDays * 86400) &&
                            (!rule.unplayedDays ||
                              !cloud.tracks.some(
                                (row) =>
                                  row.trackId === track.id &&
                                  row.lastPlayed >=
                                    cutoff - rule.unplayedDays * 86400,
                              )),
                        )
                        .slice(0, rule.limit);
                      await play(tracks);
                    })
                  }
                >
                  {rule.name}
                  <Play size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t(`Изменить ${rule.name}`, `Edit ${rule.name}`)}
                  onClick={() => setSmartEditor(id)}
                >
                  <Settings size={18} />
                </button>
              </div>
            ))}
          <button onClick={() => setSmartEditor("")}>
            <Plus />
            {t("Новая подборка", "New smart playlist")}
          </button>
        </div>
      ) : (
        <PlaylistCards
          lists={lists.filter(
            (v) =>
              (tab === "albums"
                ? v.is_album || v.playlist_type === "album"
                : !v.is_album && v.playlist_type !== "album") &&
              matches(v.title),
          )}
        />
      )}
      {smartEditor !== null && (
        <SmartEditor
          id={smartEditor}
          initial={cloud.smartPlaylists[smartEditor]}
          onClose={() => setSmartEditor(null)}
        />
      )}
      {renameFolder && selected && (
        <InputDialog
          title={t("Название папки", "Folder name")}
          initial={selected.name}
          onClose={() => setRenameFolder(false)}
          onSubmit={(name) => change("folders", folder!, { ...selected, name })}
        />
      )}
      {create && (
        <InputDialog
          title={
            tab === "folders"
              ? t("Новая папка", "New folder")
              : t("Новый плейлист", "New playlist")
          }
          onClose={() => setCreate(false)}
          onSubmit={async (title) => {
            if (tab === "folders") {
              await change("folders", crypto.randomUUID(), {
                name: title,
                playlistIds: [],
                pinned: false,
                order: Object.keys(cloud.folders).length,
              });
            } else {
              await api.createPlaylist(title);
              await refreshLibrary();
            }
          }}
        />
      )}
    </>
  );
}

export function PlaylistPage() {
  const t = useText();
  const selected = useApp((s) => s.detail) as Playlist;
  const data = useResource(
    () => api.playlist(selected.id),
    [selected.id],
    selected,
  );
  const list = data.value || selected;
  const tracks = list.tracks || [];
  const me = useApp((s) => s.me);
  const [edit, setEdit] = useState(false),
    [rename, setRename] = useState(false),
    [folderOpen, setFolderOpen] = useState(false);
  const folders = useCloud((s) => s.cloud.folders);
  const own = list.user?.id === me?.id;
  return (
    <>
      <div className="collection-hero">
        <RemoteImage
          src={list.artwork_url || tracks[0]?.artwork_url}
          className="large-cover"
          pixels={1080}
        />
        <small>
          {list.is_album ? t("Альбом", "Album") : t("Плейлист", "Playlist")}
        </small>
        <h1>{list.title}</h1>
        <p>
          {list.user?.username} · {list.track_count || tracks.length}{" "}
          {t("треков", "tracks")}
        </p>
        <div className="collection-actions">
          <button
            className="primary"
            disabled={!tracks.length}
            onClick={() => void run(() => play(tracks))}
          >
            <Play size={18} fill="currentColor" />
            {t("Слушать", "Play")}
          </button>
          <button
            className="icon-button"
            aria-label={t("Перемешать", "Shuffle")}
            onClick={() =>
              void run(async () => {
                await play(tracks);
                const { control } = await import("./player");
                await control("shuffle");
              })
            }
          >
            <Shuffle />
          </button>
          <button
            className="icon-button"
            aria-label={t("Поделиться", "Share")}
            onClick={() => void run(() => share(list, "playlist"))}
          >
            <Share2 />
          </button>
          <button
            className="icon-button"
            aria-label={t("Действия", "Actions")}
            onClick={() => setEdit(true)}
          >
            <Plus />
          </button>
        </div>
      </div>
      <Status error={data.error} loading={data.loading} />
      <TrackList
        tracks={tracks}
        removable={own}
        onRemove={(track) =>
          void run(async () => {
            await api.editPlaylist(
              list,
              tracks.filter((t) => t.id !== track.id).map((t) => t.id),
            );
            useApp.setState((s) => ({ revision: s.revision + 1 }));
          })
        }
      />
      {edit && (
        <Sheet title={list.title} onClose={() => setEdit(false)}>
          <div className="menu-list">
            <button
              onClick={() => void run(() => api.likePlaylist(list.id, true))}
            >
              <Heart />
              {t("Добавить в библиотеку", "Save to library")}
            </button>
            <button
              onClick={() => {
                setEdit(false);
                setFolderOpen(true);
              }}
            >
              <Plus />
              {t("Добавить в папку", "Add to folder")}
            </button>
            {own && (
              <>
                <button
                  onClick={() => {
                    setEdit(false);
                    setRename(true);
                  }}
                >
                  {t("Переименовать", "Rename")}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    void run(async () => {
                      await api.deletePlaylist(list.id);
                      await refreshLibrary();
                      go("library");
                    })
                  }
                >
                  {t("Удалить плейлист", "Delete playlist")}
                </button>
              </>
            )}
          </div>
        </Sheet>
      )}
      {rename && (
        <InputDialog
          title={t("Название плейлиста", "Playlist title")}
          initial={list.title}
          onClose={() => setRename(false)}
          onSubmit={async (title) => {
            await api.editPlaylist(
              list,
              tracks.map((t) => t.id),
              title,
            );
            useApp.setState((s) => ({ revision: s.revision + 1 }));
          }}
        />
      )}
      {folderOpen && (
        <Sheet
          title={t("Добавить в папку", "Add to folder")}
          onClose={() => setFolderOpen(false)}
        >
          <div className="menu-list">
            {Object.entries(folders)
              .filter(([, v]) => v)
              .map(([id, folder]) => (
                <button
                  key={id}
                  onClick={() =>
                    void run(async () => {
                      await change("folders", id, {
                        ...folder,
                        playlistIds: [
                          ...new Set([...folder.playlistIds, list.id]),
                        ],
                      });
                      setFolderOpen(false);
                    })
                  }
                >
                  {folder.name}
                </button>
              ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

export function UserList({ users }: { users: User[] }) {
  return (
    <div className="user-list">
      {users.map((user) => (
        <button key={user.id} onClick={() => go("artist", user)}>
          <RemoteImage src={user.avatar_url} className="avatar" />
          <strong>{user.username}</strong>
          <ArrowRight size={18} />
        </button>
      ))}
    </div>
  );
}
export function Following() {
  const t = useText(),
    data = useResource(() => api.following(), []);
  const [query, setQuery] = useState("");
  return (
    <>
      <h1>{t("Подписки", "Following")}</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("Найти человека", "Find a person")}
      />
      <Status error={data.error} loading={data.loading} />
      <UserList
        users={(data.value || []).filter((v) =>
          v.username.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
        )}
      />
    </>
  );
}
export function ArtistPage() {
  const t = useText();
  const user = useApp((s) => s.detail) as User;
  const profile = useResource(() => api.user(user.id), [user.id], user),
    data = useResource(() => api.userTracks(user.id), [user.id], []);
  const lists = useResource(() => api.userPlaylists(user.id), [user.id], []);
  const following = useResource(() => api.following(), []);
  const followed =
    following.value?.some((person) => person.id === user.id) === true;
  const [followBusy, setFollowBusy] = useState(false);
  return (
    <>
      <div className="collection-hero">
        <RemoteImage
          src={profile.value?.avatar_url}
          className="profile-cover"
        />
        <h1>{profile.value?.username}</h1>
        <p>{profile.value?.description}</p>
        <button
          className="primary"
          disabled={followBusy || following.loading}
          aria-pressed={followed}
          onClick={() => {
            setFollowBusy(true);
            void run(async () => {
              await api.follow(user.id, !followed);
              useApp.setState((state) => ({ revision: state.revision + 1 }));
            }).finally(() => setFollowBusy(false));
          }}
        >
          <Plus size={18} />
          {followed ? t("Отписаться", "Unfollow") : t("Подписаться", "Follow")}
        </button>
      </div>
      <Status error={data.error} loading={data.loading} />
      <TrackList tracks={data.value || []} />
      <PlaylistCards lists={lists.value || []} />
    </>
  );
}
export function Profile() {
  const t = useText();
  const me = useApp((s) => s.me);
  const items = [
    ["following", Users, "Подписки", "Following"],
    ["dislikes", ThumbsDown, "Дизлайки", "Dislikes"],
    ["statistics", BarChart3, "Моя статистика", "My statistics"],
    ["leaderboard", Trophy, "Лидерборд", "Leaderboard"],
    ["offline", Download, "Офлайн", "Offline"],
    ["imports", Music2, "Импорт музыки", "Import music"],
    ["settings", Settings, "Настройки", "Settings"],
  ] as const;
  return (
    <>
      <div className="profile-hero">
        <RemoteImage src={me?.avatar_url} className="profile-cover" pixels={500} />
        <p className="eyebrow">YOUR VEIRUNE</p>
        <h1>{me?.username}</h1>
      </div>
      <div className="menu-list profile-menu">
        {items.map(([page, Icon, ru, en]) => (
          <button key={page} onClick={() => go(page)}>
            <Icon />
            {t(ru, en)}
            <ArrowRight size={18} />
          </button>
        ))}
        <button className="danger" onClick={() => void run(signOut)}>
          <LogOut />
          {t("Выйти", "Sign out")}
        </button>
      </div>
    </>
  );
}
export function Dislikes() {
  const t = useText();
  const values = useCloud((s) => s.cloud.trackFeedback);
  const tracks = Object.values(values)
    .filter((v) => v.disliked)
    .map((v) => ({
      id: v.track.id,
      title: v.track.title,
      duration: v.track.durationMs,
      artwork_url: v.track.artworkUrl,
      permalink_url: v.track.permalinkUrl,
      metadata_artist: v.track.artist,
      genre: v.track.genre,
    }));
  return (
    <>
      <h1>{t("Дизлайки", "Dislikes")}</h1>
      <p className="muted">
        {t(
          "Эти треки исключены из рекомендаций.",
          "These tracks are excluded from recommendations.",
        )}
      </p>
      {tracks.length ? (
        <TrackList tracks={tracks} />
      ) : (
        <Empty>{t("Здесь пока пусто", "Nothing here yet")}</Empty>
      )}
    </>
  );
}
