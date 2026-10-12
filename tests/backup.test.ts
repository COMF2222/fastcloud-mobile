import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBackup } from "../src/backup.ts";
const base = () => ({
  version: 1,
  preferences: {
    theme: "Dark",
    accent_rgb: [255, 255, 255],
    heading_opacity: null,
  },
  folders: {
    folder: { name: "Road", playlistIds: [123], pinned: false, order: 0 },
  },
  smartPlaylists: {},
});
test("desktop-compatible backup accepts portable preferences and collections", () => {
  validateBackup(base());
});
test("invalid colours and malformed collections cannot corrupt the cached UI", () => {
  for (const value of ["red", {}, [255, 255], [-1, 0, 0]]) {
    const backup = base();
    Object.assign(backup.preferences, { accent_rgb: value });
    assert.throws(() => validateBackup(backup));
  }
  const backup = base();
  Object.assign(backup.folders.folder, { playlistIds: "not an array" });
  assert.throws(() => validateBackup(backup));
});
test("unknown credentials, prototype fields and nested preset payloads are rejected before any edit", () => {
  assert.throws(() =>
    validateBackup({ ...base(), tokens: { access_token: "secret" } }),
  );
  const backup = base();
  Object.assign(backup.preferences, {
    theme_presets: [{ version: 1, name: "Bad", values: { theme_presets: [] } }],
  });
  assert.throws(() => validateBackup(backup));
  assert.throws(() =>
    validateBackup({
      ...base(),
      folders: JSON.parse('{"__proto__":{"name":"bad"}}'),
    }),
  );
});
