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
