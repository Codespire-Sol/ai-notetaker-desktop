<div align="center">
  <img src="images/codespire-logo.png" alt="Codespire" width="180" />
</div>

# Microsoft Teams / Calendar Setup (Azure)

Connecting a Microsoft account is **optional**. Codespire Notetaker records, transcribes and
summarizes meetings perfectly well without it.

Connecting it adds three conveniences:

| You get | Why it matters |
|---|---|
| **Your upcoming meetings** on the Calendar page | See what's coming up, refreshed every 5 minutes |
| **Auto-labelled recordings** | A recording is automatically named after the meeting happening at that time |
| **Auto-filled attendee emails** | "Send Notes" already knows who to email |
| **Per-meeting language** | Force a recording language for a specific meeting |

To do this, Microsoft requires an **app registration** — a free entry in Azure that produces a
**Client ID**. You create it **once**, then paste the Client ID into the app's Settings.

> **The app only ever reads your calendar.** It cannot read your email, files, chat or contacts —
> see [What the app can and cannot access](#what-the-app-can-and-cannot-access).

---

## Before you start

- Decide which account you'll connect:
  - **Work / school account** (e.g. `you@yourcompany.com`) — **recommended**. Gives real Teams
    meetings and **real attendee email addresses**.
  - **Personal account** (outlook.com / hotmail / a Microsoft account on Gmail) — works for
    testing, but Microsoft **masks attendee emails** (see [Personal accounts](#option-b--personal-microsoft-account)).
- You do **not** need a client secret. The app uses **PKCE**, the secure method for desktop apps.

---

## Option A — Work / school account (recommended)

### 1. Open the portal

Go to **<https://entra.microsoft.com>** (or <https://portal.azure.com>) and sign in with your
**work** Microsoft account.

### 2. Create the app registration

1. In the left menu choose **App registrations** → **➕ New registration**.
2. **Name:** `Codespire Notetaker`
3. **Supported account types:** select
   **“Accounts in any organizational directory (Any Microsoft Entra ID tenant — Multitenant)”**
4. **Redirect URI:** change the dropdown from *Web* to
   **“Public client/native (mobile & desktop)”** and enter **exactly**:

   ```
   http://localhost:8412/callback
   ```

5. Click **Register**.

> ⚠️ The redirect URI must be under **Mobile and desktop applications** (a *public client*), **not**
> under *Web*. If it lands in the wrong section, delete it and re-add it under
> **Authentication → Add a platform → Mobile and desktop applications**.

### 3. Copy the Client ID

On the app's **Overview** page, copy the **Application (client) ID**. It looks like:

```
11111111-2222-3333-4444-555555555555
```

### 4. Add the API permissions

Go to **API permissions** → **➕ Add a permission** → **Microsoft Graph** →
**Delegated permissions**, and add these three:

| Permission | What it's for |
|---|---|
| `Calendars.Read` | Read your meetings — title, time, attendee emails |
| `User.Read` | Read your own name/email (to show which account is connected) |
| `offline_access` | Stay connected without signing in every hour |

**Do not** add a client secret or certificate — none is needed.

### 5. Admin consent (only if your organization requires it)

Many companies **block users from consenting to apps** themselves. If so, when you try to connect
you'll see **“Need admin approval.”**

An **Azure / Global administrator** at your company must open the app registration →
**API permissions** → click **“Grant admin consent for &lt;your company&gt;”**. It's a **one-time,
ten-second click**, after which everyone in the company can connect.

> This is normal and expected — every organisation approves an app once before its people can use it.

---

## Option B — Personal Microsoft account

Useful when you have no admin and just want to try the calendar features.

### 1. Sign in cleanly

Open a **private / incognito** browser window and go to **<https://portal.azure.com>**, signing in
with **only** your personal Microsoft account.

> **If you see `AADSTS90072`** ("account … does not exist in tenant …"), your browser was still
> signed into a *work* account, so the portal tried to open in the work tenant. An **incognito
> window with only the personal account** fixes it. You can also use the profile menu →
> **Switch directory** → **Default Directory**.

### 2. Register the app

Same as Option A, with one difference:

- **Supported account types:** choose **“Personal Microsoft accounts only.”**

> ⚠️ **Why not “All Microsoft account users”?** That makes the app *multitenant*, and Microsoft
> **blocks user consent to newly-registered multitenant apps without a verified publisher** — you'd
> see a warning and consent would fail. Choosing **Personal Microsoft accounts only** avoids this.

Add the same **redirect URI** (`http://localhost:8412/callback`, public client) and the same three
**delegated permissions** (`Calendars.Read`, `User.Read`, `offline_access`). You consent to it
yourself when signing in — no admin needed.

### Limitation: masked attendee emails

Microsoft **anonymises attendee addresses for personal accounts**. Instead of a real address you'll
see something like:

```
outlook_8C89A15739ADF57D@outlook.com
```

That is **not a deliverable address** — notes emailed to it won't reach the person. Meeting
**titles and times work fine**; only the attendee emails are masked.

**On a work/school account you get the real addresses** (`alice@company.com`) and emailing notes
works normally. For testing on a personal account, simply type the recipient's real email into the
"Send Notes" box.

---

## Add the Client ID to Codespire Notetaker

1. Open the app → **Settings** → **Microsoft Teams**.
2. Paste the **Application (client) ID** into **Microsoft Client ID**.
3. Click **Save**, then **Connect Teams**.
4. Your **browser opens** to the Microsoft sign-in page → sign in → click **Accept** on the
   permissions screen.
5. The browser confirms success and the app shows **Connected** with your email address. ✅

Developers can instead put it in a `.env` file at the project root:

```dotenv
MS_CLIENT_ID=11111111-2222-3333-4444-555555555555
```

Once connected, open the **Calendar** page — your upcoming meetings appear, and new recordings are
automatically linked to whichever meeting is happening at the time.

---

## What the app can and cannot access

Because only three delegated, read-only permissions are requested:

| ✅ The app **can** | ❌ The app **cannot** |
|---|---|
| Read **your own** calendar events (title, time, attendees, organizer) | Read your **email** |
| Read your own name and email address | Read your **files** / OneDrive / SharePoint |
| Stay signed in (refresh token) | Read your **Teams chats** or contacts |
| | See **anyone else's** calendar |
| | **Create, change or delete** anything |

Tokens are stored **locally on your machine** and never sent to Codespire. You can revoke access at
any time at **<https://myaccount.microsoft.com>** → *App permissions*, or by clicking **Disconnect**
in the app's Settings.

---

## Troubleshooting

| Problem | Cause & fix |
|---|---|
| **“Need admin approval”** | Your organisation blocks user consent. Ask an Azure/Global admin to click **Grant admin consent** on the app registration (Option A, step 5). |
| **`AADSTS90072`** — account doesn't exist in tenant | You're signed into the wrong tenant. Use an **incognito window** and sign in with only the intended account. |
| **“Redirect URI mismatch”** | The redirect must be **exactly** `http://localhost:8412/callback`, registered under **Mobile and desktop applications** (public client). |
| **“End users cannot grant consent to newly registered multitenant apps…”** | The app is set to *multitenant + personal*. For a personal account, change **Supported account types** to **Personal Microsoft accounts only**. |
| **“Microsoft Client ID not configured”** | Paste the Client ID in **Settings → Microsoft Teams** and click **Save**. |
| **“Could not start local auth server on port 8412”** | Something else is using port **8412**. Close it and try again. |
| **Attendee email looks like `outlook_…@outlook.com`** | You're on a **personal** account — Microsoft masks attendee addresses. Use a work account, or type the real email manually when sending notes. |
| **Meeting times look wrong** | The app converts Microsoft's UTC times to your local timezone automatically. If they still look off, check your PC's timezone setting. |

---

## Related documentation

| Guide | |
|---|---|
| [User Guide](USER-GUIDE.md) | How to record, review and email meeting notes |
| [Configuration](CONFIGURATION.md) | All keys and settings explained |
| [Install (Windows)](INSTALL-WINDOWS.md) | Installing the `.exe` |
| [Install (macOS)](INSTALL-MAC.md) | Installing the `.dmg` |

---

<div align="center">
  <sub>Copyright © 2026 Codespire Solutions. Licensed under the <a href="../LICENSE">Elastic License 2.0</a>.</sub>
</div>
