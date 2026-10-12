package work.comf.fastcloud.mobile;

import android.content.Context;
import android.util.Base64;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class Gateway {

  record Response(int status, byte[] bytes, String type) {
    JSONObject json() throws Exception {
      return bytes.length == 0
        ? new JSONObject()
        : new JSONObject(new String(bytes, StandardCharsets.UTF_8));
    }
  }

  private static final Object TOKEN_LOCK = new Object();
  final Context context;
  private String pairingTicket;
  private int pairingGeneration;

  JSONObject pairingStart() throws Exception {
    if (session() != null) throw new IOException("Already signed in");
    final int generation;
    synchronized (this) {
      generation = ++pairingGeneration;
    }
    Response response = raw(
      "/v1/mobile/pairing/start",
      "POST",
      new JSONObject(),
      null
    );
    if (response.status() != 200) throw new IOException(
      response.status() == 404
        ? "Update the Veirune server to connect your phone"
        : response.json().optString("error", "Could not create phone code")
    );
    JSONObject value = response.json();
    synchronized (this) {
      if (generation != pairingGeneration) throw new IOException(
        "Phone connection cancelled"
      );
      pairingTicket = value.getString("ticket");
    }
    return new JSONObject()
      .put("code", value.getString("code"))
      .put("expiresIn", value.getInt("expiresIn"));
  }

  boolean pairingPoll() throws Exception {
    final String ticket;
    final int generation;
    synchronized (this) {
      ticket = pairingTicket;
      generation = pairingGeneration;
    }
    if (ticket == null) return session() != null;
    Response response = raw(
      "/v1/mobile/pairing/poll",
      "POST",
      new JSONObject().put("ticket", ticket),
      null
    );
    if (response.status() == 202) return false;
    if (response.status() != 200) throw new IOException(
      response.json().optString("error", "Phone connection failed")
    );
    JSONObject tokens = response.json();
    tokens.getString("access_token");
    tokens.getString("refresh_token");
    tokens.getLong("account_id");
    synchronized (this) {
      if (generation != pairingGeneration) return false;
      save(tokens);
      pairingTicket = null;
    }
    return true;
  }

  synchronized void pairingCancel() {
    pairingGeneration++;
    pairingTicket = null;
  }

  Gateway(Context context) {
    this.context = context.getApplicationContext();
  }

  String server() {
    return context
      .getSharedPreferences("mobile", 0)
      .getString("server", "https://77.223.107.226");
  }

  void configure(String server) throws Exception {
    URL value = new URL(server);
    if (
      !value.getProtocol().equals("https") ||
      value.getUserInfo() != null ||
      !value.getPath().isEmpty() ||
      value.getQuery() != null ||
      value.getRef() != null
    ) throw new IOException("Use an HTTPS server address");
    if (!server().equals(server) && session() != null) throw new IOException(
      "Sign out before changing server"
    );
    context
      .getSharedPreferences("mobile", 0)
      .edit()
      .putString("server", server)
      .commit();
  }

  JSONObject session() throws Exception {
    String value = SecureStore.get(context);
    return value == null ? null : new JSONObject(value);
  }

  void save(JSONObject tokens) throws Exception {
    tokens.put(
      "expires_at",
      System.currentTimeMillis() + tokens.optLong("expires_in", 3600) * 1000
    );
    SecureStore.set(context, tokens.toString());
  }

  private void saveRefresh(JSONObject tokens, String expected)
    throws Exception {
    tokens.put(
      "expires_at",
      System.currentTimeMillis() + tokens.optLong("expires_in", 3600) * 1000
    );
    SecureStore.replace(context, expected, tokens.toString());
  }

  private static JSONObject normalize(JSONObject object) throws Exception {
    var keys = object.keys();
    while (keys.hasNext()) {
      String key = keys.next();
      Object value = object.get(key);
      if (value instanceof JSONObject child) normalize(child);
      else if (value instanceof org.json.JSONArray list) for (
        int i = 0;
        i < list.length();
        i++
      ) if (list.opt(i) instanceof JSONObject child) normalize(child);
    }
    if (
      !object.has("id") && object.optString("urn").startsWith("soundcloud:")
    ) {
      String urn = object.getString("urn");
      try {
        object.put(
          "id",
          Long.parseLong(urn.substring(urn.lastIndexOf(':') + 1))
        );
      } catch (NumberFormatException ignored) {}
    }
    return object;
  }

  private Response exchange(String path, JSONObject body) throws Exception {
    return raw(path, "POST", body, null);
  }

  private record Credential(String token, long owner) {}

  private Credential access(boolean force) throws Exception {
    synchronized (TOKEN_LOCK) {
      JSONObject value = session();
      if (value == null) throw new IOException("Sign in to Veirune");
      if (
        force ||
        value.optLong("expires_at") < System.currentTimeMillis() + 60000
      ) {
        Response response = exchange(
          "/v1/oauth/refresh",
          new JSONObject().put(
            "refresh_token",
            value.getString("refresh_token")
          )
        );
        if (response.status() != 200) throw new IOException(
          response.status() == 401
            ? "Sign in again"
            : "Server temporarily unavailable"
        );
        JSONObject tokens = response.json();
        tokens.put("account_id", value.optLong("account_id"));
        saveRefresh(tokens, value.getString("refresh_token"));
        value = tokens;
      }
      return new Credential(
        value.getString("access_token"),
        value.getLong("account_id")
      );
    }
  }

  Response request(String path, String method, JSONObject body)
    throws Exception {
    Credential initial = access(false);
    Response result = raw(path, method, body, initial.token());
    if (result.status() == 401) {
      Credential current;
      synchronized (TOKEN_LOCK) {
        JSONObject value = session();
        if (
          value == null || value.optLong("account_id") != initial.owner()
        ) throw new IOException("Account changed; retry the request");
        current = access(
          value.optString("access_token").equals(initial.token())
        );
      }
      if (current.owner() != initial.owner()) throw new IOException(
        "Account changed; retry the request"
      );
      result = raw(path, method, body, current.token());
    }
    return result;
  }

  Response raw(String path, String method, JSONObject body, String token)
    throws Exception {
    if (
      !path.startsWith("/v1/") || path.contains("..") || path.contains("://")
    ) throw new IOException("Invalid server path");
    HttpURLConnection connection = (HttpURLConnection) new URL(
      server() + path
    ).openConnection();
    connection.setInstanceFollowRedirects(false);
    connection.setConnectTimeout(15000);
    connection.setReadTimeout(path.equals("/v1/mobile/lyrics") ? 90000 : 45000);
    connection.setRequestMethod(method);
    connection.setRequestProperty("X-Fastcloud-Preferences", "2");
    connection.setRequestProperty("Accept", "application/json");
    if (token != null) connection.setRequestProperty(
      "Authorization",
      "OAuth " + token
    );
    try {
      if (body != null) {
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setFixedLengthStreamingMode(bytes.length);
        try (var out = connection.getOutputStream()) {
          out.write(bytes);
        }
      }
      int status = connection.getResponseCode();
      var stream =
        status >= 400
          ? connection.getErrorStream()
          : connection.getInputStream();
      byte[] bytes;
      if (stream == null) bytes = new byte[0];
      else try (stream; var out = new java.io.ByteArrayOutputStream()) {
        byte[] buffer = new byte[65536];
        int count;
        while ((count = stream.read(buffer)) != -1) {
          if (out.size() + count > 10 * 1024 * 1024) throw new IOException(
            "Server response too large"
          );
          out.write(buffer, 0, count);
        }
        bytes = out.toByteArray();
      }
      return new Response(status, bytes, connection.getContentType());
    } finally {
      connection.disconnect();
    }
  }

  JSONObject json(String path, String method, JSONObject body)
    throws Exception {
    Response response = request(path, method, body);
    if (
      response.status() < 200 || response.status() >= 300
    ) throw new IOException(
      "HTTP " +
        response.status() +
        ": " +
        response.json().optString("error", "Request failed")
    );
    return normalize(response.json());
  }

  String stream(long id) throws Exception {
    Response result = request(
      "/v1/media/resolve",
      "POST",
      new JSONObject().put("urn", "soundcloud:tracks:" + id)
    );
    if (result.status() == 200) {
      String path = result.json().getString("playlist_path");
      if (!path.startsWith("/v1/media/")) throw new IOException(
        "Invalid playback address"
      );
      return server() + path;
    }
    if (result.status() != 422) throw new IOException(
      "Playback temporarily unavailable (" + result.status() + ")"
    );
    JSONObject data = json(
      "/v1/soundcloud/api/tracks/" +
        java.net.URLEncoder.encode("soundcloud:tracks:" + id, "UTF-8") +
        "/streams",
      "GET",
      null
    );
    String path = data.optString(
      "hls_aac_160_url",
      data.optString("hls_mp3_128_url", data.optString("preview_mp3_128_url"))
    );
    if (!path.startsWith("/v1/soundcloud/asset/")) throw new IOException(
      "No playable stream"
    );
    return server() + path;
  }

  void completeLogin(String code, String verifier) throws Exception {
    Response response = exchange(
      "/v1/oauth/exchange",
      new JSONObject().put("code", code).put("verifier", verifier)
    );
    long deadline = System.currentTimeMillis() + 14 * 60 * 1000;
    String ticket = response.json().optString("ticket");
    while (response.status() == 202 && System.currentTimeMillis() < deadline) {
      Thread.sleep(3000);
      response = exchange(
        "/v1/oauth/pending",
        new JSONObject().put("ticket", ticket)
      );
    }
    if (response.status() != 200) throw new IOException(
      response.json().optString("error", "Sign-in did not complete")
    );
    JSONObject tokens = response.json();
    Response me = raw(
      "/v1/session",
      "GET",
      null,
      tokens.getString("access_token")
    );
    if (me.status() != 200) throw new IOException("Account validation failed");
    tokens.put("account_id", me.json().getLong("user_id"));
    save(tokens);
  }
}
