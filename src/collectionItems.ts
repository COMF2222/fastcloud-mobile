import type { Track, Playlist, User } from "./types";
export function collectionItems<T extends Track | Playlist | User>(
  rows: unknown[],
  kind: "tracks" | "playlists" | "users" | "comments",
): T[] {
  const singular = {
    tracks: "track",
    playlists: "playlist",
    users: "user",
    comments: "comment",
  }[kind];
  const seen = new Set<number>();
  return rows.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const wrapper = raw as Record<string, unknown>;
    const item = (wrapper[singular] || wrapper.origin || raw) as Record<
      string,
      unknown
    >;
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isSafeInteger(item.id) ||
      Number(item.id) <= 0 ||
      seen.has(Number(item.id))
    )
      return [];
    if (
      typeof item.urn === "string" &&
      !item.urn.startsWith(`soundcloud:${kind}:`)
    )
      return [];
    if (
      kind === "users"
        ? typeof item.username !== "string"
        : kind === "comments"
          ? typeof item.body !== "string"
          : typeof item.title !== "string"
    )
      return [];
    seen.add(Number(item.id));
    return [item as T];
  });
}
