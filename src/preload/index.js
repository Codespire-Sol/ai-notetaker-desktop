import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),

  // PIN lock
  pinStatus: () => ipcRenderer.invoke('pin:status'),
  setPin: (pin) => ipcRenderer.invoke('pin:set', pin),
  verifyPin: (pin) => ipcRenderer.invoke('pin:verify', pin),
  disablePin: () => ipcRenderer.invoke('pin:disable'),

  // AI
  transcribe: (payload) => ipcRenderer.invoke('ai:transcribe', payload),
  summarize: (payload) => ipcRenderer.invoke('ai:summarize', payload),

  // Recording + pipeline
  saveRecording: (arrayBuffer, mimeType, durationMs) =>
    ipcRenderer.invoke('recorder:save', { arrayBuffer, mimeType, durationMs }),
  processMeeting: (payload) => ipcRenderer.invoke('meeting:process', payload),

  // Meetings
  listMeetings: () => ipcRenderer.invoke('meetings:list'),
  getMeeting: (id) => ipcRenderer.invoke('meetings:get', id),
  updateMeeting: (id, patch) => ipcRenderer.invoke('meetings:update', { id, patch }),
  deleteMeeting: (id) => ipcRenderer.invoke('meetings:delete', id),
  getMeetingAudio: (id) => ipcRenderer.invoke('meeting:getAudio', id),

  // Usage / dashboard
  usageStats: () => ipcRenderer.invoke('usage:stats'),

  // Meeting auto-detection
  setRecordingState: (on) => ipcRenderer.invoke('recorder:setRecording', on),
  onCallStarted: (cb) => {
    const h = (_e, data) => cb(data)
    ipcRenderer.on('detector:call-started', h)
    return () => ipcRenderer.removeListener('detector:call-started', h)
  },
  onCallEnded: (cb) => {
    const h = () => cb()
    ipcRenderer.on('detector:call-ended', h)
    return () => ipcRenderer.removeListener('detector:call-ended', h)
  },

  // Calendar match (the meeting happening right now)
  currentMeeting: () => ipcRenderer.invoke('calendar:current'),
  setMeetingLang: (meetingId, lang) => ipcRenderer.invoke('meetingLang:set', { meetingId, lang }),

  // Teams
  connectTeams: () => ipcRenderer.invoke('teams:connect'),
  teamsStatus: () => ipcRenderer.invoke('teams:status'),
  disconnectTeams: () => ipcRenderer.invoke('teams:disconnect'),
  teamsMeetings: () => ipcRenderer.invoke('teams:meetings'),

  // Email
  sendMeetingNotes: (payload) => ipcRenderer.invoke('email:send', payload),
  verifySmtp: (smtp) => ipcRenderer.invoke('email:verify', smtp)
}

contextBridge.exposeInMainWorld('api', api)
