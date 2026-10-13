package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.Test;

public class RadioRealShelfTest {

  @Test
  public void peepRadioUsesSimilarProfilesInsteadOfStoppingAtHisOwnRelatedShelf()
    throws Exception {
    var seeds = new ArrayList<RadioMixer.Entry<Long>>();
    var pages = new LinkedHashMap<String, List<RadioMixer.Entry<Long>>>();
    var records = new HashMap<Long, RadioMixer.Entry<Long>>();
    try (
      var input = new BufferedReader(
        new InputStreamReader(
          getClass().getResourceAsStream("/radio-peep.tsv"),
          StandardCharsets.UTF_8
        )
      )
    ) {
      for (String line; (line = input.readLine()) != null; ) {
        String[] row = line.split("\t", -1);
        long id = Long.parseLong(row[1]);
        var track = new RadioMixer.Entry<>(
          id,
          row[2],
          row[3],
          Long.parseLong(row[4]),
          Boolean.parseBoolean(row[5]),
          id
        );
        records.put(id, track);
        if (row[0].equals("seed")) seeds.add(track);
        else pages
          .computeIfAbsent(row[0], ignored -> new ArrayList<>())
          .add(track);
      }
    }
    assertTrue(
      RadioMixer.needsExpansion(
        seeds,
        List.of(pages.get("related")),
        seeds,
        true
      )
    );
    for (boolean artistStation : new boolean[] { true, false }) {
      var mixed = RadioMixer.mix(
        seeds,
        new ArrayList<>(pages.values()),
        artistStation,
        seeds
      );
      var artists = new HashSet<String>();
      long own = 0;
      for (long id : mixed) {
        String artist = records.get(id).artist();
        artists.add(artist);
        if (artist.equals("lilpeep")) own++;
      }
      assertTrue(
        "The public Peep example must have a useful continuation",
        mixed.size() >= 8
      );
      assertTrue(
        "Source radio must contain several performer credits",
        artists.size() >= 4
      );
      assertTrue(
        "Peep must not dominate the expanded shelf",
        own * 3 <= mixed.size()
      );
      assertFalse(mixed.contains(seeds.get(0).id()));
      System.out.println(
        "Live Peep fixture: artistRadio=" +
          artistStation +
          ", selected=" +
          mixed.size() +
          ", performerCredits=" +
          artists.size() +
          ", Peep=" +
          own
      );
    }
  }
}
