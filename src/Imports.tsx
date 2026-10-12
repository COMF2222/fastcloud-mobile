import { useEffect, useRef, useState } from "react";
import { FileUp, Play, Pause, Music2 } from "lucide-react";
import { useApp, run, notify, refreshLibrary } from "./state";
import { useText, Sheet, InputDialog } from "./ui";
import {
  parseFiles,
  yandexItems,
  startJournal,
  loadJournal,
  importJournal,
  type Journal,
  type ImportItem,
} from "./importer";
export function Imports() {
  const t = useText();
  const owner = useApp((s) => s.me!.id);
  const [journal, setJournal] = useState<Journal | null>(null),
    [busy, setBusy] = useState(false),
    [yandex, setYandex] = useState(false),
    [title, setTitle] = useState("Spotify"),
    [items, setItems] = useState<ImportItem[] | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    void loadJournal(owner).then(setJournal);
    return () => {
      cancelled.current = true;
    };
  }, [owner]);
  const resume = async (current: Journal) => {
    cancelled.current = false;
    setBusy(true);
    try {
      await importJournal(current, setJournal, () => cancelled.current);
      await refreshLibrary();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <p className="eyebrow">BRING YOUR MUSIC</p>
      <h1>{t("Импорт музыки", "Import music")}</h1>
      <p className="muted">
        {t(
          "Перенеси любимые треки в SoundCloud-плейлист.",
          "Bring your favourite songs into a SoundCloud playlist.",
        )}
      </p>
      <section className="settings-card">
        <h2>Spotify</h2>
        <p>
          {t(
            "Выбери экспорт плейлиста или лайков: CSV, JSON или ZIP.",
            "Choose a playlist or likes export: CSV, JSON or ZIP.",
          )}
        </p>
        <label className="button primary">
          <FileUp size={18} />
          {t("Выбрать файл", "Choose file")}
          <input
            hidden
            multiple
            type="file"
            accept=".csv,.json,.zip"
            disabled={busy}
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              setTitle("Spotify");
              void run(async () => {
                const found = await parseFiles(files);
                if (!found.length)
                  throw Error(
                    t(
                      "В файле не найдено треков",
                      "No tracks found in the file",
                    ),
                  );
                setItems(found);
              });
            }}
          />
        </label>
      </section>
      <section className="settings-card">
        <h2>{t("Яндекс Музыка", "Yandex Music")}</h2>
        <p>
          {t(
            "Лайки из аккаунта или файл экспорта.",
            "Likes from your account or an export file.",
          )}
        </p>
        <button disabled={busy} onClick={() => setYandex(true)}>
          <Music2 size={18} />
          {t("Подключить Яндекс", "Connect Yandex")}
        </button>
        <label className="button">
          <FileUp size={18} />
          {t("Импорт файла", "Import file")}
          <input
            hidden
            multiple
            type="file"
            accept=".csv,.json,.zip"
            disabled={busy}
            onChange={(event) => {
              setTitle(t("Яндекс Музыка", "Yandex Music"));
              void run(async () =>
                setItems(
                  await parseFiles(Array.from(event.target.files || [])),
                ),
              );
            }}
          />
        </label>
      </section>
      {journal && (
        <section className="settings-card">
          <h2>{journal.title}</h2>
          <p>
            {journal.at} / {journal.items.length} · {t("найдено", "matched")}{" "}
            {journal.matched.length}
          </p>
          <progress
            max={Math.max(1, journal.items.length)}
            value={journal.at}
          />
          <p className="muted">
            {t("Не найдено", "Not found")}: {journal.missing.length}
          </p>
          {journal.state === "done" ? (
            <p>
              {t("Импорт завершён", "Import complete")} ·{" "}
              {journal.playlists.length} {t("плейлистов", "playlists")}
            </p>
          ) : (
            <button
              disabled={busy}
              onClick={() => void run(() => resume(journal))}
            >
              <Play size={18} />
              {t("Продолжить", "Resume")}
            </button>
          )}
          {busy && (
            <button
              onClick={() => {
                cancelled.current = true;
              }}
            >
              <Pause size={18} />
              {t("Приостановить", "Pause")}
            </button>
          )}
        </section>
      )}
      {items && (
        <InputDialog
          title={t("Название плейлиста", "Playlist title")}
          initial={title}
          onClose={() => setItems(null)}
          onSubmit={async (name) => {
            const value = await startJournal(owner, name, items);
            setJournal(value);
            setItems(null);
            void run(() => resume(value));
          }}
        />
      )}
      {yandex && (
        <InputDialog
          title={t("Токен Яндекс Музыки", "Yandex Music token")}
          placeholder={t("OAuth-токен", "OAuth token")}
          onClose={() => setYandex(false)}
          onSubmit={async (token) => {
            setBusy(true);
            try {
              setItems(await yandexItems(token));
              setTitle(t("Яндекс Музыка", "Yandex Music"));
              setYandex(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
