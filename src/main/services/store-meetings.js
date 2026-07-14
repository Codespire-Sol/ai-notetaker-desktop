// Local meetings store — metadata + transcripts in electron-store (JSON),
// audio files live on disk under userData/recordings/*.webm (path referenced).
import Store from 'electron-store'
import crypto from 'crypto'

const mStore = new Store({ name: 'codespire-meetings', defaults: { meetings: [] } })

export function listMeetings() {
  // newest first, without the (potentially large) transcript body for the list view
  return mStore
    .get('meetings')
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ transcript, segments, ...meta }) => meta)
}

export function getMeeting(id) {
  return mStore.get('meetings').find((m) => m.id === id) || null
}

export function addMeeting(data) {
  const meeting = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    title: data.title || 'Untitled meeting',
    durationSec: data.durationSec || 0,
    language: data.language || '',
    audioPath: data.audioPath || '',
    attendees: data.attendees || [],
    summary: data.summary || '',
    actionItems: data.actionItems || [],
    keyDecisions: data.keyDecisions || [],
    followUps: data.followUps || [],
    sentiment: data.sentiment || 'neutral',
    transcript: data.transcript || '',
    segments: data.segments || [],
    emailedTo: data.emailedTo || [],
    status: data.status || 'done'
  }
  const all = mStore.get('meetings')
  all.push(meeting)
  mStore.set('meetings', all)
  return meeting
}

export function updateMeeting(id, patch) {
  const all = mStore.get('meetings')
  const idx = all.findIndex((m) => m.id === id)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ...patch }
  mStore.set('meetings', all)
  return all[idx]
}

export function deleteMeeting(id) {
  mStore.set('meetings', mStore.get('meetings').filter((m) => m.id !== id))
  return { ok: true }
}
