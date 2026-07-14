![Codespire](images/codespire-logo.png)

# Install Codespire Notetaker on Windows

Windows is the **fully-supported platform** for Codespire Notetaker — system-audio
capture works out of the box here. This takes about five minutes and is mostly
clicking **Next**.

---

## Before you start

- **Windows 10 or 11** (64-bit).
- An **OpenAI API key** and a **Sarvam API key**. You can install first and paste
  them in afterwards — see [CONFIGURATION.md](CONFIGURATION.md) for where to get
  them.
- A **headset** (recommended, not required).

You don't need Node, Python, Docker or anything else. Everything — including the
audio converter — is inside the installer.

---

## Step 1 — Download the installer

1. Open the repository's **Releases** page and download the latest Windows
   installer. It's a single file ending in **`.exe`**, named something like
   `Codespire Notetaker Setup 1.0.0.exe`.
2. It lands in your **Downloads** folder.

---

## Step 2 — Run Setup

1. **Double-click the `.exe`**.
2. Windows shows a blue **"Windows protected your PC"** (SmartScreen) box. This
   is expected: the app is **not code-signed** yet, and SmartScreen warns about
   every new publisher.
   Click **More info**, then **Run anyway**. You only do this once.

   > Don't see **Run anyway**? Click the small **More info** link first — the
   > button appears underneath.

3. Choose an install folder if you want to (or accept the default) and click
   **Install**.
4. When it finishes, the app opens and a **Codespire Notetaker** icon is added to
   your Start menu and desktop.

---

## Step 3 — First launch and microphone permission

The first time you start a recording, **Windows asks whether Codespire Notetaker
may use your microphone**. Click **Yes / Allow**.

This matters more than it looks:

- The microphone is how the app records **your** side of the call.
- The app also watches microphone activity to know **when a meeting starts and
  ends** — that's what powers auto-detection.

If you clicked *Block* by mistake, fix it here:

**Settings → Privacy & security → Microphone** →
turn on **Microphone access**, turn on **Let apps access your microphone**, and
make sure **Let desktop apps access your microphone** is on. Then restart the app.

---

## Step 4 — Add your keys

1. Open the app and go to **Settings** in the left sidebar.
2. Under **AI Providers**, paste your **OpenAI API key** and your
   **Sarvam API key**.
3. Click **Save**.

That's the minimum. Optionally also fill in:

- **Email (SMTP)** — so you can email notes to attendees. Click
  **Test connection** to check it.
- **Microsoft Client ID** — so the **Calendar** page works and recordings get
  auto-linked to meetings. See [AZURE-SETUP.md](AZURE-SETUP.md).
- **Meeting Detection → Auto-record** — turn it on if you want recording to start
  by itself when a call begins.

Every setting is explained in [CONFIGURATION.md](CONFIGURATION.md).

---

## Step 5 — Record something

Click **New Recording → Start Recording**, talk for ten seconds, then
**Stop & Generate Notes**. If a transcript and a summary come back, you're fully
set up.

---

## Daily use

| Action | How |
|--------|-----|
| **Start the app** | Open **Codespire Notetaker** from the Start menu or desktop |
| **Keep it watching for meetings** | Just close the window — it keeps running in the **tray**, near the clock |
| **Bring it back** | Click the **tray icon** |
| **Fully quit** | Right-click the tray icon → **Quit** |

> Leave it in the tray. If you quit it, meeting detection stops and the app can't
> catch your next call.

---

## Troubleshooting

**"Windows protected your PC" and no way past it**
Click **More info → Run anyway** (Step 2). The app is unsigned; this warning is
about the missing certificate, not about the file being unsafe.

**Recording won't start / "Could not start recording. Check microphone permission."**
Windows is blocking the microphone. Fix it in **Settings → Privacy & security →
Microphone** (see Step 3), then restart the app.

**"Mic only — system audio unavailable" appears while recording**
The app captured your microphone but **not** the system audio, so you'll get
*your* voice but not the other participants'. It usually means the system-audio
(loopback) capture was cancelled or wasn't available. Stop the recording, close
and reopen the app, and start again. The recording is still saved and still
transcribed — it's just one-sided.

**Meetings aren't being detected**
- Make sure the app is **running** (window open or in the tray).
- Detection triggers when a call app takes the microphone. If your meeting app is
  muted from the very start and never touches the mic, there's nothing to detect
  — record manually.
- Auto-record only *starts by itself* if you turned it on in
  **Settings → Meeting Detection**. Otherwise you get the banner and have to
  click **Record**.

**No notification appeared**
Check **Windows Settings → System → Notifications** and make sure notifications
are allowed for Codespire Notetaker (and that Focus assist / Do not disturb is
off).

**Transcription or summary fails**
Check your keys in **Settings → AI Providers** (click the eye icon to confirm
they pasted correctly), and check that your OpenAI/Sarvam accounts have credit.

---

Next: [USER-GUIDE.md](USER-GUIDE.md) — how to use the app day to day.
