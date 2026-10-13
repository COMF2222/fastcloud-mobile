package work.comf.fastcloud.mobile;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.function.LongSupplier;

final class ArtworkCache {

  private final File root;
  private final long budget;
  private final LongSupplier clock;

  ArtworkCache(File root) {
    this(root, 32 * 1024 * 1024, System::currentTimeMillis);
  }

  ArtworkCache(File root, long budget, LongSupplier clock) {
    this.root = root;
    this.budget = budget;
    this.clock = clock;
  }

  private String key(String url) throws Exception {
    java.net.URI uri = new java.net.URI(url);
    if (
      !"https".equals(uri.getScheme()) ||
      uri.getHost() == null ||
      !uri.getHost().matches("i[1-4]\\.sndcdn\\.com") ||
      uri.getUserInfo() != null ||
      uri.getPort() != -1
    ) throw new IOException("Invalid artwork address");
    var result = new StringBuilder();
    for (byte value : MessageDigest.getInstance("SHA-256").digest(
      url.getBytes(StandardCharsets.UTF_8)
    ))
      result.append(String.format(Locale.ROOT, "%02x", value & 255));
    return result.toString();
  }

  synchronized Gateway.Response read(String url) {
    try {
      String key = key(url);
      File image = new File(root, key + ".img"),
        info = new File(root, key + ".meta");
      if (
        !info.isFile() ||
        info.length() > 256 ||
        !image.isFile() ||
        image.length() > budget ||
        image.length() > 10 * 1024 * 1024
      ) return null;
      String[] metadata = new String(bytes(info), StandardCharsets.UTF_8).split(
        "\n"
      );
      if (
        metadata.length != 2 ||
        !imageType(metadata[0]) ||
        clock.getAsLong() - Long.parseLong(metadata[1]) > 7L * 86400000
      ) return null;
      byte[] data = bytes(image);
      image.setLastModified(clock.getAsLong());
      return new Gateway.Response(200, data, metadata[0]);
    } catch (Exception ignored) {
      return null;
    }
  }

  synchronized void write(String url, Gateway.Response response) {
    try {
      String type =
        response.type() == null
          ? ""
          : response.type().split(";")[0].trim().toLowerCase(Locale.ROOT);
      if (
        response.status() != 200 ||
        !imageType(type) ||
        response.bytes().length == 0 ||
        response.bytes().length > budget ||
        response.bytes().length > 10 * 1024 * 1024
      ) return;
      String key = key(url);
      if (!root.isDirectory() && !root.mkdirs()) return;
      put(new File(root, key + ".img"), response.bytes());
      new File(root, key + ".img").setLastModified(clock.getAsLong());
      put(
        new File(root, key + ".meta"),
        (type + "\n" + clock.getAsLong()).getBytes(StandardCharsets.UTF_8)
      );
      File[] images = root.listFiles((dir, name) -> name.endsWith(".img"));
      if (images == null) return;
      long total = Arrays.stream(images).mapToLong(File::length).sum();
      Arrays.sort(images, Comparator.comparingLong(File::lastModified));
      for (var image : images) {
        if (total <= budget) break;
        long size = image.length();
        if (image.delete()) total -= size;
        new File(root, image.getName().replace(".img", ".meta")).delete();
      }
    } catch (Exception ignored) {}
  }

  private static boolean imageType(String type) {
    return Set.of(
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/avif"
    ).contains(type);
  }

  private static byte[] bytes(File file) throws IOException {
    var out = new ByteArrayOutputStream();
    try (var input = new FileInputStream(file)) {
      byte[] buffer = new byte[8192];
      int size;
      while ((size = input.read(buffer)) != -1) out.write(buffer, 0, size);
    }
    return out.toByteArray();
  }

  private static void put(File file, byte[] bytes) throws IOException {
    File temp = File.createTempFile(
      file.getName(),
      ".tmp",
      file.getParentFile()
    );
    try {
      try (var output = new FileOutputStream(temp)) {
        output.write(bytes);
      }
      if (file.exists() && !file.delete()) throw new IOException(
        "Artwork cache busy"
      );
      if (!temp.renameTo(file)) throw new IOException(
        "Artwork cache unavailable"
      );
    } finally {
      temp.delete();
    }
  }
}
