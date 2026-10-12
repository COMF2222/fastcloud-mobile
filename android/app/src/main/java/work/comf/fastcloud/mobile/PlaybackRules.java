package work.comf.fastcloud.mobile;

final class PlaybackRules {

  static boolean heard(
    boolean playing,
    long elapsed,
    long positionDelta,
    float speed
  ) {
    return (
      playing &&
      elapsed > 0 &&
      elapsed <= 2000 &&
      Math.abs(positionDelta - elapsed * speed) < 2000
    );
  }

  static long fadeDuration(
    long requested,
    long outgoingDuration,
    long incomingDuration
  ) {
    return Math.max(
      0,
      Math.min(
        8000,
        Math.min(
          requested,
          Math.min(
            outgoingDuration / 2,
            incomingDuration > 0 ? incomingDuration / 2 : 8000
          )
        )
      )
    );
  }

  static double outgoingGain(double progress) {
    return Math.cos((Math.max(0, Math.min(1, progress)) * Math.PI) / 2);
  }

  static double incomingGain(double progress) {
    return Math.sin((Math.max(0, Math.min(1, progress)) * Math.PI) / 2);
  }
}
