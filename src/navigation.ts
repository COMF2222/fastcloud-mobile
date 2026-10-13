export type NavigationEntry<P, D> = { page: P; detail: D };
export function pushPage<P, D>(
  history: NavigationEntry<P, D>[],
  current: NavigationEntry<P, D>,
  next: NavigationEntry<P, D>,
  reset = false,
) {
  if (reset) return [];
  const id = (value: D) =>
    value && typeof value === "object" && "id" in value ? value.id : undefined;
  if (
    current.page === next.page &&
    (current.detail === next.detail ||
      (id(current.detail) !== undefined &&
        id(current.detail) === id(next.detail)))
  )
    return history;
  return [...history, current].slice(-30);
}
export function popPage<P, D>(
  history: NavigationEntry<P, D>[],
  fallback: NavigationEntry<P, D>,
) {
  return { entry: history.at(-1) || fallback, history: history.slice(0, -1) };
}
