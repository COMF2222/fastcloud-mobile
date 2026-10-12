import { useEffect, useRef, useState } from "react";
import { Send, Plus, ArrowLeft, MoreHorizontal, Music2 } from "lucide-react";
import { api } from "./client";
import { change, useCloud } from "./cloud";
import { useApp, run, notify } from "./state";
import { play } from "./player";
import {
  RemoteImage,
  Status,
  Empty,
  Sheet,
  TrackList,
  useResource,
  useText,
} from "./ui";
import {
  messageNonce,
  mergeChatMessages,
  type ChatContacts,
  type ChatInbox,
  type ChatPage,
  type ChatMessage,
  type ChatPerson,
} from "./chatTypes";

export function Messages() {
  const t = useText();
  const me = useApp((s) => s.me);
  const [revision, setRevision] = useState(0),
    [thread, setThread] = useState<{ id: number; peer: ChatPerson } | null>(
      null,
    ),
    [people, setPeople] = useState(false);
  const inbox = useResource(() => api.chat<ChatInbox>("inbox"), [revision]);
  const contacts = useResource(
    () => api.chat<ChatContacts>("contacts"),
    [revision],
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRevision((v) => v + 1);
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  if (thread)
    return (
      <Conversation
        key={thread.id}
        id={thread.id}
        peer={thread.peer}
        meId={me!.id}
        onClose={() => {
          setThread(null);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <>
      <div className="page-heading">
        <h1>{t("Сообщения", "Messages")}</h1>
        <button
          className="icon-button"
          aria-label={t("Новый диалог", "New conversation")}
          onClick={() => setPeople(true)}
        >
          <Plus />
        </button>
      </div>
      <p className="muted">
        {t(
          "Общайтесь с взаимными подписчиками SoundCloud.",
          "Chat with your mutual SoundCloud followers.",
        )}
      </p>
      <Status error={inbox.error} loading={inbox.loading} />
      <div className="conversation-list">
        {inbox.value?.conversations.map((row) => (
          <button
            key={row.id}
            onClick={() => setThread({ id: row.id, peer: row.peer })}
          >
            <RemoteImage src={row.peer.avatarUrl} className="avatar" />
            <span>
              <strong>{row.peer.username}</strong>
              <small>
                {row.lastMessage?.text ||
                  row.lastMessage?.attachment?.title ||
                  t("Начать общение", "Start chatting")}
              </small>
            </span>
            {row.unread > 0 && <b className="badge">{row.unread}</b>}
          </button>
        ))}
      </div>
      {!inbox.loading && !inbox.value?.conversations.length && (
        <Empty>
          {t(
            "Здесь появятся твои диалоги",
            "Your conversations will appear here",
          )}
        </Empty>
      )}
      {people && (
        <Sheet
          title={t("Новый диалог", "New conversation")}
          onClose={() => setPeople(false)}
        >
          <Status error={contacts.error} loading={contacts.loading} />
          <div className="user-list">
            {contacts.value?.contacts.map((person) => (
              <button
                key={person.id}
                onClick={() =>
                  void run(async () => {
                    const value = await api.chat<{
                      id: number;
                      peer: ChatPerson;
                    }>("threads", "POST", { peerId: person.id });
                    setThread(value);
                    setPeople(false);
                  })
                }
              >
                <RemoteImage src={person.avatarUrl} className="avatar" />
                {person.username}
              </button>
            ))}
          </div>
          {!contacts.loading && !contacts.value?.contacts.length && (
            <Empty>
              {t(
                "Пока нет доступных взаимных подписчиков",
                "No mutual followers are available yet",
              )}
            </Empty>
          )}
        </Sheet>
      )}
    </>
  );
}

function Conversation({
  id,
  peer,
  meId,
  onClose,
}: {
  id: number;
  peer: ChatPerson;
  meId: number;
  onClose: () => void;
}) {
  const t = useText();
  const [messages, setMessages] = useState<ChatMessage[]>([]),
    [text, setText] = useState(""),
    [pending, setPending] = useState<{
      text: string;
      nonce: string;
      attachment: { kind: string; id: number } | null;
    } | null>(null),
    [error, setError] = useState(""),
    [canSend, setCanSend] = useState(true),
    [more, setMore] = useState(false),
    [actions, setActions] = useState(false),
    [attach, setAttach] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    tail = useRef<HTMLDivElement>(null);
  const likes = useApp((s) => s.likes),
    lists = useApp((s) => s.playlists);
  const lastId = useRef(0),
    alive = useRef(true),
    loading = useRef(false);
  const load = async (before = 0) => {
    if (loading.current) return;
    loading.current = true;
    const initial = lastId.current === 0;
    try {
      const data = await api.chat<ChatPage>(
        `threads/${id}/messages?${before ? "before=" + before : "after=" + lastId.current}`,
      );
      if (!alive.current) return;
      setMessages((current) => mergeChatMessages(current, data.messages));
      if (initial || before) setMore(data.hasMore);
      setCanSend(data.canSend);
      if (data.messages.length && !before) {
        lastId.current = Math.max(
          lastId.current,
          ...data.messages.map((m) => m.id),
        );
        await api.chat(`threads/${id}/read`, "POST", {
          through: lastId.current,
        });
      }
      setError("");
    } catch (e) {
      if (alive.current) setError(String(e));
    } finally {
      loading.current = false;
    }
  };
  useEffect(() => {
    alive.current = true;
    lastId.current = 0;
    setMessages([]);
    void load();
    const focus = setTimeout(() => input.current?.focus(), 150);
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 4000);
    return () => {
      alive.current = false;
      clearTimeout(focus);
      clearInterval(timer);
    };
  }, [id]);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "end" });
  }, [messages[messages.length - 1]?.id]);
  const send = async (
    attachment: { kind: string; id: number } | null = null,
  ) => {
    if (!canSend || pending || (!text.trim() && !attachment)) return;
    const payload = { text: text.trim(), nonce: messageNonce(), attachment };
    setPending(payload);
    try {
      const received = await api.chat<ChatMessage>(
        `threads/${id}/messages`,
        "POST",
        payload,
      );
      if (!alive.current) return;
      setMessages((current) => mergeChatMessages(current, [received]));
      setText("");
      setPending(null);
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      input.current?.focus();
    }
  };
  return (
    <div className="chat-screen">
      <header className="chat-heading">
        <button
          className="icon-button"
          aria-label={t("Назад", "Back")}
          onClick={onClose}
        >
          <ArrowLeft />
        </button>
        <RemoteImage src={peer.avatarUrl} className="avatar" />
        <strong>{peer.username}</strong>
        <button
          className="icon-button"
          aria-label={t("Действия", "Actions")}
          onClick={() => setActions(true)}
        >
          <MoreHorizontal />
        </button>
      </header>
      <div className="chat-messages">
        {more && (
          <button
            className="text-button"
            onClick={() => void load(messages[0]?.id)}
          >
            {t("Предыдущие сообщения", "Older messages")}
          </button>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              "message-bubble " + (message.senderId === meId ? "mine" : "")
            }
          >
            <p>{message.text}</p>
            {message.attachment && (
              <button
                className="message-attachment"
                onClick={() =>
                  void run(async () => {
                    const a = message.attachment!;
                    if (a.kind === "track") await play([await api.track(a.id)]);
                    else {
                      const list = await api.playlist(a.id);
                      await play(list.tracks || []);
                    }
                  })
                }
              >
                <Music2 size={20} />
                <span>{message.attachment.title}</span>
              </button>
            )}
            <time>
              {new Date(message.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          </div>
        ))}
        <div ref={tail} />
      </div>
      {error && (
        <div className="error-card" role="alert">
          {error}
          {pending && (
            <button
              onClick={() =>
                void run(async () => {
                  const received = await api.chat<ChatMessage>(
                    `threads/${id}/messages`,
                    "POST",
                    pending,
                  );
                  setMessages((current) =>
                    mergeChatMessages(current, [received]),
                  );
                  setText("");
                  setPending(null);
                  setError("");
                  input.current?.focus();
                })
              }
            >
              {t("Повторить отправку", "Retry sending")}
            </button>
          )}
        </div>
      )}
      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <button
          type="button"
          className="icon-button"
          disabled={!canSend}
          aria-label={t("Прикрепить музыку", "Attach music")}
          onClick={() => setAttach(true)}
        >
          <Plus />
        </button>
        <textarea
          aria-label={t("Сообщение", "Message")}
          ref={input}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("Напиши сообщение", "Write a message")}
          disabled={!canSend}
          rows={1}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          className="icon-button send-button"
          disabled={!canSend || !!pending || !text.trim()}
          aria-label={t("Отправить", "Send")}
        >
          <Send size={22} />
        </button>
      </form>
      {attach && (
        <Sheet
          title={t("Поделиться музыкой", "Share music")}
          onClose={() => setAttach(false)}
        >
          <div className="menu-list">
            {likes.slice(0, 30).map((track) => (
              <button
                key={track.id}
                onClick={() => {
                  setAttach(false);
                  void send({ kind: "track", id: track.id });
                }}
              >
                {track.title}
              </button>
            ))}
            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => {
                  setAttach(false);
                  void send({ kind: "playlist", id: list.id });
                }}
              >
                {list.title}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {actions && (
        <Sheet title={peer.username} onClose={() => setActions(false)}>
          <div className="menu-list">
            <button
              onClick={() =>
                void run(async () => {
                  await api.chat(`threads/${id}/archive`, "POST", {});
                  onClose();
                })
              }
            >
              {t("Убрать из списка", "Archive conversation")}
            </button>
            <button
              className="danger"
              onClick={() =>
                void run(async () => {
                  await api.chat("block", "POST", {
                    peerId: peer.id,
                    blocked: true,
                  });
                  onClose();
                })
              }
            >
              {t("Заблокировать", "Block")}
            </button>
            <button
              className="danger"
              onClick={() =>
                void run(async () => {
                  await api.chat(`threads/${id}/report`, "POST", {
                    reason: "spam",
                  });
                  notify(t("Жалоба отправлена", "Report sent"));
                  setActions(false);
                })
              }
            >
              {t("Пожаловаться", "Report")}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

export function Statistics() {
  const t = useText(),
    cloud = useCloud((s) => s.cloud);
  const [days, setDays] = useState(30);
  const cutoff = days ? Date.now() / 1000 - days * 86400 : 0;
  const daily = cloud.daily.filter(
    (row) => !days || new Date(row.day).getTime() / 1000 >= cutoff,
  );
  const ms = days
    ? daily.reduce((sum, row) => sum + row.ms, 0)
    : cloud.totals.ms;
  const plays = days
    ? daily.reduce((sum, row) => sum + row.plays, 0)
    : cloud.totals.plays;
  const artists = new Map<string, { name: string; ms: number }>();
  for (const row of cloud.tracks) {
    const name = row.artist.replace(/^[\p{S}\s]+|[\p{S}\s]+$/gu, "").trim();
    const key = name.normalize("NFKC").toLocaleLowerCase();
    const value = artists.get(key) || { name, ms: 0 };
    value.ms += row.ms;
    artists.set(key, value);
  }
  const ranked = [...artists.values()].sort((a, b) => b.ms - a.ms).slice(0, 10);
  const max = Math.max(1, ...daily.map((row) => row.ms));
  return (
    <>
      <h1>{t("Моя статистика", "My statistics")}</h1>
      <div className="chips">
        {[7, 30, 0].map((value) => (
          <button
            key={value}
            aria-pressed={days === value}
            onClick={() => setDays(value)}
          >
            {value
              ? `${value} ${t("дней", "days")}`
              : t("Всё время", "All time")}
          </button>
        ))}
      </div>
      <div className="stats-summary">
        <div>
          <strong>
            {Math.floor(ms / 3600000)}
            <small>{t("ч", "h")}</small> {Math.floor(ms / 60000) % 60}
            <small>{t("мин", "min")}</small>
          </strong>
          <p>{t("с музыкой", "with music")}</p>
        </div>
        <div>
          <strong>{plays}</strong>
          <p>{t("прослушиваний", "listens")}</p>
        </div>
      </div>
      <section
        className="stats-chart"
        aria-label={t("Время прослушивания по дням", "Listening time by day")}
      >
        {daily.slice(-30).map((row) => (
          <div
            key={row.day}
            title={`${row.day}: ${Math.round(row.ms / 60000)} ${t("мин", "min")}`}
          >
            <span style={{ height: `${Math.max(2, (row.ms / max) * 100)}%` }} />
          </div>
        ))}
      </section>
      <h2>
        {t("Любимые исполнители · всё время", "Favourite artists · all time")}
      </h2>
      <div className="ranking-list">
        {ranked.map((row, i) => (
          <div key={row.name}>
            <small>{i + 1}</small>
            <strong>{row.name}</strong>
            <span>
              {Math.floor(row.ms / 3600000)} {t("ч", "h")}{" "}
              {Math.floor(row.ms / 60000) % 60} {t("мин", "min")}
            </span>
          </div>
        ))}
      </div>
      <h2>{t("Любимые треки · всё время", "Favourite tracks · all time")}</h2>
      <TrackList
        tracks={[...cloud.tracks]
          .sort((a, b) => b.ms - a.ms)
          .slice(0, 10)
          .map((row) => ({
            id: row.trackId,
            title: row.title,
            metadata_artist: row.artist,
            genre: row.genre,
          }))}
      />
    </>
  );
}

export function Leaderboard() {
  const t = useText();
  const [days, setDays] = useState(7),
    [sort, setSort] = useState("time");
  const data = useResource(() => api.leaderboard(days, sort), [days, sort]);
  const anonymous =
    useCloud((s) => s.cloud.preferences.leaderboard_anonymous) !== false;
  return (
    <>
      <p className="eyebrow">VEIRUNE COMMUNITY</p>
      <h1>{t("Кто больше слушает", "Who listens the most")}</h1>
      <p className="muted">
        {t(
          "Музыка объединяет. Найди своё место в топе.",
          "Music brings us together. Find your place in the chart.",
        )}
      </p>
      <button
        className="privacy-banner"
        onClick={() =>
          void run(() =>
            change("preferences", "leaderboard_anonymous", !anonymous),
          )
        }
      >
        {anonymous
          ? t(
              "Ты в топе анонимно. Показать имя →",
              "You appear anonymously. Show your name →",
            )
          : t("Твоё имя видно. Скрыть →", "Your name is visible. Hide it →")}
      </button>
      <div className="chips">
        {[7, 30, 0].map((value) => (
          <button
            key={value}
            aria-pressed={days === value}
            onClick={() => setDays(value)}
          >
            {value
              ? `${value} ${t("дней", "days")}`
              : t("Всё время", "All time")}
          </button>
        ))}
      </div>
      <div className="chips">
        {[
          ["time", "По часам", "By hours"],
          ["plays", "По трекам", "By listens"],
        ].map((row) => (
          <button
            key={row[0]}
            aria-pressed={sort === row[0]}
            onClick={() => setSort(row[0])}
          >
            {t(row[1], row[2])}
          </button>
        ))}
      </div>
      <Status error={data.error} loading={data.loading} />
      <div className="leaderboard">
        {data.value?.entries.map((row) => (
          <div
            className={"leaderboard-row " + (row.isMe ? "me" : "")}
            key={row.rank}
          >
            <strong className="rank">{row.rank}</strong>
            <span>
              <strong>
                {row.anonymous ? t("Аноним", "Anonymous") : row.name}
                {row.isMe ? " · " + t("ты", "you") : ""}
              </strong>
              <small>{row.artists.map((a) => a.name).join(", ")}</small>
            </span>
            <div>
              <b>
                {Math.floor(row.ms / 3600000)} {t("ч", "h")}
              </b>
              <small>
                {row.plays} {t("треков", "listens")}
              </small>
            </div>
          </div>
        ))}
      </div>
      {!data.loading && !data.value?.entries.length && (
        <Empty>
          {t(
            "Послушай музыку, чтобы появиться в топе",
            "Listen to some music to join the chart",
          )}
        </Empty>
      )}
    </>
  );
}
