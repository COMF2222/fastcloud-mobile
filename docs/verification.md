# Verification

Keep this file updated with actual checks, not assumptions.

The Android project must pass `npm run check`, `npm test`, production web build,
signed `assembleRelease`, `testDebugUnitTest` and `lintRelease`. The backend must pass its Python
tests and the shared Rust lyrics worker tests. A browser preview verifies layout,
not Android background audio or OAuth.

Required real-device checks on Honor:

1. Fresh sign-in and existing account settings/likes/dislikes.
2. Playback and artwork over mobile data with the phone VPN disabled.
3. Screen locked for at least three tracks, notification and headphone controls.
4. Network interruption, server restart, token expiry and recovery.
5. Crossfade on natural transitions, gapless off/on, speed and EQ.
6. Dislikes excluded from radio/autoplay/wave, undo from dislike list.
7. Download, airplane mode playback, account switch isolation.
8. Chat autofocus, retry with same nonce, attachments and mutual followers.
9. Import over 1000 tracks, pause/resume and missing matches.
10. Keyboard, safe areas, large text, light theme, GIF/video wallpaper.

iOS requires a Mac build and the same playback/account tests on an iPhone.
Android or browser success alone is not evidence that these device checks passed.


Actual local results: [QA report](qa-report-2026-10-12.md) and
[source security baseline](security-baseline-2026-10-12.md). They distinguish
browser/demo checks from device audio, installation and launcher behavior.
Also check changing all icon choices, restarting the app, restoring Moon and
upgrading without losing the chosen launcher icon. Android and iOS icon choices
are not copied from another device's account settings.

## Android 0.1.7 — 2026-10-13

Production web build, signed Android release build, JVM tests and Android lint
passed. Shared TypeScript tests: 39 passed. App lint reports zero errors; its
existing resource/dependency warnings remain. Release staging verified version
0.1.7, build 1007, package and persistent release certificate.

A fixture captured from public SoundCloud metadata through the backend contains
39 related tracks and 63 tracks from six related profiles for Lil Peep's
"white wine". The original shelf triggers expansion. Artist radio selected
16 tracks with 10 performer credits (three credited Lil Peep); track radio
selected 13 with nine credits (one credited Lil Peep). This verifies selection
on that fixture, not every artist or live endless playback. The authenticated
artwork relay returned a valid 500 px JPEG for the same track.

Honor is disconnected. Notification/lock-screen rendering, continuous station
refill and listening quality still need a device check after installing 0.1.7.
iOS runtime behavior was not tested.

## Android 0.1.8 — 2026-10-16

TypeScript check and all 49 TypeScript tests pass, including catalog release
classification/search, wallpaper drag/pinch anchoring/bounds/legacy records,
and timestamps at one hour and 140 minutes (2:20:00).

Browser checks use the explicit demo fixture, not live account data. At
390×844 the profile exposes tracks, popular uploads, albums, playlists, likes
and both track/playlist reposts. Own profiles also expose following and dislikes;
other profiles do not. Performer search filters likes correctly and switching
tabs clears the query. Deferred activity data uses independent loading states;
arrow-key tab navigation and empty/search states work. Targeted DOM checks
found no broken tab references, missing search label, undersized new buttons
or horizontal overflow. These are targeted checks, not a full WCAG audit.

Wallpaper drag and slider zoom match the saved application background after
reload. Editing that saved background needs no file chooser. Fit image works;
cancelling leaves the original framing unchanged. The light-theme editor is
opaque and readable. At 375×667 Save remains visible, all editor buttons are
44 px high, and no horizontal page overflow appears. The preview canvas fills
the entire 390×844 / 375×667 viewport with overlaid controls. Optional placement
tools collapse to leave more of the wallpaper visible. Escape returns focus to
the opener, and the saved image uses the same framing style as the editor.

The final signed release build passed in 42 seconds. Staging verified version
0.1.8 / build 1008, 12,129,825 bytes and the persistent certificate.
Unchanged native code reuses Gradle's passing 27
JVM test results. Android lint has zero errors / 101 existing warnings.
No phone is connected: actual
two-finger gestures, animated video decoding and app installation on Honor
remain device checks. iOS was not built or tested.
