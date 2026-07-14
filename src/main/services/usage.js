// AI usage + cost tracking. Logs each transcribe/summarize call with tokens/
// minutes and computes cost from a hard-coded price table (USD), stored locally.
import Store from 'electron-store'
import crypto from 'crypto'

const uStore = new Store({ name: 'codespire-usage', defaults: { log: [] } })

export const USD_TO_INR = 85

// USD pricing (approx, matches the original notetaker cost model)
const STT_PER_MIN = { // $/minute of audio
  'saarika:v2.5': 0.002, 'saarika:flash': 0.002, 'saaras:v3': 0.002, default: 0.002,
}
const LLM_PER_1K = { // { in, out } $ per 1K tokens
  'gpt-4o-mini': { in: 0.00015, out: 0.0006 },
  'gpt-4o': { in: 0.0025, out: 0.01 },
  'gpt-4-turbo': { in: 0.01, out: 0.03 },
  default: { in: 0.00015, out: 0.0006 },
}

function sttCost(model, audioSeconds) {
  const rate = STT_PER_MIN[model] ?? STT_PER_MIN.default
  return (audioSeconds / 60) * rate
}
function llmCost(model, inTok, outTok) {
  const r = LLM_PER_1K[model] ?? LLM_PER_1K.default
  return (inTok / 1000) * r.in + (outTok / 1000) * r.out
}

// Log one AI operation. operation: 'transcribe' | 'summarize'
export function logUsage({ operation, provider, model, meetingId, meetingTitle, audioSeconds = 0, inputTokens = 0, outputTokens = 0 }) {
  const costUsd = operation === 'transcribe'
    ? sttCost(model, audioSeconds)
    : llmCost(model, inputTokens, outputTokens)
  const entry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    operation, provider, model, meetingId, meetingTitle,
    audioSeconds, inputTokens, outputTokens,
    tokens: inputTokens + outputTokens,
    costUsd,
  }
  const log = uStore.get('log')
  log.push(entry)
  uStore.set('log', log)
  return entry
}

// Aggregated stats for the Dashboard (costs already converted to INR).
export function getUsageStats() {
  const log = uStore.get('log')
  const inr = (usd) => usd * USD_TO_INR

  const totalCostUsd = log.reduce((s, e) => s + e.costUsd, 0)
  const totalTokens = log.reduce((s, e) => s + e.tokens, 0)
  const totalCalls = log.length

  const group = (key) => {
    const map = {}
    for (const e of log) {
      const k = e[key] || 'unknown'
      if (!map[k]) map[k] = { name: k, cost: 0, calls: 0, tokens: 0 }
      map[k].cost += inr(e.costUsd); map[k].calls += 1; map[k].tokens += e.tokens
    }
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }

  const meetingIds = new Set(log.map((e) => e.meetingId).filter(Boolean))

  return {
    totalMeetings: meetingIds.size,
    totalCost: inr(totalCostUsd),
    totalTokens,
    totalCalls,
    byProvider: group('provider'),
    byOperation: group('operation'),
    recent: log.slice(-15).reverse().map((e) => ({
      at: e.at, provider: e.provider, model: e.model, operation: e.operation,
      tokens: e.tokens, cost: inr(e.costUsd), meetingTitle: e.meetingTitle || '',
    })),
    currency: 'INR',
  }
}
