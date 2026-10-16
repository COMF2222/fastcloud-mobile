import { artist, type Playlist, type Track } from "./types.ts";

export type ArtistSection =
  | "tracks"
  | "popular"
  | "albums"
  | "playlists"
  | "likes"
  | "reposts"
  | "following"
  | "dislikes";
export function popularTracks(tracks: Track[]) {
  return [...tracks].sort(
    (a, b) => (b.playback_count || 0) - (a.playback_count || 0),
  );
}
const releases = new Set(["album", "ep", "single", "compilation"]);
export function isRelease(list: Playlist) {
  return (
    list.is_album === true ||
    [list.playlist_type, list.set_type].some(
      (value) =>
        typeof value === "string" && releases.has(value.trim().toLowerCase()),
    )
  );
}
export function artistCollections(lists: Playlist[]) {
  const unique = [...new Map(lists.map((list) => [list.id, list])).values()];
  return {
    albums: unique.filter(isRelease),
    playlists: unique.filter((list) => !isRelease(list)),
  };
}
export function filterArtistItems<T extends Track | Playlist>(
  items: T[],
  query: string,
): T[] {
  const words = query
    .toLocaleLowerCase()
    .replaceAll("ё", "е")
    .trim()
    .split(/\s+/);
  return items.filter((item) =>
    words.every((word) =>
      [item.title, artist(item), item.genre || ""]
        .join(" ")
        .toLocaleLowerCase()
        .replaceAll("ё", "е")
        .includes(word),
    ),
  );
}
