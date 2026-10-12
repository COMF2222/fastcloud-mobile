import Papa from "papaparse";
import { unzipSync, strFromU8 } from "fflate";
import { Preferences } from "@capacitor/preferences";
import { api, request } from "./client";
import { artist, type Track } from "./types";
import { compare, importScore, type ImportItem } from "./contracts";
export type { ImportItem } from "./contracts";
export { compare, importScore } from "./contracts";
export type Journal = {
  id: string;
  owner: number;
  title: string;
  items: ImportItem[];
  at: number;
  matched: Track[];
  missing: ImportItem[];
  playlists: number[];
  written: number;
  pending: { title: string; ids: number[] } | null;
  state: "matching" | "paused" | "writing" | "done";
};
const field = (row: Record<string, unknown>, ...names: string[]) =>
  String(
    names.map((n) => row[n]).find((v) => v !== undefined && v !== null) || "",
  ).trim();
export function parseItems(text: string, name: string): ImportItem[] {
  if (name.toLowerCase().endsWith(".csv")) {
    const rows = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
    }).data;
    return rows
      .map((row) => ({
        title: field(
          row,
          "Track Name",
          "trackName",
          "track_name",
          "Title",
          "Название",
          "title",
        ),
        artist: field(
          row,
          "Artist Name(s)",
          "Artist Name",
          "artistName",
          "artist_name",
          "Artist",
          "Исполнитель",
          "artist",
        ),
        durationMs:
          Number(
            field(row, "Track Duration (ms)", "duration_ms", "durationMs"),
          ) || undefined,
      }))
      .filter((v) => v.title && v.artist);
  }
  const value = JSON.parse(text);
  const rows = Array.isArray(value)
    ? value
    : value.tracks ||
      value.items ||
      value.likedTracks ||
      value.playlists?.flatMap((p: { items: unknown[] }) => p.items) ||
      [];
  return rows
    .map((raw: Record<string, unknown>) => {
      const row = (raw.track || raw) as Record<string, unknown>;
      const artists = Array.isArray(row.artists)
        ? row.artists
            .map((a) =>
              typeof a === "string" ? a : (a as { name: string }).name,
            )
            .join(", ")
        : field(row, "artist", "artistName", "artist_name");
      return {
        title: field(row, "trackName", "track_name", "name", "title"),
        artist: artists,
        durationMs: Number(row.durationMs || row.duration_ms) || undefined,
      };
    })
    .filter((v: ImportItem) => v.title && v.artist);
}
export async function parseFiles(files: File[]): Promise<ImportItem[]> {
  const items: ImportItem[] = [];
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) throw Error("Файл слишком большой");
    if (file.name.endsWith(".zip")) {
      let declaredSize = 0;
      const archives = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: (entry) => {
          if (!/\.(csv|json)$/i.test(entry.name)) return false;
          declaredSize += entry.originalSize;
          if (
            entry.originalSize > 25 * 1024 * 1024 ||
            declaredSize > 50 * 1024 * 1024
          )
            throw Error("Archive is too large");
          return true;
        },
      });
      let size = 0;
      for (const [name, bytes] of Object.entries(archives)) {
        size += bytes.length;
        if (size > 50 * 1024 * 1024) throw Error("Архив слишком большой");
        try {
          items.push(...parseItems(strFromU8(bytes), name));
        } catch {
          /* Skip non-music JSON in a Spotify export. */
        }
      }
    } else items.push(...parseItems(await file.text(), file.name));
  }
  if (items.length > 10000)
    throw Error("Импорт поддерживает до 10 000 треков за раз");
  return [
    ...new Map(
      items.map((v) => [compare(v.artist) + "/" + compare(v.title), v]),
    ).values(),
  ];
}
export async function yandexItems(token: string): Promise<ImportItem[]> {
  const likes = await request<{
    library: { tracks: { id: string | number }[] };
  }>("/v1/mobile/yandex", "POST", { action: "likes", token });
  const ids = likes.library.tracks.map((row) => String(row.id));
  const result: ImportItem[] = [];
  for (let at = 0; at < ids.length; at += 100) {
    const tracks = await request<
      ({
        title: string;
        artists: { name: string }[];
        durationMs?: number;
      } | null)[]
    >("/v1/mobile/yandex", "POST", {
      action: "tracks",
      token,
      ids: ids.slice(at, at + 100),
    });
    for (const track of tracks)
      if (track)
        result.push({
          title: track.title,
          artist: track.artists.map((a) => a.name).join(", "),
          durationMs: track.durationMs,
        });
  }
  return result;
}
const key = (owner: number) => `import-${owner}`;
export async function loadJournal(owner: number): Promise<Journal | null> {
  const value = await Preferences.get({ key: key(owner) });
  return value.value ? JSON.parse(value.value) : null;
}
export const saveJournal = (journal: Journal) =>
  Preferences.set({ key: key(journal.owner), value: JSON.stringify(journal) });
export async function startJournal(
  owner: number,
  title: string,
  items: ImportItem[],
): Promise<Journal> {
  if (!items.length) throw Error("В файле нет треков");
  const journal: Journal = {
    id: crypto.randomUUID().slice(0, 8),
    owner,
    title,
    items,
    at: 0,
    matched: [],
    missing: [],
    playlists: [],
    written: 0,
    pending: null,
    state: "matching",
  };
  await saveJournal(journal);
  return journal;
}
export async function importJournal(
  journal: Journal,
  onProgress: (journal: Journal) => void,
  isCancelled: () => boolean,
) {
  journal.state = "matching";
  for (; journal.at < journal.items.length;) {
    if (isCancelled()) {
      journal.state = "paused";
      await saveJournal(journal);
      return;
    }
    const item = journal.items[journal.at];
    const candidates = await api.search(item.artist + " " + item.title);
    const ranked = (candidates as Track[])
      .map((track) => ({ track, score: importScore(item, track) }))
      .filter((v) => v.score >= 100)
      .sort((a, b) => b.score - a.score);
    if (ranked.length) {
      if (!journal.matched.some((v) => v.id === ranked[0].track.id))
        journal.matched.push(ranked[0].track);
    } else journal.missing.push(item);
    journal.at++;
    await saveJournal(journal);
    onProgress({ ...journal });
  }
  journal.state = "writing";
  if (!journal.matched.length) {
    journal.state = "done";
    await saveJournal(journal);
    onProgress({ ...journal });
    return;
  }
  if (journal.pending) {
    const own = await api.playlists();
    const found = own.filter((list) => list.title === journal.pending!.title);
    let matched = false;
    for (const list of found) {
      const full = await api.playlist(list.id);
      if (
        JSON.stringify((full.tracks || []).map((t) => t.id)) ===
        JSON.stringify(journal.pending.ids)
      ) {
        journal.playlists.push(list.id);
        journal.written += journal.pending.ids.length;
        journal.pending = null;
        await saveJournal(journal);
        matched = true;
        break;
      }
    }
    if (!matched)
      throw Error(
        "Предыдущая запись могла пройти. Проверь плейлист в библиотеке перед повторным импортом.",
      );
  }
  while (journal.written < journal.matched.length) {
    if (isCancelled()) {
      journal.state = "paused";
      await saveJournal(journal);
      return;
    }
    const ids = journal.matched
      .slice(journal.written, journal.written + 500)
      .map((t) => t.id);
    const title =
      journal.title +
      (journal.matched.length > 500
        ? " · " + (journal.playlists.length + 1)
        : "") +
      ` [${journal.id}]`;
    journal.pending = { title, ids };
    await saveJournal(journal);
    const list = await api.createPlaylist(title, ids);
    journal.playlists.push(list.id);
    journal.written += ids.length;
    journal.pending = null;
    await saveJournal(journal);
    onProgress({ ...journal });
  }
  journal.state = "done";
  await saveJournal(journal);
  onProgress({ ...journal });
}
