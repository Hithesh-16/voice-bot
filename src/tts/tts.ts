/**
 * Text-to-Speech: returns audio as Buffer.
 * Prefers Deepgram (no OpenAI quota), then ElevenLabs, then OpenAI.
 * For Twilio Media Streams we need 8kHz μ-law mono (ffmpeg conversion when available).
 */

import { spawn } from 'child_process';
import { createClient } from '@deepgram/sdk';
import OpenAI from 'openai';

const deepgramKey = process.env.DEEPGRAM_API_KEY;
const dg = deepgramKey ? createClient(deepgramKey) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
const elevenLabsVoice = process.env.ELEVENLABS_VOICE_ID || 'default';

/** Twilio Media Streams require 8kHz μ-law. Set to true to convert via ffmpeg when available. */
const CONVERT_TO_TWILIO = true;

export async function textToSpeech(text: string): Promise<Buffer> {
  const raw = await getRawTts(text);
  if (!raw.length) return raw;
  if (CONVERT_TO_TWILIO) {
    const mulaw = await toMulaw8k(raw).catch(() => null);
    if (mulaw) return mulaw;
  }
  return raw;
}

/** Deepgram TTS options for browser (model/voice, encoding, sample_rate, bit_rate). */
export interface DeepgramTtsOptions {
  model?: string;
  encoding?: 'linear16' | 'mulaw' | 'alaw' | 'mp3' | 'opus' | 'flac' | 'aac';
  sample_rate?: number;
  bit_rate?: number;
  container?: string;
}

/** Returns raw audio for browser playback — uses Deepgram when DEEPGRAM_API_KEY is set. */
export async function textToSpeechForBrowser(text: string, options?: DeepgramTtsOptions): Promise<Buffer> {
  return getRawTts(text, options);
}

async function getRawTts(text: string, options?: DeepgramTtsOptions): Promise<Buffer> {
  if (dg) {
    return deepgramTts(text, options).catch((e) => {
      console.warn('[TTS] Deepgram failed, falling back', e?.message);
      return fallbackTts(text);
    });
  }
  return fallbackTts(text);
}

async function fallbackTts(text: string): Promise<Buffer> {
  if (elevenLabsKey) return elevenLabsTts(text).catch(() => openaiTts(text));
  return openaiTts(text);
}

/** Deepgram TTS (Aura) — returns audio for browser. */
async function deepgramTts(text: string, options?: DeepgramTtsOptions): Promise<Buffer> {
  if (!dg) return Buffer.alloc(0);
  const opts = {
    model: options?.model || process.env.DEEPGRAM_TTS_MODEL || 'aura-asteria-en',
    encoding: options?.encoding || 'mp3',
    ...(options?.sample_rate != null && { sample_rate: options.sample_rate }),
    ...(options?.bit_rate != null && { bit_rate: options.bit_rate }),
    ...(options?.container != null && { container: options.container }),
  };
  const client = await dg.speak.request({ text: text.slice(0, 4096) }, opts);
  const stream = await client.getStream();
  if (!stream) throw new Error('No stream from Deepgram TTS');
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return Buffer.from(out);
}

/** Convert MP3/PCM to 8kHz μ-law using ffmpeg (for Twilio). */
function toMulaw8k(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', 'pipe:0',
      '-ar', '8000',
      '-ac', '1',
      '-f', 'mulaw',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exit ${code}`));
    });
    ff.on('error', reject);
    ff.stdin.write(input);
    ff.stdin.end();
  });
}

async function openaiTts(text: string): Promise<Buffer> {
  if (!openai) {
    return Buffer.alloc(0);
  }
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text.slice(0, 4096),
  });
  const arrayBuffer = await mp3.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function elevenLabsTts(text: string): Promise<Buffer> {
  const voiceId = elevenLabsVoice === 'default' ? '21m00Tcm4TlvDq8ikWAM' : elevenLabsVoice;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': elevenLabsKey!,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text: text.slice(0, 4096), model_id: 'eleven_monolingual_v1' }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${t}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
