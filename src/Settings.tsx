import { AppIconPicker } from "./AppIconPicker";
import { useEffect, useRef, useState } from "react";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { RefreshCw, Image, Download, Upload, Shield } from "lucide-react";
import { request } from "./client";
import { useCloud, change, setPreference, syncCloud } from "./cloud";
import { useApp, notify, run } from "./state";
import { nativePlatform, supportsAudioEffects } from "./native";
import { Sheet, InputDialog, useResource, useText } from "./ui";
import { saveWallpaper, useWallpaper } from "./wallpaper";
import { WallpaperEditor } from "./WallpaperEditor";
import { validateBackup } from "./backup";
import { UpdateSettings } from "./UpdateUI";
const colours = [
  "#ffffff",
  "#a7b7ff",
  "#ff915e",
  "#ed96be",
  "#84d6b0",
  "#d2b8ff",
];
const genres = [
  "Alternative Rock",
  "Ambient",
  "Classical",
  "Country",
  "Dance",
  "Disco",
  "Drum & Bass",
  "Dubstep",
  "Electronic",
  "Folk",
  "Funk",
  "Hip-hop & Rap",
  "House",
  "Indie",
  "Jazz",
  "K-pop",
  "Latin",
  "Lo-fi",
  "Metal",
  "Phonk",
  "Pop",
  "Punk",
  "R&B",
  "Reggae",
  "Rock",
  "Soul",
  "Techno",
  "Trance",
  "Trap",
  "World",
];
export function Toggle({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        className="toggle"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
function Range({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
  suffix = "%",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const [current, setCurrent] = useState(value);
  useEffect(() => setCurrent(value), [value]);
  return (
    <label className="range-setting">
      <span>
        {label}
        <b>
          {suffix === "%" ? Math.round(current * 100) : current}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => setCurrent(Number(e.target.value))}
        onPointerUp={() => onChange(current)}
        onKeyUp={() => onChange(current)}
      />
    </label>
  );
}
export function Settings() {
  const t = useText();
  const cloud = useCloud((s) => s.cloud),
    status = useCloud((s) => s.status);
  const prefs = cloud.preferences;
  const wallpaper = useWallpaper((s) => s.url);
  const [wallpaperEdit, setWallpaperEdit] = useState<{
    file: File | null;
  } | null>(null);
  const wallpaperInput = useRef<HTMLInputElement>(null);
  const [genreOpen, setGenreOpen] = useState(false),
    [presetOpen, setPresetOpen] = useState(false);
  const [savePreset, setSavePreset] = useState(false);
  const session = useResource(
    () => request<{ admin: boolean }>("/v1/session"),
    [],
  );
  const save = (key: string, value: unknown) =>
    void run(() => setPreference(key, value));
  const taste = prefs.music_taste || {
    discovery: 0.5,
    diversity: 0.5,
    repeat_days: 2,
    genres: [],
  };
  return (
    <>
      <h1>{t("Настройки", "Settings")}</h1>
      <section className="settings-card">
        <h2>{t("Аккаунт", "Account")}</h2>
        <div className="setting-row">
          <span>
            <strong>{useApp((s) => s.me?.username)}</strong>
            <small>
              {status === "synced"
                ? t("Данные синхронизированы", "Data synced")
                : status === "pending"
                  ? t("Есть несохранённые изменения", "Changes waiting to sync")
                  : t(
                      "Синхронизация при подключении",
                      "Will sync when connected",
                    )}
            </small>
          </span>
          <button
            className="icon-button"
            aria-label={t("Синхронизировать", "Sync")}
            onClick={() => void run(syncCloud)}
          >
            <RefreshCw />
          </button>
        </div>
        <Toggle
          label={t("Анонимность в лидерборде", "Anonymous on leaderboard")}
          checked={prefs.leaderboard_anonymous !== false}
          onChange={(v) => save("leaderboard_anonymous", v)}
        />
        <div className="setting-row">
          <strong>{t("Язык", "Language")}</strong>
          <div className="chips">
            <button
              aria-pressed={prefs.language !== "English"}
              onClick={() => save("language", "Russian")}
            >
              Русский
            </button>
            <button
              aria-pressed={prefs.language === "English"}
              onClick={() => save("language", "English")}
            >
              English
            </button>
          </div>
        </div>
      </section>
      <AppIconPicker english={prefs.language === "English"} />
      <section className="settings-card">
        <h2>{t("Оформление", "Appearance")}</h2>
        <div className="chips">
          {[
            ["Dark", "Тёмная", "Dark"],
            ["Light", "Светлая", "Light"],
            ["System", "Системная", "System"],
          ].map((row) => (
            <button
              key={row[0]}
              aria-pressed={(prefs.theme || "Dark") === row[0]}
              onClick={() => save("theme", row[0])}
            >
              {t(row[1], row[2])}
            </button>
          ))}
        </div>
        <p>{t("Акцент", "Accent")}</p>
        <div className="colour-swatches">
          {colours.map((colour) => (
            <button
              key={colour}
              style={{ background: colour }}
              aria-label={colour}
              onClick={() =>
                save(
                  "accent_rgb",
                  colour
                    .slice(1)
                    .match(/../g)!
                    .map((s) => parseInt(s, 16)),
                )
              }
            />
          ))}
          <input
            type="color"
            value={
              "#" +
              (
                (prefs.accent_rgb as number[]) ||
                (prefs.theme === "Light" ? [37, 42, 75] : [255, 255, 255])
              )
                .map((value) =>
                  Math.max(0, Math.min(255, value))
                    .toString(16)
                    .padStart(2, "0"),
                )
                .join("")
            }
            aria-label={t("Свой цвет", "Custom colour")}
            onChange={(e) =>
              save(
                "accent_rgb",
                e.target.value
                  .slice(1)
                  .match(/../g)!
                  .map((s) => parseInt(s, 16)),
              )
            }
          />
        </div>
        <Range
          label={t("Размер текста", "Text size")}
          value={Number(prefs.interface_text_scale) || 1}
          min={0.9}
          max={1.25}
          onChange={(v) => save("interface_text_scale", v)}
        />
        <Range
          label={t("Непрозрачность подложек", "Surface opacity")}
          value={
            typeof prefs.panel_opacity === "number" ? prefs.panel_opacity : 0.85
          }
          onChange={(v) => save("panel_opacity", v)}
        />
        <Range
          label={t("Затемнение фона", "Wallpaper dimming")}
          value={Number(prefs.background_dim) || 0}
          max={0.85}
          onChange={(v) => save("background_dim", v)}
        />
        <Range
          label={t("Размытие фона", "Wallpaper blur")}
          value={Number(prefs.background_blur) || 0}
          max={30}
          step={1}
          suffix=" px"
          onChange={(v) => save("background_blur", v)}
        />
        <div className="settings-actions">
          <button onClick={() => wallpaperInput.current?.click()}>
            <Image size={18} />
            {t("Выбрать фон", "Choose wallpaper")}
          </button>
          <input
            hidden
            ref={wallpaperInput}
            type="file"
            accept="image/*,video/mp4,video/webm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setWallpaperEdit({ file });
              e.target.value = "";
            }}
          />
          {wallpaper && (
            <button onClick={() => setWallpaperEdit({ file: null })}>
              {t("Настроить фон", "Adjust wallpaper")}
            </button>
          )}
          {wallpaper && (
            <button onClick={() => void run(() => saveWallpaper(null))}>
              {t("Убрать фон", "Remove wallpaper")}
            </button>
          )}
          <button onClick={() => setPresetOpen(true)}>
            {t("Пресеты", "Presets")}
          </button>
        </div>
        <Toggle
          label={t("Меньше анимации", "Reduced motion")}
          checked={prefs.reduced_motion === true}
          onChange={(v) => save("reduced_motion", v)}
        />
      </section>
      <section className="settings-card">
        <h2>{t("Музыкальный вкус", "Music taste")}</h2>
        <Range
          label={t("Больше открытий", "More discovery")}
          value={taste.discovery}
          onChange={(v) => save("music_taste", { ...taste, discovery: v })}
        />
        <Range
          label={t("Разнообразие исполнителей", "Artist diversity")}
          value={taste.diversity}
          onChange={(v) => save("music_taste", { ...taste, diversity: v })}
        />
        <button onClick={() => setGenreOpen(true)}>
          {t("Любимые жанры", "Favourite genres")} · {taste.genres.length}
        </button>
      </section>
      <section className="settings-card">
        <h2>{t("Воспроизведение", "Playback")}</h2>
        <Toggle
          label={t(
            "Продолжать музыку после очереди",
            "Autoplay after the queue ends",
          )}
          checked={prefs.autoplay !== false}
          onChange={(v) => save("autoplay", v)}
        />
        {supportsAudioEffects && (
          <Toggle
            label={t("Выравнивать громкость", "Normalize volume")}
            checked={prefs.normalization === true}
            onChange={(v) => save("normalization", v)}
          />
        )}
        <Range
          label={t("Плавный переход", "Crossfade")}
          value={Number(prefs.crossfade_ms || 0) / 1000}
          max={8}
          step={1}
          suffix=" s"
          onChange={(v) => save("crossfade_ms", v * 1000)}
        />
      </section>
      <section className="settings-card">
        <h2>{t("Текст песни", "Lyrics")}</h2>
        <Range
          label={t("Размер текста", "Text size")}
          value={Number(prefs.lyrics_scale) || 1}
          min={0.8}
          max={1.5}
          onChange={(v) => save("lyrics_scale", v)}
        />
        <Toggle
          label={t("Следовать текущей строке", "Follow current line")}
          checked={prefs.lyrics_auto_scroll !== false}
          onChange={(v) => save("lyrics_auto_scroll", v)}
        />
        <Toggle
          label={t("Размывать неактивные строки", "Blur inactive lines")}
          checked={prefs.lyrics_blur_past !== false}
          onChange={(v) => save("lyrics_blur_past", v)}
        />
      </section>
      <section className="settings-card">
        <h2>{t("Резервная копия", "Backup")}</h2>
        <div className="settings-actions">
          <button
            onClick={() =>
              void run(async () => {
                const value = JSON.stringify(
                  {
                    version: 1,
                    preferences: cloud.preferences,
                    folders: cloud.folders,
                    smartPlaylists: cloud.smartPlaylists,
                  },
                  null,
                  2,
                );
                if (nativePlatform) {
                  const result = await Filesystem.writeFile({
                    path: "veirune-settings.json",
                    data: btoa(unescape(encodeURIComponent(value))),
                    directory: Directory.Cache,
                  });
                  await Share.share({ files: [result.uri] });
                } else {
                  const url = URL.createObjectURL(
                    new Blob([value], { type: "application/json" }),
                  );
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "veirune-settings.json";
                  link.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
              })
            }
          >
            <Download size={18} />
            {t("Экспорт", "Export")}
          </button>
          <label className="button">
            <Upload size={18} />
            {t("Импорт", "Import")}
            <input
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file)
                  void run(async () => {
                    if (file.size > 2 * 1024 * 1024)
                      throw Error(t("Файл слишком большой", "File too large"));
                    const value = JSON.parse(await file.text());
                    validateBackup(value);
                    for (const section of [
                      "preferences",
                      "folders",
                      "smartPlaylists",
                    ] as const)
                      for (const [key, v] of Object.entries(
                        value[section] || {},
                      ))
                        await change(section, key, v);
                    await syncCloud();
                    notify(t("Настройки восстановлены", "Settings restored"));
                  });
              }}
            />
          </label>
        </div>
      </section>
      {session.value?.admin && <Admin />}
      <UpdateSettings />
      {genreOpen && (
        <Sheet
          title={t("Любимые жанры", "Favourite genres")}
          onClose={() => setGenreOpen(false)}
        >
          <div className="chips genre-choices">
            {genres.map((genre) => (
              <button
                key={genre}
                aria-pressed={taste.genres.includes(genre)}
                disabled={
                  !taste.genres.includes(genre) && taste.genres.length >= 12
                }
                onClick={() =>
                  save("music_taste", {
                    ...taste,
                    genres: taste.genres.includes(genre)
                      ? taste.genres.filter((v) => v !== genre)
                      : [...taste.genres, genre],
                  })
                }
              >
                {genre}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {presetOpen && (
        <Sheet
          title={t("Пресеты оформления", "Appearance presets")}
          onClose={() => setPresetOpen(false)}
        >
          <div className="menu-list">
            <button
              onClick={() => {
                setPresetOpen(false);
                setSavePreset(true);
              }}
            >
              {t("Сохранить своё оформление", "Save your appearance")}
            </button>
            {[
              ["Night", [167, 183, 255]],
              ["Sunset", [255, 145, 94]],
              ["Mint", [132, 214, 176]],
              ["Rose", [237, 150, 190]],
              ["Lavender", [210, 184, 255]],
              ["Classic", [255, 255, 255]],
            ].map(([name, rgb]) => (
              <button
                key={name as string}
                onClick={() => {
                  save("accent_rgb", rgb);
                  save("theme", "Dark");
                  setPresetOpen(false);
                }}
              >
                {name as string}
              </button>
            ))}
            {(
              (prefs.theme_presets as {
                name: string;
                values: Record<string, unknown>;
              }[]) || []
            ).map((preset) => (
              <button
                key={preset.name}
                onClick={() =>
                  void run(async () => {
                    for (const [key, value] of Object.entries(preset.values))
                      await setPreference(key, value);
                    setPresetOpen(false);
                  })
                }
              >
                {preset.name}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {savePreset && (
        <InputDialog
          title={t("Название пресета", "Preset name")}
          onClose={() => setSavePreset(false)}
          onSubmit={async (name) => {
            if (name.length > 64)
              throw Error(t("Название слишком длинное", "Name is too long"));
            const keys = [
              "theme",
              "accent_rgb",
              "panel_rgb",
              "panel_opacity",
              "panel_blur",
              "heading_opacity",
              "text_rgb",
              "muted_text_rgb",
              "interface_text_scale",
              "interface_scale",
              "background_opacity",
              "background_dim",
              "background_blur",
              "background_overlay",
              "lyrics_scale",
              "lyrics_blur_past",
              "reduced_motion",
            ];
            const values = {
              ...Object.fromEntries(
                Object.entries(prefs).filter(([key]) => keys.includes(key)),
              ),
              theme: prefs.theme || "Dark",
              accent_rgb: prefs.accent_rgb || [255, 255, 255],
            };
            const saved =
              (prefs.theme_presets as {
                version: number;
                name: string;
                values: Record<string, unknown>;
              }[]) || [];
            await setPreference(
              "theme_presets",
              [
                ...saved.filter((preset) => preset.name !== name),
                { version: 1, name, values },
              ].slice(-20),
            );
          }}
        />
      )}
      {wallpaperEdit && (
        <WallpaperEditor
          file={wallpaperEdit.file}
          onClose={() => setWallpaperEdit(null)}
        />
      )}
    </>
  );
}

function Admin() {
  const t = useText();
  const [open, setOpen] = useState(false),
    [tick, setTick] = useState(0);
  const data = useResource(
    () =>
      request<{
        users: {
          id: number;
          username: string;
          status: string;
          online: boolean;
          stream_requests_today: number;
        }[];
      }>("/v1/admin/users"),
    [tick],
  );
  const settings = useResource(
    () => request<{ approval_required: boolean }>("/v1/admin/settings"),
    [tick],
  );
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => {
      if (!document.hidden) setTick((v) => v + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, [open]);
  return (
    <section className="settings-card">
      <button className="setting-row" onClick={() => setOpen(!open)}>
        <Shield />
        {t("Управление пользователями", "Manage users")}
      </button>
      {open && (
        <>
          <Toggle
            label={t("Одобрять заявки на вход", "Require approval")}
            checked={settings.value?.approval_required === true}
            onChange={(approval_required) =>
              void run(async () => {
                await request("/v1/admin/settings", "POST", {
                  approval_required,
                });
                setTick((v) => v + 1);
              })
            }
          />
          {data.value?.users.map((user) => (
            <div className="admin-user" key={user.id}>
              <strong>{user.username}</strong>
              <small>
                {user.online
                  ? t("Онлайн", "Online")
                  : t("Не в сети", "Offline")}{" "}
                · API {user.stream_requests_today || 0}
              </small>
              <button
                onClick={() =>
                  void run(async () => {
                    await request(`/v1/admin/users/${user.id}`, "POST", {
                      status:
                        user.status === "approved" ? "denied" : "approved",
                    });
                    setTick((v) => v + 1);
                  })
                }
              >
                {user.status === "approved"
                  ? t("Отключить", "Disable")
                  : t("Разрешить", "Approve")}
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
