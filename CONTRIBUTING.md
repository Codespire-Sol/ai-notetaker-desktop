# Contributing to Codespire Notetaker

Thanks for your interest in contributing! This guide covers how to set up the
project, make changes, and submit them.

## License of contributions

This project is released under the [Elastic License 2.0](LICENSE). By submitting a
contribution, you agree that your contribution is licensed under the same terms.

## Reporting bugs & requesting features

- Open a GitHub issue with clear steps to reproduce (for bugs) or a description of
  the use case (for features).
- For bugs, please include your **OS and version** (Windows 11, macOS 14, …), the
  app version, and — where relevant — which meeting app was running. Recording and
  audio-capture issues are almost always OS-specific.
- **Never paste API keys, SMTP passwords, transcripts or recordings** into an
  issue. Redact them first.
- **Do not** report security vulnerabilities in public issues — follow
  [SECURITY.md](SECURITY.md) instead.

## Development setup

Requirements: **Node.js >= 20** and npm.

```bash
git clone https://github.com/Codespire-Sol/ai-notetaker-desktop.git
cd ai-notetaker-desktop

npm install
npm run dev
```

`npm run dev` starts electron-vite with hot reload for the renderer and a restart
on main-process changes.

Copy `.env.example` to `.env` and fill in your own keys (OpenAI, Sarvam, SMTP,
optionally `MS_CLIENT_ID`) so you don't have to re-enter them in Settings on every
run. **`.env` is git-ignored — keep it that way.**

To produce installers locally:

```bash
npm run build          # compile main + preload + renderer
npm run package:win    # Windows .exe  → release/
npm run package:mac    # macOS  .dmg   → release/
```

## Project structure

```
src/
  main/          Electron main process
    index.js       app lifecycle, windows, IPC handlers
    services/      ai.js       — Sarvam transcription + OpenAI summarization
                   detector.js — meeting auto-detection (mic-in-use)
                   email.js    — SMTP delivery of notes + attachments
                   store-meetings.js — local meeting/transcript persistence
                   teams.js    — Microsoft Graph OAuth + calendar
                   usage.js    — token/cost tracking for the AI Dashboard
  preload/       contextBridge — the only IPC surface exposed to the renderer
  renderer/      React + Vite UI
    src/pages/     Meetings, Record, MeetingDetail, Calendar, Dashboard,
                   Settings, Lock
    src/hooks/     useRecorder.js
    src/recorder.js  system-audio + mic capture and mixing
    src/theme.css    design tokens (Codespire blue #1268ff)
```

Rules of thumb:

- **Node/OS/native work belongs in `src/main`.** The renderer has no Node access.
- **Anything the UI needs from main goes through `src/preload`.** Add an explicit,
  narrowly-scoped channel — never expose `ipcRenderer` or `require` to the renderer,
  and keep `contextIsolation` on and `nodeIntegration` off.
- **Third-party API calls belong in `src/main/services`**, not in React components,
  so that keys never reach the renderer.

## Coding conventions

- JavaScript (ESM), React function components with hooks. No class components.
- 2-space indent, single quotes, semicolons — match the file you're editing.
- Components in `PascalCase.jsx`; services, hooks and utilities in `camelCase.js`.
- Style with the CSS variables in `src/renderer/src/theme.css`. Don't hardcode
  colours — the brand blue is `--brand` (`#1268ff`).
- Icons come from `lucide-react`. Don't add another icon library.
- Every new AI call must record its usage through `services/usage.js` so it shows
  up correctly in the AI Dashboard.
- Never log API keys, tokens, transcripts or audio paths containing personal data.

## Making changes

1. Fork the repo and create a branch from `main`
   (`git checkout -b fix/short-description`).
2. Make your change. Keep it focused — one logical change per pull request.
3. Test the paths you touched **in a real recording session** (`npm run dev`), and
   on Windows *and* macOS if you changed audio capture, meeting detection or
   packaging — those behave differently on each OS.
4. Update documentation in `docs/` if your change affects setup, configuration or
   behaviour.

## Submitting a pull request

1. Push your branch and open a pull request against `main`.
2. Describe **what** changed and **why**. Link any related issue.
3. Include a screenshot or short clip for UI changes.
4. Ensure the app builds (`npm run build`) and CI passes.
5. Be responsive to review feedback.

## Commit messages

Write clear, imperative commit messages (e.g. "Stop recording when the last mic
consumer exits"). Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`) are
welcome but not required.

---

Questions? Email [admin@codespiresolutions.com](mailto:admin@codespiresolutions.com).
