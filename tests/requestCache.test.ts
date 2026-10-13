import test from "node:test";
import assert from "node:assert/strict";
import { RequestCache } from "../src/requestCache.ts";
test("simultaneous reads share one request and cache callers cannot mutate each other", async () => {
  const cache = new RequestCache();
  let calls = 0;
  const load = async () => {
    calls++;
    return { tracks: [1, 2] };
  };
  const [a, b] = await Promise.all([
    cache.read("songs", 10000, load),
    cache.read("songs", 10000, load),
  ]);
  a.tracks.push(3);
  assert.deepEqual(b.tracks, [1, 2]);
  assert.deepEqual((await cache.read("songs", 10000, load)).tracks, [1, 2]);
  assert.equal(calls, 1);
});
test("account changes discard late results and mutations invalidate cached reads", async () => {
  const cache = new RequestCache();
  let resolve!: (value: string) => void;
  const pending = cache.read(
    "me",
    10000,
    () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  );
  cache.clear();
  resolve("old account");
  await assert.rejects(pending, /replaced/);
  assert.equal(
    await cache.read("me", 10000, async () => "new account"),
    "new account",
  );
  cache.clear();
  assert.equal(await cache.read("me", 10000, async () => "changed"), "changed");
});
