export class RequestCache {
  private entries = new Map<
    string,
    { value: unknown; expires: number; size: number }
  >();
  private flights = new Map<string, Promise<unknown>>();
  private epoch = 0;
  private revision = 0;
  private bytes = 0;
  clear() {
    this.epoch++;
    this.invalidate();
  }
  invalidate() {
    this.revision++;
    this.entries.clear();
    this.flights.clear();
    this.bytes = 0;
  }
  async read<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const saved = this.entries.get(key);
    if (saved && saved.expires > Date.now())
      return structuredClone(saved.value) as T;
    const pending = this.flights.get(key);
    if (pending) return structuredClone(await pending) as T;
    const generation = this.epoch;
    const revision = this.revision;
    const flight = load().then((value) => {
      if (generation !== this.epoch) throw Error("Request replaced; retry");
      if (ttl > 0 && revision === this.revision) {
        const size = JSON.stringify(value).length * 2;
        if (saved) {
          this.bytes -= saved.size;
          this.entries.delete(key);
        }
        while (
          this.entries.size &&
          (this.entries.size >= 96 || this.bytes + size > 4 * 1024 * 1024)
        ) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.size;
          this.entries.delete(oldest);
        }
        if (size <= 4 * 1024 * 1024) {
          this.entries.set(key, {
            value: structuredClone(value),
            size,
            expires: Date.now() + ttl,
          });
          this.bytes += size;
        }
      }
      return value;
    });
    this.flights.set(key, flight);
    try {
      return structuredClone(await flight) as T;
    } finally {
      if (this.flights.get(key) === flight) this.flights.delete(key);
    }
  }
}
