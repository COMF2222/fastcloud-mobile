import { api } from "./client";
import { go, useApp } from "./state";
import { usePlayer } from "./player";
import { artist, type Track, type User } from "./types";
const key = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function openTrack(track: Track) {
  usePlayer.setState({ expanded: false });
  go("track", track);
}
export async function openTrackArtist(track: Track) {
  const name = artist(track);
  if (track.user?.id && key(name) === key(track.user.username)) {
    usePlayer.setState({ expanded: false });
    go("artist", track.user);
    return;
  }
  const owner = useApp.getState().me?.id;
  const users = (await api.search(name, "users")) as User[];
  if (useApp.getState().me?.id !== owner) return;
  const match = users.find((user) => key(user.username) === key(name));
  usePlayer.setState({ expanded: false });
  if (match) go("artist", match);
  else {
    useApp.setState({ searchQuery: name });
    go("search");
  }
}
