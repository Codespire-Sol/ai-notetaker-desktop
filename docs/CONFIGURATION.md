![Codespire](images/codespire-logo.png)

# Configuration Reference

Everything Codespire Notetaker needs is configured from the **Settings** page
inside the app. There is no config file to edit and nothing to deploy.

Settings are stored **on this machine only**. Your API keys, recordings and
transcripts are never uploaded anywhere except the calls the app makes to Sarvam
and OpenAI, and the emails **you** send through **your own** SMTP server.

---

## Settings page

### AI Providers — required

| Setting | Required | What it does | Where to get it |
|---------|----------|--------------|-----------------|
| **OpenAI API key** | **Yes** | Turns the transcript into the summary, action items, key decisions, follow-up questions and sentiment. | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — sign in, **Create new secret key**, copy it (it's shown only once). Starts with `sk-`. |
| **Sarvam API key** | **Yes** | Speech-to-text. Transcribes the recording, auto-detecting the language unless you pick one. | [sarvam.ai](https://www.sarvam.ai) — sign in to the dashboard and create an API subscription key. |
| **Summarize model** | No | Which OpenAI model writes the notes. **`gpt-4o-mini`** (default) is fast and cheap and is what most people should use. **`gpt-4o`** is stronger and noticeably more expensive. | — |
| **Transcription model** | No | Which Sarvam model transcribes. **`saarika:v2.5`** (default) is the accurate one. **`saarika:flash`** is faster. Both auto-detect language. | — |

> Both key fields are masked. Click the **eye icon** to reveal what you pasted —
> a stray space is the usual cause of an "invalid key" error.

**Languages supported for transcription:** English, Hindi, Telugu, Tamil,
Marathi, Bengali and Gujarati. Leave the language on **Auto-detect** and Sarvam
works it out itself, including code-switched / Hinglish speech.

---

### Microsoft Teams — optional

| Setting | What it does |
|---------|--------------|
| **Microsoft Client ID** | The Application (client) ID of an Azure app registration. With it, you can connect your Microsoft account so the **Calendar** page lists your upcoming meetings and recordings are auto-linked to the meeting happening at the time — picking up its **title** and **attendee emails** automatically. |

**How do I get a Client ID?** See **[AZURE-SETUP.md](AZURE-SETUP.md)** — it walks
through creating the Azure app registration step by step.

Paste the ID, click **Connect Teams**, and sign in when the browser opens. The
button then shows your account email, with a **Disconnect** option next to it.

---

### Meeting Detection — optional

| Setting | Default | What it does |
|---------|---------|--------------|
| **Auto-record detected meetings** | **Off** | The app notices when another app starts using your microphone — i.e. a call began. With this **on**, recording **starts automatically** and stops when the call ends. With it **off**, you instead get a *"Meeting detected — record it?"* banner and a Windows notification, and nothing is recorded until you click **Record**. |

Detection is microphone-driven, so it works for ad-hoc calls, early starts and
meetings that were never in a calendar. Recordings stop automatically when the
call ends, with a **3-hour** safety cap.

> Meeting detection is a **Windows** feature — it relies on Windows'
> per-app microphone-activity tracking. On macOS, start recordings manually.

---

### Email (SMTP) — optional

Needed only if you want to email meeting notes from inside the app. The app sends
through **your own** mail server — it has no mail service of its own.

| Setting | Example | Notes |
|---------|---------|-------|
| **SMTP Host** | `smtp.office365.com` | Your mail provider's outgoing server. |
| **Port** | `587` | `587` for STARTTLS (the usual choice); `465` for implicit TLS. |
| **Username** | `you@company.com` | Usually your full email address. |
| **Password** | — | Your mailbox password, or an **app password** if your account has MFA/2FA enabled (Microsoft and Google both require this). Masked, with an eye icon to reveal. |
| **From address** | `you@company.com` | The address notes are sent from. Falls back to the username if left blank. |

**Office 365 example:** host `smtp.office365.com`, port `587`, username and from
address both your work email, password an app password.

Click **Test connection** to verify the settings before you rely on them — it
connects and authenticates and reports **SMTP connection OK ✓** or the exact
error.

**What gets sent:** the **summary**, **action items** and **key decisions** in the
email body; the **full transcript** attached as a `.txt` file; and the **audio as
an MP3** — but only when it's **under 20 MB**, since larger attachments are
routinely rejected by mail servers. Longer meetings simply go out without the
audio.

---

### App Lock (PIN) — optional

| Setting | Notes |
|---------|-------|
| **PIN** | **At least 4 digits.** When enabled, the app asks for the PIN every time it opens, so nobody else on this PC can read your meeting notes. Only a hash of the PIN is stored, never the PIN itself. Remove it any time with **Remove PIN**. |

> There's no recovery flow — if you forget the PIN, you'll have to remove the
> app's local settings file (see [Where your data lives](#where-your-data-lives)).

---

## Optional `.env` overrides (developers)

If you're running the app from source, you can put values in a `.env` file at the
repository root instead of typing them into Settings. **An `.env` value always
wins over the corresponding value saved in Settings.** This is a developer
convenience — packaged installs don't need it.

Copy `.env.example` to `.env` and fill in what you need:

```env
# AI providers
OPENAI_API_KEY=sk-...
SARVAM_API_KEY=...

# Microsoft Teams (Azure app registration — Application/client ID)
MS_CLIENT_ID=00000000-0000-0000-0000-000000000000

# Email (SMTP)
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=you@company.com
SMTP_PASS=...
EMAIL_FROM=you@company.com
```

| Variable | Overrides |
|----------|-----------|
| `OPENAI_API_KEY` | Settings → AI Providers → OpenAI API key |
| `SARVAM_API_KEY` | Settings → AI Providers → Sarvam API key |
| `MS_CLIENT_ID` | Settings → Microsoft Teams → Microsoft Client ID |
| `SMTP_HOST` | Settings → Email → SMTP Host |
| `SMTP_PORT` | Settings → Email → Port |
| `SMTP_USER` | Settings → Email → Username |
| `SMTP_PASS` | Settings → Email → Password |
| `EMAIL_FROM` | Settings → Email → From address |

The model pickers, the auto-record toggle and the PIN have **no** `.env`
equivalents — set those in the app.

> `.env` is a plain-text file holding real secrets. It is git-ignored; keep it
> that way.

---

## Where your data lives

Everything the app produces stays on your machine, under the app's own data
folder:

| Platform | Folder |
|----------|--------|
| **Windows** | `%APPDATA%\codespire-notetaker\` |
| **macOS** | `~/Library/Application Support/codespire-notetaker/` |

Inside it:

| File / folder | Contents |
|---------------|----------|
| `recordings/` | The recorded audio — a `.webm` per meeting, plus the `.mp3` the app converts it to for seeking and for email attachments. **This is the bulky one** — check it occasionally if disk space is tight. |
| `codespire-notetaker.json` | Your settings: API keys, SMTP details, model choices, the auto-record toggle, per-meeting language preferences and the PIN hash. |
| `codespire-meetings.json` | Meeting metadata, summaries, action items, decisions and full transcripts. |
| `codespire-usage.json` | The AI usage log behind the **Dashboard** — one entry per API call, with tokens and cost. |

**What leaves your PC:** only the audio sent to **Sarvam** for transcription, the
transcript sent to **OpenAI** for summarization, and any email **you** choose to
send through **your own** SMTP server. Nothing is uploaded to Codespire, and no
key is ever transmitted anywhere except to the provider it belongs to.

---

See also: [USER-GUIDE.md](USER-GUIDE.md) ·
[INSTALL-WINDOWS.md](INSTALL-WINDOWS.md) · [INSTALL-MAC.md](INSTALL-MAC.md)
