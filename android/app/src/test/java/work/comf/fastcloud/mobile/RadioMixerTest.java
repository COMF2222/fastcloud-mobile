package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import java.util.*;
import org.junit.Test;

public class RadioMixerTest {

  @Test
  public void aPlayedSeedIsNotAnAvailableAlternativeThatBlocksAllRelatedSongs() {
    var seed = track(1, "seed");
    var result = RadioMixer.mix(
      List.of(seed),
      List.of(List.of(track(2, "seed"), track(3, "seed"))),
      false,
      List.of(seed)
    );
    assertTrue(result.contains(2L));
    assertTrue(result.contains(3L));
  }

  private RadioMixer.Entry<Long> track(long id, String artist) {
    return new RadioMixer.Entry<>(id, "song" + id, artist, 180000, true, id);
  }

  @Test
  public void artistRadioIncludesSeedArtistAndAlternatesWithSimilarArtists() {
    var own = new ArrayList<RadioMixer.Entry<Long>>();
    var related = new ArrayList<RadioMixer.Entry<Long>>();
    for (long i = 1; i <= 16; i++) own.add(track(i, "seed"));
    for (long i = 20; i <= 50; i++) related.add(track(i, "other" + i));
    var result = RadioMixer.mix(
      own,
      List.of(related),
      true,
      List.of(track(1, "seed"))
    );
    assertEquals(24, result.size());
    assertTrue(
      result
        .stream()
        .filter(id -> id < 20)
        .count() >= 6
    );
    for (int i = 1; i < result.size(); i++) assertFalse(
      result.get(i) < 20 && result.get(i - 1) < 20
    );
  }

  @Test
  public void rejectsBlockedPreviewsDuplicatesAndEarlierRecordings() {
    var played = track(1, "seed");
    var duplicate = new RadioMixer.Entry<>(
      2L,
      "song1",
      "seed",
      184000L,
      true,
      2L
    );
    var restricted = new RadioMixer.Entry<>(
      3L,
      "preview",
      "other",
      180000L,
      false,
      3L
    );
    var result = RadioMixer.mix(
      List.of(played),
      List.of(List.of(played, duplicate, restricted, track(4, "fresh"))),
      false,
      List.of(played)
    );
    assertEquals(List.of(4L), result);
  }

  @Test
  public void differentSeedPagesShareTheQueueAndNoArtistFillsIt() {
    var a = List.of(track(1, "a"), track(2, "a"), track(3, "a"));
    var b = List.of(track(4, "b"), track(5, "b"), track(6, "b"));
    var result = RadioMixer.mix(List.of(), List.of(a, b), false, List.of());
    assertEquals(List.of(1L, 4L, 2L, 5L), result);
  }
}
