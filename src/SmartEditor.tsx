import { useState } from "react";
import { change } from "./cloud";
import { run } from "./state";
import { Sheet, useText } from "./ui";
import type { Cloud } from "./types";
export function SmartEditor({
  id,
  initial,
  onClose,
}: {
  id: string;
  initial?: Cloud["smartPlaylists"][string];
  onClose: () => void;
}) {
  const t = useText();
  const [rule, setRule] = useState(
    initial || {
      name: "",
      genre: "",
      addedDays: 0,
      unplayedDays: 0,
      limit: 50,
    },
  );
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title={t("Умная подборка", "Smart playlist")} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          void run(async () => {
            if (!rule.name.trim())
              throw Error(t("Укажи название", "Enter a name"));
            await change("smartPlaylists", id || crypto.randomUUID(), {
              ...rule,
              name: rule.name.trim(),
            });
            onClose();
          }).finally(() => setBusy(false));
        }}
      >
        <label>
          {t("Название", "Name")}
          <input
            autoFocus
            required
            maxLength={128}
            value={rule.name}
            onChange={(event) => setRule({ ...rule, name: event.target.value })}
          />
        </label>
        <label>
          {t("Жанр · пусто для всех", "Genre · leave empty for all")}
          <input
            maxLength={48}
            value={rule.genre}
            onChange={(event) =>
              setRule({ ...rule, genre: event.target.value })
            }
          />
        </label>
        <label>
          {t(
            "Добавлены за последние дни · 0 для всех",
            "Added in the last days · 0 for all",
          )}
          <input
            type="number"
            min={0}
            max={365}
            value={rule.addedDays}
            onChange={(event) =>
              setRule({ ...rule, addedDays: Number(event.target.value) })
            }
          />
        </label>
        <label>
          {t("Не слушал дней · 0 для всех", "Not played in days · 0 for all")}
          <input
            type="number"
            min={0}
            max={365}
            value={rule.unplayedDays}
            onChange={(event) =>
              setRule({ ...rule, unplayedDays: Number(event.target.value) })
            }
          />
        </label>
        <label>
          {t("Число треков", "Track limit")}
          <input
            type="number"
            min={1}
            max={500}
            required
            value={rule.limit}
            onChange={(event) =>
              setRule({ ...rule, limit: Number(event.target.value) })
            }
          />
        </label>
        <button className="primary" disabled={busy}>
          {t("Сохранить", "Save")}
        </button>
        {id && (
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void run(async () => {
                await change("smartPlaylists", id, null);
                onClose();
              }).finally(() => setBusy(false));
            }}
          >
            {t("Удалить подборку", "Delete playlist")}
          </button>
        )}
      </form>
    </Sheet>
  );
}
