package work.comf.fastcloud.mobile;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import java.util.ArrayList;
import org.json.JSONObject;

final class AppIcons {
  static final int DEFAULT = 9;
  private static ComponentName component(Context context, int id) {
    return new ComponentName(context.getPackageName(), context.getPackageName() + ".Icon" + String.format(java.util.Locale.ROOT, "%02d", id));
  }
  static boolean valid(int id) { return id >= 1 && id <= 12; }
  private static int selected(Context context) {
    PackageManager manager = context.getPackageManager();
    for (int id = 1; id <= 12; id++) {
      int state = manager.getComponentEnabledSetting(component(context, id));
      if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
          (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && id == DEFAULT)) return id;
    }
    return DEFAULT;
  }
  static synchronized JSONObject apply(Context context, Integer requested) throws Exception {
    if (requested == null) return new JSONObject().put("selected", selected(context)).put("supported", true);
    int id = requested;
    if (!valid(id)) throw new IllegalArgumentException("Choose an icon from 1 to 12");
    PackageManager manager = context.getPackageManager();
    int previous = selected(context);
    try {
      if (Build.VERSION.SDK_INT >= 33) {
        var settings = new ArrayList<PackageManager.ComponentEnabledSetting>();
        for (int candidate = 1; candidate <= 12; candidate++) settings.add(new PackageManager.ComponentEnabledSetting(
          component(context, candidate), candidate == id ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
          PackageManager.DONT_KILL_APP));
        manager.setComponentEnabledSettings(settings);
      } else {
        // Enable the replacement before removing any launcher entry.
        manager.setComponentEnabledSetting(component(context, id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (int candidate = 1; candidate <= 12; candidate++) if (candidate != id)
          manager.setComponentEnabledSetting(component(context, candidate), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
      }
    } catch (Exception failure) {
      manager.setComponentEnabledSetting(component(context, previous), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
      if (id != previous) manager.setComponentEnabledSetting(component(context, id), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
      throw failure;
    }
    return new JSONObject().put("selected", id).put("supported", true);
  }
}
