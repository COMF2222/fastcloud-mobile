package work.comf.fastcloud.mobile;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

  @Override
  public void onCreate(android.os.Bundle state) {
    registerPlugin(FastcloudPlugin.class);
    super.onCreate(state);
  }
}
