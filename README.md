# Veirune Mobile

Android and iOS share the React/TypeScript interface and the existing Veirune
backend. Android uses Media3 in a foreground media service; iOS uses AVFoundation.
Music, artwork, account data and SoundCloud API operations go through the server.
The phone never contains the SoundCloud application secret.

```powershell
cd D:\projects\fastcloud-mobile
npm ci
python tools/setup-android.py
npm run apk
```

Install on Android 7 or newer. On this owner's Windows machine, `npm run apk`
uses the persistent private signing key created in `%LOCALAPPDATA%/Fastcloud/mobile-signing`.
Run `python tools/stage-android-release.py` to verify and stage
`release/Veirune-Mobile-0.1.6.apk`. Without a configured key, the build helper
produces a debug APK for development only. Never commit signing keys or passwords.

```powershell
npm run dev
```

Open `http://127.0.0.1:5185/?demo=1` for the explicitly separate UI preview.
The preview contains sample metadata and does not claim to play real music.
Installed builds use the real server. The login screen supports either official
SoundCloud OAuth or **Connect with PC**. For the latter, enter the phone's code in
desktop Veirune 0.4.15 → Settings → Account → Connect your phone and confirm the
same account in the PC browser. The phone gets a fresh, independent OAuth grant;
the PC's stored rotating credentials are never copied. Codes expire in ten minutes.
The phone does not need to reach the SoundCloud login page for this method.
Audio and metadata use the server after login. No password is entered into Veirune.

Phone pairing, mobile lyrics and Yandex import require deploying the backend changes
from the sibling `fastcloud-backend` repository. Existing account data is retained.
See [the exact publication commands](docs/deployment.md). This signed Android APK is ready for real-device testing; it is not an already
verified production release.

iOS must be built and tested on a Mac with Xcode 26 or newer:

```sh
npm ci
npm run sync
npm run ios
```

Select your Apple development team and device in Xcode. Android verification does
not establish iOS compatibility. See [architecture](docs/architecture.md) and
[verification](docs/verification.md) for the current evidence and device checks.

This repository has not been published automatically. Deployment and release are
performed by the owner.

Google Play Services are not required. Android supports native background audio,
headphone and notification controls, crossfade, EQ, normalization and offline files.
The iOS source shares the interface and account contract, but EQ and normalization
controls are hidden there until native support is implemented and verified.
The checks workflow produces a debug APK; the separate release workflow publishes
signed APKs and bilingual update metadata on version tags. The Android updater
uses the backend relay, checks SHA-256, package identity and signing certificate,
then opens Android's installer. Future versions preserve data when installed over
the existing app. iOS updates use the App Store once a store release is configured.
See deployment.md for signing secrets and first-release commands.


The primary app icon is Moon (option 9). Appearance settings include twelve native
icon choices. Device icon selection is separate from portable account preferences.
See [publication commands](docs/deployment.md) and [verification](docs/verification.md).
The mobile wave uses listening, likes, skips and metadata; desktop CLAP embedding
inference is not bundled on the phone. iOS EQ/normalization remain unavailable.
Android source/build success does not substitute for an Honor playback test.

Release staging checks the APK certificate against `android/release-certificate.sha256`.
This public fingerprint is not a signing key; keep the same private key for every update.
