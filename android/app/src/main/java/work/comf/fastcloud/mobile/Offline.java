package work.comf.fastcloud.mobile;

import android.content.Context;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

final class Offline {

  private static void write(File path, String value) throws IOException {
    try (var out = new FileOutputStream(path)) {
      out.write(value.getBytes(StandardCharsets.UTF_8));
    }
  }

  private static String read(File path) throws IOException {
    try (
      var in = new FileInputStream(path);
      var out = new ByteArrayOutputStream()
    ) {
      byte[] buffer = new byte[8192];
      int count;
      while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
      return out.toString("UTF-8");
    }
  }

  static File root(Context context) throws Exception {
    JSONObject session = new Gateway(context).session();
    if (session == null) throw new IOException("Sign in first");
    File root = new File(
      context.getFilesDir(),
      "offline/" + session.getLong("account_id")
    );
    if (!root.exists() && !root.mkdirs()) throw new IOException(
      "Storage unavailable"
    );
    return root;
  }

  static File folder(Context context, long id) throws Exception {
    if (id <= 0) throw new IOException("Invalid track ID");
    return new File(root(context), String.valueOf(id));
  }

  static String playable(Context context, long id) throws Exception {
    File dir = folder(context, id);
    return new File(dir, "ready").exists()
      ? new File(dir, "index.m3u8").toURI().toString()
      : null;
  }

  private static byte[] fetch(String address, String server, int limit)
    throws Exception {
    URL url = new URL(address);
    URL base = new URL(server);
    if (
      !url.getProtocol().equals("https") ||
      !url.getHost().equals(base.getHost()) ||
      url.getPort() != base.getPort() ||
      !url.getPath().startsWith("/v1/")
    ) throw new IOException("Invalid audio address");
    HttpURLConnection connection = (HttpURLConnection) url.openConnection();
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(45000);
    try {
      if (connection.getResponseCode() != 200) throw new IOException(
        "Download unavailable"
      );
      try (
        InputStream in = connection.getInputStream();
        ByteArrayOutputStream out = new ByteArrayOutputStream()
      ) {
        byte[] buffer = new byte[65536];
        int count;
        while ((count = in.read(buffer)) != -1) {
          if (out.size() + count > limit) throw new IOException(
            "Audio segment too large"
          );
          out.write(buffer, 0, count);
        }
        return out.toByteArray();
      }
    } finally {
      connection.disconnect();
    }
  }

  static synchronized void download(
    Context context,
    Gateway gateway,
    JSONObject track
  ) throws Exception {
    long id = track.getLong("id");
    File dir = folder(context, id);
    if (new File(dir, "ready").exists()) return;
    if (!dir.exists() && !dir.mkdirs()) throw new IOException(
      "Storage unavailable"
    );
    String source = gateway.stream(id);
    String text = new String(
      fetch(source, gateway.server(), 262144),
      StandardCharsets.UTF_8
    );
    if (
      !text.startsWith("#EXTM3U") ||
      !text.contains("#EXT-X-ENDLIST") ||
      text.contains("#EXT-X-STREAM-INF") ||
      text.contains("#EXT-X-KEY") ||
      text.contains("#EXT-X-MAP")
    ) throw new IOException("This stream cannot be saved offline yet");
    StringBuilder manifest = new StringBuilder();
    int index = 0;
    for (String line : text.split("\n")) {
      line = line.trim();
      if (!line.isEmpty() && !line.startsWith("#")) {
        if (dir.getUsableSpace() < 128L * 1024 * 1024) throw new IOException(
          "Not enough storage"
        );
        String name = "segment-" + index++ + ".seg";
        File file = new File(dir, name);
        byte[] bytes = fetch(
          new URL(new URL(source), line).toString(),
          gateway.server(),
          64 * 1024 * 1024
        );
        try (var out = new FileOutputStream(file)) {
          out.write(bytes);
        }
        line = name;
      }
      manifest.append(line).append('\n');
    }
    if (index == 0) throw new IOException("No audio segments");
    write(new File(dir, "index.m3u8"), manifest.toString());
    write(new File(dir, "track.json"), track.toString());
    write(new File(dir, "ready"), "ok");
  }

  static JSONArray list(Context context) throws Exception {
    JSONArray result = new JSONArray();
    File[] dirs = root(context).listFiles();
    if (dirs != null) for (File dir : dirs) {
      try {
        if (new File(dir, "ready").exists()) {
          long bytes = 0;
          File[] files = dir.listFiles();
          if (files != null) for (File file : files) bytes += file.length();
          result.put(
            new JSONObject()
              .put("track", new JSONObject(read(new File(dir, "track.json"))))
              .put("bytes", bytes)
              .put("ready", true)
          );
        }
      } catch (Exception ignored) {}
    }
    return result;
  }

  static void remove(Context context, long id) throws Exception {
    File dir = folder(context, id);
    File[] files = dir.listFiles();
    if (files != null) for (File file : files)
      if (file.isFile() && !file.delete()) throw new IOException(
        "Could not remove download"
      );
    if (dir.exists() && !dir.delete()) throw new IOException(
      "Could not remove download"
    );
  }
}
