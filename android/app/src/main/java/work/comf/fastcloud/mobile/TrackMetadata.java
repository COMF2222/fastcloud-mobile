package work.comf.fastcloud.mobile;

import java.net.URI;

final class TrackMetadata {

  static String credit(Object... values) {
    for (Object value : values)
      if (value instanceof String text) {
        text = text.trim();
        if (
          !text.isEmpty() &&
          !text.equalsIgnoreCase("null") &&
          !text.equalsIgnoreCase("undefined")
        ) return text;
      }
    return "";
  }

  static String artwork(Object... values) {
    for (Object value : values) {
      String text = credit(value);
      if (text.isEmpty()) continue;
      try {
        URI uri = new URI(text);
        if (
          !"https".equals(uri.getScheme()) ||
          uri.getHost() == null ||
          !uri.getHost().matches("i[1-4]\\.sndcdn\\.com") ||
          uri.getUserInfo() != null ||
          uri.getPort() != -1 ||
          uri.getFragment() != null
        ) continue;
        String path = uri.getRawPath();
        String resized = path.replaceFirst(
          "-(?:large|small|t\\d+x\\d+)\\.(jpg|jpeg|png|webp)$",
          "-t500x500.$1"
        );
        return (
          "https://" +
          uri.getHost() +
          resized +
          (uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery())
        );
      } catch (Exception ignored) {}
    }
    return null;
  }
}
