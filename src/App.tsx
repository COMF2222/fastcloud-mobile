import { useAppIcon } from "./AppIconPicker";
import { useCallback, useEffect, useState } from "react";
import { mobileTheme } from "./mobileTheme";
import { PhonePairing } from "./PhonePairing";
import { TrackPage } from "./TrackPage";
import { ShareMusic } from "./ShareMusic";
import { UpdateNotice, UpdateSheet } from "./UpdateUI";
import { useUpdateChecks } from "./updates";
import { App as NativeApp } from "@capacitor/app";
import {
  Home as HomeIcon,
  Search as SearchIcon,
  Library as LibraryIcon,
  MessageCircle,
  UserRound,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import {
  Home,
  SearchPage,
  Library,
  Profile,
  PlaylistPage,
  ArtistPage,
  Following,
  Dislikes,
} from "./CorePages";
import { Messages, Statistics, Leaderboard } from "./SocialPages";
import { Settings } from "./Settings";
import { Imports } from "./Imports";
import { MiniPlayer, FullPlayer, Queue, Offline } from "./PlaybackUI";
import {
  useApp,
  boot,
  signIn,
  go,
  back as goBack,
  run,
  refreshLibrary,
} from "./state";
import { useCloud, syncCloud, activeCloudAccount } from "./cloud";
import { usePlayer, refreshPlayer } from "./player";
import { native, nativePlatform, preview } from "./native";
import { loadWallpaper, useWallpaper } from "./wallpaper";
import { useText } from "./ui";
import { invalidateRequests } from "./client";
export default function App() {
  const appIcon = useAppIcon();
  const [systemLight, setSystemLight] = useState(
    () => matchMedia("(prefers-color-scheme: light)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: light)");
    const changed = () => setSystemLight(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useUpdateChecks();
  const t = useText();
  const page = useApp((s) => s.page),
    detailId = useApp((s) => s.detail?.id),
    me = useApp((s) => s.me),
    connecting = useApp((s) => s.connecting),
    toast = useApp((s) => s.toast);
  const prefs = useCloud((s) => s.cloud.preferences),
    expanded = usePlayer((s) => s.expanded),
    hasCurrentTrack = usePlayer((s) => !!s.state.queue[s.state.index]);
  const cloud = useCloud((s) => s.cloud),
    syncStatus = useCloud((s) => s.status),
    likes = useApp((s) => s.likes);
  useEffect(() => {
    if (
      nativePlatform &&
      me &&
      activeCloudAccount() === me.id &&
      syncStatus !== "loading"
    )
      void native
        .playbackSettings({
          accountId: me.id,
          preferences: cloud.preferences,
          feedback: cloud.trackFeedback,
          history: cloud.tracks,
          likes: likes.map((t) => t.id),
        })
        .catch(() => {});
  }, [cloud, likes, me, syncStatus]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--mini",
      hasCurrentTrack ? "74px" : "0px",
    );
  }, [hasCurrentTrack]);
  const wallpaper = useWallpaper();
  const shareRequest = useApp((s) => s.shareRequest);
  const [backgroundOnly, setBackgroundOnly] = useState(false);
  const [pairing, setPairing] = useState<{
    code: string;
    expiresIn: number;
  } | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const closePairing = useCallback(() => {
    setPairing(null);
    void native.pairingCancel().catch(() => {});
  }, []);
  useEffect(() => {
    void boot();
    void loadWallpaper().catch(() => {});
    const player = setInterval(() => {
        if (!document.hidden && useApp.getState().me)
          void refreshPlayer().catch(() => {});
      }, 500),
      sync = setInterval(() => {
        if (!document.hidden) void syncCloud();
      }, 30000);
    const state = nativePlatform
      ? NativeApp.addListener("appStateChange", ({ isActive }) => {
          if (isActive && useApp.getState().me) {
            void refreshPlayer().catch(() => {});
            void syncCloud();
          }
        })
      : null;
    const back = nativePlatform
      ? NativeApp.addListener("backButton", () => {
          if (document.querySelector('[role="dialog"]')) {
            const dialogs = document.querySelectorAll('[role="dialog"]');
            dialogs[dialogs.length - 1]
              ?.querySelector<HTMLButtonElement>("header button")
              ?.click();
            return;
          }
          if (usePlayer.getState().expanded)
            usePlayer.setState({ expanded: false });
          else if (useApp.getState().page !== "home") goBack();
          else void NativeApp.minimizeApp();
        })
      : null;
    return () => {
      clearInterval(player);
      clearInterval(sync);
      void state?.then((v) => v.remove());
      void back?.then((v) => v.remove());
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.lang = prefs.language === "English" ? "en" : "ru";
    root.style.fontSize = `${16 * Number(prefs.interface_text_scale || 1)}px`;
    root.dataset.theme =
      prefs.theme === "Light" || (prefs.theme === "System" && systemLight)
        ? "light"
        : "dark";
    root.dataset.motion = prefs.reduced_motion ? "reduced" : "full";
    const theme = mobileTheme(prefs, root.dataset.theme === "light");
    for (const [key, value] of Object.entries(theme.vars))
      root.style.setProperty(key, value);
  }, [prefs, systemLight]);
  const nav = [
    ["home", HomeIcon, "Главная", "Home"],
    ["search", SearchIcon, "Поиск", "Search"],
    ["library", LibraryIcon, "Музыка", "Library"],
    ["messages", MessageCircle, "Чаты", "Chats"],
    ["profile", UserRound, "Профиль", "Profile"],
  ] as const;
  const subpage = !nav.some((row) => row[0] === page);
  return (
    <>
      {wallpaper.url && (
        <div
          className="wallpaper"
          style={{ filter: `blur(${Number(prefs.background_blur) || 0}px)` }}
        >
          {wallpaper.video ? (
            <video src={wallpaper.url} autoPlay muted playsInline loop />
          ) : (
            <img src={wallpaper.url} alt="" />
          )}
          <div
            className="wallpaper-shade"
            style={{
              background: `rgba(0,0,0,${Number(prefs.background_dim) || 0})`,
            }}
          />
        </div>
      )}
      {backgroundOnly ? (
        <button className="restore-ui" onClick={() => setBackgroundOnly(false)}>
          {t("Вернуть интерфейс", "Show controls")}
        </button>
      ) : connecting && !me ? (
        <div className="login-screen">
          <img src={appIcon} alt="Veirune" />
          <h1>Veirune</h1>
          <span className="spinner" />
        </div>
      ) : !me ? (
        <div className="login-screen">
          <img src={appIcon} alt="" />
          <p className="eyebrow">YOUR MUSIC, EVERYWHERE</p>
          <h1>Veirune</h1>
          <p>
            {t(
              "Твоя музыка SoundCloud. Теперь с тобой.",
              "Your SoundCloud music. Now with you.",
            )}
          </p>
          <button
            className="primary"
            disabled={!nativePlatform || connecting}
            onClick={() => void signIn()}
          >
            {connecting
              ? t("Подключаемся…", "Connecting…")
              : t("Войти через SoundCloud", "Sign in with SoundCloud")}
          </button>
          <small>
            {t(
              "Лайки, плейлисты и настройки подхватятся из твоего аккаунта.",
              "Your likes, playlists and settings will follow you.",
            )}
          </small>
          {nativePlatform && (
            <button
              disabled={connecting || pairBusy}
              onClick={() => {
                setPairBusy(true);
                void run(async () => {
                  setPairing(await native.pairingStart());
                }).finally(() => setPairBusy(false));
              }}
            >
              {pairBusy
                ? t("Получаем код…", "Creating code…")
                : t("Подключить с ПК", "Connect with PC")}
            </button>
          )}
          {!nativePlatform && (
            <a href="?demo=1">
              {t("Посмотреть интерфейс", "Preview the interface")}
            </a>
          )}
        </div>
      ) : (
        <div className="app-shell">
          <header className="app-header">
            {subpage ? (
              <button
                className="icon-button"
                aria-label={t("Назад", "Back")}
                onClick={goBack}
              >
                <ArrowLeft />
              </button>
            ) : (
              <button
                className="brand"
                onClick={() => {
                  if (wallpaper.url) setBackgroundOnly(true);
                  else go("home");
                }}
              >
                <img src={appIcon} alt="" />
                veirune
              </button>
            )}
            <button
              className="icon-button refresh"
              aria-label={t("Обновить данные", "Refresh")}
              onClick={() =>
                void run(async () => {
                  await syncCloud();
                  invalidateRequests();
                  await refreshLibrary();
                })
              }
            >
              <RefreshCw size={18} />
            </button>
          </header>
          {syncStatus === "offline" && (
            <div className="connection-banner" role="status">
              {t(
                "Не удалось синхронизировать настройки",
                "Settings could not be synced",
              )}
            </div>
          )}
          <main key={`${page}:${detailId || 0}`}>
            <UpdateNotice />
            {page === "home" ? (
              <Home />
            ) : page === "search" ? (
              <SearchPage />
            ) : page === "library" ? (
              <Library />
            ) : page === "messages" ? (
              <Messages />
            ) : page === "profile" ? (
              <Profile />
            ) : page === "settings" ? (
              <Settings />
            ) : page === "statistics" ? (
              <Statistics />
            ) : page === "leaderboard" ? (
              <Leaderboard />
            ) : page === "playlist" ? (
              <PlaylistPage />
            ) : page === "artist" ? (
              <ArtistPage />
            ) : page === "track" ? (
              <TrackPage />
            ) : page === "following" ? (
              <Following />
            ) : page === "dislikes" ? (
              <Dislikes />
            ) : page === "offline" ? (
              <Offline />
            ) : page === "queue" ? (
              <Queue />
            ) : page === "imports" ? (
              <Imports />
            ) : null}
          </main>
          <MiniPlayer />
          <nav className="bottom-nav" aria-label={t("Навигация", "Navigation")}>
            {nav.map(([target, Icon, ru, en]) => (
              <button
                key={target}
                aria-current={page === target ? "page" : undefined}
                onClick={() => go(target, null, true)}
              >
                <Icon size={22} />
                <span>{t(ru, en)}</span>
              </button>
            ))}
          </nav>
          {expanded && <FullPlayer />}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {pairing && <PhonePairing {...pairing} onClose={closePairing} />}
      <UpdateSheet />
      {me && shareRequest && (
        <ShareMusic
          {...shareRequest}
          onClose={() => useApp.setState({ shareRequest: null })}
        />
      )}
      {preview && <span className="preview-badge">PREVIEW</span>}
    </>
  );
}
