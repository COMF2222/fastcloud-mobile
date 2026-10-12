package work.comf.fastcloud.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class AppIconsTest {
  @Test public void onlyBundledIconsAreAcceptedAndMoonIsDefault() {
    assertEquals(9, AppIcons.DEFAULT);
    for (int id = 1; id <= 12; id++) assertTrue(AppIcons.valid(id));
    for (int id : new int[]{Integer.MIN_VALUE, -1, 0, 13, Integer.MAX_VALUE}) assertFalse(AppIcons.valid(id));
  }
}
