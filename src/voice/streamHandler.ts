/**
 * Voice orchestration: Twilio Media Streams WebSocket.
 * - Receives inbound audio (base64 μ-law 8kHz)
 * - STT → AI Brain → TTS → outbound audio
 * - Call state, barge-in (interrupt), silence/timeout
 */

import { WebSocket } from 'ws';
import { getVertical } from '../config/verticals.js';
import { runBrain } from '../brain/llm.js';
import { createSttStream } from '../stt/deepgram.js';
import { textToSpeech } from '../tts/tts.js';

const SILENCE_TIMEOUT_MS = 4000;
const MAX_TURN_DURATION_MS = 30_000;

export interface StreamContext {
  callSid: string;
  streamSid: string | null;
  vertical: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  lastActivityAt: number;
  isSpeaking: boolean;
  streamStart: number;
}

export function handleStream(ws: WebSocket, params: Record<string, string>): void {
  const callSid = params.CallSid ?? 'unknown';
  const vertical = params.vertical ?? process.env.BOT_VERTICAL ?? 'sales';

  const ctx: StreamContext = {
    callSid,
    streamSid: null,
    vertical,
    messages: [],
    lastActivityAt: Date.now(),
    isSpeaking: false,
    streamStart: Date.now(),
  };

  let sttStream: ReturnType<typeof createSttStream> | null = null;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let turnTimeout: ReturnType<typeof setTimeout> | null = null;

  function resetSilenceTimer(): void {
    if (silenceTimer) clearTimeout(silenceTimer);
    ctx.lastActivityAt = Date.now();
    silenceTimer = setTimeout(() => {
      if (ctx.isSpeaking) return;
      // Optional: send a prompt like "Are you still there?"
    }, SILENCE_TIMEOUT_MS);
  }

  function clearTurnTimeout(): void {
    if (turnTimeout) {
      clearTimeout(turnTimeout);
      turnTimeout = null;
    }
  }

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as { event: string; streamSid?: string; media?: { payload: string }; sequence?: string };
      if (msg.event === 'media' && msg.media?.payload) {
        if (!sttStream) {
          sttStream = createSttStream({
            onTranscript: (text, isFinal) => {
              if (!text.trim() || !isFinal) return;
              ctx.lastActivityAt = Date.now();
              clearTurnTimeout();
              processUserInput(ctx, text, ws).catch((err) => {
                console.error('[stream] processUserInput error', err);
              });
            },
          });
          sttStream.start();
        }
        sttStream.write(Buffer.from(msg.media.payload, 'base64'));
        resetSilenceTimer();
      }
      if (msg.event === 'start') {
        const start = (msg as { start?: { streamSid?: string; customParameters?: Record<string, string> } }).start;
        const streamSid = msg.streamSid ?? start?.streamSid;
        if (streamSid) ctx.streamSid = streamSid;
        if (start?.customParameters?.vertical) ctx.vertical = start.customParameters.vertical;
        const verticalConfig = getVertical(ctx.vertical);
        resetSilenceTimer();
        // Send greeting from vertical as first TTS
        (async () => {
          ctx.isSpeaking = true;
          try {
            const audio = await textToSpeech(verticalConfig.greeting);
            if (audio && ws.readyState === WebSocket.OPEN && ctx.streamSid) {
              ws.send(JSON.stringify({ event: 'media', streamSid: ctx.streamSid, media: { payload: audio.toString('base64') } }));
            }
          } finally {
            ctx.isSpeaking = false;
          }
        })();
      }
      if (msg.event === 'stop') {
        sttStream?.stop();
        sttStream = null;
      }
    } catch (e) {
      console.error('[stream] message error', e);
    }
  });

  ws.on('close', () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    clearTurnTimeout();
    sttStream?.stop();
  });
}

async function processUserInput(
  ctx: StreamContext,
  text: string,
  ws: WebSocket
): Promise<void> {
  ctx.messages.push({ role: 'user', content: text });
  ctx.isSpeaking = true;

  const timeout = setTimeout(() => {
    ctx.isSpeaking = false;
  }, MAX_TURN_DURATION_MS);

  try {
    const config = getVertical(ctx.vertical);
    const reply = await runBrain(config, ctx.messages);
    ctx.messages.push({ role: 'assistant', content: reply });

    const audio = await textToSpeech(reply);
    if (audio && ws.readyState === WebSocket.OPEN && ctx.streamSid) {
      ws.send(JSON.stringify({ event: 'media', streamSid: ctx.streamSid, media: { payload: audio.toString('base64') } }));
    }
  } catch (err) {
    console.error('[stream] runBrain error', err);
    const fallback = 'Sorry, I had a small hiccup. Can you say that again?';
    const audio = await textToSpeech(fallback).catch(() => null);
    if (audio && ws.readyState === WebSocket.OPEN && ctx.streamSid) {
      ws.send(JSON.stringify({ event: 'media', streamSid: ctx.streamSid, media: { payload: audio.toString('base64') } }));
    }
  } finally {
    clearTimeout(timeout);
    ctx.isSpeaking = false;
  }
}
