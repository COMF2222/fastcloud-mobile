import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PlayerState, Track, Listen } from "./types";
import type { MobileUpdate } from "./updates";
export interface NativeBridge {
  appIcon(options: {
    id?: number;
  }): Promise<{ selected: number; supported: boolean; note?: string }>;
  request(options: {
    path: string;
    method?: string;
    body?: unknown;
    binary?: boolean;
  }): Promise<{ status: number; data: unknown; contentType?: string }>;
  session(): Promise<{
    signedIn: boolean;
    accountId?: number;
    pending?: boolean;
  }>;
  login(): Promise<void>;
  pairingStart(): Promise<{ code: string; expiresIn: number }>;
  pairingPoll(): Promise<{ ready: boolean }>;
  pairingCancel(): Promise<void>;
  updatesCheck(): Promise<MobileUpdate>;
  updatesStatus(): Promise<MobileUpdate>;
  updatesDownload(): Promise<MobileUpdate>;
  updatesCancel(): Promise<void>;
  updatesInstall(): Promise<{ needsPermission?: boolean }>;
  logout(): Promise<void>;
  configure(options: { server: string }): Promise<void>;
  player(): Promise<PlayerState>;
  play(options: {
    tracks: Track[];
    index: number;
    recommended: boolean;
    station?: import("./station").Station;
  }): Promise<void>;
  enqueue(options: { track: Track; next: boolean }): Promise<void>;
  control(options: {
    action: string;
    value?: number;
    index?: number;
    target?: number;
  }): Promise<void>;
  download(options: { track: Track }): Promise<void>;
  downloads(): Promise<{
    items: { track: Track; bytes: number; ready: boolean }[];
  }>;
  removeDownload(options: { id: number }): Promise<void>;
  playbackSettings(options: {
    accountId: number;
    preferences: Record<string, unknown>;
    feedback: Record<string, unknown>;
    history?: Listen[];
    likes?: number[];
  }): Promise<void>;
}
export const native = registerPlugin<NativeBridge>("Fastcloud");
export const nativePlatform = Capacitor.isNativePlatform();
export const supportsAudioEffects = Capacitor.getPlatform() !== "ios";
export const server = (
  import.meta.env.VITE_FASTCLOUD_SERVER_URL || "https://77.223.107.226"
).replace(/\/+$/, "");
export const preview =
  new URLSearchParams(location.search).get("demo") === "1" && !nativePlatform;
