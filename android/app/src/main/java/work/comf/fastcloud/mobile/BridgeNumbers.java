package work.comf.fastcloud.mobile;

final class BridgeNumbers {
  private BridgeNumbers() {}

  static double number(Object value, double fallback) {
    if (value == null) return fallback;
    if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue())) {
      throw new IllegalArgumentException("Invalid numeric argument");
    }
    return number.doubleValue();
  }

  static long id(Object value) {
    double number = number(value, 0);
    if (number < 1 || number > 9007199254740991d || number != Math.rint(number)) {
      throw new IllegalArgumentException("Invalid account or track identity");
    }
    return (long) number;
  }
}
