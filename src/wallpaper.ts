import { create } from "zustand";
import { Preferences } from "@capacitor/preferences";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Capacitor } from "@capacitor/core";
import { nativePlatform } from "./native";
export const useWallpaper = create<{ url: string | null; video: boolean }>(
  () => ({ url: null, video: false }),
);
export async function loadWallpaper() {
  const saved = await Preferences.get({ key: "wallpaper" });
  if (saved.value) {
    const value = JSON.parse(saved.value);
    useWallpaper.setState({
      url: nativePlatform ? Capacitor.convertFileSrc(value.url) : value.url,
      video: value.video,
    });
  }
}
export async function saveWallpaper(file: File | null) {
  if (!file) {
    await Preferences.remove({ key: "wallpaper" });
    useWallpaper.setState({ url: null, video: false });
    return;
  }
  if (file.size > 25 * 1024 * 1024)
    throw Error("Максимальный размер фона — 25 MiB");
  if (!/^(image|video)\//.test(file.type))
    throw Error("Выбери изображение или видео");
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  let url = encoded;
  if (nativePlatform) {
    const extension = (
      {
        "image/gif": "gif",
        "image/webp": "webp",
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/avif": "avif",
        "image/svg+xml": "svg",
        "video/webm": "webm",
        "video/mp4": "mp4",
      } as Record<string, string>
    )[file.type];
    if (!extension) throw Error("Этот формат фона не поддерживается");
    const result = await Filesystem.writeFile({
      directory: Directory.Data,
      path: `wallpaper-${crypto.randomUUID()}.${extension}`,
      data: encoded.split(",")[1],
    });
    url = result.uri;
  }
  const value = { url, video: file.type.startsWith("video/") };
  await Preferences.set({ key: "wallpaper", value: JSON.stringify(value) });
  useWallpaper.setState({
    url: nativePlatform ? Capacitor.convertFileSrc(url) : url,
    video: value.video,
  });
}
