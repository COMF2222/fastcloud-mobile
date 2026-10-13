# Architecture and storage

The mobile repository is independent of the desktop repository. React/TypeScript
provides one Android/iOS interface; native players own background playback.
Pure lyric timing, genres, greetings, recommendation ranking and chat contracts
come from desktop commit df3eee0e7b9906ddbd7604879da5106290665c12.

| Mobile file | Desktop reference |
|---|---|
| lyricsTiming.ts | desktop/src/lyricsTiming.ts |
| genres.ts | desktop/src/genres.ts |
| waveGreeting.ts | desktop/src/waveGreeting.ts |
| chatTypes.ts | desktop/src/chatTypes.ts |
| searchRecommendations.ts | desktop/src/searchRecommendations.ts |
| themePalette.ts | material and contrast functions in desktop/src/theme.ts |

## Backend and identity

All SoundCloud metadata, artwork and audio go through the configured HTTPS
Fastcloud backend. The phone contains no application secret. OAuth tokens stay
native, encrypted with Android Keystore AES-GCM or iOS Keychain; JavaScript never
persists them. Refresh is serialized and conditional on the original account and
refresh grant, so a late refresh cannot restore a signed-out account.

Phone pairing obtains a fresh independent OAuth grant on the PC. The backend
rotates it, checks that both grants identify the same permitted user, and keeps a
bounded short-lived handoff in memory. Only the phone's private 256-bit ticket
can retrieve credentials; the public eight-character code cannot. Codes expire
after ten minutes or a server restart. Delivery permits identical retries for
one minute. Native code encrypts the received grant and discards the ticket.
The existing desktop refresh grant is neither copied nor replaced.

The lyrics worker reuses the desktop Rust provider/matching engine and regression
tests. Credentials enter through stdin rather than process arguments. Runtime,
worker concurrency, request/output sizes and caches are bounded. Yandex import
uses a fixed API, bounded response and transient user token; it is not retained.

## Portable data

/v1/me/personal is shared with desktop. Preferences load before dirty keys upload,
so first login cannot replace existing settings with defaults. Caches and import
journals are per account. Updates use timestamp/device ordering; newer dislike
removals win over stale retries. Deletions preserve server tombstones. Patch
batches have at most 100 keys per section and retain unacknowledged edits.

Listening counters are cumulative per device/day/track. The server merges maxima
for retry safety and sums independent devices. Queue transitions and heard-time
accounting continue natively with the screen locked. Likes/playlists/follows remain
authoritative in SoundCloud via the relay. Chat/leaderboard data live in Fastcloud.

Portable: taste, appearance values, dislikes, folders, smart rules, statistics and
leaderboard anonymity. Device-only: wallpaper bytes, queue, downloads, sleep timer
and native audio controls. Imports reconcile uncertain playlist writes and split
track writes at 500 rather than duplicating a playlist on retry.

## Players

Track menus, the expanded player, collection details and artist profiles can
start seed radio. Sixteen playable seeds sample the complete collection; the
opening song plays before recommendations finish loading. Native playback keeps
the original station context in the account-scoped queue and continues it with
the screen locked, independently of ordinary playlist autoplay. Android fetches
four related pages concurrently with a bounded wait and a twenty-second retry
interval; selection preserves page rank while mixing sources, filtering dislikes,
previews and already heard recordings. Artist radio aims for one source-artist
song in three. Recent radio history is bounded to 1000 entries and the native
played queue is trimmed while retaining fifteen previous songs. Late results
cannot modify a replacement queue; pending candidates are checked against current
dislikes again before appending. iOS implements the same source context but still
requires a Mac build and device verification.

Android uses a Media3 foreground MediaSessionService, network wake mode, audio
focus, headset controls and a second prepared player for natural crossfade.
iOS uses AVFoundation and the same native bridge contracts; Mac compilation and
real iPhone tests are still required. EQ and normalization are hidden on iOS
until native support is implemented. Android offline HLS has explicit bounds and
rejects unsupported encrypted/master formats rather than claiming a bad download
is usable. Long background Android downloads are not a foreground download job;
they can be interrupted by the OS and require retry.

Desktop-only Discord/global shortcuts/window controls are not mobile features.
The CLAP model is not bundled: mobile recommendations use recent history,
listening activity, likes, metadata and related tracks. Do not claim model parity.
GIF/image/video wallpaper bytes are retained, with a 25 MiB file limit.

## Mobile updates

Android build code = major * 1000000 + minor * 1000 + patch. Versions are canonical
major.minor.patch, without aliases or prerelease suffixes. The public backend
reads one fixed GitHub release repository and validates tag, package, size, hashes
and certificate metadata. APK redirects are restricted to GitHub release hosts.
The native updater verifies size/SHA-256 and the APK's actual package/build/name
and certificate against the installed app; metadata cannot authorize a new signer.

Downloads stay in private cache. FileProvider grants read access to the Android
installer, which needs user confirmation. Cancellation disconnects the request;
corrupt files return to a retryable state. No silent installation exists.
The persistent signing key lives outside the repo, with local password protected
by Windows DPAPI. Only the owner configures GitHub signing secrets. iOS uses an
App Store link once configured; there is no APK or arbitrary IPA fallback.

## Music detail navigation

The full player opens a song detail page from its title and the credited artist
from its artist name. If the uploader differs from that credit, profile lookup
uses an exact normalized performer name; an unmatched name opens music search
instead of labeling the uploader as the performer. Track actions also expose
these routes. Back retains a bounded account-local page/detail history; tab
changes and sign-out clear it. Different detail IDs remount the detail view to
prevent displaying the previous song while its replacement loads.

## Bounded reads and artwork

Account-scoped metadata reads coalesce concurrent requests and retain at most
96 entries / 4 MiB for twenty seconds. Mutations invalidate this cache; changing
accounts rejects late responses. Search shows its first fifty results without
waiting for another page. Each library section appears independently, including
wrapped playlist likes. Artwork loads near the viewport on a separate two-worker
native pool and uses a private account cache bounded to 32 MiB / seven days.
The player service retains independent network capacity.

Radio refill queries keep the original source alongside up to two recent
recommended songs. Sparse shelves expand through related profiles and then the
source genre. A delayed result is accepted only by the same station session;
skipping within that station does not discard a useful pending batch. Queue
appends recheck live dislikes and IDs.

Android radio measures usable tracks from other performers rather than counting
uploader names. Reuploads explicitly labelled with the source performer share
that performer's selection quota without changing displayed credits. When the
shelf lacks alternatives, it reads up to six related profiles. Source tracks
share one quota across seed credits; the quota shrinks for sparse shelves.

Android notification and lock-screen metadata reject placeholder artist strings
and fall back to track metadata or the uploader. Covers use the authenticated
backend artwork relay and account cache, with a separate two-worker bitmap pool
so image loading does not occupy playback or radio workers.
