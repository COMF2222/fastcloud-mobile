package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;
import org.junit.Test;

public class BridgeNumbersTest {
  @Test public void acceptsJsonIntegerAndLongAccountIds() {
    assertEquals(123456789L, BridgeNumbers.id(Integer.valueOf(123456789)));
    assertEquals(5000000000L, BridgeNumbers.id(Long.valueOf(5000000000L)));
    assertEquals(123456789L, BridgeNumbers.id(Double.valueOf(123456789)));
  }
  @Test public void preservesLongSeekAndTimerArguments() {
    assertEquals(1791833882000d, BridgeNumbers.number(Long.valueOf(1791833882000L), 0), 0);
    assertEquals(0.5, BridgeNumbers.number(Double.valueOf(0.5), 0), 0);
    assertEquals(0, BridgeNumbers.number(null, 0), 0);
  }
  @Test public void rejectsMissingFractionalOrUnsafeIdentities() {
    for (Object value : new Object[]{null, 0, -1, 0.5, "123", Double.NaN, Double.POSITIVE_INFINITY, 9007199254740992L}) {
      try { BridgeNumbers.id(value); fail("Accepted invalid identity: " + value); }
      catch (IllegalArgumentException expected) {}
    }
  }
}
