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
  private final ExecutorService radioIo = Executors.newFixedThreadPool(4);
  private int radioVariation;
  private String lastRadioContext = "";
  private long lastRadioAttempt;
  private String lastRadioAnchor = "";
  private final ArrayDeque<RadioMixer.Entry<JSONObject>> radioHistory =
    new ArrayDeque<>();
  private boolean destroyed;

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
    MediaItem current = player.getCurrentMediaItem();
    if (current == null) return;
    String station =
      current.mediaMetadata.extras == null
        ? ""
        : current.mediaMetadata.extras.getString("station", "");
    long now = android.os.SystemClock.elapsedRealtime();
    if (!station.isEmpty()) {
      if (!station.equals(lastRadioContext)) {
        lastRadioContext = station;
        lastRadioAttempt = 0;
        radioHistory.clear();
      }
      if (
        lastRadioAttempt > 0 &&
        now - lastRadioAttempt < 20000 &&
        current.mediaId.equals(lastRadioAnchor)
      ) return;
    }
    if (
      extending ||
      player.getMediaItemCount() == 0 ||
      (station.isEmpty() && !preferences().optBoolean("autoplay", true)) ||
      getSharedPreferences("playback", 0).getLong("sleep", 0) > 0
    ) return;
    extending = true;
    if (!station.isEmpty()) {
      lastRadioAttempt = now;
      lastRadioAnchor = current.mediaId;
    }
    if (!station.isEmpty()) {
      current.mediaMetadata.extras.putBoolean("radio_loading", true);
      current.mediaMetadata.extras.putBoolean("radio_error", false);
    }
    var previous = new ArrayList<>(radioHistory);
    for (int i = 0; i < player.getMediaItemCount(); i++) {
      try {
        previous.add(
          radioEntry(
            new JSONObject(
              player.getMediaItemAt(i).mediaMetadata.extras.getString("track")
            )
          )
        );
      } catch (Exception ignored) {}
    }
    int variation = radioVariation++;
    Set<String> used = new HashSet<>();
    for (int i = 0; i < player.getMediaItemCount(); i++) used.add(
      player.getMediaItemAt(i).mediaId
    );
    io.execute(() -> {
      var items = new ArrayList<MediaItem>();
      try {
        if (!station.isEmpty()) {
          for (var track : stationTracks(station, previous, variation)) {
            var item = FastcloudPlugin.item(track);
            item.mediaMetadata.extras.putBoolean("recommended", true);
            item.mediaMetadata.extras.putString("station", station);
            items.add(item);
          }
        } else {
          JSONObject result = gateway.json(
            "/v1/soundcloud/api/tracks/" +
              java.net.URLEncoder.encode(
                "soundcloud:tracks:" + current.mediaId,
                "UTF-8"
              ) +
              "/related?limit=50&access=playable,preview&linked_partitioning=true",
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
        }
      } catch (Exception ignored) {}
      handler.post(() -> {
        if (destroyed) return;
        MediaItem live = player.getCurrentMediaItem();
        boolean sameQueue =
          live != null &&
          (station.isEmpty()
            ? live == current
            : live.mediaMetadata.extras != null &&
              station.equals(
                live.mediaMetadata.extras.getString("station", "")
              ));
        if (!station.isEmpty()) {
          current.mediaMetadata.extras.putBoolean("radio_loading", false);
          current.mediaMetadata.extras.putBoolean(
            "radio_error",
            items.isEmpty()
          );
          if (sameQueue) {
            live.mediaMetadata.extras.putBoolean("radio_loading", false);
            live.mediaMetadata.extras.putBoolean(
              "radio_error",
              items.isEmpty()
            );
          }
        }
        if (sameQueue) {
          boolean ended = player.getPlaybackState() == Player.STATE_ENDED;
          int last = player.getMediaItemCount();
          Set<String> liveIds = new HashSet<>();
          for (int i = 0; i < last; i++) liveIds.add(
            player.getMediaItemAt(i).mediaId
          );
          items.removeIf(item -> {
            try {
              return (
                !liveIds.add(item.mediaId) ||
                blocked(
                  new JSONObject(item.mediaMetadata.extras.getString("track"))
                )
              );
            } catch (Exception error) {
              return true;
            }
          });
          player.addMediaItems(items);
          if (!station.isEmpty()) {
            for (var item : items) {
              try {
                radioHistory.addLast(
                  radioEntry(
                    new JSONObject(item.mediaMetadata.extras.getString("track"))
                  )
                );
              } catch (Exception ignored) {}
            }
            while (radioHistory.size() > 1000) radioHistory.removeFirst();
          }
          if (ended && !items.isEmpty()) {
            player.seekToDefaultPosition(last);
            player.prepare();
            player.play();
          }
          if (
            !station.isEmpty() && player.getCurrentMediaItemIndex() > 120
          ) player.removeMediaItems(0, player.getCurrentMediaItemIndex() - 15);
          saveQueue();
        }
        extending = false;
      });
    });
  }

  private RadioMixer.Entry<JSONObject> radioEntry(JSONObject track)
    throws Exception {
    if (!track.has("id")) {
      String urn = track.optString("urn");
      track.put("id", Long.parseLong(urn.substring(urn.lastIndexOf(':') + 1)));
    }
    boolean playable =
      !blocked(track) &&
      !List.of("SNIP", "BLOCK").contains(track.optString("policy")) &&
      !List.of("preview", "blocked").contains(track.optString("access"));
    JSONObject metadata = track.optJSONObject("publisher_metadata"),
      user = track.optJSONObject("user");
    String artist = metadata == null ? "" : metadata.optString("artist");
    if (artist.isBlank()) artist = track.optString("metadata_artist");
    if (artist.isBlank()) artist =
      user == null ? "" : user.optString("username");
    return new RadioMixer.Entry<>(
      track.optLong("id"),
      comparable(track.optString("title")),
      comparable(artist),
      track.optLong("full_duration_ms", track.optLong("duration")),
      playable,
      track
    );
  }

  private List<JSONObject> stationTracks(
    String source,
    List<RadioMixer.Entry<JSONObject>> previous,
    int variation
  ) throws Exception {
    JSONObject context = new JSONObject(source);
    JSONArray raw = context.getJSONArray("seeds");
    var seeds = new ArrayList<RadioMixer.Entry<JSONObject>>();
    for (int i = 0; i < Math.min(16, raw.length()); i++) {
      var entry = radioEntry(raw.getJSONObject(i));
      if (entry.playable()) seeds.add(entry);
    }
    if (seeds.isEmpty()) return List.of();
    var origins = new HashSet<Long>();
    for (var seed : seeds) origins.add(seed.id());
    var frontier = new ArrayList<RadioMixer.Entry<JSONObject>>();
    for (int i = previous.size() - 1; i >= 0 && frontier.size() < 2; i--) {
      var row = previous.get(i);
      if (
        !origins.contains(row.id()) &&
        row.playable() &&
        frontier.stream().noneMatch(accepted -> accepted.id() == row.id())
      ) frontier.add(row);
    }
    var querySeeds = new ArrayList<RadioMixer.Entry<JSONObject>>();
    int originalCount = Math.min(frontier.isEmpty() ? 4 : 2, seeds.size());
    for (int i = 0; i < originalCount; i++) querySeeds.add(
      seeds.get(Math.floorMod(variation * originalCount + i, seeds.size()))
    );
    querySeeds.addAll(frontier);
    var searches = new ArrayList<
      java.util.concurrent.Future<List<RadioMixer.Entry<JSONObject>>>
    >();
    for (var querySeed : querySeeds) {
      long id = querySeed.id();
      searches.add(
        radioIo.submit(() -> {
          var response = gateway.json(
            "/v1/soundcloud/api/tracks/soundcloud%3Atracks%3A" +
              id +
              "/related?limit=50&access=playable&linked_partitioning=true",
            "GET",
            null
          );
          var rows = response.getJSONArray("collection");
          var page = new ArrayList<RadioMixer.Entry<JSONObject>>();
          for (int j = 0; j < rows.length(); j++) page.add(
            radioEntry(rows.getJSONObject(j))
          );
          return page;
        })
      );
    }
    long deadline =
      System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(12);
    var pages = new ArrayList<List<RadioMixer.Entry<JSONObject>>>();
    for (var search : searches) {
      try {
        pages.add(
          search.get(
            Math.max(1, deadline - System.nanoTime()),
            java.util.concurrent.TimeUnit.NANOSECONDS
          )
        );
      } catch (Exception error) {
        android.util.Log.w(
          "VeiruneRadio",
          "Related page unavailable: " + error.getClass().getSimpleName()
        );
        search.cancel(true);
        pages.add(List.of());
      }
    }
    var ownArtists = new HashSet<String>();
    for (var seed : seeds) ownArtists.add(seed.artist());
    long others = pages
      .stream()
      .flatMap(List::stream)
      .filter(
        row ->
          row.playable() &&
          !ownArtists.contains(row.artist()) &&
          previous.stream().noneMatch(seen -> seen.id() == row.id())
      )
      .map(RadioMixer.Entry::artist)
      .distinct()
      .count();
    if (others < 3) {
      // Some related-track shelves contain almost only the source uploader.
      // Ask SoundCloud for related profiles before broadening to the same genre.
      JSONObject anchor = seeds.get(0).value(),
        user = anchor.optJSONObject("user");
      var profileSearches = new ArrayList<
        java.util.concurrent.Future<List<RadioMixer.Entry<JSONObject>>>
      >();
      try {
        if (
          user != null &&
          comparable(user.optString("username")).equals(seeds.get(0).artist())
        ) {
          var lookup = radioIo.submit(() ->
            gateway.json(
              "/v1/soundcloud/api/users/soundcloud%3Ausers%3A" +
                user.optLong("id") +
                "/related?linked_partitioning=true&limit=8",
              "GET",
              null
            )
          );
          JSONObject relatedUsers;
          try {
            relatedUsers = lookup.get(6, TimeUnit.SECONDS);
          } finally {
            lookup.cancel(true);
          }
          var users = relatedUsers.getJSONArray("collection");
          for (int i = 0; i < Math.min(3, users.length()); i++) {
            long id = users
              .getJSONObject(Math.floorMod(variation * 3 + i, users.length()))
              .optLong("id");
            if (id > 0 && id != user.optLong("id")) profileSearches.add(
              radioIo.submit(() ->
                radioPage(
                  "/v1/soundcloud/api/users/soundcloud%3Ausers%3A" +
                    id +
                    "/tracks?limit=30&access=playable&linked_partitioning=true"
                )
              )
            );
          }
        }
      } catch (Exception ignored) {}
      long profileDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(6);
      for (var search : profileSearches) {
        try {
          pages.add(
            search.get(
              Math.max(1, profileDeadline - System.nanoTime()),
              TimeUnit.NANOSECONDS
            )
          );
        } catch (Exception ignored) {
          search.cancel(true);
        }
      }
      long expanded = pages
        .stream()
        .flatMap(List::stream)
        .filter(
          row ->
            row.playable() &&
            !ownArtists.contains(row.artist()) &&
            previous.stream().noneMatch(seen -> seen.id() == row.id())
        )
        .map(RadioMixer.Entry::artist)
        .distinct()
        .count();
      String genre = anchor.optString("genre").trim();
      if (expanded < 3 && !genre.isEmpty()) {
        var search = radioIo.submit(() ->
          radioPage(
            "/v1/soundcloud/api/tracks?genres=" +
              java.net.URLEncoder.encode(genre, "UTF-8") +
              "&limit=50&access=playable&linked_partitioning=true"
          )
        );
        try {
          pages.add(search.get(6, TimeUnit.SECONDS));
        } catch (Exception ignored) {
          search.cancel(true);
        }
      }
    }
    if (pages.stream().allMatch(List::isEmpty)) throw new java.io.IOException(
      "Related music unavailable"
    );
    var result = RadioMixer.mix(
      seeds,
      pages,
      "artist".equals(context.optString("kind")),
      previous
    );
    android.util.Log.i(
      "VeiruneRadio",
      "kind=" +
        context.optString("kind") +
        " seeds=" +
        seeds.size() +
        " related=" +
        pages.stream().mapToInt(List::size).sum() +
        " selected=" +
        result.size()
    );
    return result;
  }

  private List<RadioMixer.Entry<JSONObject>> radioPage(String path)
    throws Exception {
    JSONArray rows = gateway.json(path, "GET", null).getJSONArray("collection");
    var page = new ArrayList<RadioMixer.Entry<JSONObject>>();
    for (int i = 0; i < rows.length(); i++) page.add(
      radioEntry(rows.getJSONObject(i))
    );
    return page;
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
        .putString(
          "station",
          player.getCurrentMediaItem() == null
            ? ""
            : player
                .getCurrentMediaItem()
                .mediaMetadata.extras.getString("station", "")
        )
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
        value.mediaMetadata.extras.putString(
          "station",
          prefs.getString("station", "")
        );
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
    destroyed = true;
    radioIo.shutdownNow();
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
