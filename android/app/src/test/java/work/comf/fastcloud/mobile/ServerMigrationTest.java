package work.comf.fastcloud.mobile;
import org.junit.Test;
import static org.junit.Assert.*;
public class ServerMigrationTest {
  @Test public void onlyTheKnownServerMoveMayReplaceAnAuthenticatedOrigin() {
    assertTrue(ServerMigration.restoring(ServerMigration.LEGACY,ServerMigration.CURRENT));
    assertFalse(ServerMigration.restoring("https://another.example",ServerMigration.CURRENT));
    assertFalse(ServerMigration.restoring(ServerMigration.LEGACY,"https://80.47.238.200.evil.example"));
    assertFalse(ServerMigration.restoring(ServerMigration.CURRENT,ServerMigration.CURRENT));
  }
}
