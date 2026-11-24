// Keep Electron's per-helper signing defaults. The main app also hosts the Steam overlay.
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sign } from '@electron/osx-sign';

const identity = process.env.CJ_MAC_SIGN_IDENTITY;
const bundleID = process.env.CJ_MAC_BUNDLE_ID;
if (process.platform !== 'darwin' || !identity || !bundleID || !process.argv[2]) {
  throw Error('Run on macOS with the app path, CJ_MAC_SIGN_IDENTITY and CJ_MAC_BUNDLE_ID.');
}

const app = resolve(process.argv[2]);
const actualID = execFileSync('/usr/libexec/PlistBuddy', [
  '-c', 'Print CFBundleIdentifier', resolve(app, 'Contents/Info.plist')
], { encoding: 'utf8' }).trim();
if (actualID !== bundleID) {
  throw Error('Rebuild the app with the publisher bundle ID before signing.');
}

await sign({
  app,
  identity,
  platform: 'darwin',
  optionsForFile(file) {
    if (resolve(file) !== app) return {};
    return {
      hardenedRuntime: true,
      entitlements: [
        'com.apple.security.cs.allow-jit',
        'com.apple.security.cs.allow-dyld-environment-variables',
        'com.apple.security.cs.disable-library-validation'
      ]
    };
  }
});
execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
console.log('Signed', basename(app));
