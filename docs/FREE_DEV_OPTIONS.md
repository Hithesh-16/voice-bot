# Free development & testing options

Use these to develop and test the voice bot without paid APIs (or with generous free tiers).

---

## 1. AI brain (LLM)

| Option | Free tier | How to use in this project |
|--------|-----------|----------------------------|
| **Groq** | Yes – free tier, fast inference | Get key at [console.groq.com](https://console.groq.com). In `.env` set `GROQ_API_KEY=your_key` and leave `OPENAI_API_KEY` empty. Uses OpenAI-compatible API. |
| **Ollama (local)** | Free – runs on your machine | Install [Ollama](https://ollama.com), run `ollama run llama3.2`. In `.env` set `LLM_PROVIDER=ollama` (and optionally `OLLAMA_BASE_URL=http://localhost:11434/v1`, `OLLAMA_CHAT_MODEL=llama3.2`). No API key. |
| **OpenAI** | Paid; sometimes free trial credits | Set `OPENAI_API_KEY` in `.env`. |
| **OpenRouter** | Limited free (e.g. 50 req/day) | Use OpenRouter’s OpenAI-compatible endpoint: set `OPENAI_API_KEY` to your OpenRouter key and `OPENAI_BASE_URL=https://openrouter.ai/api/v1` (you’d add baseURL support in code). |
| **Google AI Studio** | Free tier | Would require a small adapter in `src/brain/llm.ts` to call Gemini API. |

**Recommended for free dev:** **Groq** (cloud, no local GPU) or **Ollama** (fully local, no account).

---

## 2. Speech-to-text (STT)

| Option | Free tier | Notes |
|--------|-----------|--------|
| **Deepgram** | Trial credits for new signups | Best for **live/streaming**. Set `DEEPGRAM_API_KEY`. |
| **AssemblyAI** | Free tier / trial | Good accuracy; supports streaming. Would need a small adapter in `src/stt/`. |
| **Google Cloud Speech-to-Text** | $300 free credits (GCP) | Requires GCP project; good for batch/recorded. |
| **Whisper (local via Ollama)** | Free | `ollama run whisper`. Not real-time in current setup; would need a different pipeline for live calls. |
| **Browser Web Speech API** | Free | Only in browser; not for Twilio/server-side voice. |

**Recommended for free dev:** Use **Deepgram** trial credits for real-time; for “model only” testing you can skip STT and use `/test/brain` without a real call.

---

## 3. Text-to-speech (TTS)

| Option | Free tier | Notes |
|--------|-----------|--------|
| **OpenAI TTS** | Paid (usage-based) | Set `OPENAI_API_KEY`; used by this app. |
| **Google Cloud TTS** | Free tier / credits | Would need an adapter in `src/tts/`. |
| **Edge TTS (Microsoft)** | Free (unofficial libs) | e.g. `edge-tts` (Python); would need a Node adapter or subprocess. |
| **Browser SpeechSynthesis** | Free | Browser only. |
| **Twilio `<Say>`** | Uses Twilio voice | No separate TTS key; Twilio speaks the text. For full streaming bot we still need TTS → 8kHz μ-law. |

**Recommended for free dev:** Rely on **OpenAI TTS** if you have credits, or **Google Cloud TTS** free tier after adding a small adapter. For local “brain only” testing, TTS isn’t needed (use `/test/brain`).

---

## 4. Telephony (Twilio)

| Option | Free tier | Notes |
|--------|-----------|--------|
| **Twilio** | Trial balance + trial number | Sign up at [twilio.com](https://www.twilio.com). You get a number and balance for dev. Inbound/outbound work; upgrade for production. |
| **Plivo, Vonage, etc.** | Various trials | Would require changing `src/telephony/` to their webhooks/APIs. |

**Recommended for free dev:** **Twilio trial** – no cost for small dev usage.

---

## Quick setup: Groq (free LLM)

1. Sign up at [console.groq.com](https://console.groq.com) and create an API key.
2. In `.env`:
   ```env
   GROQ_API_KEY=gsk_xxxxxxxxxxxx
   # Leave OPENAI_API_KEY empty (or comment it out) so Groq is used
   ```
3. Restart the server. Hit `GET /test/brain?message=Hello` – the brain will use Groq (e.g. `llama-3.3-70b-versatile`).

Optional: set `GROQ_CHAT_MODEL=llama-3.1-8b-instant` (or another [Groq model](https://console.groq.com/docs/models)) for faster/cheaper responses.

---

## Quick setup: Ollama (local LLM)

1. Install [Ollama](https://ollama.com) and run:
   ```bash
   ollama run llama3.2
   ```
2. In `.env`:
   ```env
   LLM_PROVIDER=ollama
   # Optional: OLLAMA_BASE_URL=http://localhost:11434/v1
   # Optional: OLLAMA_CHAT_MODEL=llama3.2
   ```
3. Leave `OPENAI_API_KEY` and `GROQ_API_KEY` unset. Restart and use `/test/brain`.

---

## Testing without voice (model only)

You can test the **sales brain** with no STT/TTS/telephony:

- **GET**  
  `http://localhost:3000/test/brain?message=We%20need%20a%20demo`
- **POST**  
  `http://localhost:3000/test/brain`  
  Body: `{"message": "I'm interested in your product"}`

This only uses the LLM; no Twilio, Deepgram, or TTS required.
