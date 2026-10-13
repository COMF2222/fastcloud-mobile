package work.comf.fastcloud.mobile;

import java.util.*;

/** Pure queue selection, independent of Android and network state. */
final class RadioMixer {

  record Entry<T>(
    long id,
    String title,
    String artist,
    long duration,
    boolean playable,
    T value
  ) {}

  static <T> List<T> mix(
    List<Entry<T>> seeds,
    List<List<Entry<T>>> pages,
    boolean artistStation,
    List<Entry<T>> previous
  ) {
    Set<String> own = new HashSet<>();
    for (var seed : seeds) own.add(seed.artist());
    var primary = new ArrayList<>(seeds);
    var related = new ArrayList<Entry<T>>();
    int depth = pages.stream().mapToInt(List::size).max().orElse(0);
    for (int i = 0; i < depth; i++) for (var page : pages)
      if (i < page.size()) {
        var row = page.get(i);
        if (artistStation && own.contains(row.artist())) primary.add(row);
        else related.add(row);
      }
    var seen = new ArrayList<>(previous);
    var counts = new HashMap<String, Integer>();
    var result = new ArrayList<T>();
    String lastArtist = previous.isEmpty()
      ? ""
      : previous.get(previous.size() - 1).artist();
    while (result.size() < 24 && (!primary.isEmpty() || !related.isEmpty())) {
      boolean usePrimary =
        (result.size() % 3 == 2 && !primary.isEmpty()) || related.isEmpty();
      var pool = usePrimary ? primary : related;
      var other = usePrimary ? related : primary;
      Entry<T> chosen = choose(
        pool,
        seen,
        counts,
        own,
        artistStation,
        lastArtist
      );
      if (chosen == null) {
        chosen = choose(other, seen, counts, own, artistStation, lastArtist);
        if (chosen != null) pool = other;
      }
      if (chosen == null) chosen = choose(
        pool,
        seen,
        counts,
        own,
        artistStation,
        null
      );
      if (chosen == null) {
        chosen = choose(other, seen, counts, own, artistStation, null);
        if (chosen != null) pool = other;
      }
      if (chosen == null) break;
      pool.remove(chosen);
      seen.add(chosen);
      result.add(chosen.value());
      lastArtist = chosen.artist();
      counts.merge(lastArtist, 1, Integer::sum);
    }
    return result;
  }

  private static <T> Entry<T> choose(
    List<Entry<T>> pool,
    List<Entry<T>> seen,
    Map<String, Integer> counts,
    Set<String> own,
    boolean artistStation,
    String avoidArtist
  ) {
    for (var row : pool) {
      int limit = artistStation && own.contains(row.artist()) ? 8 : 2;
      if (
        !row.playable() ||
        counts.getOrDefault(row.artist(), 0) >= limit ||
        row.artist().equals(avoidArtist)
      ) continue;
      if (
        seen
          .stream()
          .anyMatch(
            other ->
              other.id() == row.id() ||
              (other.title().equals(row.title()) &&
                other.artist().equals(row.artist()) &&
                Math.abs(other.duration() - row.duration()) <= 8000)
          )
      ) continue;
      return row;
    }
    return null;
  }
}
