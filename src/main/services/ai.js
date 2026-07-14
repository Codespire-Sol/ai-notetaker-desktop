// ai.js — AI core module for the Electron main process.
// Ported from the Python reference services (sarvam_service.py, openai_service.py,
// skills_prompt.py). Handles speech-to-text via Sarvam AI and structured meeting
// summarization via OpenAI. ES modules, Node 20 (Electron main process).

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';

// ── Constants ────────────────────────────────────────────────────────────

const SARVAM_STT_URL = 'https://api.sarvam.ai/speech-to-text';
const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const MAX_CHUNK_SECONDS = 25; // Sarvam limit is ~30s; use 25s for safety.
const MAX_RETRIES = 2; // Retry a failed chunk API call up to this many times.
const TARGET_SAMPLE_RATE = 16000; // 16 kHz mono WAV for Sarvam.

// Short language code → Sarvam language code.
const SARVAM_LANGUAGES = {
  hi: 'hi-IN', mr: 'mr-IN', te: 'te-IN', bn: 'bn-IN',
  gu: 'gu-IN', pa: 'pa-IN', ta: 'ta-IN', kn: 'kn-IN',
  ml: 'ml-IN', od: 'od-IN', en: 'en-IN',
};

const VALID_SARVAM_MODELS = new Set([
  'saarika:v1', 'saarika:v2.5', 'saarika:flash', 'saaras:v3', 'saaras:v3-realtime',
]);

const VALID_OPENAI_MODELS = new Set([
  'gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano',
  'o3-mini', 'gpt-4-turbo', 'gpt-3.5-turbo',
]);

// ── ffmpeg + WAV helpers ─────────────────────────────────────────────────

/**
 * Decode any audio file on disk to a 16 kHz mono s16 WAV buffer using the
 * bundled ffmpeg binary. Reads/writes via temp files (spawn, no shell).
 */
async function decodeToWav(audioPath) {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static binary not found. Ensure ffmpeg-static is installed.');
  }

  const outPath = path.join(
    os.tmpdir(),
    `sarvam_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`
  );

  const args = [
    '-i', audioPath,
    '-ar', String(TARGET_SAMPLE_RATE), // 16 kHz
    '-ac', '1', // mono
    '-sample_fmt', 's16', // 16-bit PCM
    '-f', 'wav',
    '-y', // overwrite
    outPath,
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => reject(new Error(`Failed to launch ffmpeg: ${err.message}`)));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
    });
  });

  try {
    return await fs.readFile(outPath);
  } finally {
    // Best-effort cleanup of the decoded temp file.
    fs.unlink(outPath).catch(() => {});
  }
}

/**
 * Parse the header of a canonical PCM WAV buffer.
 * Returns { channels, sampleRate, bitsPerSample, dataOffset, dataLength }.
 * Scans chunks so it tolerates extra header chunks (e.g. LIST/fact).
 */
function parseWavHeader(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a valid RIFF/WAVE file');
  }

  let channels = 1;
  let sampleRate = TARGET_SAMPLE_RATE;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataLength = 0;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;

    if (chunkId === 'fmt ') {
      channels = buf.readUInt16LE(bodyStart + 2);
      sampleRate = buf.readUInt32LE(bodyStart + 4);
      bitsPerSample = buf.readUInt16LE(bodyStart + 14);
    } else if (chunkId === 'data') {
      dataOffset = bodyStart;
      // Clamp to actual buffer in case the size field is off.
      dataLength = Math.min(chunkSize, buf.length - bodyStart);
      break;
    }

    // Chunks are word-aligned (even byte boundaries).
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1) throw new Error('WAV file has no data chunk');
  return { channels, sampleRate, bitsPerSample, dataOffset, dataLength };
}

/** Build a canonical 44-byte-header WAV buffer from raw PCM frames. */
function buildWav(pcm, channels, sampleRate, bitsPerSample) {
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

/** Duration in seconds of a WAV buffer. */
function wavDuration(buf) {
  try {
    const { channels, sampleRate, bitsPerSample, dataLength } = parseWavHeader(buf);
    const bytesPerFrame = channels * (bitsPerSample / 8);
    return dataLength / bytesPerFrame / sampleRate;
  } catch {
    return 0;
  }
}

/**
 * Split a WAV buffer into <=chunkSeconds WAV chunks.
 * Returns [{ bytes: Buffer, offset: number(seconds) }].
 * Short files (<= MAX_CHUNK_SECONDS + 5) are returned as a single chunk.
 */
function splitWavChunks(buf, chunkSeconds = MAX_CHUNK_SECONDS) {
  const { channels, sampleRate, bitsPerSample, dataOffset, dataLength } = parseWavHeader(buf);
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const totalFrames = Math.floor(dataLength / bytesPerFrame);
  const duration = totalFrames / sampleRate;

  if (duration <= MAX_CHUNK_SECONDS + 5) {
    return [{ bytes: buf, offset: 0 }];
  }

  const framesPerChunk = Math.floor(chunkSeconds * sampleRate);
  const numChunks = Math.ceil(totalFrames / framesPerChunk);
  const chunks = [];

  for (let i = 0; i < numChunks; i++) {
    const startFrame = i * framesPerChunk;
    const framesThisChunk = Math.min(framesPerChunk, totalFrames - startFrame);
    const byteStart = dataOffset + startFrame * bytesPerFrame;
    const byteEnd = byteStart + framesThisChunk * bytesPerFrame;

    const pcm = buf.subarray(byteStart, byteEnd);
    const chunkWav = buildWav(pcm, channels, sampleRate, bitsPerSample);
    chunks.push({ bytes: chunkWav, offset: startFrame / sampleRate });
  }

  return chunks;
}

// ── Sarvam response parsing ──────────────────────────────────────────────

/**
 * Parse a single Sarvam /speech-to-text response into normalized segments.
 * Builds sentence-level segments from word timestamps, offsetting by `offset`.
 */
function parseSarvamResponse(result, offset = 0) {
  const transcript = result.transcript || '';
  const timestamps = (result.timestamps && typeof result.timestamps === 'object') ? result.timestamps : {};

  const words = Array.isArray(timestamps.words) ? timestamps.words : [];
  const starts = Array.isArray(timestamps.start_time_seconds) ? timestamps.start_time_seconds : [];
  const ends = Array.isArray(timestamps.end_time_seconds) ? timestamps.end_time_seconds : [];

  const round2 = (n) => Math.round(n * 100) / 100;
  const segments = [];

  if (words.length) {
    let current = { id: 0, start: 0, end: 0, text: '' };

    for (let i = 0; i < words.length; i++) {
      const st = (i < starts.length ? starts[i] : 0) + offset;
      const et = (i < ends.length ? ends[i] : 0) + offset;

      if (!current.text) current.start = round2(st);
      current.end = round2(et);
      current.text += words[i] + ' ';

      const stripped = current.text.trimEnd();
      // End a segment at sentence-ending punctuation (Latin + Devanagari danda).
      if (/[.।?!]$/.test(stripped) || stripped.endsWith('।।') || i === words.length - 1) {
        current.text = stripped;
        if (current.text) {
          segments.push({ id: segments.length, start: current.start, end: current.end, text: current.text });
        }
        current = { id: segments.length, start: 0, end: 0, text: '' };
      }
    }

    if (current.text.trim()) {
      segments.push({ id: segments.length, start: current.start, end: current.end, text: current.text.trim() });
    }
  }

  if (!segments.length) {
    segments.push({ id: 0, start: round2(offset), end: round2(offset), text: transcript });
  }

  const duration = segments.length ? segments[segments.length - 1].end : 0;
  return {
    full_text: transcript || segments.map((s) => s.text).join(' '),
    duration: round2(duration),
    segments,
  };
}

/** POST one WAV chunk to Sarvam, with retries. Returns parsed result or null. */
async function transcribeChunk(chunkBytes, sarvamKey, sarvamLang, sarvamModel, offset) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const form = new FormData();
      // Blob wraps the chunk bytes as the multipart file part.
      form.append('file', new Blob([chunkBytes], { type: 'audio/wav' }), 'chunk.wav');
      form.append('language_code', sarvamLang);
      form.append('model', sarvamModel);
      form.append('with_timestamps', 'true');

      const resp = await fetch(SARVAM_STT_URL, {
        method: 'POST',
        headers: { 'api-subscription-key': sarvamKey },
        body: form,
      });

      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        // On the last attempt, give up on this chunk (caller tolerates gaps).
        if (attempt >= MAX_RETRIES) return null;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }

      const json = await resp.json();
      const parsed = parseSarvamResponse(json, offset);
      // Capture the language Sarvam actually detected (present when using 'unknown').
      if (parsed) parsed.detectedLang = json.language_code || json.detected_language_code || '';
      return parsed;
    } catch {
      if (attempt >= MAX_RETRIES) return null;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return null;
}

// ── Public: transcribe ───────────────────────────────────────────────────

/**
 * Transcribe an audio file using Sarvam AI speech-to-text.
 * Decodes to 16 kHz mono WAV, splits into <=25s chunks, transcribes each,
 * and merges the results (offsetting segment timestamps).
 *
 * @returns {Promise<{success:true, full_text:string, language:string,
 *   duration:number, segments:{id:number,start:number,end:number,text:string}[]}>}
 */
export async function transcribe({ audioPath, sarvamKey, model = 'saarika:v2.5', language = '' }) {
  if (!sarvamKey) throw new Error('Sarvam API key is required for transcription.');
  if (!audioPath) throw new Error('audioPath is required for transcription.');

  // Resolve language code. If the user picked one, use it; otherwise pass
  // 'unknown' so Sarvam AUTO-DETECTS the spoken language (saarika:v2.5/flash
  // support this) — instead of forcing Hindi on every auto-recording.
  const lang = (language || '').trim().toLowerCase();
  const isAuto = !lang || lang === 'auto';
  const sarvamLang = isAuto ? 'unknown' : (SARVAM_LANGUAGES[lang] || (lang === 'en' ? 'en-IN' : 'unknown'));
  const sarvamModel = VALID_SARVAM_MODELS.has(model) ? model : 'saarika:v2.5';

  // Decode to a normalized WAV buffer, then split into transcribable chunks.
  let wavBuffer;
  try {
    wavBuffer = await decodeToWav(audioPath);
  } catch (err) {
    throw new Error(`Audio decoding failed: ${err.message}`);
  }

  const chunks = splitWavChunks(wavBuffer, MAX_CHUNK_SECONDS);

  // Transcribe all chunks concurrently (order preserved by index).
  const results = await Promise.all(
    chunks.map((c) => transcribeChunk(c.bytes, sarvamKey, sarvamLang, sarvamModel, c.offset))
  );

  // Merge in order, re-numbering segment ids and tracking max duration.
  const allSegments = [];
  const textParts = [];
  let totalDuration = 0;
  let detected = '';
  const failed = [];

  results.forEach((data, idx) => {
    if (!data) { failed.push(idx + 1); return; }
    for (const seg of data.segments) {
      allSegments.push({ id: allSegments.length, start: seg.start, end: seg.end, text: seg.text });
    }
    if (data.full_text) textParts.push(data.full_text);
    if (data.duration > totalDuration) totalDuration = data.duration;
    if (!detected && data.detectedLang) detected = data.detectedLang;
  });

  if (!allSegments.length) {
    throw new Error('All audio chunks failed to transcribe via Sarvam API.');
  }

  return {
    success: true,
    full_text: textParts.join(' '),
    // Report the chosen language, else the auto-detected one (e.g. te-IN -> te), else 'auto'.
    language: lang || (detected ? detected.split('-')[0] : 'auto'),
    duration: Math.round(totalDuration * 100) / 100,
    segments: allSegments,
  };
}

// ── OpenAI summarization ─────────────────────────────────────────────────

// System prompt instructing GPT to return a structured meeting-notes JSON
// object. Ported/condensed from skills_prompt.py (build_summary_prompt).
const SUMMARY_SYSTEM_PROMPT = `You are an expert meeting analyst and note-taker (similar to Fireflies.ai or Otter.ai).
Analyze the meeting transcript and produce a DETAILED, COMPREHENSIVE, STRUCTURED set of meeting notes.

Respond ONLY with a valid JSON object in this exact format (no markdown, no code fences, no extra text):
{
  "summary": "A comprehensive 5-8 sentence executive summary in English covering all major topics, outcomes, decisions, blockers, and next steps",
  "action_items": [
    { "task": "Clear, specific, actionable task description", "owner": "Exact speaker label / person name from transcript, or 'Unassigned'", "due": "Deadline mentioned or null" }
  ],
  "key_decisions": ["Concrete decision made during the meeting", "Another decision"],
  "follow_up_questions": ["Specific follow-up question 1", "Question 2"],
  "sentiment": "positive"
}

Rules:
- summary MUST be in clear, professional English even if the transcript is in Hindi/Marathi/Telugu/Bengali/Gujarati/Tamil/Kannada/Malayalam or Hinglish.
- Understand code-switched and transliterated speech (Indian languages written in English script) and express the meaning naturally in English.
- Extract EVERY action item, task, to-do, and commitment. Each must be specific and actionable. Translate Hindi/Hinglish tasks to English.
- For action item owners, use the EXACT speaker label from the transcript (e.g., "Speaker 1"). NEVER invent or guess real names. If no owner is clear, use "Unassigned".
- key_decisions should capture concrete decisions made during the meeting.
- follow_up_questions: generate 3-5 relevant questions based on unresolved topics or next steps.
- sentiment MUST be exactly one of: positive, neutral, tense, mixed.
- Preserve technical terms, proper nouns, product names, and acronyms exactly as spoken.
- NEVER fabricate information — only capture what was actually said in the transcript.`;

/**
 * Safely parse a JSON object out of an LLM response string.
 * Tries a direct parse first, then extracts the first balanced {...} block.
 */
function parseJsonResponse(raw) {
  try {
    return JSON.parse(raw);
  } catch { /* fall through to bracket extraction */ }

  const start = raw.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(raw.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  // Fallback shape so callers always get a consistent structure.
  return {
    summary: raw ? raw.slice(0, 500) : 'Summary unavailable',
    action_items: [],
    key_decisions: [],
    follow_up_questions: [],
    sentiment: 'neutral',
  };
}

/** Coerce action items into the required {task, owner, due} shape. */
function normalizeActionItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    if (typeof it === 'string') return { task: it, owner: 'Unassigned', due: null };
    return {
      task: it.task || it.description || '',
      owner: it.owner || 'Unassigned',
      due: it.due ?? it.deadline ?? null,
    };
  });
}

/** Coerce key decisions into an array of strings. */
function normalizeStringList(list, key) {
  if (!Array.isArray(list)) return [];
  return list.map((el) => (typeof el === 'string' ? el : (el && (el[key] || el.text)) || '')).filter(Boolean);
}

// ── Public: summarize ────────────────────────────────────────────────────

/**
 * Summarize a meeting transcript into structured notes using OpenAI.
 *
 * @returns {Promise<{success:true, summary:string,
 *   action_items:{task:string,owner:string,due:string|null}[],
 *   key_decisions:string[], follow_up_questions:string[],
 *   sentiment:string, language:string}>}
 */
export async function summarize({ transcript, openaiKey, model = 'gpt-4o-mini', meetingTitle = 'Meeting', language = 'auto' }) {
  if (!openaiKey) throw new Error('OpenAI API key is required for summarization.');
  if (!transcript || !transcript.trim()) throw new Error('Transcript is empty; nothing to summarize.');

  const chosenModel = VALID_OPENAI_MODELS.has(model) ? model : 'gpt-4o-mini';

  const userMessage =
    `Meeting Title: ${meetingTitle}\n` +
    `Language: ${language}\n\n` +
    `Transcript:\n${transcript}`;

  let resp;
  try {
    resp = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: [
          { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        top_p: 0.9,
        max_tokens: 16384,
        response_format: { type: 'json_object' },
      }),
    });
  } catch (err) {
    throw new Error(`Could not connect to OpenAI API: ${err.message}`);
  }

  if (resp.status === 401) throw new Error('OpenAI API key is invalid.');
  if (resp.status === 429) throw new Error('OpenAI rate limit exceeded. Try again shortly.');
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`OpenAI API error (${resp.status}): ${body.slice(0, 400)}`);
  }

  const json = await resp.json();
  const rawText = json?.choices?.[0]?.message?.content?.trim() || '';
  const parsed = parseJsonResponse(rawText);

  // Normalize into the exact documented return shape.
  const sentiment = ['positive', 'neutral', 'tense', 'mixed'].includes(parsed.sentiment)
    ? parsed.sentiment
    : 'neutral';

  return {
    success: true,
    summary: parsed.summary || '',
    action_items: normalizeActionItems(parsed.action_items),
    key_decisions: normalizeStringList(parsed.key_decisions, 'decision'),
    follow_up_questions: normalizeStringList(parsed.follow_up_questions, 'question'),
    sentiment,
    language,
    // Token usage for cost tracking (OpenAI returns this on every call)
    usage: {
      inputTokens: json?.usage?.prompt_tokens || 0,
      outputTokens: json?.usage?.completion_tokens || 0,
      totalTokens: json?.usage?.total_tokens || 0,
    },
    model,
  };
}
