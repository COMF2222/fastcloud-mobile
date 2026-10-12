import { test } from "node:test";
import assert from "node:assert/strict";
import { collect } from "../src/pagination.ts";
test("libraries load past the first page and preserve encoded cursors through the relay", async () => {
  const paths: string[] = [];
  const values = await collect<number>(
    "/me/likes/tracks?limit=200",
    async (path) => {
      paths.push(path);
      assert.equal(
        new URL(path, "https://api.soundcloud.com").searchParams.get(
          "linked_partitioning",
        ),
        "true",
      );
      return paths.length === 1
        ? {
            collection: [1, 2],
            next_href: "/v1/soundcloud/api/me/likes/tracks?cursor=a%2Bb",
          }
        : { collection: [3, 4] };
    },
  );
  assert.deepEqual(values, [1, 2, 3, 4]);
  assert.match(paths[1], /cursor=a%2Bb/);
  assert.ok(!paths[1].startsWith("/v1/soundcloud"));
});
test("foreign pagination cannot receive credentials", async () => {
  let calls = 0;
  await assert.rejects(
    collect("/tracks", async () => {
      calls++;
      return { collection: [1], next_href: "https://attacker.example/steal" };
    }),
    /Unexpected pagination/,
  );
  assert.equal(calls, 1);
});
test("repeated cursors and maximum size stop additional requests", async () => {
  let calls = 0;
  const values = await collect(
    "/tracks",
    async () => {
      calls++;
      return { collection: [1, 2, 3], next_href: "/tracks" };
    },
    2,
  );
  assert.deepEqual(values, [1, 2]);
  assert.equal(calls, 1);
  calls = 0;
  await collect("/tracks", async () => {
    calls++;
    return { collection: [], next_href: "/tracks" };
  });
  assert.equal(calls, 1);
});
