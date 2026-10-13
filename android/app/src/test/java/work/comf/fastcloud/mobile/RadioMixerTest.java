package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import java.util.*;
import org.junit.Test;

public class RadioMixerTest {

  @Test
  public void aRelatedShelfDominatedByPeepExpandsEvenWithFiveUploaderNames() {
    var seed = track(1, "lilpeep");
    var shelf = new ArrayList<RadioMixer.Entry<Long>>();
    for (long i = 2; i <= 35; i++) shelf.add(track(i, "lilpeep"));
    for (long i = 36; i <= 40; i++) shelf.add(
      new RadioMixer.Entry<>(
        i,
        "lilpeepsong" + i,
        "uploader" + i,
        180000L,
        true,
        i
      )
    );
    assertTrue(
      RadioMixer.needsExpansion(
        List.of(seed),
        List.of(shelf),
        List.of(seed),
        true
      )
    );
    assertTrue(
      RadioMixer.needsExpansion(
        List.of(seed),
        List.of(shelf),
        List.of(seed),
        false
      )
    );
    var alternatives = new ArrayList<RadioMixer.Entry<Long>>();
    for (long i = 100; i < 116; i++) alternatives.add(track(i, "similar" + i));
    var mixed = RadioMixer.mix(
      List.of(seed),
      List.of(shelf, alternatives),
      true,
      List.of(seed)
    );
    assertEquals(24, mixed.size());
    assertEquals(
      8,
      mixed
        .stream()
        .filter(id -> id < 100)
        .count()
    );
    for (int i = 1; i < mixed.size(); i++) assertFalse(
      mixed.get(i) < 100 && mixed.get(i - 1) < 100
    );
  }

  @Test
  public void scarceAlternativesDoNotTurnArtistRadioIntoASoloPlaylist() {
    var own = new ArrayList<RadioMixer.Entry<Long>>();
    for (long i = 1; i <= 16; i++) own.add(track(i, "seed"));
    var alternatives = List.of(
      track(20, "a"),
      track(21, "b"),
      track(22, "c"),
      track(23, "d")
    );
    var mixed = RadioMixer.mix(
      own,
      List.of(alternatives),
      true,
      List.of(own.get(0))
    );
    assertEquals(6, mixed.size());
    assertEquals(
      2,
      mixed
        .stream()
        .filter(id -> id < 20)
        .count()
    );
  }

  @Test
  public void alreadyHeardAndRestrictedSongsDoNotCountAsDiversity() {
    var seed = track(1, "lilpeep");
    var rows = new ArrayList<RadioMixer.Entry<Long>>();
    for (long i = 20; i < 36; i++) rows.add(track(i, "other" + i));
    assertFalse(
      RadioMixer.needsExpansion(
        List.of(seed),
        List.of(rows),
        List.of(seed),
        true
      )
    );
    assertTrue(
      RadioMixer.needsExpansion(List.of(seed), List.of(rows), rows, true)
    );
  }

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
