// Email-sending service (Electron main process).
// Sends meeting notes as a branded HTML email with the full transcript attached.
import nodemailer from 'nodemailer'

// ── Helpers ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Basic HTML escaping so user/AI content can't break the markup.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Normalise, dedupe and validate a list of recipient strings.
function normaliseRecipients(to) {
  const list = Array.isArray(to) ? to : [to]
  const seen = new Set()
  const valid = []
  for (const raw of list) {
    if (!raw) continue
    const addr = String(raw).trim()
    if (!addr) continue
    const key = addr.toLowerCase()
    if (seen.has(key)) continue
    if (!EMAIL_RE.test(addr)) continue
    seen.add(key)
    valid.push(addr)
  }
  return valid
}

// Turn a meeting title into a safe .txt filename.
function safeFilename(title) {
  const base = String(title || 'meeting-notes')
    .trim()
    .replace(/[^a-z0-9\-_ ]/gi, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
  return `${base || 'meeting-notes'}-transcript.txt`
}

// Action items and key decisions may arrive as plain strings or objects.
function actionItemParts(item) {
  if (typeof item === 'string') return { task: item, owner: '', due: '' }
  return {
    task: item?.task ?? item?.title ?? '',
    owner: item?.owner ?? item?.assignee ?? '',
    due: item?.due ?? item?.dueDate ?? item?.deadline ?? ''
  }
}

function decisionText(d) {
  if (typeof d === 'string') return d
  return d?.decision ?? d?.text ?? d?.title ?? ''
}

// ── HTML builders ─────────────────────────────────────────────────────────────

const PRIMARY = '#1268ff'
const FONT = "'Inter', 'Segoe UI', Arial, sans-serif"

function buildActionItemsHtml(actionItems) {
  const rows = actionItems
    .map(actionItemParts)
    .filter((p) => p.task)
  if (!rows.length) return ''

  const body = rows
    .map((p) => {
      const meta = []
      if (p.owner) meta.push(`<span style="color:${PRIMARY};font-weight:600;">${esc(p.owner)}</span>`)
      if (p.due) meta.push(`<span style="color:#6b7280;">Due: ${esc(p.due)}</span>`)
      const metaHtml = meta.length
        ? ` <span style="color:#9ca3af;">&#8212;</span> ${meta.join(' <span style="color:#9ca3af;">&#8212;</span> ')}`
        : ''
      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#1f2937;line-height:1.5;">
          <span style="color:${PRIMARY};font-weight:700;">&#8226;</span> ${esc(p.task)}${metaHtml}
        </td>
      </tr>`
    })
    .join('')

  return `<div style="margin:26px 0 0;">
      <h2 style="color:#0f172a;font-size:15px;margin:0 0 10px;font-weight:700;">Action Items</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
        ${body}
      </table>
    </div>`
}

function buildKeyDecisionsHtml(keyDecisions) {
  const rows = keyDecisions.map(decisionText).filter(Boolean)
  if (!rows.length) return ''

  const body = rows
    .map(
      (text) => `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eef1f6;font-size:14px;color:#1f2937;line-height:1.5;">
          <span style="color:${PRIMARY};font-weight:700;">&#10003;</span> ${esc(text)}
        </td>
      </tr>`
    )
    .join('')

  return `<div style="margin:26px 0 0;">
      <h2 style="color:#0f172a;font-size:15px;margin:0 0 10px;font-weight:700;">Key Decisions</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
        ${body}
      </table>
    </div>`
}

function buildHtml({ meetingTitle, summary, actionItems, keyDecisions }) {
  const summaryHtml = summary
    ? `<div style="margin:22px 0 0;">
        <h2 style="color:#0f172a;font-size:15px;margin:0 0 8px;font-weight:700;">Summary</h2>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin:0;">${esc(summary)}</p>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:${FONT};">
    <div style="max-width:640px;margin:0 auto;padding:24px 12px;">
      <div style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(15,23,42,0.08);">

        <!-- Header -->
        <div style="background:${PRIMARY};padding:26px 32px;">
          <p style="color:rgba(255,255,255,0.85);font-size:11px;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 6px;font-weight:600;">Codespire Notetaker</p>
          <h1 style="color:#ffffff;font-size:21px;margin:0;line-height:1.3;font-weight:700;">${esc(meetingTitle || 'Meeting Notes')}</h1>
        </div>

        <!-- Body -->
        <div style="padding:26px 32px 30px;">
          ${summaryHtml}
          ${buildActionItemsHtml(actionItems)}
          ${buildKeyDecisionsHtml(keyDecisions)}
        </div>

        <!-- Footer -->
        <div style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:11px;text-align:center;margin:0;line-height:1.6;">
            Auto-generated by Codespire Notetaker. The full transcript is attached to this email.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`
}

// Plain-text fallback for clients that don't render HTML.
function buildText({ meetingTitle, summary, actionItems, keyDecisions }) {
  const lines = [meetingTitle || 'Meeting Notes', '']
  if (summary) lines.push('SUMMARY', summary, '')

  const items = actionItems.map(actionItemParts).filter((p) => p.task)
  if (items.length) {
    lines.push('ACTION ITEMS')
    for (const p of items) {
      const meta = [p.owner, p.due ? `Due: ${p.due}` : ''].filter(Boolean).join(' — ')
      lines.push(`- ${p.task}${meta ? ` — ${meta}` : ''}`)
    }
    lines.push('')
  }

  const decisions = keyDecisions.map(decisionText).filter(Boolean)
  if (decisions.length) {
    lines.push('KEY DECISIONS')
    for (const d of decisions) lines.push(`- ${d}`)
    lines.push('')
  }

  lines.push('Auto-generated by Codespire Notetaker. The full transcript is attached.')
  return lines.join('\n')
}

// Build a nodemailer transporter from the smtp config object.
function createTransport(smtp) {
  if (!smtp || !smtp.host) {
    throw new Error('SMTP configuration is missing a host')
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: !!smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send meeting notes to a list of recipients as a branded HTML email,
 * with the full transcript attached as a .txt file.
 *
 * @returns {Promise<{ ok: true, messageId: string, accepted: string[], rejected: string[] }>}
 */
export async function sendMeetingNotes({
  smtp,
  to,
  meetingTitle,
  summary,
  actionItems = [],
  keyDecisions = [],
  transcriptText = '',
  audioPath = '',      // optional: absolute path to an audio file to attach
  audioName = ''       // optional: display filename for the audio attachment
}) {
  const recipients = normaliseRecipients(to)
  if (!recipients.length) {
    throw new Error('No valid recipients')
  }

  const safeItems = Array.isArray(actionItems) ? actionItems : []
  const safeDecisions = Array.isArray(keyDecisions) ? keyDecisions : []

  const transporter = createTransport(smtp)

  const attachments = []
  if (transcriptText && String(transcriptText).trim()) {
    attachments.push({
      filename: safeFilename(meetingTitle),
      content: String(transcriptText),
      contentType: 'text/plain; charset=utf-8'
    })
  }
  // Optional audio attachment (caller decides whether to include based on size)
  if (audioPath) {
    attachments.push({
      filename: audioName || `${safeFilename(meetingTitle).replace(/\.txt$/i, '')}.mp3`,
      path: audioPath
    })
  }

  const from = smtp.from || smtp.user
  const html = buildHtml({ meetingTitle, summary, actionItems: safeItems, keyDecisions: safeDecisions })
  const text = buildText({ meetingTitle, summary, actionItems: safeItems, keyDecisions: safeDecisions })

  try {
    const info = await transporter.sendMail({
      from: `"Codespire Notetaker" <${from}>`,
      to: recipients,
      subject: `Meeting Notes: ${meetingTitle || 'Untitled meeting'}`,
      html,
      text,
      attachments
    })
    return {
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || []
    }
  } catch (err) {
    throw new Error(`Failed to send meeting notes email: ${err?.message || err}`)
  }
}

/**
 * Verify that the SMTP configuration can connect and authenticate.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function verifySmtp(smtp) {
  try {
    const transporter = createTransport(smtp)
    await transporter.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}
