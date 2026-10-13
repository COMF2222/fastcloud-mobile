package work.comf.fastcloud.mobile;

import static org.junit.Assert.*;

import org.junit.Test;

public class TrackMetadataTest {

  @Test
  public void nullCreditsNeverBecomeTheNotificationArtist() {
    assertEquals(
      "Lil Peep",
      TrackMetadata.credit(null, "null", " ", "Lil Peep")
    );
    assertEquals("CUPSIZE", TrackMetadata.credit("CUPSIZE", "Uploader"));
    assertEquals(
      "Uploader",
      TrackMetadata.credit(new Object(), "undefined", "Uploader")
    );
    assertEquals("", TrackMetadata.credit(null, "null"));
  }

  @Test
  public void notificationCoversHaveEnoughResolutionAndPreserveTheCdnQuery() {
    assertEquals(
      "https://i1.sndcdn.com/artworks-example-t500x500.jpg?size=1",
      TrackMetadata.artwork(
        "https://i1.sndcdn.com/artworks-example-large.jpg?size=1"
      )
    );
    assertEquals(
      "https://i2.sndcdn.com/avatar-t500x500.jpg",
      TrackMetadata.artwork(
        null,
        "null",
        "https://i2.sndcdn.com/avatar-large.jpg"
      )
    );
    assertEquals(
      "https://i1.sndcdn.com/art-original.jpg",
      TrackMetadata.artwork("https://i1.sndcdn.com/art-original.jpg")
    );
    assertNull(
      TrackMetadata.artwork(
        "http://i1.sndcdn.com/a.jpg",
        "https://evil.example/a.jpg",
        "https://i1.sndcdn.com@evil.example/a.jpg",
        "https://i1.sndcdn.com:443/a.jpg"
      )
    );
  }
}
