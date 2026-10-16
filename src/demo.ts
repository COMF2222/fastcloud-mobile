import { emptyCloud, type Track, type Playlist } from "./types";
export const demoTracks: Track[] = Array.from({ length: 12 }, (_, index) => ({
  id: 1000 + index,
  title: [
    "October",
    "White Wine",
    "Northern Lights",
    "Sunset Drive",
    "Origami",
    "Afterglow",
  ][index % 6],
  duration: 180000 + index * 8000,
  user: {
    id: (index % 4) + 1,
    username: ["Lil Peep", "CUPSIZE", "JESUS", "Luna"][index % 4],
  },
  genre: ["Hip-hop & Rap", "Alternative Rock", "Ambient", "Electronic"][
    index % 4
  ],
}));
export const demoPlaylists: Playlist[] = [
  {
    id: 2001,
    title: "Поздний вечер",
    track_count: 12,
    tracks: demoTracks,
    user: { id: 1, username: "enchanted" },
  },
  {
    id: 2002,
    title: "В дороге",
    track_count: 8,
    tracks: demoTracks.slice(0, 8),
    user: { id: 1, username: "enchanted" },
  },
];
let cloud = emptyCloud();
export async function demoRequest(
  path: string,
  method: string,
  body: unknown,
): Promise<unknown> {
  path = decodeURIComponent(path);
  const route = path.split("?")[0].replace("/v1/soundcloud/api", "");
  const userId = Number(route.match(/^\/users\/soundcloud:users:(\d+)$/)?.[1]);
  if (userId)
    return {
      id: userId,
      username:
        ["Lil Peep", "CUPSIZE", "JESUS", "Luna"][userId - 1] || "Artist",
    };
  const tracksUser = Number(
    route.match(/^\/users\/soundcloud:users:(\d+)\/tracks$/)?.[1],
  );
  if (tracksUser)
    return {
      collection: demoTracks.filter((track) => track.user?.id === tracksUser),
    };
  if (/^\/users\/soundcloud:users:\d+\/(likes|reposts)\/tracks$/.test(route))
    return { collection: demoTracks.slice(2, 5).map((track) => ({ track })) };
  if (/^\/users\/soundcloud:users:\d+\/reposts\/playlists$/.test(route))
    return { collection: [{ playlist: demoPlaylists[1] }] };
  const listsUser = Number(
    route.match(/^\/users\/soundcloud:users:(\d+)\/playlists$/)?.[1],
  );
  if (listsUser)
    return {
      collection: [
        {
          ...demoPlaylists[0],
          user: {
            id: listsUser,
            username:
              ["Lil Peep", "CUPSIZE", "JESUS", "Luna"][listsUser - 1] ||
              "Artist",
          },
        },
        {
          ...demoPlaylists[1],
          id: 2101,
          title: "Evening Tapes",
          is_album: true,
          playlist_type: "album",
          user: {
            id: listsUser,
            username:
              ["Lil Peep", "CUPSIZE", "JESUS", "Luna"][listsUser - 1] ||
              "Artist",
          },
        },
      ],
    };
  if (route.endsWith("/comments"))
    return {
      collection: [
        {
          id: 5001,
          body: "Love this track",
          user: { id: 2, username: "harlow2k" },
        },
      ],
    };
  const trackId = Number(
    route.match(/^\/tracks\/soundcloud:tracks:(\d+)$/)?.[1],
  );
  if (trackId)
    return demoTracks.find((track) => track.id === trackId) || demoTracks[0];
  if (path.includes("/playlists/") && path.includes("/tracks"))
    return { collection: demoTracks };
  if (path === "/v1/me/personal") {
    if (method === "POST") {
      const patch = body as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(patch))
        if (key in cloud && key !== "stats")
          Object.assign(cloud[key as keyof typeof cloud], value);
    }
    return structuredClone(cloud);
  }
  if (path.includes("/leaderboard"))
    return {
      entries: [
        {
          rank: 1,
          name: "enchanted",
          isMe: true,
          anonymous: false,
          ms: 12345678,
          plays: 128,
          artists: [{ name: "Lil Peep", ms: 6000000 }],
        },
      ],
      participants: 1,
    };
  if (path === "/v1/soundcloud/api/me") return { id: 1, username: "enchanted" };
  if (path.includes("/chat/activate")) return { id: 1 };
  if (path.includes("/chat/inbox"))
    return { conversations: [], unread: 0, meId: 1 };
  if (path.includes("/chat/contacts"))
    return {
      contacts: [{ id: 2, username: "harlow2k" }],
      blocked: [],
      degraded: false,
    };
  if (path === "/v1/chat/threads" && method === "POST")
    return {
      id: 1,
      peer: {
        id: 2,
        username: "harlow2k",
        avatarUrl: null,
        permalinkUrl: null,
      },
    };
  if (path.includes("/chat/threads/1/messages")) {
    if (method === "POST") {
      const value = body as {
        text: string;
        nonce: string;
        attachment?: { kind: string; id: number };
      };
      return {
        id: Date.now(),
        threadId: 1,
        senderId: 1,
        text: value.text,
        nonce: value.nonce,
        attachment: null,
        createdAt: Date.now(),
      };
    }
    return {
      messages: [],
      peer: {
        id: 2,
        username: "harlow2k",
        avatarUrl: null,
        permalinkUrl: null,
      },
      hasMore: false,
      peerReadId: 0,
      blocked: false,
      canSend: true,
    };
  }
  if (path.includes("/chat/threads/1/read")) return {};
  if (path === "/v1/mobile/lyrics")
    return {
      id: 1,
      trackName: "Preview",
      artistName: "Preview",
      plainLyrics:
        "A quiet road beneath the stars\nA new day waiting where we are",
      syncedLyrics:
        "[00:00.00]A quiet road beneath the stars\n[00:10.00]A new day waiting where we are",
      instrumental: false,
    };
  if (path.includes("playlists/")) return demoPlaylists[0];
  if (path.includes("playlists")) return { collection: demoPlaylists };
  if (
    path.includes("users") ||
    (path.includes("followings") && !path.includes("tracks"))
  )
    return {
      collection: [
        { id: 2, username: "harlow2k" },
        { id: 3, username: "Luna" },
      ],
    };
  if (path.includes("/tracks/") && !path.includes("/related"))
    return demoTracks[0];
  return { collection: demoTracks };
}
