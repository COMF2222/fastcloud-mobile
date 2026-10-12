import { create } from "zustand";
import { useEffect } from "react";
import { App as NativeApp } from "@capacitor/app";
import { native, nativePlatform, preview } from "./native";
export type MobileUpdate = {
  supported: boolean;
  currentVersion: string;
  currentBuild: number;
  phase: "idle" | "available" | "downloading" | "ready";
  compatible?: boolean;
  received: number;
  total: number;
  error?: string;
  release: {
    version: string;
    build?: number;
    bytes?: number;
    notes?: { ru?: string[]; en?: string[] };
    storeUrl?: string;
  } | null;
};
export const useUpdates = create<{
  status: MobileUpdate;
  open: boolean;
  checking: boolean;
}>(() => ({
  status: {
    supported: true,
    currentVersion: "0.1.0",
    currentBuild: 1000,
    phase: "idle",
    received: 0,
    total: 0,
    release: null,
  },
  open: false,
  checking: false,
}));
let checking: Promise<void> | null = null;
export function checkUpdates(manual = false): Promise<void> {
  if (checking) return checking;
  useUpdates.setState({ checking: true });
  const request = (async () => {
    try {
      if (nativePlatform)
        useUpdates.setState({ status: await native.updatesCheck() });
      else if (
        preview &&
        new URLSearchParams(location.search).has("updatePreview")
      )
        useUpdates.setState({
          status: {
            supported: true,
            currentVersion: "0.1.0",
            currentBuild: 1000,
            phase: "available",
            compatible: true,
            received: 0,
            total: 5000000,
            release: {
              version: "0.1.1",
              bytes: 5000000,
              notes: {
                ru: ["Пример обновления для предпросмотра интерфейса."],
                en: ["Sample update for the interface preview."],
              },
            },
          },
        });
    } catch (cause) {
      if (manual)
        useUpdates.setState((state) => ({
          status: {
            ...state.status,
            error: cause instanceof Error ? cause.message : String(cause),
          },
        }));
    } finally {
      useUpdates.setState({ checking: false });
    }
  })();
  checking = request;
  void request.finally(() => {
    if (checking === request) checking = null;
  });
  return request;
}
export function useUpdateChecks() {
  useEffect(() => {
    let alive = true,
      last = 0;
    const refresh = () => {
      if (!alive || document.hidden || Date.now() - last < 60000) return;
      last = Date.now();
      void checkUpdates();
    };
    if (nativePlatform)
      void native
        .updatesStatus()
        .then((status) => {
          if (alive) useUpdates.setState({ status });
        })
        .catch(() => {});
    refresh();
    const interval = setInterval(refresh, 30 * 60 * 1000);
    const subscription = nativePlatform
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive) refresh();
        })
      : null;
    return () => {
      alive = false;
      clearInterval(interval);
      void subscription?.then((value) => value.remove());
    };
  }, []);
  const downloading = useUpdates(
    (state) => state.status.phase === "downloading",
  );
  useEffect(() => {
    if (!downloading || !nativePlatform) return;
    let alive = true,
      busy = false;
    const interval = setInterval(() => {
      if (!alive || busy) return;
      busy = true;
      void native
        .updatesStatus()
        .then((status) => {
          if (alive) useUpdates.setState({ status });
        })
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, 500);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [downloading]);
}
