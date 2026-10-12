package work.comf.fastcloud.mobile;

final class UpdateRules {

  static final long MAX_APK = 128L * 1024 * 1024;

  private UpdateRules() {}

  static int build(String version) {
    if (
      version == null ||
      !version.matches(
        "(?:0|[1-9][0-9]{0,2})\\.(?:0|[1-9][0-9]{0,2})\\.(?:0|[1-9][0-9]{0,2})"
      )
    ) throw new IllegalArgumentException("Invalid update version");
    String[] parts = version.split("\\.");
    return (
      Integer.parseInt(parts[0]) * 1000000 +
      Integer.parseInt(parts[1]) * 1000 +
      Integer.parseInt(parts[2])
    );
  }

  static boolean acceptable(
    String packageName,
    String version,
    long build,
    long installedBuild,
    long bytes,
    String hash,
    String signature
  ) {
    return (
      "work.comf.fastcloud.mobile".equals(packageName) &&
      build == build(version) &&
      build > installedBuild &&
      bytes > 0 &&
      bytes <= MAX_APK &&
      hash != null &&
      hash.matches("[a-f0-9]{64}") &&
      signature != null &&
      signature.matches("[a-f0-9]{64}")
    );
  }

  static String hex(byte[] bytes) {
    StringBuilder value = new StringBuilder();
    for (byte b : bytes)
      value.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
    return value.toString();
  }
}
