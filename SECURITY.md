# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Email **[security@codespiresolutions.com](mailto:security@codespiresolutions.com)** instead.

Include as much of the following as you can:

- The type of issue (e.g. IPC exposure, key leakage, path traversal, insecure token
  storage, remote code execution).
- The affected version of Codespire Notetaker and your OS.
- The file(s) or component(s) involved, and step-by-step instructions to reproduce.
- Proof-of-concept code, if you have it, and the impact you believe it has.

**Please redact secrets.** Never include real API keys, SMTP passwords, Microsoft
tokens, transcripts or recordings in your report — they are yours, and we don't
want them.

### What to expect

- We'll acknowledge your report within **3 business days**.
- We'll confirm the issue and tell you our assessment and expected fix timeline.
- We'll keep you updated as we work on a fix, and credit you in the release notes
  when it ships — unless you'd rather stay anonymous.

Please give us a reasonable window to release a fix before disclosing publicly.

## Supported versions

Security fixes are applied to the **latest release** only. Codespire Notetaker is a
desktop app — always update to the newest installer from the
[Releases page](https://github.com/Codespire-Sol/ai-notetaker-desktop/releases/latest).

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Older releases | ❌ — please update |

## How your data is stored

Codespire Notetaker is a **local-first** application. Understanding what lives where
matters when assessing a security report:

- **API keys and credentials** — your OpenAI key, Sarvam key, SMTP username and
  password, the optional Microsoft client ID, the Microsoft OAuth token and your app
  PIN are stored in a local **[electron-store](https://github.com/sindresorhus/electron-store)**
  file inside your OS user profile's application-data directory. They are protected
  by your operating-system user account.
- **Recordings, transcripts and AI notes** — written to local files on your own disk.
- **None of this is ever transmitted to Codespire.** We operate no server for this
  app, we have no account system, and we receive no telemetry.

The only outbound network traffic the app makes is to services **you** configure with
**your own** credentials:

| Destination | Why | What is sent |
|-------------|-----|--------------|
| Sarvam AI | Transcription | Your meeting audio |
| OpenAI | Summary, action items, decisions | Your transcript text |
| Microsoft Graph *(only if you connect it)* | Calendar & attendee list | OAuth token |
| Your own SMTP server | Emailing the notes | Notes, transcript, audio attachment |

Those providers' handling of that data is governed by *their* terms and *your*
account with them.

## Your responsibilities

- Keep your OS user account secured — anyone with access to your logged-in Windows
  or macOS profile can read the app's local store.
- Rotate any API key you believe has been exposed, at the provider.
- Use an app-specific SMTP password where your mail provider supports one.
- Recording a conversation may require the consent of the participants. Know and
  follow the law where you are.

---

Copyright (c) 2026 Codespire Solutions.
