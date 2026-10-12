import {
  emptyCloud,
  artist,
  type Cloud,
  type Feedback,
  type Track,
} from "./types.ts";
export type Section =
  "preferences" | "folders" | "smartPlaylists" | "likedAt" | "trackFeedback";
export type Dirty = Partial<Record<Section, Record<string, unknown>>>;
export function patchBatch(dirty: Dirty): Dirty {
  return Object.fromEntries(
    Object.entries(dirty).map(([section, values]) => [
      section,
      Object.fromEntries(Object.entries(values).slice(0, 100)),
    ]),
  ) as Dirty;
}
export function newer(a: Feedback, b: Feedback) {
  return (
    a.updatedAt > b.updatedAt ||
    (a.updatedAt === b.updatedAt && a.device > b.device)
  );
}
export function mergeCloud(remote: Cloud, local: Cloud, pending: Dirty): Cloud {
  const cloud = {
    ...emptyCloud(),
    ...remote,
    preferences: { ...remote.preferences },
    folders: { ...remote.folders },
    smartPlaylists: { ...remote.smartPlaylists },
    likedAt: { ...remote.likedAt },
    trackFeedback: { ...remote.trackFeedback },
  };
  for (const [id, value] of Object.entries(local.trackFeedback))
    if (!cloud.trackFeedback[id] || newer(value, cloud.trackFeedback[id]))
      cloud.trackFeedback[id] = value;
  for (const [section, patch] of Object.entries(pending))
    for (const [key, value] of Object.entries(patch)) {
      if (
        section === "trackFeedback" &&
        cloud.trackFeedback[key] &&
        newer(cloud.trackFeedback[key], value as Feedback)
      )
        continue;
      (cloud[section as Section] as Record<string, unknown>)[key] = value;
    }
  for (const section of ["folders", "smartPlaylists"] as const)
    for (const [key, value] of Object.entries(cloud[section]))
      if (value === null) delete cloud[section][key];
  return cloud;
}
export function blocked(track: Track, cloud: Cloud) {
  const normal = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\p{P}\p{S}\s]+/gu, "");
  return Object.values(cloud.trackFeedback).some(
    (v) =>
      v.disliked &&
      (v.track.id === track.id ||
        (v.track.isrc && v.track.isrc === track.publisher_metadata?.isrc) ||
        (normal(v.track.artist) === normal(artist(track)) &&
          normal(v.track.title) === normal(track.title) &&
          Math.abs(v.track.durationMs - (track.duration || 0)) < 10000)),
  );
}
export function acknowledge(dirty: Dirty, sent: Dirty): Dirty {
  const remaining = structuredClone(dirty);
  for (const [section, patch] of Object.entries(sent))
    for (const [key, value] of Object.entries(patch))
      if (
        JSON.stringify(remaining[section as Section]?.[key]) ===
        JSON.stringify(value)
      )
        delete remaining[section as Section]![key];
  return remaining;
}
export function shuffled<T>(
  items: readonly T[],
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export type ImportItem = { title: string; artist: string; durationMs?: number };
export const compare = (s: string) =>
  s
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
function versions(s: string) {
  return [
    ...s
      .toLowerCase()
      .matchAll(/remix|cover|live|sped|slowed|nightcore|ремикс|кавер/gu),
  ]
    .map((v) => v[0])
    .sort()
    .join(",");
}
export function importScore(item: ImportItem, track: Track) {
  if (
    track.access !== "playable" ||
    ["SNIP", "BLOCK"].includes(track.policy || "")
  )
    return 0;
  if (versions(item.title) !== versions(track.title)) return 0;
  if (
    item.durationMs &&
    track.duration &&
    Math.abs(item.durationMs - track.duration) > 8000
  )
    return 0;
  const title = compare(item.title),
    performer = compare(item.artist),
    found = compare(
      track.title.replace(/\((?:prod|official|audio|video)[^)]*\)/gi, ""),
    ),
    credit = compare(artist(track));
  const full =
    found === title ||
    found === performer + title ||
    found === title + performer;
  if (!full) return 0;
  return credit === performer ||
    found === performer + title ||
    found === title + performer
    ? 100
    : 0;
}
