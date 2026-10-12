package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import org.junit.Test;

public class UpdateRulesTest {

  @Test
  public void versionsAreOrderedAcrossDoubleDigitComponents() {
    assertTrue(UpdateRules.build("0.10.0") > UpdateRules.build("0.9.99"));
    assertEquals(1001, UpdateRules.build("0.1.1"));
  }

  @Test
  public void rejectsDowngradesOtherPackagesAndInvalidSizes() {
    String hash = "a".repeat(64);
    assertTrue(
      UpdateRules.acceptable(
        "work.comf.fastcloud.mobile",
        "0.1.1",
        1001,
        1000,
        4000000,
        hash,
        hash
      )
    );
    assertFalse(
      UpdateRules.acceptable(
        "other.app",
        "0.1.1",
        1001,
        1000,
        4000000,
        hash,
        hash
      )
    );
    assertFalse(
      UpdateRules.acceptable(
        "work.comf.fastcloud.mobile",
        "0.1.0",
        1000,
        1000,
        4000000,
        hash,
        hash
      )
    );
    assertFalse(
      UpdateRules.acceptable(
        "work.comf.fastcloud.mobile",
        "0.1.1",
        1001,
        1000,
        UpdateRules.MAX_APK + 1,
        hash,
        hash
      )
    );
  }

  @Test
  public void hashesMustBeCompleteSha256Values() {
    assertFalse(
      UpdateRules.acceptable(
        "work.comf.fastcloud.mobile",
        "0.1.1",
        1001,
        1000,
        1,
        "abc",
        "a".repeat(64)
      )
    );
    assertEquals("00ff", UpdateRules.hex(new byte[] { 0, (byte) 255 }));
  }

  @Test(expected = IllegalArgumentException.class)
  public void leadingZeroVersionCannotCollideWithExistingBuild() {
    UpdateRules.build("0.01.1");
  }
}
