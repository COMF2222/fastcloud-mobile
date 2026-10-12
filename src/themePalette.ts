// Shared surface material rules from the Veirune desktop reference.
const mix = (
  color: readonly number[],
  other: readonly number[],
  amount: number,
) =>
  color.map((channel, i) =>
    Math.round(channel * (1 - amount) + other[i] * amount),
  );
const ease = (value: number, start: number, end: number) => {
  const progress = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return progress * progress * (3 - 2 * progress);
};
export const luminance = (color: readonly number[]) =>
  color
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
      0,
    );
export const contrast = (a: readonly number[], b: readonly number[]) =>
  (Math.max(luminance(a), luminance(b)) + 0.05) /
  (Math.min(luminance(a), luminance(b)) + 0.05);

export function panelPalette(
  color: readonly number[],
  opacity: number,
  light: boolean,
) {
  const alpha = Math.max(0, Math.min(1, opacity));
  const base = light ? [241, 242, 246] : [14, 16, 21];
  // Keep low-opacity glass colourful, then ease into a restrained opaque
  // material. Opacity still reaches 100%; it never exposes the wallpaper.
  const brightness = luminance(color);
  const toneAmount = Math.max(
    light ? 1 - ease(brightness, 0.45, 0.85) : ease(brightness, 0.025, 0.09),
    ease(Math.max(...color) - Math.min(...color), 45, 140),
  );
  const material = mix(
    color,
    mix(light ? [245, 246, 249] : [18, 20, 29], color, light ? 0.07 : 0.16),
    toneAmount,
  );
  const surface = mix(color, material, ease(alpha, 0.15, 0.8));
  const nav = mix(
    surface,
    light ? [232, 234, 240] : [0, 0, 0],
    light ? 0.12 : 0.18,
  );
  const raised = mix(surface, [255, 255, 255], light ? 0.1 : 0.035);
  const backgrounds = [surface, nav, raised].map((value) =>
    mix(base, value, alpha),
  );
  const background = backgrounds[0];
  const minimumContrast = (foreground: readonly number[]) =>
    Math.min(...backgrounds.map((value) => contrast(value, foreground)));
  const darkText =
    minimumContrast([0, 0, 0]) >= minimumContrast([255, 255, 255]);
  let text = darkText ? [20, 23, 29] : [245, 246, 249];
  if (minimumContrast(text) < 4.5)
    text = darkText ? [0, 0, 0] : [255, 255, 255];
  let muted = text;
  for (const amount of [0.28, 0.2, 0.12]) {
    const candidate = mix(text, background, amount);
    if (minimumContrast(candidate) >= 4.5) {
      muted = candidate;
      break;
    }
  }
  let controlLine = text;
  for (const amount of [0.35, 0.45, 0.55, 0.7]) {
    const candidate = mix(background, text, amount);
    if (minimumContrast(candidate) >= 3) {
      controlLine = candidate;
      break;
    }
  }
  return {
    surface,
    background,
    backgrounds,
    text,
    muted,
    controlLine,
    nav,
    raised,
    alpha,
  };
}

export function readableAccent(
  accent: readonly number[],
  background: readonly number[],
  text: readonly number[],
) {
  for (const amount of [0, 0.25, 0.5, 0.75, 1]) {
    const candidate = mix(accent, text, amount);
    if (contrast(background, candidate) >= 4.5) return candidate;
  }
  return [...text];
}
