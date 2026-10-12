type ObjectData = Record<string, unknown>;
const object = (value: unknown): value is ObjectData =>
  !!value && typeof value === "object" && !Array.isArray(value);
const check = (condition: unknown): void => {
  if (!condition) throw Error("Invalid Veirune backup");
};
const number = (value: unknown, min: number, max: number, integer = false) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max &&
  (!integer || Number.isInteger(value));
const text = (value: unknown, maximum: number) =>
  typeof value === "string" &&
  value.length <= maximum &&
  !/[\u0000-\u001f]/.test(value);
const colours = ["accent_rgb", "panel_rgb", "text_rgb", "muted_text_rgb"];
const toggles = [
  "normalization",
  "gapless",
  "lyrics_blur_past",
  "lyrics_auto_scroll",
  "compact_rows",
  "show_track_numbers",
  "reduced_motion",
  "autoplay",
  "leaderboard_anonymous",
];
const bounds: Record<string, [number, number, boolean?]> = {
  panel_opacity: [0, 1],
  panel_blur: [0, 40, true],
  heading_opacity: [0, 1],
  interface_text_scale: [0.9, 1.25],
  interface_scale: [0.9, 1.15],
  background_opacity: [0, 0.7],
  background_dim: [0, 0.85],
  background_blur: [0, 50, true],
  background_overlay: [0, 1],
  lyrics_scale: [0.8, 1.5],
  crossfade_ms: [0, 8000, true],
};
const enums: Record<string, string[]> = {
  theme: ["Dark", "Light", "System"],
  language: ["Russian", "English"],
  wave_mode: ["Balanced", "Familiar", "Discover", "Mood", "NoRepeats"],
  wave_mood: ["Calm", "Sad", "Happy", "Workout", "Road"],
};
const exact = (value: ObjectData, fields: string[]) =>
  Object.keys(value).length === fields.length &&
  fields.every((key) => Object.prototype.hasOwnProperty.call(value, key));
function preference(key: string, value: unknown, preset = false): void {
  if (preset)
    check(
      [
        ...colours,
        ...Object.keys(bounds).filter((field) => field !== "crossfade_ms"),
        "theme",
        "lyrics_blur_past",
        "reduced_motion",
      ].includes(key),
    );
  if (colours.includes(key)) {
    check(
      (value === null && key !== "accent_rgb") ||
        (Array.isArray(value) &&
          value.length === 3 &&
          value.every((v) => number(v, 0, 255, true))),
    );
    return;
  }
  if (toggles.includes(key)) {
    check(typeof value === "boolean");
    return;
  }
  if (key in enums) {
    check(typeof value === "string" && enums[key].includes(value));
    return;
  }
  if (key in bounds) {
    check(
      (key === "heading_opacity" && value === null) ||
        number(value, ...bounds[key]),
    );
    return;
  }
  if (key === "music_taste" && !preset) {
    check(object(value));
    const taste = value as ObjectData;
    check(
      exact(taste, ["discovery", "diversity", "repeat_days", "genres"]) &&
        number(taste.discovery, 0, 1) &&
        number(taste.diversity, 0, 1) &&
        number(taste.repeat_days, 0, 7, true) &&
        Array.isArray(taste.genres) &&
        taste.genres.length <= 12 &&
        taste.genres.every((v) => text(v, 48)),
    );
    return;
  }
  if (key === "theme_presets" && !preset) {
    check(Array.isArray(value) && value.length <= 20);
    for (const raw of value as unknown[]) {
      check(object(raw));
      const item = raw as ObjectData;
      check(
        exact(item, ["version", "name", "values"]) &&
          item.version === 1 &&
          text(item.name, 64) &&
          object(item.values) &&
          Object.keys(item.values as ObjectData).length > 0,
      );
      for (const [field, v] of Object.entries(item.values as ObjectData))
        preference(field, v, true);
    }
    return;
  }
  if (key === "quick_access" && !preset) {
    check(Array.isArray(value) && value.length <= 100);
    for (const raw of value as unknown[]) {
      if (typeof raw === "string") {
        check(
          [
            "likes",
            "daily_mix",
            "fresh",
            "vibe",
            "history",
            "station",
          ].includes(raw),
        );
        continue;
      }
      check(
        object(raw) &&
          Object.keys(raw).length === 1 &&
          ["track", "playlist", "album"].includes(Object.keys(raw)[0]),
      );
      const item = Object.values(raw as ObjectData)[0];
      check(object(item));
      const entry = item as ObjectData;
      check(
        exact(entry, ["id", "title", "artist", "artwork_url"]) &&
          number(entry.id, 1, Number.MAX_SAFE_INTEGER, true) &&
          text(entry.title, 512) &&
          text(entry.artist, 256) &&
          (entry.artwork_url === null ||
            (text(entry.artwork_url, 2048) &&
              (entry.artwork_url as string).startsWith("https://"))),
      );
    }
    return;
  }
  throw Error("Invalid Veirune backup preference");
}
export function validateBackup(
  value: unknown,
): asserts value is {
  version: 1;
  preferences: ObjectData;
  folders: ObjectData;
  smartPlaylists: ObjectData;
} {
  check(object(value));
  const data = value as ObjectData;
  check(
    data.version === 1 &&
      Object.keys(data).every((key) =>
        ["version", "preferences", "folders", "smartPlaylists"].includes(key),
      ),
  );
  for (const section of ["preferences", "folders", "smartPlaylists"]) {
    check(
      object(data[section]) &&
        Object.keys(data[section] as ObjectData).length <= 1000,
    );
    for (const [key, raw] of Object.entries(data[section] as ObjectData)) {
      check(!["__proto__", "prototype", "constructor"].includes(key));
      if (section === "preferences") {
        preference(key, raw);
        continue;
      }
      check(/^[a-zA-Z0-9_-]{1,64}$/.test(key) && object(raw));
      const row = raw as ObjectData;
      check(text(row.name, 128) && (row.name as string).trim().length > 0);
      if (section === "folders")
        check(
          exact(row, ["name", "playlistIds", "pinned", "order"]) &&
            Array.isArray(row.playlistIds) &&
            row.playlistIds.length <= 1000 &&
            row.playlistIds.every((v) =>
              number(v, 1, Number.MAX_SAFE_INTEGER, true),
            ) &&
            typeof row.pinned === "boolean" &&
            number(row.order, 0, 10000, true),
        );
      else
        check(
          exact(row, ["name", "genre", "addedDays", "unplayedDays", "limit"]) &&
            text(row.genre, 48) &&
            number(row.addedDays, 0, 365, true) &&
            number(row.unplayedDays, 0, 365, true) &&
            number(row.limit, 1, 500, true),
        );
    }
  }
}
