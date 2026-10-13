import type { Track } from "./types";

export type StationKind = "track" | "collection" | "artist";
export type Station = { kind: StationKind; seeds: Track[]; session: string };
export function stationSeeds(
  tracks: Track[],
  variation = Math.random(),
): Track[] {
  const seen = new Set<number>();
  const eligible = tracks.filter(
    (track) =>
      track.id > 0 &&
      track.access !== "blocked" &&
      track.access !== "preview" &&
      track.policy !== "BLOCK" &&
      track.policy !== "SNIP" &&
      !seen.has(track.id) &&
      !!seen.add(track.id),
  );
  if (!eligible.length) return [];
  const count = Math.min(16, eligible.length);
  const offset = Math.floor(
    Math.max(0, Math.min(0.999999, variation)) * eligible.length,
  );
  return Array.from(
    { length: count },
    (_, index) =>
      eligible[
        (offset + Math.floor((index * eligible.length) / count)) %
          eligible.length
      ],
  );
}
export function stationOpening(seeds: Track[], kind: StationKind): Track[] {
  // Play immediately; native playback fetches related tracks in the background.
  // Multiple collection seeds survive even when the app's web view is suspended.
  return seeds.slice(0, 1);
}
