export async function collect<T>(
  first: string,
  load: (
    path: string,
  ) => Promise<T[] | { collection: T[]; next_href?: string | null }>,
  maximum = 5000,
): Promise<T[]> {
  const items: T[] = [],
    seen = new Set<string>();
  let next: string | null = first;
  while (next && items.length < maximum && seen.size < 100) {
    const url = new URL(next, "https://api.soundcloud.com");
    if (
      url.origin !== "https://api.soundcloud.com" ||
      url.username ||
      url.password
    )
      throw Error("Unexpected pagination address");
    if (url.pathname.startsWith("/v1/soundcloud/api/"))
      url.pathname = url.pathname.slice("/v1/soundcloud/api".length);
    url.searchParams.set("linked_partitioning", "true");
    const path = url.pathname + url.search;
    if (seen.has(path)) break;
    seen.add(path);
    const page = await load(path);
    if (Array.isArray(page)) {
      items.push(...page);
      break;
    }
    if (!Array.isArray(page.collection))
      throw Error("Invalid collection response");
    items.push(...page.collection);
    next = page.next_href || null;
  }
  return items.slice(0, maximum);
}
