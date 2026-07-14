![Codespire](images/codespire-logo.png)

# Install Codespire Notetaker on macOS

> **Read this first.**
> **Windows is the fully-supported platform today.** On macOS the app installs,
> records your **microphone**, transcribes, summarizes and emails notes exactly as
> it does on Windows — but capturing **system audio** (the other participants'
> voices) needs **extra setup**, because macOS does not let apps record system
> output on their own. Details in the [System audio](#system-audio-on-macos) section
> below.

---

## Before you start

- **macOS 11 (Big Sur) or later**, Apple Silicon or Intel.
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

The app is **not signed or notarized** by Apple, so a normal double-click gets
you *"Codespire Notetaker cannot be opened because it is from an unidentified
developer."*

Do this instead, **once**:

1. Open **Applications** in Finder.
2. **Right-click** (or Control-click) **Codespire Notetaker** → **Open**.
3. In the dialog, click **Open** again.

macOS remembers your choice. From then on it opens normally.

> Still blocked? Go to **System Settings → Privacy & Security**, scroll to the
> **Security** section, and click **Open Anyway** next to the message about
> Codespire Notetaker.

---

## Step 4 — Grant permissions

macOS asks for permission the first time the app needs something. Say yes to both.

| Permission | Why it's needed |
|------------|-----------------|
| **Microphone** | Records your voice, and tells the app when a call starts and ends. **Required.** |
| **Screen Recording** | macOS puts audio capture behind the screen-recording permission. Needed for any attempt at capturing what you hear. |

To check or fix them later:
**System Settings → Privacy & Security → Microphone** and
**System Settings → Privacy & Security → Screen Recording** — make sure
**Codespire Notetaker** is toggled **on** in both.

> After you change **Screen Recording**, macOS requires you to **quit and reopen
> the app** for it to take effect.

---

## System audio on macOS

Here is the honest picture.

macOS has no built-in equivalent of the Windows "loopback" capture the app relies
on. Apple deliberately blocks apps from recording other apps' audio output. So:

- **Your microphone always works.** Your side of every meeting is recorded,
  transcribed and summarized normally.
- **The other participants may not be captured**, because their audio comes out of
  your speakers/headset — which macOS won't let the app read directly. When this
  happens you'll see **"Mic only — system audio unavailable"** during recording,
  and the transcript will contain only your half of the conversation.

**The workaround** is a **virtual audio device** — a small system extension
(BlackHole, Loopback, and similar tools) that creates a fake audio output the app
*can* record from. You route the meeting's sound through it, and the app captures
both sides. Setting this up means installing third-party software and
reconfiguring your Mac's audio routing; it is outside the scope of this guide and
we don't ship or endorse a specific tool.

**If both sides of the conversation matter to you, use the Windows build.** It
captures system audio with no setup at all.

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
Expected on macOS without a virtual audio device — see
[System audio on macOS](#system-audio-on-macos). Your own voice is still recorded
and the notes are still generated.

**Meeting detection doesn't fire**
The automatic "meeting detected" behaviour relies on Windows' microphone-activity
tracking and does **not** work on macOS. Start recordings manually from
**New Recording**.

---

Next: [USER-GUIDE.md](USER-GUIDE.md) — how to use the app day to day.
