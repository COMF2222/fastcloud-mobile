package work.comf.fastcloud.mobile;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureStore {

  private static final String ALIAS = "FastcloudMobileSession";

  private static SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore");
    store.load(null);
    if (!store.containsAlias(ALIAS)) {
      KeyGenerator generator = KeyGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_AES,
        "AndroidKeyStore"
      );
      generator.init(
        new KeyGenParameterSpec.Builder(
          ALIAS,
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          .build()
      );
      generator.generateKey();
    }
    return (SecretKey) store.getKey(ALIAS, null);
  }

  static synchronized void set(Context context, String value) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(Cipher.ENCRYPT_MODE, key());
    context
      .getSharedPreferences("auth", 0)
      .edit()
      .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
      .putString(
        "session",
        Base64.encodeToString(
          cipher.doFinal(
            value.getBytes(java.nio.charset.StandardCharsets.UTF_8)
          ),
          Base64.NO_WRAP
        )
      )
      .commit();
  }

  static synchronized String get(Context context) throws Exception {
    var prefs = context.getSharedPreferences("auth", 0);
    String value = prefs.getString("session", null);
    if (value == null) return null;
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
      Cipher.DECRYPT_MODE,
      key(),
      new GCMParameterSpec(
        128,
        Base64.decode(prefs.getString("iv", ""), Base64.NO_WRAP)
      )
    );
    return new String(
      cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)),
      java.nio.charset.StandardCharsets.UTF_8
    );
  }

  static synchronized void replace(
    Context context,
    String expectedRefresh,
    String value
  ) throws Exception {
    String existing = get(context);
    if (
      existing == null ||
      !new org.json.JSONObject(existing)
        .optString("refresh_token")
        .equals(expectedRefresh)
    ) throw new java.io.IOException("Account changed; retry the request");
    set(context, value);
  }

  static synchronized void clear(Context context) {
    context.getSharedPreferences("auth", 0).edit().clear().commit();
  }
}
