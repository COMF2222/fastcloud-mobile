package work.comf.fastcloud.mobile;

import android.content.Context;
import org.json.JSONObject;

final class FeedbackStore {

  private FeedbackStore() {}

  static synchronized void merge(Context context, JSONObject incoming)
    throws Exception {
    var prefs = context.getSharedPreferences("playback", 0);
    JSONObject result = new JSONObject(incoming.toString()),
      local = new JSONObject(prefs.getString("feedback", "{}"));
    var keys = local.keys();
    while (keys.hasNext()) {
      String key = keys.next();
      JSONObject left = local.getJSONObject(key),
        right = result.optJSONObject(key);
      if (
        right == null ||
        left.optLong("updatedAt") > right.optLong("updatedAt") ||
        (left.optLong("updatedAt") == right.optLong("updatedAt") &&
          left.optString("device").compareTo(right.optString("device")) > 0)
      ) result.put(key, left);
    }
    prefs.edit().putString("feedback", result.toString()).apply();
  }

  static synchronized void clear(Context context) {
    context
      .getSharedPreferences("playback", 0)
      .edit()
      .remove("feedback")
      .remove("history")
      .remove("likes")
      .remove("preferences")
      .remove("eq")
      .remove("sleep")
      .commit();
  }

  static synchronized void mergeRemote(
    Context context,
    JSONObject incoming,
    long owner
  ) throws Exception {
    JSONObject account = new Gateway(context).session();
    if (account == null || account.optLong("account_id") != owner) return;
    merge(context, incoming.getJSONObject("trackFeedback"));
    context
      .getSharedPreferences("playback", 0)
      .edit()
      .putString("history", incoming.getJSONArray("tracks").toString())
      .apply();
  }
}
