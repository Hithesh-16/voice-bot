# Voice Bot

                         ┌──────────────────────┐
                         │   CRM / Lead Source  │
                         │ (HubSpot, Salesforce)│
                         └─────────┬────────────┘
                                   │
                 ┌─────────────────▼─────────────────┐
                 │       Campaign Orchestrator        │
                 │  (Outbound Dialer + Scheduler)     │
                 │                                    │
                 │ • Lead selection                   │
                 │ • Retry rules                      │
                 │ • Call timing windows              │
                 │ • DND & compliance checks          │
                 └─────────┬─────────────────────────┘
                           │
            ┌──────────────▼──────────────┐
            │        Telephony Layer       │
            │  (Twilio / Plivo / Vonage)  │
            │                              │
            │ • Inbound calls              │
            │ • Outbound dialing           │
            │ • Call transfer              │
            │ • Recording                  │
            └─────────┬───────────┬───────┘
                      │           │
          Inbound Call │           │ Outbound Call
                      │           │
                      ▼           ▼
        ┌────────────────────────────────────────┐
        │       Voice Orchestration Service       │
        │      (Node.js / Python Backend)         │
        │                                        │
        │ • WebSocket audio streaming             │
        │ • Call state machine                    │
        │ • Barge-in handling                     │
        │ • Silence & timeout detection           │
        │ • Sales funnel tracking                 │
        └─────────┬───────────────┬─────────────┘
                  │               │
                  ▼               ▼
        ┌───────────────┐   ┌───────────────┐
        │ Speech-to-Text│   │ Text-to-Speech│
        │  (Deepgram /  │   │ (Polly / Azure│
        │  Google STT)  │   │  / ElevenLabs)│
        └─────────┬─────┘   └───────▲───────┘
                  │                 │
                  ▼                 │
        ┌────────────────────────────────────────┐
        │           AI Sales Brain                │
        │   (LLM + Sales Rules + Tools)           │
        │                                        │
        │ • Lead qualification                   │
        │ • Objection handling                   │
        │ • Pitch personalization                │
        │ • Demo / meeting booking                │
        │ • Escalation to human agent             │
        └─────────┬───────────────┬─────────────┘
                  │               │
                  ▼               ▼
        ┌───────────────┐   ┌─────────────────┐
        │ Sales APIs    │   │ Knowledge Base  │
        │ • CRM update  │   │ • Product FAQ   │
        │ • Calendar    │   │ • Pricing info │
        │ • Lead score  │   │ • Objections   │
        └───────────────┘   └─────────────────┘



A modular **voice bot** that fits the architecture: CRM → Campaign Orchestrator → Telephony → Voice Orchestration → STT/TTS → AI Brain. Use it for **sales**, **support**, **banking**, or **healthcare** by changing the `BOT_VERTICAL` env var.

## Architecture

- **Telephony**: Twilio (inbound + outbound, Media Streams for real-time audio).
- **Voice orchestration**: Node.js server with WebSocket for Twilio Media Streams; call state, silence/timeout handling.
- **STT**: Deepgram live streaming.
- **TTS**: OpenAI or ElevenLabs; converted to 8kHz μ-law for Twilio when ffmpeg is available.
- **AI Brain**: OpenAI with vertical-specific system prompts and tools (escalate, book meeting, create ticket, etc.).

For **free development testing** (Groq, Ollama, free STT/TTS options), see **[docs/FREE_DEV_OPTIONS.md](docs/FREE_DEV_OPTIONS.md)**.

## Quick start

1. **Clone and install**

   ```bash
   cd voice-bot
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   # Edit .env: Twilio, Deepgram, OpenAI, and optionally ElevenLabs
   ```

3. **Expose locally (for Twilio webhooks)**

   Use [ngrok](https://ngrok.com/) or similar:

   ```bash
   ngrok http 3000
   ```

   Set `BASE_URL` in `.env` to the ngrok URL (e.g. `https://abc123.ngrok.io`).

4. **Run**

   ```bash
   npm run dev
   ```

5. **Point Twilio at your app**

   - In Twilio Console → Phone Numbers → your number → Voice:
     - **A call comes in**: Webhook → `https://YOUR_BASE_URL/voice/inbound` (HTTP POST)
     - **Primary handler fails**: `https://YOUR_BASE_URL/voice/fallback`
   - For **outbound** campaigns, set the call’s TwiML URL to `https://YOUR_BASE_URL/voice/outbound`.

## Verticals

Set `BOT_VERTICAL` in `.env`:

| Value       | Use case   | Behavior / tools |
|------------|------------|-------------------|
| `sales`    | Sales      | Qualification, objections, book meeting, CRM update, escalate |
| `support`  | Support    | Troubleshooting, create ticket, knowledge base, escalate |
| `banking`  | Banking    | Balance, transactions, escalate; compliance-aware |
| `healthcare` | Healthcare | Appointments, cancel, escalate; no medical advice |

You can add more in `src/config/verticals.ts`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default `3000`) |
| `BASE_URL` | Yes (prod) | Public URL (e.g. ngrok or your domain) for Twilio webhooks and stream |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio phone number for outbound |
| `DEEPGRAM_API_KEY` | Yes (streaming) | Deepgram API key for live STT |
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM + TTS |
| `ELEVENLABS_API_KEY` | No | If set, TTS uses ElevenLabs (fallback: OpenAI TTS) |
| `BOT_VERTICAL` | No | `sales` \| `support` \| `banking` \| `healthcare` (default `support`) |

## Project layout

```
src/
  config/verticals.ts   # Vertical configs (prompts, tools, compliance)
  telephony/
    twilio.ts           # TwiML helpers, Twilio client
    webhooks.ts         # /voice/inbound, outbound, fallback
  voice/
    streamHandler.ts    # WebSocket handler: STT → Brain → TTS, state, timeouts
  stt/deepgram.ts       # Deepgram live STT
  tts/tts.ts            # TTS (OpenAI/ElevenLabs) + optional ffmpeg → 8kHz μ-law
  brain/llm.ts          # OpenAI chat + vertical tools
  server.ts             # Express + WebSocket server
```

## Optional: TTS for Twilio Media Streams

Twilio expects **8kHz μ-law** on the stream. This app converts TTS output to that format when **ffmpeg** is installed. If you don’t have ffmpeg, the bot still runs but Twilio may not play the audio correctly; install ffmpeg or use a TTS that outputs 8kHz μ-law directly.

## Optional: Campaign orchestrator / CRM

The diagram includes a Campaign Orchestrator (lead selection, retry, DND). This repo focuses on the **voice bot** (telephony + orchestration + STT/TTS + AI). To add an orchestrator:

- Add a small scheduler or use Twilio’s task queue.
- Sync leads from HubSpot/Salesforce (REST APIs) and trigger outbound via `twilioClient.calls.create()` with TwiML URL `BASE_URL/voice/outbound`.
- Implement DND and retry rules in that layer; this app only handles the live call.

## License

MIT.
