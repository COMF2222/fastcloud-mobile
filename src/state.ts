import { create } from "zustand";
import { Preferences as Storage } from "@capacitor/preferences";
import { native, nativePlatform, preview, server } from "./native";
import { api, setRequestAccount } from "./client";
import { activateCloud, resetCloud, syncCloud } from "./cloud";
import type { Track, Playlist, User } from "./types";
import { pushPage, popPage, type NavigationEntry } from "./navigation";
export type Page =
  | "home"
  | "search"
  | "library"
  | "messages"
  | "profile"
  | "settings"
  | "statistics"
  | "leaderboard"
  | "offline"
  | "dislikes"
  | "following"
  | "playlist"
  | "artist"
  | "track"
  | "queue"
  | "imports";
export const useApp = create<{
  page: Page;
  detail: Track | Playlist | User | null;
  navigation: NavigationEntry<Page, Track | Playlist | User | null>[];
  searchQuery: string;
  libraryTab: string;
  me: User | null;
  connecting: boolean;
  likes: Track[];
  recent: Track[];
  playlists: Playlist[];
  toast: string;
  revision: number;
  shareRequest: { item: Track | Playlist; kind: "track" | "playlist" } | null;
}>(() => ({
  page: "home",
  detail: null,
  navigation: [],
  searchQuery: "",
  libraryTab: "likes",
  me: null,
  connecting: true,
  likes: [],
  recent: [],
  playlists: [],
  toast: "",
  revision: 0,
  shareRequest: null,
}));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const notify = (message: string) => {
  useApp.setState({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => useApp.setState({ toast: "" }), 4500);
};
export async function run(task: () => Promise<unknown>) {
  try {
    await task();
  } catch (cause) {
    notify(cause instanceof Error ? cause.message : String(cause));
  }
}
export const go = (
  page: Page,
  detail: Track | Playlist | User | null = null,
  reset = false,
) =>
  useApp.setState((state) => ({
    page,
    detail,
    navigation: pushPage(
      state.navigation,
      { page: state.page, detail: state.detail },
      { page, detail },
      reset,
    ),
  }));
export const back = () =>
  useApp.setState((state) => {
    const previous = popPage(state.navigation, {
      page: "home" as Page,
      detail: null,
    });
    return { ...previous.entry, navigation: previous.history };
  });
let libraryFlight: { owner: number; promise: Promise<void> } | null = null;
export function refreshLibrary(): Promise<void> {
  const state = useApp.getState();
  if (!state.me) return Promise.resolve();
  const id = state.me.id;
  if (libraryFlight?.owner === id) return libraryFlight.promise;
  const promise = loadLibrary(id).finally(() => {
    if (libraryFlight?.promise === promise) libraryFlight = null;
  });
  libraryFlight = { owner: id, promise };
  return promise;
}
async function loadLibrary(id: number) {
  const before = useApp.getState();
  let own = before.playlists.filter((list) => list.user?.id === id);
  let saved = before.playlists.filter((list) => list.user?.id !== id);
  const apply = (patch: Partial<ReturnType<typeof useApp.getState>>) => {
    if (useApp.getState().me?.id === id) useApp.setState(patch);
  };
  const mergeLists = () =>
    apply({
      playlists: [
        ...new Map([...own, ...saved].map((list) => [list.id, list])).values(),
      ],
    });
  const results = await Promise.allSettled([
    api.likes().then((likes) => apply({ likes })),
    api.history().then((recent) => apply({ recent })),
    api.playlists().then((lists) => {
      own = lists;
      mergeLists();
    }),
    api.likedPlaylists().then((lists) => {
      saved = lists;
      mergeLists();
    }),
  ]);
  if (useApp.getState().me?.id !== id) return;
  if (results.every((result) => result.status === "rejected"))
    notify("Не удалось обновить музыку / Could not refresh music");
  const current = useApp.getState();
  await Storage.set({
    key: `library-${id}`,
    value: JSON.stringify({
      likes: current.likes,
      recent: current.recent,
      playlists: current.playlists,
    }),
  });
}

let booting: Promise<void> | null = null;
export function boot(): Promise<void> {
  if (booting) return booting;
  booting = bootAccount().finally(() => {
    booting = null;
  });
  return booting;
}
async function bootAccount() {
  useApp.setState({ connecting: true });
  try {
    if (nativePlatform) await native.configure({ server });
    const session = preview
      ? { signedIn: true, accountId: 1 }
      : nativePlatform
        ? await native.session()
        : { signedIn: false };
    if (!session.signedIn) return;
    setRequestAccount(session.accountId || 0);
    let me: User = { id: session.accountId!, username: "Veirune" };
    const saved = await Storage.get({ key: `profile-${session.accountId}` });
    if (saved.value)
      try {
        const cached = JSON.parse(saved.value);
        if (cached.id === session.accountId) me = cached;
      } catch {}
    useApp.setState({ me });
    void api
      .me()
      .then(async (profile) => {
        if (
          useApp.getState().me?.id !== session.accountId ||
          profile.id !== session.accountId
        )
          return;
        useApp.setState({ me: profile });
        await Storage.set({
          key: `profile-${profile.id}`,
          value: JSON.stringify(profile),
        });
      })
      .catch(() => {});
    void api.chat("activate", "POST", {}).catch(() => {});
    const library = await Storage.get({ key: `library-${me.id}` });
    if (library.value)
      try {
        const cached = JSON.parse(library.value);
        useApp.setState({
          likes: cached.likes || [],
          recent: cached.recent || [],
          playlists: cached.playlists || [],
        });
      } catch {}
    await activateCloud(me.id);
    await refreshLibrary();
  } catch (cause) {
    notify(String(cause));
  } finally {
    useApp.setState({ connecting: false });
  }
}
export async function signIn() {
  useApp.setState({ connecting: true });
  try {
    await native.login();
    await boot();
  } catch (cause) {
    notify(String(cause));
    useApp.setState({ connecting: false });
  }
}
export async function signOut() {
  await syncCloud();
  await native.logout();
  setRequestAccount(0);
  resetCloud();
  useApp.setState({
    me: null,
    likes: [],
    playlists: [],
    recent: [],
    page: "home",
    detail: null,
    navigation: [],
    searchQuery: "",
    libraryTab: "likes",
    shareRequest: null,
  });
}
export async function toggleLike(track: Track) {
  const liked = useApp.getState().likes.some((t) => t.id === track.id);
  await api.like(track.id, !liked);
  useApp.setState((s) => ({
    likes: liked
      ? s.likes.filter((t) => t.id !== track.id)
      : [track, ...s.likes],
  }));
  if (!liked) {
    const { change, dislike } = await import("./cloud");
    await change("likedAt", String(track.id), Math.floor(Date.now() / 1000));
    await dislike(track, false);
  }
}
