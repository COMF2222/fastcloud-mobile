package work.comf.fastcloud.mobile;

import android.app.PendingIntent;
import android.content.Intent;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.*;
import androidx.media3.common.audio.AudioProcessor;
import androidx.media3.datasource.*;
import androidx.media3.exoplayer.*;
import androidx.media3.exoplayer.audio.*;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

@androidx.media3.common.util.UnstableApi
public class PlaybackService extends MediaSessionService {

  private ExoPlayer player, spare;
  private MediaSession session;
  private Gateway gateway;
  private Listening listening;
  private androidx.media3.datasource.DataSource.Factory sources;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService io = Executors.newSingleThreadExecutor();

  private record Ticket(String url, long created) {}

  private final Map<Long, Ticket> streams = new ConcurrentHashMap<>();
  private final Map<ExoPlayer, AudioProbe> probes = new IdentityHashMap<>();
  private final Map<ExoPlayer, Equalizer> equalizers = new IdentityHashMap<>();
  private final Map<ExoPlayer, LoudnessEnhancer> enhancers =
    new IdentityHashMap<>();
  private long lastTick, lastPosition, sessionMs, fadeStart, fadeLength, fadePosition;
  private boolean counted, extending;
  private int retries, ticks;
  private String spareId = "";
  private int spareIndex = -1;

  @Override
  public void onCreate() {
    super.onCreate();
    gateway = new Gateway(this);
    listening = new Listening(this);
    var http = new DefaultHttpDataSource.Factory()
      .setConnectTimeoutMs(15000)
      .setReadTimeoutMs(90000)
      .setAllowCrossProtocolRedirects(false);
    var base = new DefaultDataSource.Factory(this, http);
    sources = new ResolvingDataSource.Factory(base, spec -> {
      if (!"fastcloud".equals(spec.uri.getScheme())) return spec;
      try {
        long id = Long.parseLong(spec.uri.getLastPathSegment());
        String local = Offline.playable(this, id);
        if (local != null) return spec.withUri(android.net.Uri.parse(local));
        Ticket ticket = streams.get(id);
        if (
          ticket == null ||
          System.currentTimeMillis() - ticket.created() > 3 * 3600000L
        ) {
          ticket = new Ticket(gateway.stream(id), System.currentTimeMillis());
          streams.put(id, ticket);
        }
        return spec.withUri(android.net.Uri.parse(ticket.url()));
      } catch (Exception e) {
        throw new java.io.IOException(e.getMessage(), e);
      }
    });
    player = createPlayer(true);
    PendingIntent activity = PendingIntent.getActivity(
      this,
      0,
      new Intent(this, MainActivity.class),
      PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
    );
    session = new MediaSession.Builder(this, player)
      .setSessionActivity(activity)
      .build();
    restoreQueue();
    handler.post(tick);
    handler.post(transition);
  }

  private ExoPlayer createPlayer(boolean focus) {
    AudioProbe probe = new AudioProbe();
    DefaultRenderersFactory renderers = new DefaultRenderersFactory(this) {
      @Override
      protected AudioSink buildAudioSink(
        android.content.Context context,
        boolean floatOutput,
        boolean playbackParams
      ) {
        return new DefaultAudioSink.Builder(context)
          .setEnableFloatOutput(false)
          .setAudioProcessors(new AudioProcessor[] { probe })
          .build();
      }
    };
    ExoPlayer result = new ExoPlayer.Builder(this, renderers)
      .setMediaSourceFactory(
        new DefaultMediaSourceFactory(this).setDataSourceFactory(sources)
      )
      .setLoadControl(
        new DefaultLoadControl.Builder()
          .setBufferDurationsMs(30000, 90000, 1500, 3000)
          .build()
      )
      .build();
    result.setAudioAttributes(
      new AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build(),
      focus
    );
    result.setHandleAudioBecomingNoisy(true);
    result.setWakeMode(C.WAKE_MODE_NETWORK);
    probes.put(result, probe);
    result.addListener(
      new Player.Listener() {
        @Override
        public void onMediaItemTransition(
          @Nullable MediaItem item,
          int reason
        ) {
          if (player != result) return;
          try {
            if (
              item != null &&
              item.mediaMetadata.extras != null &&
              item.mediaMetadata.extras.getBoolean("recommended", false) &&
              blocked(
                new JSONObject(item.mediaMetadata.extras.getString("track"))
              )
            ) {
              handler.post(() -> {
                if (player == result && result.getCurrentMediaItem() == item) {
                  cancelSpare();
                  result.removeMediaItem(result.getCurrentMediaItemIndex());
                }
              });
              return;
            }
          } catch (Exception ignored) {}
          if (
            fadeStart > 0 &&
            spare != null &&
            item != null &&
            item.mediaId.equals(spareId)
          ) {
            handler.post(() -> handoff());
            return;
          }
          cancelSpare();
          sessionMs = 0;
          counted = false;
          lastPosition = result.getCurrentPosition();
          retries = 0;
          probe.restart();
          saveQueue();
          if (
            result.getMediaItemCount() - result.getCurrentMediaItemIndex() < 5
          ) extend();
        }

        @Override
        public void onPlaybackStateChanged(int state) {
          if (player == result && state == Player.STATE_ENDED) extend();
        }

        @Override
        public void onTimelineChanged(Timeline timeline, int reason) {
          if (player == result) saveQueue();
        }

        @Override
        public void onPlayWhenReadyChanged(boolean ready, int reason) {
          if (player == result && spare != null && fadeStart > 0) {
            if (ready) spare.play();
            else spare.pause();
          }
        }

        @Override
        public void onPositionDiscontinuity(
          Player.PositionInfo old,
          Player.PositionInfo next,
          int reason
        ) {
          if (
            player == result && reason == Player.DISCONTINUITY_REASON_SEEK
          ) cancelSpare();
        }

        @Override
        public void onPlayerError(PlaybackException error) {
          if (player != result) {
            if (spare == result) cancelSpare();
            return;
          }
          cancelSpare();
          if (++retries <= 3) {
            streams.clear();
            long position = result.getCurrentPosition();
            handler.postDelayed(
              () -> {
                if (player == result && result.getPlayerError() != null) {
                  result.seekTo(position);
                  result.prepare();
                  result.play();
                }
              },
              Math.min(15000, retries * 3000)
            );
          }
        }
      }
    );
    return result;
  }

  private JSONObject preferences() {
    try {
      return new JSONObject(
        getSharedPreferences("playback", 0).getString("preferences", "{}")
      );
    } catch (Exception e) {
      return new JSONObject();
    }
  }

  private static String comparable(String value) {
    return java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFKC)
      .toLowerCase(Locale.ROOT)
      .replaceAll("[\\p{P}\\p{S}\\s]+", "");
  }

  private boolean blocked(JSONObject track) {
    try {
      JSONObject feedback = new JSONObject(
        getSharedPreferences("playback", 0).getString("feedback", "{}")
      );
      var keys = feedback.keys();
      while (keys.hasNext()) {
        JSONObject value = feedback.getJSONObject(keys.next());
        if (!value.optBoolean("disliked")) continue;
        JSONObject other = value.getJSONObject("track");
        if (other.optLong("id") == track.optLong("id")) return true;
        JSONObject metadata = track.optJSONObject("publisher_metadata"),
          user = track.optJSONObject("user");
        String artist =
          metadata == null
            ? track.optString(
                "metadata_artist",
                user == null ? "" : user.optString("username")
              )
            : metadata.optString(
                "artist",
                user == null ? "" : user.optString("username")
              );
        if (
          comparable(other.optString("title")).equals(
            comparable(track.optString("title"))
          ) &&
          comparable(other.optString("artist")).equals(comparable(artist)) &&
          Math.abs(other.optLong("durationMs") - track.optLong("duration")) <
            10000
        ) return true;
        if (
          metadata != null &&
          !other.isNull("isrc") &&
          other.optString("isrc").equals(metadata.optString("isrc"))
        ) return true;
      }
    } catch (Exception ignored) {}
    return false;
  }

  private final Runnable tick = new Runnable() {
    @Override
    public void run() {
      long now = android.os.SystemClock.elapsedRealtime(),
        position = player.getCurrentPosition(),
        delta = lastTick == 0 ? 0 : now - lastTick;
      try {
        if (
          PlaybackRules.heard(
            player.isPlaying(),
            delta,
            position - lastPosition,
            player.getPlaybackParameters().speed
          )
        ) {
          MediaItem item = player.getCurrentMediaItem();
          if (item != null) {
            sessionMs += delta;
            long duration = player.getDuration();
            long threshold =
              duration > 0
                ? Math.min(30000, Math.max(1000, duration / 2))
                : 30000;
            boolean newly = !counted && sessionMs >= threshold;
            if (newly) counted = true;
            listening.add(
              new JSONObject(item.mediaMetadata.extras.getString("track")),
              delta,
              newly
            );
          }
        }
        long sleep = getSharedPreferences("playback", 0).getLong("sleep", 0);
        if (sleep > 0 && System.currentTimeMillis() >= sleep) {
          player.pause();
          cancelSpare();
          getSharedPreferences("playback", 0).edit().remove("sleep").apply();
        }
        if (++ticks % 30 == 0) io.execute(() -> {
          try {
            JSONObject account = gateway.session();
            if (account == null) return;
            long owner = account.optLong("account_id");
            listening.sync(gateway);
            JSONObject remote = gateway.json("/v1/me/personal", "GET", null);
            FeedbackStore.mergeRemote(PlaybackService.this, remote, owner);
          } catch (Exception ignored) {}
        });
        if (ticks % 5 == 0) {
          for (
            int index = player.getMediaItemCount() - 1;
            index > player.getCurrentMediaItemIndex();
            index--
          ) {
            MediaItem item = player.getMediaItemAt(index);
            if (
              item.mediaMetadata.extras.getBoolean("recommended", false) &&
              blocked(
                new JSONObject(item.mediaMetadata.extras.getString("track"))
              )
            ) player.removeMediaItem(index);
          }
          if (
            player.getMediaItemCount() - player.getCurrentMediaItemIndex() < 5
          ) extend();
        }
        applyEffects(player);
        if (spare != null) applyEffects(spare);
      } catch (Exception ignored) {}
      lastTick = now;
      lastPosition = position;
      handler.postDelayed(this, 1000);
    }
  };
  private final Runnable transition = new Runnable() {
    @Override
    public void run() {
      try {
        JSONObject prefs = preferences();
        long requested = prefs.optLong("crossfade_ms");
        int next = player.getNextMediaItemIndex();
        if (
          requested <= 0 ||
          next < 0 ||
          player.getRepeatMode() == Player.REPEAT_MODE_ONE ||
          getSharedPreferences("playback", 0).getLong("sleep", 0) > 0
        ) {
          cancelSpare();
          handler.postDelayed(this, 100);
          return;
        }
        String id = player.getMediaItemAt(next).mediaId;
        if (spare != null && !spareId.equals(id)) cancelSpare();
        long remaining = player.getDuration() - player.getCurrentPosition();
        if (
          spare == null &&
          player.isPlaying() &&
          remaining > 0 &&
          remaining < 30000
        ) {
          spare = createPlayer(false);
          spareId = id;
          spareIndex = next;
          spare.setVolume(0);
          spare.setMediaItem(player.getMediaItemAt(next));
          spare.setPlaybackParameters(player.getPlaybackParameters());
          spare.prepare();
        }
        if (
          spare != null &&
          player.isPlaying() &&
          spare.getPlaybackState() == Player.STATE_READY
        ) {
          long length = PlaybackRules.fadeDuration(
            requested,
            player.getDuration(),
            spare.getDuration()
          );
          if (fadeStart == 0 && remaining > 0 && remaining <= length) {
            fadeLength = remaining;
            fadePosition = player.getCurrentPosition();
            fadeStart = android.os.SystemClock.elapsedRealtime();
            spare.play();
          }
          if (fadeStart > 0) {
            double progress = Math.max(
              0,
              Math.min(
                1,
                (player.getCurrentPosition() - fadePosition) /
                  (double) Math.max(1, fadeLength)
              )
            );
            player.setVolume((float) PlaybackRules.outgoingGain(progress));
            spare.setVolume((float) PlaybackRules.incomingGain(progress));
            if (progress >= 1 || remaining <= 200) handoff();
          }
        }
      } catch (Exception ignored) {
        cancelSpare();
      }
      handler.postDelayed(this, 100);
    }
  };

  private void handoff() {
    if (spare == null) return;
    ExoPlayer previous = player,
      next = spare;
    spare = null;
    fadeStart = 0;
    spareId = "";
    var before = new ArrayList<MediaItem>();
    var after = new ArrayList<MediaItem>();
    for (int index = 0; index < previous.getMediaItemCount(); index++) {
      if (index < spareIndex) before.add(previous.getMediaItemAt(index));
      else if (index > spareIndex) after.add(previous.getMediaItemAt(index));
    }
    next.addMediaItems(0, before);
    next.addMediaItems(after);
    next.setShuffleModeEnabled(previous.getShuffleModeEnabled());
    next.setRepeatMode(previous.getRepeatMode());
    player = next;
    next.setVolume(1);
    session.setPlayer(next);
    previous.pause();
    releasePlayer(previous);
    next.setAudioAttributes(
      new AudioAttributes.Builder()
        .setUsage(C.USAGE_MEDIA)
        .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
        .build(),
      true
    );
    sessionMs = 0;
    counted = false;
    lastPosition = next.getCurrentPosition();
    lastTick = android.os.SystemClock.elapsedRealtime();
    saveQueue();
  }

  private void cancelSpare() {
    boolean reset = spare != null || fadeStart > 0;
    if (spare != null) {
      ExoPlayer value = spare;
      spare = null;
      releasePlayer(value);
    }
    fadeStart = 0;
    spareId = "";
    if (reset && player != null) player.setVolume(1);
  }

  private void applyEffects(ExoPlayer value) {
    try {
      int sessionId = value.getAudioSessionId();
      if (sessionId == C.AUDIO_SESSION_ID_UNSET) return;
      Equalizer equalizer = equalizers.get(value);
      if (equalizer == null) {
        equalizer = new Equalizer(0, sessionId);
        equalizers.put(value, equalizer);
      }
      int preset = getSharedPreferences("playback", 0).getInt("eq", 0);
      short[] range = equalizer.getBandLevelRange();
      for (short band = 0; band < equalizer.getNumberOfBands(); band++) {
        double frequency = equalizer.getCenterFreq(band) / 1000.0;
        double db =
          preset == 1
            ? frequency < 250
              ? 5
              : frequency < 1000
                ? 2
                : 0
            : preset == 2
              ? frequency >= 500 && frequency <= 4000
                ? 3
                : -1
              : preset == 3
                ? frequency < 200
                  ? 4
                  : frequency > 2500
                    ? 3
                    : -1
                : 0;
        equalizer.setBandLevel(
          band,
          (short) Math.max(range[0], Math.min(range[1], db * 100))
        );
      }
      equalizer.setEnabled(preset != 0);
      LoudnessEnhancer enhancer = enhancers.get(value);
      if (enhancer == null) {
        enhancer = new LoudnessEnhancer(sessionId);
        enhancers.put(value, enhancer);
      }
      boolean normalize = preferences().optBoolean("normalization");
      double gain = normalize ? probes.get(value).gain() : 1;
      enhancer.setTargetGain(
        (int) Math.max(0, Math.min(600, 2000 * Math.log10(Math.max(1, gain))))
      );
      enhancer.setEnabled(normalize && gain > 1);
      if (fadeStart == 0) value.setVolume((float) Math.min(1, gain));
    } catch (
      UnsupportedOperationException
      | IllegalStateException
      | IllegalArgumentException ignored
    ) {}
  }

  private void releasePlayer(ExoPlayer value) {
    Equalizer eq = equalizers.remove(value);
    if (eq != null) eq.release();
    LoudnessEnhancer gain = enhancers.remove(value);
    if (gain != null) gain.release();
    probes.remove(value);
    value.release();
  }

  private boolean allowedRecommendation(JSONObject track, boolean wave) {
    if (!wave) return true;
    String mode = preferences().optString("wave_mode", "Balanced");
    try {
      if ("Discover".equals(mode)) {
        JSONArray likes = new JSONArray(
          getSharedPreferences("playback", 0).getString("likes", "[]")
        );
        for (int i = 0; i < likes.length(); i++) if (
          likes.getLong(i) == track.optLong("id")
        ) return false;
      }
      if ("Discover".equals(mode) || "NoRepeats".equals(mode)) {
        JSONArray history = new JSONArray(
          getSharedPreferences("playback", 0).getString("history", "[]")
        );
        long cutoff = System.currentTimeMillis() / 1000 - 7 * 86400;
        for (int i = 0; i < history.length(); i++) {
          JSONObject row = history.getJSONObject(i);
          if (
            row.optLong("trackId") == track.optLong("id") &&
            ("Discover".equals(mode) || row.optLong("lastPlayed") >= cutoff)
          ) return false;
        }
      }
    } catch (Exception ignored) {}
    return true;
  }

  private void extend() {
    if (
      extending ||
      player.getMediaItemCount() == 0 ||
      !preferences().optBoolean("autoplay", true) ||
      getSharedPreferences("playback", 0).getLong("sleep", 0) > 0
    ) return;
    MediaItem current = player.getCurrentMediaItem();
    if (current == null) return;
    extending = true;
    Set<String> used = new HashSet<>();
    for (int i = 0; i < player.getMediaItemCount(); i++) used.add(
      player.getMediaItemAt(i).mediaId
    );
    io.execute(() -> {
      var items = new ArrayList<MediaItem>();
      try {
        JSONObject result = gateway.json(
          "/v1/soundcloud/api/tracks/" +
            java.net.URLEncoder.encode(
              "soundcloud:tracks:" + current.mediaId,
              "UTF-8"
            ) +
            "/related?limit=50&access=playable,preview",
          "GET",
          null
        );
        JSONArray collection = result.getJSONArray("collection");
        var candidates = new ArrayList<JSONObject>();
        for (int i = 0; i < collection.length(); i++) candidates.add(
          collection.getJSONObject(i)
        );
        Collections.shuffle(candidates);
        Map<Long, Integer> artists = new HashMap<>();
        for (JSONObject track : candidates) {
          if (!track.has("id")) track.put(
            "id",
            Long.parseLong(
              track
                .getString("urn")
                .substring(track.getString("urn").lastIndexOf(':') + 1)
            )
          );
          JSONObject user = track.optJSONObject("user");
          long artist = user == null ? 0 : user.optLong("id");
          if (
            !used.contains(String.valueOf(track.getLong("id"))) &&
            !blocked(track) &&
            allowedRecommendation(
              track,
              current.mediaMetadata.extras.getBoolean("recommended", false)
            ) &&
            artists.getOrDefault(artist, 0) < 2
          ) {
            MediaItem value = FastcloudPlugin.item(track);
            value.mediaMetadata.extras.putBoolean("recommended", true);
            items.add(value);
            used.add(String.valueOf(track.getLong("id")));
            artists.put(artist, artists.getOrDefault(artist, 0) + 1);
          }
          if (items.size() >= 12) break;
        }
      } catch (Exception ignored) {}
      handler.post(() -> {
        if (
          player.getCurrentMediaItem() != null &&
          player.getCurrentMediaItem().mediaId.equals(current.mediaId)
        ) {
          boolean ended = player.getPlaybackState() == Player.STATE_ENDED;
          int last = player.getMediaItemCount();
          player.addMediaItems(items);
          if (ended && !items.isEmpty()) {
            player.seekToDefaultPosition(last);
            player.prepare();
            player.play();
          }
        }
        extending = false;
      });
    });
  }

  private void saveQueue() {
    try {
      JSONObject auth = gateway.session();
      if (auth == null) return;
      JSONArray queue = new JSONArray(),
        recommended = new JSONArray();
      for (int i = 0; i < player.getMediaItemCount(); i++) {
        queue.put(
          new JSONObject(
            player.getMediaItemAt(i).mediaMetadata.extras.getString("track")
          )
        );
        recommended.put(
          player
            .getMediaItemAt(i)
            .mediaMetadata.extras.getBoolean("recommended", false)
        );
      }
      getSharedPreferences("queue-" + auth.optLong("account_id"), 0)
        .edit()
        .putString("tracks", queue.toString())
        .putInt("index", player.getCurrentMediaItemIndex())
        .putLong("position", player.getCurrentPosition())
        .putString("recommended", recommended.toString())
        .apply();
    } catch (Exception ignored) {}
  }

  private void restoreQueue() {
    try {
      JSONObject auth = gateway.session();
      if (auth == null) return;
      var prefs = getSharedPreferences(
        "queue-" + auth.optLong("account_id"),
        0
      );
      JSONArray queue = new JSONArray(prefs.getString("tracks", "[]"));
      JSONArray recommended = new JSONArray(
        prefs.getString("recommended", "[]")
      );
      var items = new ArrayList<MediaItem>();
      for (int i = 0; i < queue.length(); i++) {
        MediaItem value = FastcloudPlugin.item(queue.getJSONObject(i));
        value.mediaMetadata.extras.putBoolean(
          "recommended",
          recommended.optBoolean(i, false)
        );
        items.add(value);
      }
      if (!items.isEmpty()) player.setMediaItems(
        items,
        Math.min(items.size() - 1, Math.max(0, prefs.getInt("index", 0))),
        Math.max(0, prefs.getLong("position", 0))
      );
    } catch (Exception ignored) {}
  }

  @Nullable
  @Override
  public MediaSession onGetSession(MediaSession.ControllerInfo controller) {
    return session;
  }

  @Override
  public void onDestroy() {
    handler.removeCallbacksAndMessages(null);
    saveQueue();
    cancelSpare();
    io.execute(() -> {
      try {
        listening.sync(gateway);
      } catch (Exception ignored) {}
    });
    io.shutdown();
    session.release();
    releasePlayer(player);
    super.onDestroy();
  }

  @Override
  public void onTaskRemoved(Intent rootIntent) {
    if (!player.getPlayWhenReady()) stopSelf();
  }
}
