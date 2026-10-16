# Mobile UI 0.1.8

`ArtistCatalog` takes `userId`, optional `ownSections`, and independent `tracks` and `lists` resources, each with
`value`, `loading` and `error`. The shared Status component retries through the
application's resource revision. The catalog renders
tracks, popular uploads, albums, playlists, likes and reposts without waiting for unrelated resources. An empty catalog,
loading, retry, cached values during refresh and no search matches are distinct
states. Tabs have linked panels, roving focus and arrow/Home/End navigation.
Search is labelled; buttons retain the application's touch target sizes.
Likes and reposts mount on selection, use the same paginated authenticated API
routes as desktop, and unwrap track/playlist envelopes. Reposted playlists have
their own loading/retry state. Own profiles include saved albums/playlists and
embed the existing following/dislikes views; other users' private feedback is
never requested. Tab labels scroll horizontally instead of shrinking to fit.

`WallpaperEditor` takes `file: File | null` and `onClose`. A new file uses a
temporary object URL until Save. Null edits the existing wallpaper. Drag/pinch
and arrow/+/- keys adjust framing; the labelled zoom slider provides an
alternative to pinch. Fill screen, Fit image and Reset are explicit controls.
It fills the viewport through Sheet's fullscreen variant: the canvas is the
same size as the application wallpaper. Compact overlaid controls leave the
image visible; placement, zoom slider and reset are under Options. It uses the
shared focus trap, Escape/close behavior and opaque theme controls.
Invalid/oversized media blocks saving; save failures remain retryable.
Saving disables controls and closing until persistence finishes.

Preview locally with `npm run dev`, open `/?demo=1`, then Profile → Following →
an artist, or Profile → Settings → Choose wallpaper. Demo collections include
one release and one ordinary playlist. They never substitute for real backend
data in the installed app. The wallpaper picker changes this demo browser's
local preferences only.

Targeted automated geometry/classification tests and browser checks are listed
in [verification](verification.md). Browser drag/keyboard verification does not
replace a real Honor multi-touch check.
