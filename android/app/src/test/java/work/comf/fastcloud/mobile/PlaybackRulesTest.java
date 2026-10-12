package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import org.junit.Test;

public class PlaybackRulesTest {

  @Test
  public void seekingBufferingAndLongSuspensionDoNotCount() {
    assertFalse(PlaybackRules.heard(false, 1000, 1000, 1));
    assertFalse(PlaybackRules.heard(true, 1000, 30000, 1));
    assertFalse(PlaybackRules.heard(true, 10000, 10000, 1));
    assertTrue(PlaybackRules.heard(true, 1000, 1500, 1.5f));
  }

  @Test
  public void shortTracksLimitCrossfade() {
    assertEquals(8000, PlaybackRules.fadeDuration(8000, 180000, 200000));
    assertEquals(2000, PlaybackRules.fadeDuration(8000, 4000, 200000));
    assertEquals(0, PlaybackRules.fadeDuration(0, 180000, 200000));
  }

  @Test
  public void crossfadeHasEqualPowerAndExactEndpoints() {
    assertEquals(1, PlaybackRules.outgoingGain(0), .00001);
    assertEquals(0, PlaybackRules.incomingGain(0), .00001);
    assertEquals(0, PlaybackRules.outgoingGain(1), .00001);
    assertEquals(1, PlaybackRules.incomingGain(1), .00001);
    double a = PlaybackRules.outgoingGain(.5),
      b = PlaybackRules.incomingGain(.5);
    assertEquals(1, a * a + b * b, .00001);
  }
}
