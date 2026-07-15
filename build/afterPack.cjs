// electron-builder afterPack hook — ad-hoc sign the macOS app.
//
// Why: with no Apple Developer account we can't do Developer ID signing, but an
// arm64 app MUST carry at least a valid ad-hoc signature or macOS reports it as
// "damaged and can't be opened". electron-builder's `identity: null` SKIPS signing
// entirely (leaving only the linker stub, no _CodeSignature/CodeResources), which
// is what caused the "damaged" error. This hook runs after the app is packed but
// before the DMG is built, so the DMG ships a properly ad-hoc-signed app.
//
// Requires building on macOS (codesign is macOS-only) — a Windows build cannot
// produce this, which is why Windows-built DMGs were always "damaged".
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  // identity '-' = ad-hoc; --deep also signs the nested helpers (SystemAudioCapture, MicProbe).
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  console.log(`  • afterPack: ad-hoc signed ${appName}.app`)
}
