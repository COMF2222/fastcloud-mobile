import { useState } from "react";
import { Download, ArrowUpCircle } from "lucide-react";
import { native, nativePlatform } from "./native";
import { useCloud } from "./cloud";
import { notify, run } from "./state";
import { Sheet, useText } from "./ui";
import { useUpdates, checkUpdates } from "./updates";
export function UpdateNotice() {
  const t = useText(),
    status = useUpdates((state) => state.status);
  if (!status.release) return null;
  return (
    <button
      className="update-notice"
      onClick={() => useUpdates.setState({ open: true })}
    >
      <ArrowUpCircle size={20} />
      <span>
        {status.phase === "ready"
          ? t("Обновление готово к установке", "Update ready to install")
          : t("Доступно обновление", "Update available")}
        <small>Veirune {status.release.version}</small>
      </span>
      <strong>{t("Открыть", "View")}</strong>
    </button>
  );
}
export function UpdateSettings() {
  const t = useText(),
    status = useUpdates((state) => state.status),
    checking = useUpdates((state) => state.checking);
  return (
    <section className="settings-card">
      <h2>{t("О приложении", "About")}</h2>
      <div className="account-line">
        <strong>Veirune {status.currentVersion}</strong>
        <button disabled={checking} onClick={() => void checkUpdates(true)}>
          {checking
            ? t("Проверяем…", "Checking…")
            : t("Проверить обновления", "Check for updates")}
        </button>
      </div>
      {status.release ? (
        <button onClick={() => useUpdates.setState({ open: true })}>
          {t("Посмотреть обновление", "View update")} · {status.release.version}
        </button>
      ) : status.supported ? (
        <small>
          {t("Новая версия появится здесь", "New versions will appear here")}
        </small>
      ) : (
        <small>
          {t(
            "Обновления iPhone будут доступны через App Store. Сейчас установлена тестовая сборка.",
            "iPhone updates will be available through the App Store. This is a test build.",
          )}
        </small>
      )}
      {status.error && (
        <p role="status" className="error">
          {status.error}
        </p>
      )}
    </section>
  );
}
export function UpdateSheet() {
  const t = useText(),
    english =
      useCloud((state) => state.cloud.preferences.language) === "English";
  const state = useUpdates(),
    [busy, setBusy] = useState(false),
    status = state.status;
  if (!state.open || !status.release) return null;
  const release = status.release,
    close = () => useUpdates.setState({ open: false });
  const install = () => {
    setBusy(true);
    void run(async () => {
      const result = await native.updatesInstall();
      if (result.needsPermission)
        notify(
          t(
            "Разреши Veirune устанавливать обновления, затем вернись и нажми «Установить».",
            "Allow Veirune to install updates, then return and tap Install.",
          ),
        );
    }).finally(async () => {
      try {
        useUpdates.setState({ status: await native.updatesStatus() });
      } catch {}
      setBusy(false);
    });
  };
  const download = () => {
    setBusy(true);
    useUpdates.setState((current) => ({
      status: {
        ...current.status,
        phase: "downloading",
        received: 0,
        total: release.bytes || 0,
        error: "",
      },
    }));
    void native
      .updatesDownload()
      .then((status) => useUpdates.setState({ status }))
      .catch(async (cause) => {
        try {
          useUpdates.setState({ status: await native.updatesStatus() });
        } catch {
          useUpdates.setState((current) => ({
            status: {
              ...current.status,
              phase: "available",
              error: String(cause),
            },
          }));
        }
      })
      .finally(() => setBusy(false));
  };
  return (
    <Sheet title={`Veirune ${release.version}`} onClose={close}>
      <p>{t("Что нового", "What's new")}</p>
      <ul className="release-notes">
        {(english ? release.notes?.en : release.notes?.ru)?.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {status.compatible === false ? (
        <p>
          {t(
            "Эта тестовая сборка не поддерживает установку официального обновления поверх неё. Установи официальную версию вручную.",
            "This test build cannot install the official update over itself. Install the official version manually.",
          )}
        </p>
      ) : release.storeUrl ? (
        <button
          className="primary"
          disabled={busy || !nativePlatform}
          onClick={install}
        >
          {t("Открыть App Store", "Open App Store")}
        </button>
      ) : status.phase === "downloading" ? (
        <>
          <progress
            className="update-progress"
            value={status.received}
            max={Math.max(1, status.total)}
          />
          <p role="status">
            {t("Скачиваем обновление", "Downloading update")} ·{" "}
            {Math.floor((status.received / Math.max(1, status.total)) * 100)}%
          </p>
          <button onClick={() => void native.updatesCancel()}>
            {t("Отменить", "Cancel")}
          </button>
        </>
      ) : status.phase === "ready" ? (
        <button
          className="primary"
          disabled={busy || !nativePlatform}
          onClick={install}
        >
          {t("Установить обновление", "Install update")}
        </button>
      ) : (
        <button
          className="primary"
          disabled={busy || !nativePlatform}
          onClick={download}
        >
          <Download size={18} />
          {t("Скачать обновление", "Download update")}
          {release.bytes
            ? ` · ${(release.bytes / 1024 / 1024).toFixed(1)} MB`
            : ""}
        </button>
      )}
      {status.error && (
        <p className="error" role="alert">
          {status.error}
        </p>
      )}
    </Sheet>
  );
}
