![Codespire](images/codespire-logo.png)

# Install Codespire Notetaker on macOS

> **Read this first.**
> **Windows and macOS are both fully supported.** The app records your
> **microphone** *and* the **other participants' audio**, transcribes, summarizes
> and emails notes on both platforms. On macOS, system-audio capture uses Apple's
> **ScreenCaptureKit** and needs only the one-time **Screen Recording** permission
> (Step 4) — no BlackHole, no virtual audio device, no admin password. See
> [System audio](#system-audio-on-macos) for the details and version requirements.

---

## Before you start

- **macOS 13 (Ventura) or later**, Apple Silicon. (System-audio capture needs
  macOS 13+; automatic meeting **stop** detection needs macOS 14+ — see below.
  Intel builds are not published yet.)
- An **OpenAI API key** and a **Sarvam API key** — see
  [CONFIGURATION.md](CONFIGURATION.md).

---

## Step 1 — Download the app

Open the repository's **Releases** page and download the macOS disk image — a file
ending in **`.dmg`**, named something like `Codespire Notetaker-1.0.0.dmg`.

---

## Step 2 — Install

1. **Double-click the `.dmg`** to open it.
2. **Drag Codespire Notetaker into your Applications folder.**
3. Eject the disk image.

---

## Step 3 — Open it the first time

The app is **ad-hoc signed but not notarized** by Apple, so macOS quarantines it
on download. A normal double-click shows *"Codespire Notetaker is damaged and
can't be opened"* or *"...from an unidentified developer."* **This is expected —
the app is fine; macOS just doesn't recognise the signer.**

**Clear the quarantine flag once.** Open **Terminal** (Applications → Utilities →
Terminal), paste this line, and press Return:

```bash
xattr -dr com.apple.quarantine "/Applications/Codespire Notetaker.app"
```

Then open **Codespire Notetaker** from Applications as normal. You only ever do
this once, right after installing (and again after each update you download by
hand).

> **Prefer not to use Terminal?** Right-click (or Control-click) **Codespire
> Notetaker** in Applications → **Open** → **Open** again. If that still says
> **"damaged,"** the Terminal command above is the reliable fix on Apple Silicon —
> the right-click trick often does not clear the "damaged" state.

---

## Step 4 — Grant permissions

macOS asks for permission the first time the app needs something. Say yes to both.

| Permission | Why it's needed |
|------------|-----------------|
| **Microphone** | Records your voice, and tells the app when a call starts and ends. **Required.** |
| **Screen Recording** | macOS puts system-audio capture behind this permission. **Required** to record the other participants (via ScreenCaptureKit). |

To check or fix them later:
**System Settings → Privacy & Security → Microphone** and
**System Settings → Privacy & Security → Screen Recording** — make sure
**Codespire Notetaker** is toggled **on** in both.

> After you change **Screen Recording**, macOS requires you to **quit and reopen
> the app** for it to take effect.

---

## System audio on macOS

Codespire Notetaker captures **both sides** of your meeting on macOS — no extra
software required:

- **Your microphone** — your voice.
- **System audio** (the other participants) — captured with Apple's
  **ScreenCaptureKit**, the same free framework the built-in Screen Recording
  uses. **No BlackHole, no virtual audio device, no admin password.**

The only requirement is the **Screen Recording** permission (Step 4) — macOS puts
system-audio capture behind it. Grant it once, quit and reopen the app, and every
participant is recorded, transcribed and summarised.

> **Version note:** system-audio capture needs **macOS 13 (Ventura) or later**. On
> older macOS the app records your microphone only and shows **"Mic only — system
> audio unavailable."**

---

## Step 5 — Add your keys

1. Open the app and click **Settings** in the sidebar.
2. Paste your **OpenAI API key** and **Sarvam API key** under **AI Providers**.
3. Click **Save**.

Optionally set up **Email (SMTP)**, the **Microsoft Client ID** for calendar
support, **Auto-record**, and an **App Lock PIN** — all explained in
[CONFIGURATION.md](CONFIGURATION.md).

---

## Daily use

| Action | How |
|--------|-----|
| **Start the app** | Open **Codespire Notetaker** from Applications or Spotlight |
| **Keep it watching for meetings** | Close the window — the app stays running |
| **Fully quit** | Use the tray/menu-bar icon → **Quit** |

---

## Troubleshooting

**"Cannot be opened because it is from an unidentified developer"**
Right-click → **Open** (Step 3), or click **Open Anyway** in
**System Settings → Privacy & Security**.

**Recording won't start**
The microphone permission is missing. **System Settings → Privacy & Security →
Microphone** → enable **Codespire Notetaker**, then restart the app.

**"Mic only — system audio unavailable"**
The **Screen Recording** permission is missing, or you're on macOS 12 or earlier.
Grant **System Settings → Privacy & Security → Screen Recording → Codespire
Notetaker**, then **quit and reopen** the app. Your own voice is recorded and the
notes are generated either way.

**Meeting detection doesn't fire**
On **macOS 14 (Sonoma) or later** the app auto-detects when a call starts *and*
stops, like Windows. On **macOS 13** it can auto-start when it sees the mic in use
but cannot auto-stop reliably — press **Stop** yourself when the call ends. You can
always start a recording by hand from **New Recording**.

---

Next: [USER-GUIDE.md](USER-GUIDE.md) — how to use the app day to day.
