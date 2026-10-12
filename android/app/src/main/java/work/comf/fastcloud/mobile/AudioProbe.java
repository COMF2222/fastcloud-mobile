package work.comf.fastcloud.mobile;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor.AudioFormat;
import androidx.media3.common.audio.BaseAudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

@androidx.media3.common.util.UnstableApi
final class AudioProbe extends BaseAudioProcessor {

  private long samples;
  private double squares, peak;
  private int limit;
  private volatile double gain = 1;

  double gain() {
    return gain;
  }

  synchronized void restart() {
    samples = 0;
    squares = 0;
    peak = 0;
    gain = 1;
  }

  @Override
  protected AudioFormat onConfigure(AudioFormat format) {
    limit = Math.max(1, format.sampleRate * format.channelCount * 10);
    restart();
    return format.encoding == C.ENCODING_PCM_16BIT
      ? format
      : AudioFormat.NOT_SET;
  }

  @Override
  public synchronized void queueInput(ByteBuffer input) {
    // Media3 drains the pipeline with EMPTY_BUFFER, which is also the base
    // processor's initial output buffer. Copying it into itself throws.
    if (!input.hasRemaining()) return;
    ByteBuffer view = input.duplicate().order(ByteOrder.LITTLE_ENDIAN);
    while (view.remaining() >= 2 && samples < limit) {
      double sample = view.getShort() / 32768.0;
      squares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      samples++;
    }
    if (samples > limit / 5) {
      double rms = Math.sqrt(squares / samples);
      gain =
        rms > .001
          ? Math.max(
              .25,
              Math.min(2, Math.min(.12 / rms, peak > .001 ? .95 / peak : 2))
            )
          : 1;
    }
    ByteBuffer output = replaceOutputBuffer(input.remaining());
    output.put(input);
    output.flip();
  }
}
