import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const env = { ...process.env };
if (process.platform === "win32" && !env.FASTCLOUD_ANDROID_KEYSTORE) {
  const signing = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-File", "tools/signing-env.ps1"],
    {
      encoding: "utf8",
      env: { ...env, PSModulePath: "" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (signing.status !== 0)
    throw Error("Could not read the private Android signing configuration");
  Object.assign(env, JSON.parse(signing.stdout.replace(/^\uFEFF/, "")));
}
if (process.platform === "win32") {
  const temporary = join(process.cwd(), ".java-tmp");
  mkdirSync(temporary, { recursive: true });
  env.JAVA_TOOL_OPTIONS =
    (env.JAVA_TOOL_OPTIONS || "") +
    " -Djdk.net.unixdomain.tmpdir=" +
    temporary.replaceAll("\\", "/");
  env.GRADLE_USER_HOME =
    env.FASTCLOUD_GRADLE_HOME || "C:/Users/Public/fastcloud-mobile-gradle";
  const config = join(
    env.LOCALAPPDATA,
    "Fastcloud",
    "android-toolchain",
    "environment.json",
  );
  if (existsSync(config)) {
    const { java, sdk } = JSON.parse(readFileSync(config, "utf8"));
    env.JAVA_HOME = java;
    env.ANDROID_HOME = sdk;
    env.PATH = join(java, "bin") + ";" + env.PATH;
  }
}
const cmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const release = !!env.FASTCLOUD_ANDROID_KEYSTORE;
const result = spawnSync(
  cmd,
  [
    release ? "assembleRelease" : "assembleDebug",
    "testDebugUnitTest",
    release ? "lintRelease" : "lintDebug",
    "--no-daemon",
  ],
  {
    cwd: "android",
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
process.exit(result.status ?? 1);
