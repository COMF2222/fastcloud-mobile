package work.comf.fastcloud.mobile;

final class ServerMigration {
  static final String LEGACY = "https://77.223.107.226";
  static final String CURRENT = "https://80.47.238.200";
  static boolean restoring(String previous, String next) { return LEGACY.equals(previous) && CURRENT.equals(next); }
}
