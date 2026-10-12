package work.comf.fastcloud.mobile;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import org.json.JSONObject;

final class MobileUpdater {

  private final Context context;
  private final Gateway gateway;
  private volatile JSONObject release;
  private volatile String phase = "idle",
    error = "";
  private volatile long received, total;
  private volatile boolean cancelled;
  private volatile HttpURLConnection activeConnection;
  private final java.util.concurrent.atomic.AtomicBoolean downloading =
    new java.util.concurrent.atomic.AtomicBoolean();
  private final File apk;

  MobileUpdater(Context context, Gateway gateway) {
    this.context = context.getApplicationContext();
    this.gateway = gateway;
    File directory = new File(context.getCacheDir(), "updates");
    directory.mkdirs();
    apk = new File(directory, "Veirune-Mobile.apk");
    try {
      String saved = context
        .getSharedPreferences("updater", 0)
        .getString("release", null);
      if (saved != null) {
        JSONObject value = new JSONObject(saved);
        if (valid(value) && value.getLong("build") > installedBuild()) {
          release = value;
          phase = apk.isFile() ? "ready" : "available";
        }
      }
    } catch (Exception ignored) {}
  }

  @SuppressWarnings("deprecation")
  private PackageInfo installed() throws Exception {
    return context
      .getPackageManager()
      .getPackageInfo(
        context.getPackageName(),
        Build.VERSION.SDK_INT >= 28
          ? PackageManager.GET_SIGNING_CERTIFICATES
          : PackageManager.GET_SIGNATURES
      );
  }

  private long installedBuild() throws Exception {
    PackageInfo value = installed();
    return Build.VERSION.SDK_INT >= 28
      ? value.getLongVersionCode()
      : value.versionCode;
  }

  @SuppressWarnings("deprecation")
  private String signature(PackageInfo value) throws Exception {
    Signature[] signatures =
      Build.VERSION.SDK_INT >= 28 && value.signingInfo != null
        ? value.signingInfo.getApkContentsSigners()
        : value.signatures;
    if (signatures == null || signatures.length != 1) throw new IOException(
      "Unsupported application signature"
    );
    return UpdateRules.hex(
      MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray())
    );
  }

  private boolean valid(JSONObject value) throws Exception {
    return (
      UpdateRules.acceptable(
        value.optString("packageId"),
        value.optString("version"),
        value.optLong("build"),
        installedBuild(),
        value.optLong("bytes"),
        value.optString("sha256"),
        value.optString("signatureSha256")
      ) &&
      value
        .optString("downloadPath")
        .equals("/v1/mobile/update/apk/" + value.getString("version"))
    );
  }

  JSONObject check() throws Exception {
    if (downloading.get()) return status();
    Gateway.Response response = gateway.raw(
      "/v1/mobile/update?platform=android",
      "GET",
      null,
      null
    );
    if (response.status() != 200) throw new IOException(
      response.status() == 404
        ? "Обнови сервер Veirune, чтобы проверять обновления телефона"
        : "Не удалось проверить обновления. Попробуй позже."
    );
    synchronized (this) {
      if (downloading.get()) return status();
      JSONObject value = response.json().optJSONObject("release");
      if (value == null || value.optLong("build") <= installedBuild()) {
        release = null;
        phase = "idle";
        error = "";
        apk.delete();
        context
          .getSharedPreferences("updater", 0)
          .edit()
          .remove("release")
          .apply();
        return status();
      }
      if (!valid(value)) throw new IOException(
        "Не удалось проверить данные обновления"
      );
      boolean same =
        release != null &&
        release.optString("sha256").equals(value.getString("sha256"));
      if (!same) apk.delete();
      release = value;
      phase = same && apk.isFile() ? "ready" : "available";
      error = "";
      context
        .getSharedPreferences("updater", 0)
        .edit()
        .putString("release", value.toString())
        .apply();
      return status();
    }
  }

  synchronized JSONObject status() throws Exception {
    JSONObject value = release;
    return new JSONObject()
      .put("supported", true)
      .put("currentVersion", installed().versionName)
      .put("currentBuild", installedBuild())
      .put("phase", phase)
      .put("received", received)
      .put("total", total)
      .put("error", error)
      .put("release", value == null ? JSONObject.NULL : value)
      .put(
        "compatible",
        value == null ||
          signature(installed()).equals(value.optString("signatureSha256"))
      );
  }

  void cancel() {
    cancelled = true;
    HttpURLConnection connection = activeConnection;
    if (connection != null) connection.disconnect();
  }

  JSONObject download() throws Exception {
    final JSONObject value;
    synchronized (this) {
      value = release;
      if (value == null || !valid(value)) throw new IOException(
        "Сначала проверь обновления"
      );
      if (
        !signature(installed()).equals(value.getString("signatureSha256"))
      ) throw new IOException(
        "Эта тестовая сборка подписана другим ключом. Установи официальную сборку вручную."
      );
      if (!downloading.compareAndSet(false, true)) throw new IOException(
        "Обновление уже скачивается"
      );
      cancelled = false;
      phase = "downloading";
      error = "";
      received = 0;
      total = value.getLong("bytes");
    }
    File temporary = new File(apk.getParentFile(), "download.part");
    HttpURLConnection connection = null;
    try {
      if (
        apk.getParentFile().getUsableSpace() < total + 32 * 1024 * 1024
      ) throw new IOException("Недостаточно свободного места");
      connection = (HttpURLConnection) new URL(
        gateway.server() + value.getString("downloadPath")
      ).openConnection();
      activeConnection = connection;
      if (cancelled) throw new IOException("Скачивание отменено");
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(15000);
      connection.setReadTimeout(30000);
      if (
        connection.getResponseCode() != 200 ||
        connection.getContentLengthLong() != total
      ) throw new IOException(
        "Не удалось скачать обновление. Попробуй ещё раз."
      );
      MessageDigest hash = MessageDigest.getInstance("SHA-256");
      try (
        var input = connection.getInputStream();
        var output = new FileOutputStream(temporary)
      ) {
        byte[] buffer = new byte[65536];
        int count;
        while ((count = input.read(buffer)) != -1) {
          if (cancelled) throw new IOException("Скачивание отменено");
          if (received + count > total) throw new IOException(
            "Неверный размер обновления"
          );
          output.write(buffer, 0, count);
          hash.update(buffer, 0, count);
          received += count;
        }
        output.getFD().sync();
      }
      if (
        received != total ||
        !UpdateRules.hex(hash.digest()).equals(value.getString("sha256"))
      ) throw new IOException("Обновление повреждено. Скачай его ещё раз.");
      verifyPackage(temporary, value);
      if (cancelled) throw new IOException("Скачивание отменено");
      if (apk.exists() && !apk.delete()) throw new IOException(
        "Не удалось подготовить обновление"
      );
      if (!temporary.renameTo(apk)) throw new IOException(
        "Не удалось сохранить обновление"
      );
      phase = "ready";
      return status();
    } catch (Exception failure) {
      temporary.delete();
      phase = "available";
      error = cancelled
        ? ""
        : failure.getMessage() == null
          ? "Не удалось скачать обновление"
          : failure.getMessage();
      throw failure;
    } finally {
      if (connection != null) connection.disconnect();
      activeConnection = null;
      downloading.set(false);
    }
  }

  @SuppressWarnings("deprecation")
  private void verifyPackage(File file, JSONObject value) throws Exception {
    PackageInfo archive = context
      .getPackageManager()
      .getPackageArchiveInfo(
        file.getAbsolutePath(),
        Build.VERSION.SDK_INT >= 28
          ? PackageManager.GET_SIGNING_CERTIFICATES
          : PackageManager.GET_SIGNATURES
      );
    if (
      archive == null ||
      !archive.packageName.equals(context.getPackageName()) ||
      !value.getString("version").equals(archive.versionName) ||
      (Build.VERSION.SDK_INT >= 28
        ? archive.getLongVersionCode()
        : archive.versionCode) != value.getLong("build") ||
      !signature(archive).equals(signature(installed()))
    ) throw new IOException("Не удалось проверить подпись обновления");
  }

  synchronized JSONObject install() throws Exception {
    JSONObject value = release;
    if (
      value == null || !apk.isFile() || !"ready".equals(phase)
    ) throw new IOException("Сначала скачай обновление");
    try {
      MessageDigest hash = MessageDigest.getInstance("SHA-256");
      try (var input = new java.io.FileInputStream(apk)) {
        byte[] data = new byte[65536];
        int count;
        while ((count = input.read(data)) != -1) hash.update(data, 0, count);
      }
      if (
        apk.length() != value.getLong("bytes") ||
        !UpdateRules.hex(hash.digest()).equals(value.getString("sha256"))
      ) throw new IOException("Обновление повреждено. Скачай его ещё раз.");
      verifyPackage(apk, value);
    } catch (Exception failure) {
      apk.delete();
      phase = "available";
      error = "Обновление повреждено. Скачай его ещё раз.";
      throw failure;
    }
    if (
      Build.VERSION.SDK_INT >= 26 &&
      !context.getPackageManager().canRequestPackageInstalls()
    ) {
      Intent permission = new Intent(
        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:" + context.getPackageName())
      ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(permission);
      return new JSONObject().put("needsPermission", true);
    }
    Uri uri = FileProvider.getUriForFile(
      context,
      context.getPackageName() + ".fileprovider",
      apk
    );
    Intent installer = new Intent(Intent.ACTION_VIEW)
      .setDataAndType(uri, "application/vnd.android.package-archive")
      .addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK
      );
    context.startActivity(installer);
    return new JSONObject().put("needsPermission", false);
  }
}
