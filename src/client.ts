import { native, nativePlatform, preview, server } from "./native";
import {
  normalize,
  urn,
  type Track,
  type Playlist,
  type User,
  type Cloud,
} from "./types";
import { demoRequest } from "./demo";
import { collect } from "./pagination";
import { collectionItems } from "./collectionItems";
import { RequestCache } from "./requestCache";
const requests = new RequestCache();
let requestAccount = 0;
export function setRequestAccount(id: number) {
  if (requestAccount !== id) {
    requestAccount = id;
    requests.clear();
  }
}
export const invalidateRequests = () => requests.invalidate();
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (method !== "GET") {
    const result = await loadRequest<T>(path, method, body);
    requests.invalidate();
    return result;
  }
  const ttl = path.startsWith("/v1/soundcloud/api/") ? 20000 : 0;
  return requests.read(`${requestAccount}:${path}`, ttl, () =>
    loadRequest<T>(path, method, body),
  );
}
async function loadRequest<T>(
  path: string,
  method: string,
  body?: unknown,
): Promise<T> {
  if (!path.startsWith("/v1/") || path.includes("..") || path.includes("://"))
    throw Error("Invalid request path");
  if (preview) return demoRequest(path, method, body) as Promise<T>;
  const response = nativePlatform
    ? await native.request({ path, method, body })
    : await fetch("/broker" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Fastcloud-Preferences": "2",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, data: await r.json() }));
  if (response.status < 200 || response.status >= 300) {
    const data = response.data as { error?: string; message?: string };
    throw new ApiError(
      response.status,
      data?.error || data?.message || `HTTP ${response.status}`,
    );
  }
  return normalize<T>(response.data);
}
export const sc = <T>(path: string, method = "GET", body?: unknown) =>
  request<T>("/v1/soundcloud/api" + path, method, body);
export async function collection<T>(
  path: string,
  maximum = 5000,
): Promise<T[]> {
  const rows = await collect<T>(path, (next) => sc(next), maximum);
  const route = path.split("?")[0];
  const kind = /\/comments$/.test(route)
    ? "comments"
    : /(?:^|\/)tracks$|^\/tracks|^\/tracks\/[^/]+\/related$/.test(route)
      ? "tracks"
      : /(?:^|\/)playlists$|^\/playlists/.test(route)
        ? "playlists"
        : "users";
  return collectionItems(rows, kind) as T[];
}
export const api = {
  me: () => sc<User>("/me"),
  personal: () => request<Cloud>("/v1/me/personal"),
  patch: (body: unknown) => request<Cloud>("/v1/me/personal", "POST", body),
  likes: () =>
    collection<Track>(
      "/me/likes/tracks?limit=200&access=playable,preview,blocked",
    ),
  history: () =>
    collection<Track>(
      "/me/recently-played/tracks?access=playable,preview,blocked",
      25,
    ),
  feed: () =>
    collection<Track>(
      "/me/followings/tracks?limit=100&access=playable,preview",
      100,
    ),
  playlists: () =>
    collection<Playlist>("/me/playlists?limit=200&show_tracks=false"),
  likedPlaylists: () => collection<Playlist>("/me/likes/playlists?limit=200"),
  following: () => collection<User>("/me/followings?limit=200"),
  track: (id: number) => sc<Track>(`/tracks/${urn("tracks", id)}`),
  user: (id: number) => sc<User>(`/users/${urn("users", id)}`),
  playlist: async (id: number) => {
    const [list, tracks] = await Promise.all([
      sc<Playlist>(`/playlists/${urn("playlists", id)}?show_tracks=true`),
      collection<Track>(`/playlists/${urn("playlists", id)}/tracks?limit=200`),
    ]);
    return { ...list, tracks };
  },
  userTracks: (id: number) =>
    collection<Track>(
      `/users/${urn("users", id)}/tracks?limit=200&access=playable,preview`,
    ),
  userPlaylists: (id: number) =>
    collection<Playlist>(`/users/${urn("users", id)}/playlists?limit=200`),
  related: (id: number) =>
    collection<Track>(
      `/tracks/${urn("tracks", id)}/related?limit=50&access=playable,preview`,
      50,
    ),
  search: (query: string, kind = "tracks") =>
    collection<Track | Playlist | User>(
      `/${kind}?q=${encodeURIComponent(query)}&limit=50${kind === "tracks" ? "&access=playable,preview" : ""}`,
      50,
    ),
  like: (id: number, active: boolean) =>
    sc(`/likes/tracks/${urn("tracks", id)}`, active ? "POST" : "DELETE"),
  likePlaylist: (id: number, active: boolean) =>
    sc(`/likes/playlists/${urn("playlists", id)}`, active ? "POST" : "DELETE"),
  follow: (id: number, active: boolean) =>
    sc(`/me/followings/${urn("users", id)}`, active ? "PUT" : "DELETE"),
  repost: (kind: "tracks" | "playlists", id: number, active: boolean) =>
    sc(`/reposts/${kind}/${urn(kind, id)}`, active ? "POST" : "DELETE"),
  createPlaylist: (title: string, ids: number[] = []) =>
    sc<Playlist>("/playlists", "POST", {
      playlist: {
        title,
        sharing: "private",
        tracks: ids.map((id) => ({ urn: `soundcloud:tracks:${id}` })),
      },
    }),
  editPlaylist: (list: Playlist, ids: number[], title?: string) =>
    sc<Playlist>(`/playlists/${urn("playlists", list.id)}`, "PUT", {
      playlist: {
        ...(title ? { title } : {}),
        tracks: ids.map((id) => ({ urn: `soundcloud:tracks:${id}` })),
      },
    }),
  deletePlaylist: (id: number) =>
    sc(`/playlists/${urn("playlists", id)}`, "DELETE"),
  comments: (id: number) =>
    collection<{ id: number; body: string; user?: User }>(
      `/tracks/${urn("tracks", id)}/comments?limit=200`,
    ),
  comment: (id: number, body: string, timestamp_ms?: number) =>
    sc(`/tracks/${urn("tracks", id)}/comments`, "POST", {
      comment: {
        body,
        ...(timestamp_ms === undefined ? {} : { timestamp_ms }),
      },
    }),
  resolve: (url: string) =>
    sc<Track | Playlist | User>(`/resolve?url=${encodeURIComponent(url)}`),
  chat: <T>(path: string, method = "GET", body?: unknown) =>
    request<T>("/v1/chat/" + path, method, body),
  leaderboard: (days = 7, sort = "time") =>
    request<{
      entries: {
        rank: number;
        name: string | null;
        anonymous: boolean;
        isMe: boolean;
        ms: number;
        plays: number;
        artists: { name: string; ms: number }[];
      }[];
      mine: unknown;
      participants: number;
    }>(`/v1/leaderboard?days=${days}&sort=${sort}`),
};
const imageCache = new Map<string, string>();
const imageFlights = new Map<string, Promise<string>>();
let imageBytes = 0;
export async function artwork(raw: string): Promise<string> {
  if (preview) return raw;
  if (imageCache.has(raw)) return imageCache.get(raw)!;
  if (!/^https:\/\/i[1-4]\.sndcdn\.com\//.test(raw))
    throw Error("Invalid artwork");
  const pending = imageFlights.get(raw);
  if (pending) return pending;
  const load = loadArtwork(raw);
  imageFlights.set(raw, load);
  try {
    return await load;
  } finally {
    imageFlights.delete(raw);
  }
}
async function loadArtwork(raw: string): Promise<string> {
  const response = await native.request({
    path: "/v1/soundcloud/artwork",
    method: "POST",
    body: { url: raw },
    binary: true,
  });
  if (response.status !== 200) throw Error("Artwork unavailable");
  const result = `data:${response.contentType || "image/jpeg"};base64,${response.data}`;
  while (
    imageCache.size &&
    (imageCache.size >= 128 ||
      imageBytes + result.length * 2 > 16 * 1024 * 1024)
  ) {
    const key = imageCache.keys().next().value!;
    imageBytes -= imageCache.get(key)!.length * 2;
    imageCache.delete(key);
  }
  if (result.length * 2 <= 16 * 1024 * 1024) {
    imageCache.set(raw, result);
    imageBytes += result.length * 2;
  }
  return result;
}
export const publicUrl = (path: string) => new URL(path, server).href;
