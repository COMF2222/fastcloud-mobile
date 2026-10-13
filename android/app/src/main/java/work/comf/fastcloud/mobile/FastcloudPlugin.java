package work.comf.fastcloud.mobile;

import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name = "Fastcloud")
@androidx.annotation.OptIn(
  markerClass = androidx.media3.common.util.UnstableApi.class
)
public class FastcloudPlugin extends Plugin {

  private final ExecutorService io = Executors.newFixedThreadPool(3);
  private final ExecutorService network = Executors.newFixedThreadPool(4);
  private final ExecutorService artworkIo = Executors.newFixedThreadPool(2);
  private MediaController controller;
  private com.google.common.util.concurrent.ListenableFuture<MediaController> controllerFuture;
  private Gateway gateway;
  private MobileUpdater updater;
  private volatile boolean loginRunning = false;

  @Override
  public void load() {
    gateway = new Gateway(getContext());
    updater = new MobileUpdater(getContext(), gateway);
  }

  @PluginMethod
  public void appIcon(PluginCall call) {
    io.execute(() -> {
      try {
        call.resolve(
          JSObject.fromJSONObject(
            AppIcons.apply(getContext(), call.getInt("id"))
          )
        );
      } catch (Exception error) {
        call.reject("Не удалось изменить значок приложения", error);
      }
    });
  }

  @PluginMethod
  public void updatesCheck(PluginCall call) {
    background(call, () -> {
      call.resolve(JSObject.fromJSONObject(updater.check()));
    });
  }

  @PluginMethod
  public void updatesStatus(PluginCall call) {
    background(call, () -> {
      call.resolve(JSObject.fromJSONObject(updater.status()));
    });
  }

  @PluginMethod
  public void updatesDownload(PluginCall call) {
    background(call, () -> {
      call.resolve(JSObject.fromJSONObject(updater.download()));
    });
  }

  @PluginMethod
  public void updatesCancel(PluginCall call) {
    updater.cancel();
    call.resolve();
  }

  @PluginMethod
  public void updatesInstall(PluginCall call) {
    background(call, () -> {
      call.resolve(JSObject.fromJSONObject(updater.install()));
    });
  }

  @PluginMethod
  public void pairingStart(PluginCall call) {
    background(call, () -> {
      JSONObject value = gateway.pairingStart();
      call.resolve(
        new JSObject()
          .put("code", value.getString("code"))
          .put("expiresIn", value.getInt("expiresIn"))
      );
    });
  }

  @PluginMethod
  public void pairingPoll(PluginCall call) {
    background(call, () -> {
      call.resolve(new JSObject().put("ready", gateway.pairingPoll()));
    });
  }

  @PluginMethod
  public void pairingCancel(PluginCall call) {
    background(call, () -> {
      gateway.pairingCancel();
      call.resolve();
    });
  }

  private interface Task {
    void run() throws Exception;
  }

  private void background(PluginCall call, Task task) {
    background(io, call, task);
  }

  private void background(
    ExecutorService executor,
    PluginCall call,
    Task task
  ) {
    executor.execute(() -> {
      try {
        task.run();
      } catch (Exception e) {
        call.reject(
          e.getMessage() == null ? "Operation failed" : e.getMessage()
        );
      }
    });
  }

  @PluginMethod
  public void configure(PluginCall call) {
    background(call, () -> {
      gateway.configure(call.getString("server", ""));
      call.resolve();
    });
  }

  @PluginMethod
  public void request(PluginCall call) {
    background(
      call.getBoolean("binary", false) ? artworkIo : network,
      call,
      () -> {
        JSObject body = call.getObject("body");
        String path = call.getString("path", "");
        JSONObject account = gateway.session();
        ArtworkCache cache =
          account != null &&
          "/v1/soundcloud/artwork".equals(path) &&
          call.getBoolean("binary", false)
            ? new ArtworkCache(
                new java.io.File(
                  getContext().getCacheDir(),
                  "artwork-" + account.optLong("account_id")
                )
              )
            : null;
        String artwork = body == null ? "" : body.optString("url");
        Gateway.Response response = cache == null ? null : cache.read(artwork);
        if (response == null) {
          response = gateway.request(
            call.getString("path", ""),
            call.getString("method", "GET"),
            body
          );
          if (cache != null) cache.write(artwork, response);
        }
        JSObject result = new JSObject().put("status", response.status());
        if (call.getBoolean("binary", false)) {
          result.put(
            "data",
            Base64.encodeToString(response.bytes(), Base64.NO_WRAP)
          );
          result.put("contentType", response.type());
        } else {
          String data = new String(response.bytes(), StandardCharsets.UTF_8);
          result.put(
            "data",
            data.isEmpty()
              ? JSONObject.NULL
              : new org.json.JSONTokener(data).nextValue()
          );
        }
        call.resolve(result);
      }
    );
  }

  @PluginMethod
  public void session(PluginCall call) {
    background(call, () -> {
      JSONObject session = gateway.session();
      call.resolve(
        new JSObject()
          .put("signedIn", session != null)
          .put("accountId", session == null ? 0 : session.optLong("account_id"))
          .put("pending", loginRunning)
      );
    });
  }

  @PluginMethod
  public void logout(PluginCall call) {
    getActivity().runOnUiThread(() -> {
      if (controller != null) {
        controller.stop();
        controller.clearMediaItems();
      }
      if (controllerFuture != null) MediaController.releaseFuture(
        controllerFuture
      );
      controller = null;
      controllerFuture = null;
      getContext().stopService(new Intent(getContext(), PlaybackService.class));
      gateway.pairingCancel();
      SecureStore.clear(getContext());
      FeedbackStore.clear(getContext());
      call.resolve();
    });
  }

  private String random() {
    byte[] bytes = new byte[32];
    new SecureRandom().nextBytes(bytes);
    return Base64.encodeToString(
      bytes,
      Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP
    );
  }

  @PluginMethod
  public void login(PluginCall call) {
    if (loginRunning) {
      call.reject("Sign-in already open");
      return;
    }
    loginRunning = true;
    background(call, () -> {
      try {
        JSONObject config = gateway.raw("/v1/config", "GET", null, null).json();
        String redirect = config.getString("redirect_uri");
        Uri target = Uri.parse(redirect);
        if (
          !"127.0.0.1".equals(target.getHost()) &&
          !"localhost".equals(target.getHost())
        ) throw new Exception("Server uses an unsupported sign-in callback");
        String state = random(),
          verifier = random();
        String challenge = Base64.encodeToString(
          java.security.MessageDigest.getInstance("SHA-256").digest(
            verifier.getBytes(StandardCharsets.US_ASCII)
          ),
          Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP
        );
        try (
          ServerSocket socket = new ServerSocket(
            target.getPort(),
            2,
            InetAddress.getByName("127.0.0.1")
          )
        ) {
          socket.setSoTimeout(180000);
          Uri url = Uri.parse("https://secure.soundcloud.com/authorize")
            .buildUpon()
            .appendQueryParameter("client_id", config.getString("client_id"))
            .appendQueryParameter("redirect_uri", redirect)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("code_challenge_method", "S256")
            .appendQueryParameter("code_challenge", challenge)
            .appendQueryParameter("state", state)
            .build();
          getActivity().runOnUiThread(() ->
            getActivity().startActivity(new Intent(Intent.ACTION_VIEW, url))
          );
          String code = null;
          long deadline = System.currentTimeMillis() + 180000;
          while (code == null && System.currentTimeMillis() < deadline) {
            try (var client = socket.accept()) {
              client.setSoTimeout(5000);
              var reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(
                  client.getInputStream(),
                  StandardCharsets.US_ASCII
                )
              );
              String line = reader.readLine();
              if (line == null || line.length() > 8192) continue;
              String[] parts = line.split(" ");
              if (parts.length < 2) continue;
              Uri callback = Uri.parse("http://127.0.0.1" + parts[1]);
              boolean valid =
                target.getPath().equals(callback.getPath()) &&
                java.security.MessageDigest.isEqual(
                  state.getBytes(StandardCharsets.UTF_8),
                  callback.getQueryParameter("state") == null
                    ? new byte[0]
                    : callback
                        .getQueryParameter("state")
                        .getBytes(StandardCharsets.UTF_8)
                );
              byte[] reply = (
                valid
                  ? "Вход завершён. Вернись в Veirune."
                  : "Invalid sign-in callback"
              ).getBytes(StandardCharsets.UTF_8);
              client
                .getOutputStream()
                .write(
                  (
                    "HTTP/1.1 " +
                    (valid ? "200 OK" : "400 Bad Request") +
                    "\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\nContent-Length: " +
                    reply.length +
                    "\r\n\r\n"
                  ).getBytes(StandardCharsets.US_ASCII)
                );
              client.getOutputStream().write(reply);
              if (valid) {
                if (
                  callback.getQueryParameter("error") != null
                ) throw new Exception("SoundCloud sign-in was cancelled");
                code = callback.getQueryParameter("code");
              }
            }
          }
          if (code == null) throw new Exception("Sign-in expired");
          gateway.completeLogin(code, verifier);
          call.resolve();
        }
      } finally {
        loginRunning = false;
      }
    });
  }

  private void withPlayer(
    PluginCall call,
    java.util.function.Consumer<MediaController> task
  ) {
    getActivity().runOnUiThread(() -> {
      if (controller != null) {
        try {
          task.accept(controller);
        } catch (Exception e) {
          call.reject(e.getMessage());
        }
        return;
      }
      if (controllerFuture == null) controllerFuture =
        new MediaController.Builder(
          getContext(),
          new SessionToken(
            getContext(),
            new ComponentName(getContext(), PlaybackService.class)
          )
        ).buildAsync();
      controllerFuture.addListener(() -> {
        try {
          controller = controllerFuture.get();
          task.accept(controller);
        } catch (Exception e) {
          controllerFuture = null;
          call.reject("Could not start player");
        }
      }, ContextCompat.getMainExecutor(getContext()));
    });
  }

  static MediaItem item(JSONObject track) throws Exception {
    long id = track.getLong("id");
    Bundle extras = new Bundle();
    extras.putString("track", track.toString());
    extras.putBoolean("recommended", false);
    JSONObject user = track.optJSONObject("user");
    JSONObject metadata = track.optJSONObject("publisher_metadata");
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
    return new MediaItem.Builder()
      .setMediaId(String.valueOf(id))
      .setUri("fastcloud://track/" + id)
      .setMimeType(MimeTypes.APPLICATION_M3U8)
      .setMediaMetadata(
        new MediaMetadata.Builder()
          .setTitle(track.optString("title"))
          .setArtist(artist)
          .setExtras(extras)
          .build()
      )
      .build();
  }

  @PluginMethod
  public void play(PluginCall call) {
    withPlayer(call, p -> {
      try {
        JSONArray tracks = call.getArray("tracks");
        if (tracks == null || tracks.length() == 0) throw new Exception(
          "Queue is empty"
        );
        var items = new java.util.ArrayList<MediaItem>();
        for (int i = 0; i < tracks.length(); i++) {
          MediaItem value = item(tracks.getJSONObject(i));
          value.mediaMetadata.extras.putBoolean(
            "recommended",
            call.getBoolean("recommended", false)
          );
          var station = call.getObject("station");
          if (station != null) value.mediaMetadata.extras.putString(
            "station",
            station.toString()
          );
          items.add(value);
        }
        int index = call.getInt("index", 0);
        if (index < 0 || index >= items.size()) throw new Exception(
          "Invalid queue position"
        );
        p.setMediaItems(items, index, 0);
        p.prepare();
        p.play();
        call.resolve();
      } catch (Exception e) {
        call.reject(e.getMessage());
      }
    });
  }

  private static String playbackError(
    androidx.media3.common.PlaybackException error
  ) {
    for (Throwable cause = error; cause != null; cause = cause.getCause()) {
      if (
        cause instanceof java.net.SocketTimeoutException
      ) return "Server timed out while preparing audio";
      if (
        cause instanceof
          androidx.media3.datasource.HttpDataSource.InvalidResponseCodeException http
      ) {
        return "Audio request failed: HTTP " + http.responseCode;
      }
      if (
        cause instanceof java.net.ConnectException
      ) return "Could not connect to the audio server";
    }
    return "Playback failed: " + error.getErrorCodeName();
  }

  @PluginMethod
  public void player(PluginCall call) {
    withPlayer(call, p -> {
      JSArray queue = new JSArray();
      for (int i = 0; i < p.getMediaItemCount(); i++) {
        try {
          queue.put(
            new JSONObject(
              p.getMediaItemAt(i).mediaMetadata.extras.getString("track")
            )
          );
        } catch (Exception ignored) {}
      }
      long duration = p.getDuration();
      call.resolve(
        new JSObject()
          .put("queue", queue)
          .put("index", p.getCurrentMediaItemIndex())
          .put(
            "playing",
            p.getPlayWhenReady() &&
              p.getPlayerError() == null &&
              p.getPlaybackState() != Player.STATE_ENDED
          )
          .put("loading", p.getPlaybackState() == Player.STATE_BUFFERING)
          .put(
            "radioLoading",
            p.getCurrentMediaItem() != null &&
              p
                .getCurrentMediaItem()
                .mediaMetadata.extras.getBoolean("radio_loading", false)
          )
          .put(
            "radioError",
            p.getCurrentMediaItem() != null &&
              p
                .getCurrentMediaItem()
                .mediaMetadata.extras.getBoolean("radio_error", false)
          )
          .put("positionMs", Math.max(0, p.getCurrentPosition()))
          .put("durationMs", duration < 0 ? 0 : duration)
          .put("shuffle", p.getShuffleModeEnabled())
          .put("repeat", p.getRepeatMode())
          .put("speed", p.getPlaybackParameters().speed)
          .put(
            "error",
            p.getPlayerError() == null
              ? JSONObject.NULL
              : playbackError(p.getPlayerError())
          )
      );
    });
  }

  @PluginMethod
  public void enqueue(PluginCall call) {
    withPlayer(call, p -> {
      try {
        MediaItem value = item(call.getObject("track"));
        int index = call.getBoolean("next", false)
          ? p.getCurrentMediaItemIndex() + 1
          : p.getMediaItemCount();
        p.addMediaItem(index, value);
        call.resolve();
      } catch (Exception e) {
        call.reject(e.getMessage());
      }
    });
  }

  @PluginMethod
  public void control(PluginCall call) {
    withPlayer(call, p -> {
      try {
        String action = call.getString("action", "");
        double value = BridgeNumbers.number(call.getData().opt("value"), 0);
        int index = call.getInt("index", 0);
        switch (action) {
          case "toggle" -> {
            if (
              p.getPlayerError() != null ||
              p.getPlaybackState() == Player.STATE_IDLE ||
              p.getPlaybackState() == Player.STATE_ENDED
            ) {
              if (p.getPlaybackState() == Player.STATE_ENDED) p.seekTo(0);
              p.prepare();
              p.play();
            } else if (p.getPlayWhenReady()) p.pause();
            else p.play();
          }
          case "play" -> {
            if (p.getPlaybackState() == Player.STATE_IDLE) p.prepare();
            p.play();
          }
          case "pause" -> p.pause();
          case "next" -> p.seekToNextMediaItem();
          case "previous_track" -> p.seekToPreviousMediaItem();
          case "previous" -> {
            if (p.getCurrentPosition() > 3000) p.seekTo(0);
            else p.seekToPreviousMediaItem();
          }
          case "seek" -> p.seekTo(Math.max(0, (long) value));
          case "shuffle" -> p.setShuffleModeEnabled(!p.getShuffleModeEnabled());
          case "repeat" -> p.setRepeatMode((p.getRepeatMode() + 1) % 3);
          case "speed" -> p.setPlaybackSpeed(
            (float) Math.max(.5, Math.min(2, value))
          );
          case "volume" -> p.setVolume((float) Math.max(0, Math.min(1, value)));
          case "remove" -> p.removeMediaItem(index);
          case "jump" -> p.seekToDefaultPosition(index);
          case "move" -> p.moveMediaItem(index, call.getInt("target", 0));
          case "eq" -> getContext()
            .getSharedPreferences("playback", 0)
            .edit()
            .putInt("eq", (int) Math.max(0, Math.min(3, value)))
            .apply();
          case "sleep" -> getContext()
            .getSharedPreferences("playback", 0)
            .edit()
            .putLong(
              "sleep",
              value == 0 ? 0 : System.currentTimeMillis() + (long) value * 1000
            )
            .apply();
          default -> throw new IllegalArgumentException(
            "Unknown player action"
          );
        }
        call.resolve();
      } catch (Exception e) {
        call.reject(e.getMessage());
      }
    });
  }

  @PluginMethod
  public void playbackSettings(PluginCall call) {
    try {
      synchronized (FeedbackStore.class) {
        JSONObject account = gateway.session();
        if (
          account == null ||
          account.optLong("account_id") !=
            BridgeNumbers.id(call.getData().opt("accountId"))
        ) throw new Exception("Account changed; retry the request");
        if (call.getArray("history") != null) getContext()
          .getSharedPreferences("playback", 0)
          .edit()
          .putString("history", call.getArray("history").toString())
          .apply();
        if (call.getArray("likes") != null) getContext()
          .getSharedPreferences("playback", 0)
          .edit()
          .putString("likes", call.getArray("likes").toString())
          .apply();
        getContext()
          .getSharedPreferences("playback", 0)
          .edit()
          .putString(
            "preferences",
            call.getObject("preferences", new JSObject()).toString()
          )
          .apply();
        FeedbackStore.merge(
          getContext(),
          call.getObject("feedback", new JSObject())
        );
        call.resolve();
      }
    } catch (Exception e) {
      call.reject("Could not save music preferences");
    }
  }

  @PluginMethod
  public void download(PluginCall call) {
    background(call, () -> {
      Offline.download(getContext(), gateway, call.getObject("track"));
      call.resolve();
    });
  }

  @PluginMethod
  public void downloads(PluginCall call) {
    background(call, () -> {
      call.resolve(new JSObject().put("items", Offline.list(getContext())));
    });
  }

  @PluginMethod
  public void removeDownload(PluginCall call) {
    background(call, () -> {
      Offline.remove(getContext(), BridgeNumbers.id(call.getData().opt("id")));
      call.resolve();
    });
  }

  @Override
  protected void handleOnDestroy() {
    if (controllerFuture != null) MediaController.releaseFuture(
      controllerFuture
    );
    io.shutdown();
    super.handleOnDestroy();
  }
}
