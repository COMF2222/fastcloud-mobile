import { panelPalette, contrast } from "./themePalette.ts";
const rgb = (value: unknown, fallback: number[]) =>
  Array.isArray(value) &&
  value.length === 3 &&
  value.every(
    (channel) => typeof channel === "number" && Number.isFinite(channel),
  )
    ? value.map((channel) => Math.max(0, Math.min(255, channel)))
    : fallback;
export function mobileTheme(prefs: Record<string, unknown>, light: boolean) {
  const base = light ? [245, 245, 249] : [12, 13, 18];
  const opacity = Math.max(
    0,
    Math.min(1, Number(prefs.panel_opacity ?? 0.85) || 0),
  );
  const palette = panelPalette(
    rgb(prefs.panel_rgb, light ? [255, 255, 255] : [25, 27, 35]),
    opacity,
    light,
  );
  const backgrounds = [base, ...palette.backgrounds];
  const minimum = (color: number[]) =>
    Math.min(...backgrounds.map((background) => contrast(background, color)));
  const fallback =
    minimum([0, 0, 0]) > minimum([255, 255, 255]) ? [0, 0, 0] : [255, 255, 255];
  const readable = (value: unknown, defaultColor: number[], ratio: number) => {
    const candidate = rgb(value, defaultColor);
    for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
      const color = candidate.map((channel, index) =>
        Math.round(channel * (1 - amount) + fallback[index] * amount),
      );
      if (minimum(color) >= ratio) return color;
    }
    return fallback;
  };
  const text = readable(prefs.text_rgb, palette.text, 4.5);
  const muted = readable(prefs.muted_text_rgb, palette.muted, 4.5);
  const accent = readable(
    prefs.accent_rgb,
    light ? [37, 42, 75] : [255, 255, 255],
    4.5,
  );
  const onAccent =
    contrast(accent, [0, 0, 0]) > contrast(accent, [255, 255, 255])
      ? [0, 0, 0]
      : [255, 255, 255];
  const css = (color: number[]) => `rgb(${color.join(",")})`;
  return {
    backgrounds,
    text,
    muted,
    accent,
    onAccent,
    vars: {
      "--bg": css(base),
      "--surface-rgb": palette.surface.join(","),
      "--solid": css(palette.background),
      "--chrome": css(palette.backgrounds[1]),
      "--text": css(text),
      "--muted": css(muted),
      "--accent": css(accent),
      "--on-accent": css(onAccent),
      "--line": css(readable(null, palette.controlLine, 3)),
      "--panel-opacity": String(opacity),
    },
  };
}
