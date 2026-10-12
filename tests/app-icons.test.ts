import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('Android has twelve launchable icon choices with exactly one default', () => {
 const manifest = read('android/app/src/main/AndroidManifest.xml');
 const aliases = [...manifest.matchAll(/<activity-alias\b[\s\S]*?<\/activity-alias>/g)].map(match => match[0]);
 assert.equal(aliases.length, 12);
 assert.equal(aliases.filter(value => /android:enabled="true"/.test(value)).length, 1);
 for (let id = 1; id <= 12; id++) {
   const name = String(id).padStart(2, '0');
   const alias = aliases.find(value => value.includes(`android:name=".Icon${name}"`));
   assert.ok(alias?.includes('android:targetActivity=".MainActivity"'));
   assert.ok(alias?.includes('android.intent.category.LAUNCHER'));
   assert.ok(alias?.includes(`android:icon="@mipmap/veirune_${name}"`));
   assert.ok(alias?.includes(`android:enabled="${id === 9}"`));
   for (const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']) {
     assert.ok(existsSync(new URL(`../android/app/src/main/res/mipmap-${density}/veirune_${name}.png`, import.meta.url)));
   }
 }
 const activity = manifest.match(/<activity\b[^>]*android:name=".MainActivity"[\s\S]*?<\/activity>/)?.[0];
 assert.ok(activity && !activity.includes('android.intent.category.LAUNCHER'));
});
test('iOS alternate catalogs include iPhone, iPad and opaque App Store art', () => {
 const project = read('ios/App/App.xcodeproj/project.pbxproj');
 assert.ok(project.includes('ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES'));
 for (let id = 1; id <= 12; id++) {
   const name = `Icon${String(id).padStart(2, '0')}`;
   assert.ok(project.includes(name));
   const directory = `ios/App/App/Assets.xcassets/${name}.appiconset/`;
   const entries = JSON.parse(read(directory + 'Contents.json')).images;
   assert.ok(entries.some((value: {idiom: string}) => value.idiom === 'ipad'));
   assert.ok(entries.some((value: {idiom: string; size: string}) => value.idiom === 'ios-marketing' && value.size === '1024x1024'));
   for (const entry of entries) {
     const png = readFileSync(new URL('../' + directory + entry.filename, import.meta.url));
     const pixels = Math.round(parseFloat(entry.size) * parseFloat(entry.scale));
     assert.equal(png.readUInt32BE(16), pixels);
     assert.equal(png.readUInt32BE(20), pixels);
     assert.equal(png[25], 2, 'iOS icons must be opaque RGB images');
   }
 }
});
