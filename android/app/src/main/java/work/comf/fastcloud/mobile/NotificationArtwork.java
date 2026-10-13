package work.comf.fastcloud.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import androidx.media3.common.util.BitmapLoader;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.ListeningExecutorService;
import com.google.common.util.concurrent.MoreExecutors;
import java.io.File;
import java.io.IOException;
import java.util.Set;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Session/lock-screen artwork uses the same authenticated relay as the UI. */
@androidx.media3.common.util.UnstableApi
final class NotificationArtwork implements BitmapLoader, AutoCloseable {

  private final Context context;
  private final Gateway gateway;
  private final ListeningExecutorService executor =
    MoreExecutors.listeningDecorator(Executors.newFixedThreadPool(2));

  NotificationArtwork(Context context, Gateway gateway) {
    this.context = context.getApplicationContext();
    this.gateway = gateway;
  }

  @Override
  public boolean supportsMimeType(String type) {
    return (
      type != null &&
      Set.of(
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/avif"
      ).contains(type)
    );
  }

  @Override
  public ListenableFuture<Bitmap> decodeBitmap(byte[] data) {
    return executor.submit(() -> decode(data));
  }

  @Override
  public ListenableFuture<Bitmap> loadBitmap(Uri uri) {
    return executor.submit(() -> {
      String url = TrackMetadata.artwork(uri.toString());
      if (url == null) throw new IOException("Unsupported cover address");
      JSONObject account = gateway.session();
      if (account == null) throw new IOException("Sign in to load the cover");
      long owner = account.optLong("account_id");
      ArtworkCache cache = new ArtworkCache(
        new File(context.getCacheDir(), "artwork-" + owner)
      );
      Gateway.Response response = cache.read(url);
      if (response == null) {
        response = gateway.request(
          "/v1/soundcloud/artwork",
          "POST",
          new JSONObject().put("url", url)
        );
        JSONObject current = gateway.session();
        if (
          current == null || current.optLong("account_id") != owner
        ) throw new IOException("Account changed");
        if (response.status() != 200) throw new IOException(
          "Cover unavailable"
        );
        cache.write(url, response);
      }
      return decode(response.bytes());
    });
  }

  private static Bitmap decode(byte[] bytes) throws IOException {
    if (
      bytes.length == 0 || bytes.length > 10 * 1024 * 1024
    ) throw new IOException("Invalid cover size");
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inJustDecodeBounds = true;
    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
    if (
      options.outWidth <= 0 ||
      options.outHeight <= 0 ||
      options.outWidth > 32768 ||
      options.outHeight > 32768
    ) throw new IOException("Invalid cover dimensions");
    options.inSampleSize = 1;
    while (
        Math.max(
          options.outWidth / options.inSampleSize,
          options.outHeight / options.inSampleSize
        ) > 1024
      )
      options.inSampleSize *= 2;
    options.inJustDecodeBounds = false;
    Bitmap bitmap = BitmapFactory.decodeByteArray(
      bytes,
      0,
      bytes.length,
      options
    );
    if (bitmap == null) throw new IOException("Unsupported cover data");
    return bitmap;
  }

  @Override
  public void close() {
    executor.shutdownNow();
  }
}
