/**
 * Test UI voice: browser mic → WebSocket → Deepgram live STT → transcript back to client.
 * Uses linear16 16kHz (browser sends that format).
 */

import type { WebSocket } from 'ws';
import { createSttStream } from '../stt/deepgram.js';

export function handleTestVoice(ws: WebSocket): void {
  const sttStream = createSttStream(
    {
      onTranscript(text: string, isFinal: boolean) {
        if (ws.readyState !== 1) return; // 1 = OPEN
        ws.send(JSON.stringify({ transcript: text, isFinal }));
      },
    },
    {
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      utterance_end_ms: 4000, // long pause (~6s) before "final" — finish your full sentence, then stay silent
    }
  );

  sttStream.start();

  ws.on('message', (data: Buffer | Buffer[]) => {
    if (Buffer.isBuffer(data) && data.length) sttStream.write(data);
  });

  ws.on('close', () => sttStream.stop());
  ws.on('error', () => sttStream.stop());
}
