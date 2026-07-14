![Codespire](images/codespire-logo.png)

# User Guide

Welcome to **Codespire Notetaker** — a desktop app that quietly records your
meetings, writes the transcript, and turns it into a clean set of notes: a
summary, action items, key decisions and follow-up questions.

Everything happens on **your PC**. Nothing joins your call — no bot, no extra
participant, nothing for the other side to see.

---

## 1. First run

The very first time you open the app, do these three things.

### a. Set a PIN (optional)

If other people use this PC, you can lock the app.

1. Go to **Settings → App Lock (PIN)**.
2. Type a PIN (**at least 4 digits**) and click **Enable**.

From now on the app asks for the PIN when it opens. You can remove it any time
from the same place.

### b. Add your API keys

The app needs two keys to work — one to transcribe and one to summarize.

1. Go to **Settings → AI Providers**.
2. Paste your **OpenAI API key** (starts with `sk-`) — used for the summary.
3. Paste your **Sarvam API key** — used for the transcript.
4. Click **Save**.

> Both fields are hidden by default. Click the **eye icon** to check what you
> pasted. Where to get the keys is explained in
> [CONFIGURATION.md](CONFIGURATION.md).

### c. Set up email (optional)

If you want to send notes to attendees straight from the app, fill in
**Settings → Email (SMTP)** with your mail server details and click
**Test connection**. See [CONFIGURATION.md](CONFIGURATION.md) for an Office 365
example.

---

## 2. Record a meeting

The app records **your microphone + the system audio** — that is, your voice
*and* everyone you can hear — mixed into one recording.

### Option A — record it yourself

1. Click **New Recording** in the sidebar.
2. Type a **meeting title** (optional — you can rename it later).
3. Pick a **language**, or leave it on **Auto-detect** (recommended). Supported:
   English, Hindi, Telugu, Tamil, Marathi, Bengali, Gujarati.
4. Click **Start Recording**.

You'll see a timer, a live level meter, and a red **Recording** indicator. Click
**Stop & Generate Notes** whenever you're done — or just let the call end (see
below).

### Option B — let the app detect the meeting

Codespire Notetaker watches for the moment **an app starts using your
microphone** — which is exactly when a call begins. It doesn't matter whether the
meeting is in Teams, Zoom, Google Meet, Webex or the browser; it doesn't matter
whether it starts early, runs late, or was never in your calendar at all.

What happens next depends on one switch in **Settings → Meeting Detection**:

| Auto-record | What you see |
|-------------|--------------|
| **ON** | Recording **starts by itself**. A Windows notification says *"Meeting detected — Recording started automatically. It will stop when the call ends."* and the app window comes forward. |
| **OFF** *(default)* | A blue banner appears at the top of the app: **"Meeting detected (teams.exe) — record it?"** with a **Record** button, plus a Windows notification. Click **Record** to start, or the **✕** to dismiss it. |

### When does it stop?

- **Automatically**, the moment the call ends and the meeting app releases your
  microphone.
- **Manually**, any time you click **Stop & Generate Notes**.
- After a **3-hour safety cap**, so a forgotten recording can't run all day.

### Then what?

The app saves the audio, sends it to **Sarvam** for the transcript, then to
**OpenAI** for the notes. You'll see *"Transcribing with Sarvam…"* while it
works — a long meeting takes a little while. When it's done, the meeting opens
automatically.

---

## 3. Read the notes

Open **Meetings** in the sidebar and click any recording. The detail page has:

| Section | What's in it |
|---------|--------------|
| **Recording** | An audio player. You can seek anywhere in the recording. |
| **Summary** | A few paragraphs covering topics, outcomes and next steps — always in English, even if the meeting was in Hindi, Telugu or Hinglish. |
| **Action Items** | Each task with its owner and due date, where one was mentioned. |
| **Key Decisions** | The concrete decisions the group actually made. |
| **Follow-up Questions** | Open threads worth chasing. |
| **Transcript** | Click the heading to expand the full transcript. |

The line under the title shows the date, length, detected language and the
overall **sentiment** of the meeting (positive, neutral, tense or mixed).

### Rename a meeting

Click the **pencil icon** next to the title, type the new name, press **Enter**.

### Delete a meeting

Click the **red bin icon** at the top right. This removes the meeting and its
notes from the app.

---

## 4. Email the notes

At the bottom of any meeting is **Email these notes**.

1. Enter one or more **recipient emails**, separated by commas.
   *If the meeting was linked to your calendar, the attendees are already filled
   in for you.*
2. Click **Send Notes**.

**What the recipient gets:**

- **In the email body:** the summary, the action items, and the key decisions.
- **Attached:** the **full transcript** as a `.txt` file — always.
- **Also attached:** the **audio as an MP3** — but only if it's **under 20 MB**.
  Long meetings produce a bigger file, and many inboxes bounce large
  attachments, so the app quietly skips the audio and tells you
  *"audio too large — skipped"*. The notes and transcript still go out.

> Email requires your SMTP settings to be filled in. If the send fails, go to
> **Settings → Email (SMTP)** and click **Test connection**.

---

## 5. Calendar (optional)

Connect a Microsoft/Teams account and the app gets much smarter about your
meetings.

**To connect:** **Settings → Microsoft Teams** → paste your **Microsoft Client
ID** → **Connect Teams** → sign in when the browser opens. (Don't have a Client
ID? See [AZURE-SETUP.md](AZURE-SETUP.md).)

Once connected, the **Calendar** page lists your upcoming meetings — title, time,
organizer and attendees — and **refreshes itself every 5 minutes**, so a meeting
someone adds at the last minute still shows up.

Two things then happen for free:

- **Auto-linking.** When you record, the app looks for the calendar meeting
  happening right now (with **±15 minutes** of slack for early or late starts).
  If it finds one, your recording automatically gets that meeting's **title** and
  its **attendee emails** — so the "Send Notes" box is pre-filled with the right
  people.
- **Per-meeting language.** Each meeting in the list has a **Recording language**
  dropdown. Set it to, say, *Telugu* for a specific client call and that
  recording will be transcribed as Telugu instead of auto-detecting.

---

## 6. AI Dashboard

**Dashboard** in the sidebar shows what the AI is costing you:

- **Total cost (₹)**, **total tokens**, **API calls** and **meetings** at the top.
- **Cost by provider** — how much went to Sarvam (transcription) versus OpenAI
  (summaries).
- **Usage by operation** — transcribe versus summarize.
- **Recent activity** — a row per API call with the date, model, tokens and cost.

Useful for a quick sanity check before your monthly bill arrives.

---

## 7. Tips

- **Wear a headset.** It's not just polite — it's better. The app captures system
  audio as a digital "loopback" *before* the sound reaches your ears, so the
  other participants are recorded cleanly and there's **no echo** and no
  double-recording. Speakers work too, but a headset gives the cleanest result.
- **Leave the app running in the tray.** Closing the window doesn't quit the app
  — it keeps running next to the clock, watching for meetings. If you actually
  quit it (tray icon → **Quit**), meeting detection stops and you'll miss calls.
- **Leave the language on Auto-detect** unless a meeting is reliably in one
  language. Auto-detect handles code-switching and Hinglish well.
- **Rename recordings** you'll want to find again — the title is also the email
  subject and the transcript filename.
- **Nothing appears in the call.** Other participants see no bot, no extra
  attendee and no "recording" badge from this app. Tell them you're recording —
  that's on you, not the software.

---

Setting something up? See [CONFIGURATION.md](CONFIGURATION.md).
Installing? See [INSTALL-WINDOWS.md](INSTALL-WINDOWS.md) or
[INSTALL-MAC.md](INSTALL-MAC.md).
