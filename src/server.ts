/**
 * Voice Bot — Entry point.
 * HTTP server for Twilio webhooks + WebSocket server for Media Streams.
 */

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleInbound, handleOutbound, handleFallback } from './telephony/webhooks.js';
import { handleStream } from './voice/streamHandler.js';
import { handleTestVoice } from './voice/testVoiceHandler.js';
import { getVertical, getVerticalIds } from './config/verticals.js';
import { runBrain, getProvider, getAvailableProviders, GROQ_MODELS, OPENAI_MODELS } from './brain/llm.js';
import { textToSpeechForBrowser } from './tts/tts.js';

const PORT = Number(process.env.PORT) || 3000;
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Health
app.get('/health', (_req, res) => res.json({ status: 'ok', vertical: process.env.BOT_VERTICAL || 'sales' }));

// Twilio voice webhooks
app.post('/voice/inbound', handleInbound);
app.post('/voice/outbound', handleOutbound);
app.post('/voice/fallback', handleFallback);

// Optional: show current vertical config (for debugging)
app.get('/config', (_req, res) => {
  const config = getVertical(process.env.BOT_VERTICAL || 'sales');
  res.json({ vertical: process.env.BOT_VERTICAL, greeting: config.greeting, name: config.name });
});

// List verticals (business types) for UI
app.get('/test/verticals', (_req, res) => {
  const ids = getVerticalIds();
  const defaultId = process.env.BOT_VERTICAL || 'sales';
  const verticals = ids.map((id) => ({ id, name: getVertical(id).name }));
  res.json({ verticals, defaultVertical: defaultId });
});

// List providers and models for test UI (Groq + OpenAI when keys are set)
app.get('/test/models', (_req, res) => {
  const available = getAvailableProviders();
  const defaultProvider = getProvider();
  const providers: { id: string; name: string; models: readonly { id: string; name: string }[]; defaultModel: string }[] = [];
  if (available.includes('groq')) {
    providers.push({
      id: 'groq',
      name: 'Groq',
      models: GROQ_MODELS,
      defaultModel: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
    });
  }
  if (available.includes('openai')) {
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      models: OPENAI_MODELS,
      defaultModel: process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini',
    });
  }
  if (available.includes('ollama')) {
    providers.push({
      id: 'ollama',
      name: 'Ollama',
      models: [{ id: process.env.OLLAMA_CHAT_MODEL || 'llama3.2', name: process.env.OLLAMA_CHAT_MODEL || 'llama3.2' }],
      defaultModel: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
    });
  }
  res.json({ providers, defaultProvider });
});

// Local test: try the brain (GET or POST); optional ?vertical= & ?provider= & ?model=
app.get('/test/brain', async (req, res) => {
  const message = (req.query.message as string) || "I'm interested in learning more.";
  const vertical = (req.query.vertical as string) || process.env.BOT_VERTICAL || 'sales';
  const provider = (req.query.provider as 'groq' | 'openai' | 'ollama') || undefined;
  const model = req.query.model as string | undefined;
  const config = getVertical(vertical);
  const messages = [{ role: 'user' as const, content: message }];
  try {
    const reply = await runBrain(config, messages, { provider, model });
    res.json({ user: message, bot: reply, vertical: config.name, provider, model: model || undefined });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
app.post('/test/brain', async (req, res) => {
  const body = req.body as {
    message?: string;
    vertical?: string;
    provider?: 'groq' | 'openai' | 'ollama';
    model?: string;
    messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };
  const vertical = body.vertical || process.env.BOT_VERTICAL || 'sales';
  const config = getVertical(vertical);
  const messages = body.messages?.length
    ? body.messages
    : [{ role: 'user' as const, content: body.message || "I'm interested." }];
  try {
    const reply = await runBrain(config, messages, { provider: body.provider, model: body.model });
    res.json({ reply, vertical: config.name, provider: body.provider, model: body.model || undefined });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// TTS for browser (optional: model, encoding, sample_rate, bit_rate for Deepgram)
app.get('/test/tts', async (req, res) => {
  const text = (req.query.text as string)?.trim();
  if (!text) {
    res.status(400).send('Missing text');
    return;
  }
  const model = (req.query.model as string) || undefined;
  const encoding = (req.query.encoding as string) || undefined;
  const sampleRate = req.query.sample_rate != null ? Number(req.query.sample_rate) : undefined;
  const bitRate = req.query.bit_rate != null ? Number(req.query.bit_rate) : undefined;
  const options =
    model || encoding || sampleRate != null || bitRate != null
      ? { model, encoding: encoding as 'linear16' | 'mp3' | 'opus' | 'flac' | 'aac', sample_rate: sampleRate, bit_rate: bitRate }
      : undefined;
  try {
    const audio = await textToSpeechForBrowser(text.slice(0, 4096), options);
    if (!audio.length) {
      res.status(503).send('TTS not configured (set DEEPGRAM_API_KEY for TTS, or OPENAI/ELEVENLABS)');
      return;
    }
    const contentType =
      encoding === 'opus' ? 'audio/ogg;codecs=opus' : encoding === 'flac' ? 'audio/flac' : encoding === 'aac' ? 'audio/aac' : encoding === 'linear16' ? 'application/octet-stream' : 'audio/mpeg';
    res.setHeader('Content-Type', contentType);
    res.send(audio);
  } catch (err) {
    res.status(500).send(String(err));
  }
});

// Test UI (model selector + chat + voice pipeline)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
app.get('/test', (_req, res) => {
  res.sendFile(path.join(publicDir, 'test.html'));
});

const server = createServer(app);

// Single upgrade handler so both WebSocket paths work (multiple WSS with path conflict otherwise)
const wssStream = new WebSocketServer({ noServer: true });
const wssTestVoice = new WebSocketServer({ noServer: true });

wssStream.on('connection', (ws: import('ws').WebSocket, req: import('http').IncomingMessage) => {
  const url = new URL(req.url ?? '', `http://${req.headers.host}`);
  const params: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { params[k] = v; });
  handleStream(ws, params);
});

wssTestVoice.on('connection', (ws: import('ws').WebSocket) => handleTestVoice(ws));

server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '', `http://${request.headers.host}`).pathname;
  if (pathname === '/voice/stream') {
    wssStream.handleUpgrade(request, socket, head, (ws) => wssStream.emit('connection', ws, request));
  } else if (pathname === '/test/voice') {
    wssTestVoice.handleUpgrade(request, socket, head, (ws) => wssTestVoice.emit('connection', ws));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  const provider = getProvider();
  console.log(`Voice bot listening on http://0.0.0.0:${PORT}`);
  console.log(`LLM provider: ${provider}${provider === 'groq' ? ' (set GROQ_API_KEY, leave OPENAI_API_KEY unset to avoid 429)' : ''}`);
  console.log(`Vertical: ${process.env.BOT_VERTICAL || 'sales'}`);
  console.log(`Test UI: http://localhost:${PORT}/test`);
  console.log(`Twilio webhook (inbound): POST ${process.env.BASE_URL || 'https://YOUR_URL'}/voice/inbound`);
  console.log(`Stream WebSocket: ${(process.env.BASE_URL || 'https://YOUR_URL').replace(/^http/, 'ws')}/voice/stream`);
});
