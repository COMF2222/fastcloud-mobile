import { create } from "zustand";
import { Preferences as Storage } from "@capacitor/preferences";
import { native, nativePlatform, preview, server } from "./native";
import { api } from "./client";
import { activateCloud, resetCloud, syncCloud } from "./cloud";
import type { Track, Playlist, User } from "./types";
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
  | "queue"
  | "imports";
export const useApp = create<{
  page: Page;
  detail: Track | Playlist | User | null;
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
export const go = (page: Page, detail: Track | Playlist | User | null = null) =>
  useApp.setState({ page, detail });
export async function refreshLibrary() {
  const state = useApp.getState();
  if (!state.me) return;
  const id = state.me.id;
  const results = await Promise.allSettled([
    api.likes(),
    api.history(),
    api.playlists(),
    api.likedPlaylists(),
  ]);
  if (useApp.getState().me?.id !== id) return;
  const [likes, recent, own, saved] = results;
  const patch: Partial<ReturnType<typeof useApp.getState>> = {
    revision: state.revision + 1,
  };
  if (likes.status === "fulfilled") patch.likes = likes.value;
  if (recent.status === "fulfilled") patch.recent = recent.value;
  if (own.status === "fulfilled" || saved.status === "fulfilled")
    patch.playlists = [
      ...new Map(
        [
          ...(own.status === "fulfilled" ? own.value : []),
          ...(saved.status === "fulfilled" ? saved.value : []),
        ].map((v) => [v.id, v]),
      ).values(),
    ];
  useApp.setState(patch);
  await Storage.set({
    key: `library-${id}`,
    value: JSON.stringify({
      likes: patch.likes || state.likes,
      recent: patch.recent || state.recent,
      playlists: patch.playlists || state.playlists,
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
    let me: User | null = null;
    const saved = await Storage.get({ key: `profile-${session.accountId}` });
    if (saved.value)
      try {
        me = JSON.parse(saved.value);
      } catch {}
    try {
      me = await api.me();
      await Storage.set({ key: `profile-${me.id}`, value: JSON.stringify(me) });
    } catch {
      if (!me) me = { id: session.accountId!, username: "Veirune" };
    }
    useApp.setState({ me });
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
    void api.chat("activate", "POST", {}).catch(() => {});
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
  resetCloud();
  useApp.setState({
    me: null,
    likes: [],
    playlists: [],
    recent: [],
    page: "home",
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
