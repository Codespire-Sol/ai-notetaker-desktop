// Auto-update (Windows).
//
// The build pipeline publishes a `latest.yml` manifest alongside each installer
// (see the `publish` block in package.json). On startup the app reads that from the
// GitHub Release, downloads any newer version in the background, and tells the
// renderer so it can offer a "Restart & update" button.
//
// macOS note: Apple requires an app to be code-signed for auto-update to work.
// Until the app is signed with a Developer ID, Mac users update by downloading the
// new .dmg — so we simply don't run the updater there.
import electronUpdater from 'electron-updater'
import { app, Notification } from 'electron'

const { autoUpdater } = electronUpdater

/**
 * @param {() => import('electron').BrowserWindow | null} getWindow
 */
export function initAutoUpdate(getWindow) {
  // No updates in dev, and skip macOS until the app is signed.
  if (!app.isPackaged || process.platform !== 'win32') return

  autoUpdater.autoDownload = true          // fetch it quietly in the background
  autoUpdater.autoInstallOnAppQuit = true  // worst case, it installs on next quit

  const send = (channel, payload) => {
    try { getWindow()?.webContents?.send(channel, payload) } catch { /* window gone */ }
  }

  autoUpdater.on('update-available', (info) => {
    send('update:available', { version: info?.version })
  })

  autoUpdater.on('download-progress', (p) => {
    send('update:progress', { percent: Math.round(p?.percent || 0) })
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('update:ready', { version: info?.version })
    if (Notification.isSupported()) {
      new Notification({
        title: 'Update ready',
        body: `Codespire Notetaker ${info?.version || ''} is ready — restart to install.`,
      }).show()
    }
  })

  // Never surface updater failures to the user — being offline is not an error.
  autoUpdater.on('error', () => {})

  const check = () => autoUpdater.checkForUpdates().catch(() => {})

  check()
  setInterval(check, 6 * 60 * 60 * 1000)   // re-check every 6 hours
}

/** Quit and install the downloaded update. */
export function installUpdate() {
  try { autoUpdater.quitAndInstall() } catch { /* nothing downloaded yet */ }
  return { ok: true }
}
