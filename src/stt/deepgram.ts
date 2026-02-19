/**
 * Speech-to-Text via Deepgram live streaming API.
 * Consumes μ-law 8kHz (Twilio format); Deepgram accepts raw and can handle encoding.
 */

import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';

interface TranscriptData {
  channel?: { alternatives?: { transcript?: string }[] };
  speech_final?: boolean;
  is_final?: boolean;
}

const apiKey = process.env.DEEPGRAM_API_KEY;
const dg = apiKey ? createClient(apiKey) : null;

export interface SttStreamCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
}

/** Options for live STT: Twilio (mulaw 8k) or browser (linear16 16k). */
export interface SttStreamOptions {
  encoding?: 'mulaw' | 'linear16';
  sample_rate?: number;
  channels?: number;
  /** Ms of silence before marking utterance final (longer = wait for full thought). */
  utterance_end_ms?: number;
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return ab as ArrayBuffer;
}

const DEFAULT_OPTIONS: SttStreamOptions = {
  encoding: 'mulaw',
  sample_rate: 8000,
  channels: 1,
};

export function createSttStream(callbacks: SttStreamCallbacks, options: SttStreamOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let connection: ReturnType<NonNullable<typeof dg>['listen']['live']> | null = null;
  let closed = false;

  return {
    start() {
      if (!dg) {
        console.warn('[STT] DEEPGRAM_API_KEY not set; STT disabled');
        return;
      }
      if (connection) return;
      closed = false;
      connection = dg.listen.live({
        model: 'nova-2',
        language: 'en',
        encoding: opts.encoding,
        sample_rate: opts.sample_rate,
        channels: opts.channels ?? 1,
        interim_results: true,
        utterance_end_ms: opts.utterance_end_ms ?? 1000,
        vad_events: true,
      });

      connection.on(LiveTranscriptionEvents.Open, () => {
        connection?.on(LiveTranscriptionEvents.Transcript, (data: TranscriptData) => {
          const transcript = data?.channel?.alternatives?.[0]?.transcript ?? '';
          const isFinal = data?.speech_final ?? data?.is_final ?? true;
          if (transcript) callbacks.onTranscript(transcript.trim(), isFinal);
        });
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        connection = null;
      });

      connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
        if (!closed) {
          console.warn('[STT] Deepgram connection error (client may have disconnected):', err instanceof Error ? err.message : err);
        }
        connection = null;
      });
    },
    write(chunk: Buffer) {
      if (connection && !closed && chunk.length) {
        try {
          connection.send(bufferToArrayBuffer(chunk));
        } catch (e) {
          console.error('[STT] send error', e);
        }
      }
    },
    stop() {
      closed = true;
      try {
        connection?.finish?.();
      } catch (_) {
        // requestClose in newer SDK
      }
      connection = null;
    },
  };
}
