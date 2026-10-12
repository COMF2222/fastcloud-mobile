import { useRef, useState } from "react";
import { Share } from "@capacitor/share";
import { api, sc } from "./client";
import { preview } from "./native";
import { messageNonce, type ChatContacts } from "./chatTypes";
import { Sheet, RemoteImage, Status, Empty, useResource, useText } from "./ui";
import { useApp, notify, run } from "./state";
import { urn, type Track, type Playlist } from "./types";
export function ShareMusic({
  item,
  kind,
  onClose,
}: {
  item: Track | Playlist;
  kind: "track" | "playlist";
  onClose: () => void;
}) {
  const t = useText();
  const [inside, setInside] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<{ peerId: number; nonce: string } | null>(null);
  const contacts = useResource(() => api.chat<ChatContacts>("contacts"), []);
  const send = async (peerId: number) => {
    if (busy) return;
    setBusy(true);
    setError("");
    const draft =
      pending.current?.peerId === peerId
        ? pending.current
        : { peerId, nonce: messageNonce() };
    pending.current = draft;
    try {
      const thread = await api.chat<{ id: number }>("threads", "POST", {
        peerId,
      });
      await api.chat(`threads/${thread.id}/messages`, "POST", {
        text: "",
        nonce: draft.nonce,
        attachment: { kind, id: item.id },
      });
      pending.current = null;
      onClose();
      notify(t("Музыка отправлена", "Music shared"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={t("Поделиться музыкой", "Share music")} onClose={onClose}>
      <div className="share-preview">
        <RemoteImage src={item.artwork_url} className="artwork" />
        <strong>{item.title}</strong>
      </div>
      {!inside ? (
        <div className="menu-list">
          <button onClick={() => setInside(true)}>Veirune</button>
          <button
            onClick={() =>
              void run(async () => {
                const url =
                  item.permalink_url ||
                  (
                    await (kind === "track"
                      ? api.track(item.id)
                      : sc<Playlist>(`/playlists/${urn("playlists", item.id)}`))
                  ).permalink_url;
                if (!url)
                  throw Error(t("Ссылка недоступна", "Link unavailable"));
                if (preview) notify(url);
                else
                  await Share.share({
                    title: item.title,
                    url,
                    dialogTitle: "Veirune",
                  });
                onClose();
              })
            }
          >
            {t("Другие приложения", "Other apps")}
          </button>
        </div>
      ) : (
        <>
          <p>{t("Выбери, кому отправить", "Choose who to send it to")}</p>
          <Status loading={contacts.loading} error={contacts.error} />
          <div className="user-list">
            {contacts.value?.contacts.map((person) => (
              <button
                key={person.id}
                disabled={
                  busy ||
                  (!!pending.current && pending.current.peerId !== person.id)
                }
                onClick={() => void send(person.id)}
              >
                <RemoteImage src={person.avatarUrl} className="avatar" />
                {person.username}
              </button>
            ))}
          </div>
          {!contacts.loading &&
            !contacts.error &&
            !contacts.value?.contacts.length && (
              <Empty>
                {t(
                  "Здесь появятся взаимные подписчики, которые пользуются Veirune.",
                  "Your mutual followers who use Veirune will appear here.",
                )}
              </Empty>
            )}
          {error && (
            <div role="alert" className="error-card">
              {error}
              <button
                disabled={busy}
                onClick={() => {
                  if (pending.current) void send(pending.current.peerId);
                }}
              >
                {t("Повторить отправку", "Retry sending")}
              </button>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}
