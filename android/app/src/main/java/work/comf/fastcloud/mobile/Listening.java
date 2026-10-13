package work.comf.fastcloud.mobile;

import android.content.Context;
import java.util.UUID;
import org.json.*;

final class Listening {

  private final Context context;
  private long account = 0;
  private JSONObject rows = new JSONObject();
  private String device;

  Listening(Context context) {
    this.context = context;
  }

  private synchronized void load() throws Exception {
    JSONObject session = new Gateway(context).session();
    long id = session == null ? 0 : session.optLong("account_id");
    if (id == account) return;
    account = id;
    var prefs = context.getSharedPreferences("listening-" + account, 0);
    String origin = new Gateway(context).server();
    if (account > 0 && ServerMigration.restoring(prefs.getString("server", ServerMigration.LEGACY), origin)) {
      prefs.edit().putString("synced", "{}").putString("server", origin).commit();
    } else { prefs.edit().putString("server", origin).commit(); }
    device = prefs.getString("device", null);
    if (device == null) {
      device = UUID.randomUUID().toString().replace("-", "");
      prefs.edit().putString("device", device).commit();
    }
    rows = new JSONObject(prefs.getString("rows", "{}"));
  }

  synchronized void add(JSONObject track, long ms, boolean counted)
    throws Exception {
    load();
    if (account == 0 || ms <= 0 || ms > 2000) return;
    var formatter = new java.text.SimpleDateFormat(
      "yyyy-MM-dd",
      java.util.Locale.ROOT
    );
    formatter.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
    String day = formatter.format(new java.util.Date());
    String key = day + ":" + track.getLong("id");
    JSONObject row = rows.optJSONObject(key);
    if (row == null) {
      JSONObject user = track.optJSONObject("user"),
        metadata = track.optJSONObject("publisher_metadata");
      row = new JSONObject()
        .put("day", day)
        .put("trackId", track.getLong("id"))
        .put("title", clip(track.optString("title"), 512))
        .put(
          "artist",
          clip(
            metadata == null
              ? track.optString(
                  "metadata_artist",
                  user == null ? "" : user.optString("username")
                )
              : metadata.optString(
                  "artist",
                  user == null ? "" : user.optString("username")
                ),
            256
          )
        )
        .put("genre", clip(track.optString("genre"), 128))
        .put("ms", 0)
        .put("plays", 0);
    }
    row.put("ms", Math.min(86400000, row.optLong("ms") + ms));
    if (counted) row.put("plays", Math.min(2880, row.optInt("plays") + 1));
    row.put("lastPlayed", System.currentTimeMillis() / 1000);
    rows.put(key, row);
    context
      .getSharedPreferences("listening-" + account, 0)
      .edit()
      .putString("rows", rows.toString())
      .apply();
  }

  private static String clip(String raw, int limit) {
    String text = raw.replaceAll("[\\x00-\\x1f]", " ");
    return text.length() > limit ? text.substring(0, limit) : text;
  }

  void sync(Gateway gateway) throws Exception {
    JSONArray batch;
    String id;
    long owner;
    synchronized (this) {
      load();
      if (account == 0) return;
      owner = account;
      id = device;
      batch = new JSONArray();
      JSONObject synced = new JSONObject(
        context
          .getSharedPreferences("listening-" + account, 0)
          .getString("synced", "{}")
      );
      var keys = rows.keys();
      while (keys.hasNext()) {
        String key = keys.next();
        JSONObject row = rows.getJSONObject(key);
        JSONObject old = synced.optJSONObject(key);
        if (
          old == null ||
          old.optLong("ms") < row.optLong("ms") ||
          old.optInt("plays") < row.optInt("plays")
        ) batch.put(new JSONObject(row.toString()));
      }
    }
    for (int start = 0; start < batch.length(); start += 100) {
      JSONObject session = gateway.session();
      if (session == null || session.optLong("account_id") != owner) return;
      JSONArray chunk = new JSONArray();
      for (
        int index = start;
        index < Math.min(start + 100, batch.length());
        index++
      ) chunk.put(batch.get(index));
      gateway.json(
        "/v1/me/personal",
        "POST",
        new JSONObject().put("device", id).put("stats", chunk)
      );
      synchronized (this) {
        var prefs = context.getSharedPreferences("listening-" + owner, 0);
        JSONObject synced = new JSONObject(prefs.getString("synced", "{}"));
        for (int i = 0; i < chunk.length(); i++) {
          JSONObject row = chunk.getJSONObject(i);
          synced.put(
            row.getString("day") + ":" + row.getLong("trackId"),
            new JSONObject()
              .put("ms", row.getLong("ms"))
              .put("plays", row.getInt("plays"))
          );
        }
        prefs.edit().putString("synced", synced.toString()).apply();
      }
    }
  }
}
