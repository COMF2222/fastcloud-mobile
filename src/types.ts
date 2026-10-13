export type Track = {
  id: number;
  urn?: string;
  title: string;
  duration?: number | null;
  full_duration_ms?: number | null;
  artwork_url?: string | null;
  artwork?: { "500x500"?: string | null };
  user?: { id: number; username: string; avatar_url?: string | null } | null;
  metadata_artist?: string | null;
  publisher_metadata?: {
    artist?: string | null;
    album_title?: string | null;
    isrc?: string | null;
  } | null;
  genre?: string | null;
  tag_list?: string | null;
  playback_count?: number | null;
  permalink_url?: string | null;
  access?: string | null;
  policy?: string | null;
  created_at?: string | null;
};
export type Playlist = {
  id: number;
  title: string;
  user?: Track["user"];
  artwork_url?: string | null;
  track_count?: number | null;
  tracks?: Track[];
  permalink_url?: string | null;
  is_album?: boolean;
  playlist_type?: string | null;
  genre?: string | null;
  tag_list?: string | null;
};
export type User = {
  id: number;
  username: string;
  avatar_url?: string | null;
  description?: string | null;
  permalink_url?: string | null;
  followers_count?: number;
  followings_count?: number;
};
export type Feedback = {
  disliked: boolean;
  updatedAt: number;
  device: string;
  track: {
    id: number;
    title: string;
    artist: string;
    durationMs: number;
    genre: string;
    artworkUrl: string | null;
    permalinkUrl: string | null;
    isrc: string | null;
  };
};
export type Listen = {
  day: string;
  trackId: number;
  title: string;
  artist: string;
  genre: string;
  ms: number;
  plays: number;
  lastPlayed: number;
};
export type Preferences = Record<string, unknown> & {
  language?: "Russian" | "English";
  theme?: "Dark" | "Light" | "System";
  wave_mode?: "Balanced" | "Familiar" | "Discover" | "Mood" | "NoRepeats";
  wave_mood?: "Calm" | "Sad" | "Happy" | "Workout" | "Road";
  autoplay?: boolean;
  leaderboard_anonymous?: boolean;
  music_taste?: {
    discovery: number;
    diversity: number;
    repeat_days: number;
    genres: string[];
  };
};
export type Cloud = {
  preferences: Preferences;
  folders: Record<
    string,
    { name: string; playlistIds: number[]; pinned: boolean; order: number }
  >;
  smartPlaylists: Record<
    string,
    {
      name: string;
      genre: string;
      addedDays: number;
      unplayedDays: number;
      limit: number;
    }
  >;
  likedAt: Record<string, number>;
  trackFeedback: Record<string, Feedback>;
  daily: { day: string; ms: number; plays: number }[];
  tracks: Listen[];
  totals: { ms: number; plays: number };
};
export const emptyCloud = (): Cloud => ({
  preferences: {},
  folders: {},
  smartPlaylists: {},
  likedAt: {},
  trackFeedback: {},
  daily: [],
  tracks: [],
  totals: { ms: 0, plays: 0 },
});
export type PlayerState = {
  radioLoading?: boolean;
  radioError?: boolean;
  queue: Track[];
  index: number;
  playing: boolean;
  loading: boolean;
  positionMs: number;
  durationMs: number;
  shuffle: boolean;
  repeat: number;
  speed: number;
  error?: string | null;
  sleepRemainingMs?: number;
  offline?: boolean;
};
export type LyricsRecord = {
  id: number;
  trackName: string;
  artistName: string;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  instrumental: boolean;
  source?: string;
  sourceUrl?: string | null;
};
export const artist = (track: Track) =>
  (
    [
      track.publisher_metadata?.artist,
      track.metadata_artist,
      track.user?.username,
    ].find(
      (value) =>
        typeof value === "string" &&
        value.trim() &&
        !/^(null|undefined)$/i.test(value.trim()),
    ) || "—"
  )
    .replace(/^[\p{S}\s]+|[\p{S}\s]+$/gu, "")
    .trim() || "—";
export const creditedArtists = (track: Track) =>
  artist(track)
    .split(/\s*(?:,|\bfeat\.?|\bft\.?|&|\bx\b)\s*/i)
    .filter(Boolean);
export const urn = (kind: "tracks" | "users" | "playlists", id: number) =>
  encodeURIComponent(`soundcloud:${kind}:${id}`);
export const identity = (raw: unknown): number => {
  const data = raw as { id?: number; urn?: string };
  const id = Number(data?.id || data?.urn?.split(":").slice(-1)[0]);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw Error("Invalid SoundCloud identity");
  return id;
};
export function normalize<T>(raw: unknown): T {
  if (Array.isArray(raw)) return raw.map(normalize) as T;
  if (raw && typeof raw === "object") {
    const out = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, normalize(v)]),
    );
    if (
      typeof out.urn === "string" &&
      out.urn.startsWith("soundcloud:") &&
      !out.id
    )
      out.id = identity(out);
    return out as T;
  }
  return raw as T;
}
