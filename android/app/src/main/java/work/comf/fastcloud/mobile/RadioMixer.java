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
    var primary = new ArrayList<Entry<T>>();
    for (var seed : seeds) primary.add(canonical(seed, own));
    var related = new ArrayList<Entry<T>>();
    int depth = pages.stream().mapToInt(List::size).max().orElse(0);
    for (int i = 0; i < depth; i++) for (var page : pages)
      if (i < page.size()) {
        var row = canonical(page.get(i), own);
        if (own.contains(row.artist())) primary.add(row);
        else related.add(row);
      }
    var seen = new ArrayList<Entry<T>>();
    for (var row : previous) seen.add(canonical(row, own));
    int alternatives = foreignCapacity(related, seen, own);
    int sourceBudget =
      alternatives == 0
        ? 2
        : Math.min(artistStation ? 8 : 2, Math.max(1, alternatives / 2));
    var counts = new HashMap<String, Integer>();
    var result = new ArrayList<T>();
    String lastArtist = previous.isEmpty()
      ? ""
      : seen.get(seen.size() - 1).artist();
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
        sourceBudget,
        lastArtist
      );
      if (chosen == null) {
        chosen = choose(other, seen, counts, own, sourceBudget, lastArtist);
        if (chosen != null) pool = other;
      }
      if (chosen == null) chosen = choose(
        pool,
        seen,
        counts,
        own,
        sourceBudget,
        null
      );
      if (chosen == null) {
        chosen = choose(other, seen, counts, own, sourceBudget, null);
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

  static <T> boolean needsExpansion(
    List<Entry<T>> seeds,
    List<List<Entry<T>>> pages,
    List<Entry<T>> previous,
    boolean artistStation
  ) {
    Set<String> own = new HashSet<>();
    for (var seed : seeds) own.add(seed.artist());
    var seen = new ArrayList<Entry<T>>();
    for (var row : previous) seen.add(canonical(row, own));
    var candidates = new ArrayList<Entry<T>>();
    for (var page : pages)
      for (var row : page) candidates.add(canonical(row, own));
    return foreignCapacity(candidates, seen, own) < (artistStation ? 16 : 22);
  }

  private static <T> Entry<T> canonical(Entry<T> row, Set<String> own) {
    String artist = row.artist();
    if (!own.contains(artist)) {
      // Reuploads labelled with the seed performer must not masquerade as
      // extra performers merely because their uploader has another name.
      for (String source : own)
        if (
          source.length() >= 5 &&
          (row.title().startsWith(source) ||
            row.title().endsWith(source) ||
            artist.startsWith(source) ||
            artist.endsWith(source))
        ) {
          artist = source;
          break;
        }
    }
    String title = row.title();
    if (own.contains(artist) && artist.length() >= 5) {
      if (title.startsWith(artist) && title.length() > artist.length()) title =
        title.substring(artist.length());
      else if (
        title.endsWith(artist) && title.length() > artist.length()
      ) title = title.substring(0, title.length() - artist.length());
    }
    return new Entry<>(
      row.id(),
      title,
      artist,
      row.duration(),
      row.playable(),
      row.value()
    );
  }

  private static <T> boolean duplicate(Entry<T> row, List<Entry<T>> seen) {
    return seen
      .stream()
      .anyMatch(
        other ->
          other.id() == row.id() ||
          (other.title().equals(row.title()) &&
            other.artist().equals(row.artist()) &&
            Math.abs(other.duration() - row.duration()) <= 8000)
      );
  }

  private static <T> int foreignCapacity(
    List<Entry<T>> rows,
    List<Entry<T>> previous,
    Set<String> own
  ) {
    var accepted = new ArrayList<>(previous);
    var counts = new HashMap<String, Integer>();
    int count = 0;
    for (var row : rows)
      if (
        row.playable() &&
        !own.contains(row.artist()) &&
        counts.getOrDefault(row.artist(), 0) < 2 &&
        !duplicate(row, accepted)
      ) {
        accepted.add(row);
        counts.merge(row.artist(), 1, Integer::sum);
        count++;
      }
    return count;
  }

  private static <T> Entry<T> choose(
    List<Entry<T>> pool,
    List<Entry<T>> seen,
    Map<String, Integer> counts,
    Set<String> own,
    int sourceBudget,
    String avoidArtist
  ) {
    for (var row : pool) {
      boolean source = own.contains(row.artist());
      int sourceCount = own
        .stream()
        .mapToInt(artist -> counts.getOrDefault(artist, 0))
        .sum();
      if (
        !row.playable() ||
        (source
          ? sourceCount >= sourceBudget
          : counts.getOrDefault(row.artist(), 0) >= 2) ||
        row.artist().equals(avoidArtist)
      ) continue;
      if (duplicate(row, seen)) continue;
      return row;
    }
    return null;
  }
}
