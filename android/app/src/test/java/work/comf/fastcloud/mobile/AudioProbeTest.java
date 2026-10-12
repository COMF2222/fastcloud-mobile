package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import androidx.media3.common.C;
import androidx.media3.common.audio.AudioProcessor;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.Test;

public class AudioProbeTest {
  @Test
  public void emptyPipelineInputDoesNotCopyTheBufferIntoItself() {
    AudioProbe probe = new AudioProbe();
    probe.queueInput(AudioProcessor.EMPTY_BUFFER);
    assertFalse(probe.getOutput().hasRemaining());
    probe.queueEndOfStream();
    assertTrue(probe.isEnded());
  }

  @Test
  public void pcmIsPreservedAcrossEmptyInputsAndBufferReuse() throws Exception {
    AudioProbe probe = new AudioProbe();
    probe.configure(new AudioProcessor.AudioFormat(48000, 2, C.ENCODING_PCM_16BIT));
    probe.flush();
    for (int i = 0; i < 3; i++) {
      probe.queueInput(AudioProcessor.EMPTY_BUFFER);
      ByteBuffer pcm = ByteBuffer.allocateDirect(4).order(ByteOrder.nativeOrder());
      pcm.putShort((short) 1234).putShort((short) -2345).flip();
      probe.queueInput(pcm);
      assertFalse(pcm.hasRemaining());
      ByteBuffer output = probe.getOutput().order(ByteOrder.nativeOrder());
      assertEquals(4, output.remaining());
      assertEquals(1234, output.getShort());
      assertEquals(-2345, output.getShort());
    }
    probe.queueInput(AudioProcessor.EMPTY_BUFFER);
    probe.queueEndOfStream();
    assertFalse(probe.getOutput().hasRemaining());
    assertTrue(probe.isEnded());
  }
}
