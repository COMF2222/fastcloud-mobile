import { Preferences as Storage } from "@capacitor/preferences";
import { create } from "zustand";
import { api } from "./client";
import { native, nativePlatform } from "./native";
import {
  artist,
  emptyCloud,
  type Cloud,
  type Feedback,
  type Track,
} from "./types";
import {
  mergeCloud,
  newer,
  blocked as matchesBlocked,
  acknowledge,
  patchBatch,
  type Section,
  type Dirty,
} from "./contracts";
const uuid = () => crypto.randomUUID().replace(/-/g, "");
let account = 0,
  epoch = 0,
  device = uuid(),
  dirty: Dirty = {},
  syncing: { epoch: number; promise: Promise<void> } | null = null,
  saveChain = Promise.resolve();
export const activeCloudAccount = () => account;
export const useCloud = create<{ cloud: Cloud; status: string }>(() => ({
  cloud: emptyCloud(),
  status: "offline",
}));
function snapshot() {
  return JSON.stringify({ device, cloud: useCloud.getState().cloud, dirty });
}
function persist() {
  const key = `personal-${account}`,
    data = snapshot();
  saveChain = saveChain
    .catch(() => {})
    .then(() => Storage.set({ key, value: data }));
  return saveChain;
}
export async function activateCloud(id: number) {
  epoch++;
  account = id;
  dirty = {};
  device = uuid();
  useCloud.setState({ cloud: emptyCloud(), status: "loading" });
  const current = epoch;
  const saved = await Storage.get({ key: `personal-${id}` });
  if (current !== epoch) return;
  if (saved.value) {
    try {
      const value = JSON.parse(saved.value);
      device = value.device || device;
      dirty = value.dirty || {};
      useCloud.setState({
        cloud: { ...emptyCloud(), ...value.cloud },
        status: "cached",
      });
    } catch {
      /* Ignore a corrupt local cache; the server remains authoritative. */
    }
  }
  await syncCloud();
}
export function resetCloud() {
  epoch++;
  account = 0;
  dirty = {};
  useCloud.setState({ cloud: emptyCloud(), status: "offline" });
}
export async function change(section: Section, key: string, value: unknown) {
  if (!account) throw Error("Sign in first");
  dirty[section] ??= {};
  dirty[section]![key] = value;
  const cloud = useCloud.getState().cloud;
  useCloud.setState({
    cloud: { ...cloud, [section]: { ...cloud[section], [key]: value } },
    status: "pending",
  });
  await persist();
  if (nativePlatform)
    await native.playbackSettings({
      accountId: account,
      preferences: useCloud.getState().cloud.preferences,
      feedback: useCloud.getState().cloud.trackFeedback,
    });
}
export const setPreference = (key: string, value: unknown) =>
  change("preferences", key, value);
export async function dislike(track: Track, disliked: boolean) {
  const url = (raw?: string | null) => {
    if (!raw) return null;
    try {
      const u = new URL(raw);
      return u.origin + u.pathname;
    } catch {
      return null;
    }
  };
  await change("trackFeedback", String(track.id), {
    disliked,
    updatedAt: Date.now(),
    device,
    track: {
      id: track.id,
      title: track.title.slice(0, 512),
      artist: artist(track).slice(0, 256),
      durationMs: track.full_duration_ms || track.duration || 0,
      genre: (track.genre || "").slice(0, 128),
      artworkUrl: url(track.artwork_url),
      permalinkUrl: url(track.permalink_url),
      isrc:
        track.publisher_metadata?.isrc
          ?.replace(/[^a-z0-9]/gi, "")
          .toUpperCase()
          .slice(0, 12) || null,
    },
  });
}
export function blocked(track: Track, cloud = useCloud.getState().cloud) {
  return matchesBlocked(track, cloud);
}
export function syncCloud(): Promise<void> {
  if (syncing?.epoch === epoch) return syncing.promise;
  if (!account) return Promise.resolve();
  const current = epoch;
  const promise = (async () => {
    try {
      let remote = await api.personal();
      if (current !== epoch) return;
      useCloud.setState({
        cloud: mergeCloud(remote, useCloud.getState().cloud, dirty),
      });
      for (let batch = 0; batch < 12; batch++) {
        const sent = structuredClone(patchBatch(dirty));
        if (!Object.values(sent).some((v) => Object.keys(v).length)) break;
        remote = await api.patch(sent);
        if (current !== epoch) return;
        dirty = acknowledge(dirty, sent);
        useCloud.setState({
          cloud: mergeCloud(remote, useCloud.getState().cloud, dirty),
        });
      }
      if (current !== epoch) return;
      useCloud.setState({
        status: Object.values(dirty).some((v) => Object.keys(v).length)
          ? "pending"
          : "synced",
      });
      await persist();
      if (nativePlatform)
        await native.playbackSettings({
          accountId: account,
          preferences: useCloud.getState().cloud.preferences,
          feedback: useCloud.getState().cloud.trackFeedback,
        });
    } catch {
      if (current === epoch) useCloud.setState({ status: "offline" });
    } finally {
      if (syncing?.epoch === current) syncing = null;
    }
  })();
  syncing = { epoch: current, promise };
  return promise;
}
