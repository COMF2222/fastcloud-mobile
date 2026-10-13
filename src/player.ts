import { create } from "zustand";
import { native, nativePlatform, preview } from "./native";
import { api, collection } from "./client";
import { shuffled } from "./contracts";
import { blocked, useCloud } from "./cloud";
import { artist, type PlayerState, type Track } from "./types";
import { searchRecommendations } from "./searchRecommendations";
import {
  stationSeeds,
  stationOpening,
  type Station,
  type StationKind,
} from "./station";
const initial: PlayerState = {
  queue: [],
  index: 0,
  playing: false,
  loading: false,
  positionMs: 0,
  durationMs: 0,
  shuffle: false,
  repeat: 0,
  speed: 1,
};
export const usePlayer = create<{ state: PlayerState; expanded: boolean }>(
  () => ({ state: initial, expanded: false }),
);
let pending = false;
export async function refreshPlayer() {
  if (pending || !nativePlatform) return;
  pending = true;
  try {
    usePlayer.setState({ state: await native.player() });
  } finally {
    pending = false;
  }
}
export async function play(
  tracks: Track[],
  index = 0,
  recommended = false,
  station?: Station,
) {
  const selected = tracks[index];
  const allowed = recommended ? tracks.filter((t) => !blocked(t)) : tracks;
  if (!allowed.length) throw Error("Нет подходящих треков");
  index = Math.max(
    0,
    allowed.findIndex((t) => t.id === selected?.id),
  );
  if (preview) {
    usePlayer.setState({
      state: {
        ...initial,
        queue: allowed,
        index,
        playing: true,
        durationMs: allowed[index].duration || 0,
      },
    });
    return;
  }
  await native.play({ tracks: allowed, index, recommended, station });
  await refreshPlayer();
}
export async function startStation(tracks: Track[], kind: StationKind) {
  const seeds = stationSeeds(
    tracks.filter((track) => !blocked(track)),
    kind === "track" ? 0 : Math.random(),
  );
  if (!seeds.length)
    throw Error("Нет доступных треков для волны / No playable radio seeds");
  await play(stationOpening(seeds, kind), 0, true, {
    kind,
    seeds,
    session: crypto.randomUUID(),
  });
}
export async function control(
  action: string,
  value?: number,
  index?: number,
  target?: number,
) {
  if (preview) {
    const s = { ...usePlayer.getState().state };
    if (action === "toggle") s.playing = !s.playing;
    if (action === "next") s.index = Math.min(s.index + 1, s.queue.length - 1);
    if (action === "previous" || action === "previous_track")
      s.index = Math.max(0, s.index - 1);
    if (action === "jump") s.index = index || 0;
    if (action === "seek") s.positionMs = value || 0;
    if (action === "shuffle") s.shuffle = !s.shuffle;
    if (action === "repeat") s.repeat = (s.repeat + 1) % 3;
    usePlayer.setState({ state: s });
    return;
  }
  await native.control({ action, value, index, target });
  await refreshPlayer();
}
export async function enqueue(track: Track, next = false) {
  const state = usePlayer.getState().state;
  if (!state.queue.length) return play([track]);
  if (preview) {
    const queue = [...state.queue];
    queue.splice(next ? state.index + 1 : queue.length, 0, track);
    usePlayer.setState({ state: { ...state, queue } });
    return;
  }
  await native.enqueue({ track, next });
  await refreshPlayer();
}
export async function myWave(
  likes: Track[],
  recent: Track[],
): Promise<Track[]> {
  const cloud = useCloud.getState().cloud;
  const mode = cloud.preferences.wave_mode || "Balanced";
  const taste = cloud.tracks
    .filter((t) => t.ms > 30000)
    .sort((a, b) => b.lastPlayed - a.lastPlayed);
  const recentIds = new Set(taste.slice(0, 100).map((t) => t.trackId));
  const known = new Set([...recent, ...likes].map((t) => t.id));
  const missing = taste
    .slice(0, 15)
    .filter((t) => !known.has(t.trackId))
    .map((t) => `soundcloud:tracks:${t.trackId}`);
  let recentCloud: Track[] = [];
  if (missing.length) {
    try {
      recentCloud = await collection<Track>(
        `/tracks?urns=${encodeURIComponent(missing.join(","))}&limit=50`,
        50,
      );
    } catch {}
  }
  recent = [
    ...new Map([...recentCloud, ...recent].map((t) => [t.id, t])).values(),
  ];
  const seeds = [...recent.slice(0, 15), ...likes.slice(0, 50)].filter(
    (t) => !blocked(t),
  );
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [seeds[i], seeds[j]] = [seeds[j], seeds[i]];
  }
  const results = await Promise.allSettled(
    seeds.slice(0, 4).map((t) => api.related(t.id)),
  );
  let pool = [
    ...new Map(
      [
        ...seeds,
        ...results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      ]
        .filter((t) => !blocked(t))
        .map((t) => [t.id, t]),
    ).values(),
  ];
  if (mode === "Discover")
    pool = pool.filter(
      (t) => !likes.some((l) => l.id === t.id) && !recentIds.has(t.id),
    );
  if (mode === "NoRepeats") {
    const cutoff = Date.now() / 1000 - 7 * 86400;
    pool = pool.filter(
      (t) =>
        !cloud.tracks.some((r) => r.trackId === t.id && r.lastPlayed >= cutoff),
    );
  }
  if (mode === "Mood") {
    const mood = cloud.preferences.wave_mood || "Calm";
    const queries = {
      Calm: "chill ambient",
      Sad: "sad melancholic",
      Happy: "happy feel good",
      Workout: "workout energetic",
      Road: "road trip",
    };
    const found = await api.search(queries[mood]);
    pool = [
      ...new Map(
        [...(found as Track[]), ...pool]
          .filter((t) => !blocked(t))
          .map((t) => [t.id, t]),
      ).values(),
    ];
  }
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const ranked = searchRecommendations(
    mode === "Familiar" ? likes : [...recent, ...likes.slice(0, 25)],
    pool,
    recent,
    seed,
    60,
  );
  const seen = new Map<string, number>();
  const ordered = shuffled(
    mode === "Familiar"
      ? pool.filter((t) => likes.some((l) => l.id === t.id))
      : ranked,
  );
  const result: Track[] = [];
  while (ordered.length && result.length < 40) {
    const index = ordered.findIndex(
      (t) =>
        (seen.get(artist(t)) || 0) < 2 &&
        artist(t) !== artist(result[result.length - 1] || { id: 0, title: "" }),
    );
    const chosen = ordered.splice(index < 0 ? 0 : index, 1)[0];
    result.push(chosen);
    seen.set(artist(chosen), (seen.get(artist(chosen)) || 0) + 1);
  }
  if (!result.length)
    throw Error("Пока нет подходящих треков. Попробуй другой режим.");
  return result;
}
