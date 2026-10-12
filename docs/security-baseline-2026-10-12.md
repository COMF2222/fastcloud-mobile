# Veirune mobile security baseline — 2026-10-12

Scope: Android/iOS native clients, PC pairing, mobile lyrics/import/update backend,
Windows/macOS icon helper, and local Veirune website. This is a source/local-test
baseline, not a penetration test or confirmation of a deployed mobile backend.

| Layer | Verified design / evidence | Remaining evidence |
|---|---|---|
| Transport | Native gateway requires HTTPS, keeps credentials on the fixed configured backend, rejects arbitrary request hosts. Browser demo is separate. Android forbids production cleartext; iOS uses default ATS. | Honor real TLS/network test, live deployment headers |
| Secrets | OAuth native Android Keystore / iOS Keychain. No app client secret in web code. Private APK key and DPAPI password are outside repos; CI setup script sends secrets only when owner runs it. | Owner backs up key/password securely; signing secrets configured manually |
| Pairing | Bounded short-lived private ticket; public code cannot retrieve token; new independent grant rotated and same-account checked. Retry bounded, old PC grant not copied. Backend tests cover identity/expiry/retry. | Real PC/phone paired login after server deployment |
| Authentication/data | Shared per-account personal data, safe dirty patches, account isolation, mutual-follow chat checks, admin routes role-checked; no message/token logging introduced. | Real account-switch/offline recovery test |
| Input/outputs | Import/lyric sizes, runtime and concurrency bounded; JSON backup validation rejects credentials/prototype keys; public media attachment routes constrained. | VPS Docker image and actual large import test |
| Updater | Fixed repo/asset allowlist, bounded relay, package/build/size/hash metadata. Android installer compares APK certificate to installed app and verifies hash before handoff. | Real same-key upgrade and install-permission UI |
| System icons | IDs 1–12 only, embedded images, device-local state. Windows helper constant/encoded script, JSON stdin, hidden process, 20s bound. It updates only shortcuts targeting this exact exe, never unrelated apps. macOS uses main-thread AppKit; iOS system alternate-icon API. | OS icon/launcher/Finder tests on real installations |
| Website | RU/EN static content, production canonicals retained. _headers supplies nosniff/no-referrer and CSP with self scripts, fixed public API connections, object-src none and form-action none. APK URL validated before enabling download. | Cloudflare deployment verification; no live HSTS/CSP scan claimed |

No signing key, password, user token or SoundCloud secret was published or sent
to GitHub by this task. Technical identifiers/repositories/domains remain stable;
the visible product name is Veirune. Chat data is stored server-side without E2E
encryption; anonymity hides leaderboard identity as defined by existing backend.

Required next actions are in deployment.md and verification.md. Owner checks
physical devices before public tags; CI checks native Mac/iOS compilation. After
deployment, review transport/auth/update flow, then repeat this baseline after
changes to auth, updates or storage and at least quarterly. Operational MFA,
server access reviews and retention settings were not independently audited.
