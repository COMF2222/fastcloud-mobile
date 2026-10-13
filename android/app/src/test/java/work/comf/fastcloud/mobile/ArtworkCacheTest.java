package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import java.io.File;
import org.junit.*;
import org.junit.rules.TemporaryFolder;

public class ArtworkCacheTest {

  @Rule
  public TemporaryFolder temporary = new TemporaryFolder();

  @Test
  public void artworkSurvivesReopeningAndExpiresWithoutKeepingUrlsOrCredentials()
    throws Exception {
    var dir = temporary.newFolder();
    long[] now = { 1000000 };
    var cache = new ArtworkCache(dir, 1024, () -> now[0]);
    var image = new Gateway.Response(200, new byte[] { 1, 2, 3 }, "image/jpeg");
    cache.write("https://i1.sndcdn.com/art-secret-query.jpg?x=1", image);
    assertArrayEquals(
      image.bytes(),
      new ArtworkCache(dir, 1024, () -> now[0])
        .read("https://i1.sndcdn.com/art-secret-query.jpg?x=1")
        .bytes()
    );
    for (File file : dir.listFiles())
      assertFalse(file.getName().contains("secret"));
    now[0] += 8L * 86400000;
    assertNull(cache.read("https://i1.sndcdn.com/art-secret-query.jpg?x=1"));
  }

  @Test
  public void budgetEvictsOldImagesAndRejectsHtmlAndForeignHosts()
    throws Exception {
    long[] now = { 1000000 };
    var cache = new ArtworkCache(temporary.newFolder(), 6, () -> now[0]);
    var image = new Gateway.Response(200, new byte[4], "image/png");
    cache.write("https://i1.sndcdn.com/a.png", image);
    now[0]++;
    cache.write("https://i1.sndcdn.com/b.png", image);
    assertNull(cache.read("https://i1.sndcdn.com/a.png"));
    assertNotNull(cache.read("https://i1.sndcdn.com/b.png"));
    cache.write("https://example.com/a.png", image);
    assertNull(cache.read("https://example.com/a.png"));
    cache.write(
      "https://i1.sndcdn.com/a.html",
      new Gateway.Response(200, new byte[4], "text/html")
    );
    assertNull(cache.read("https://i1.sndcdn.com/a.html"));
  }
}
