/**
 * AI Brain: LLM with vertical-specific system prompt and tools.
 * Handles qualification, objections, escalation, and tool use (CRM, calendar, etc.).
 */

import OpenAI from 'openai';
import type { VerticalConfig } from '../config/verticals.js';

// Groq API key: support both GROQ_API_KEY and GROK_API_KEY (common spelling)
const groqApiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY || '';

// Create clients for each provider that has a key (so UI can choose)
const groqClient = groqApiKey
  ? new OpenAI({ apiKey: groqApiKey, baseURL: 'https://api.groq.com/openai/v1' })
  : null;
const openaiClient = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const ollamaClient =
  process.env.LLM_PROVIDER === 'ollama'
    ? new OpenAI({ baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1', apiKey: 'ollama' })
    : null;

function getClient(provider: ProviderName): OpenAI | null {
  if (provider === 'groq') return groqClient;
  if (provider === 'openai') return openaiClient;
  if (provider === 'ollama') return ollamaClient;
  return groqClient ?? openaiClient ?? ollamaClient;
}

export type ProviderName = 'groq' | 'openai' | 'ollama';
/** Which providers are configured (have keys). */
export function getAvailableProviders(): ProviderName[] {
  const out: ProviderName[] = [];
  if (groqClient || groqApiKey) out.push('groq');
  if (openaiClient) out.push('openai');
  if (ollamaClient) out.push('ollama');
  return out.length ? out : (groqApiKey ? ['groq'] : []);
}

export function getProvider(): ProviderName {
  if (groqApiKey) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.LLM_PROVIDER === 'ollama') return 'ollama';
  return 'groq';
}

function getDefaultModel(provider: ProviderName): string {
  if (provider === 'groq') return process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile';
  if (provider === 'ollama') return process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
  return process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
}

export const OPENAI_MODELS = [
  { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
] as const;

// Groq models available for selection in test UI
export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile' },
  { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (fast)' },
  { id: 'llama-3.2-90b-vision-preview', name: 'Llama 3.2 90B Vision (preview)' },
  { id: 'llama-3.2-11b-vision-preview', name: 'Llama 3.2 11B Vision (preview)' },
  { id: 'llama-3.2-3b-preview', name: 'Llama 3.2 3B (preview)' },
  { id: 'llama-3.2-1b-preview', name: 'Llama 3.2 1B (preview)' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
  { id: 'whisper-large-v3', name: 'Whisper Large V3 (STT)' },
] as const;

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

const toolDefinitions: Record<string, ChatCompletionTool> = {
  book_meeting: {
    type: 'function',
    function: {
      name: 'book_meeting',
      description: 'Book a demo or meeting. Ask for preferred date/time if not given.',
      parameters: { type: 'object', properties: { date: { type: 'string' }, time: { type: 'string' }, topic: { type: 'string' } } },
    },
  },
  update_crm: {
    type: 'function',
    function: {
      name: 'update_crm',
      description: 'Update CRM with lead status or notes.',
      parameters: { type: 'object', properties: { note: { type: 'string' }, status: { type: 'string' } } },
    },
  },
  escalate_to_agent: {
    type: 'function',
    function: {
      name: 'escalate_to_agent',
      description: 'Transfer to a human agent. Use when user asks for human or seems frustrated.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
  create_ticket: {
    type: 'function',
    function: {
      name: 'create_ticket',
      description: 'Create a support ticket with summary.',
      parameters: { type: 'object', properties: { summary: { type: 'string' }, priority: { type: 'string' } } },
    },
  },
  search_kb: {
    type: 'function',
    function: {
      name: 'search_kb',
      description: 'Search knowledge base for an answer.',
      parameters: { type: 'object', properties: { query: { type: 'string' } } },
    },
  },
  account_balance: {
    type: 'function',
    function: {
      name: 'account_balance',
      description: 'Get account balance (after verification).',
      parameters: { type: 'object', properties: {} },
    },
  },
  recent_transactions: {
    type: 'function',
    function: {
      name: 'recent_transactions',
      description: 'List recent transactions.',
      parameters: { type: 'object', properties: { count: { type: 'number' } } },
    },
  },
  book_appointment: {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Book or reschedule a healthcare appointment.',
      parameters: { type: 'object', properties: { date: { type: 'string' }, time: { type: 'string' }, type: { type: 'string' } } },
    },
  },
  cancel_appointment: {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment.',
      parameters: { type: 'object', properties: { appointment_id: { type: 'string' } } },
    },
  },
};

export interface RunBrainOptions {
  /** Provider to use: groq | openai | ollama. If not set, uses first available (groq preferred). */
  provider?: ProviderName;
  /** Override model for this request. */
  model?: string;
}

export async function runBrain(
  config: VerticalConfig,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  options: RunBrainOptions = {}
): Promise<string> {
  const provider = options.provider ?? getProvider();
  const client = getClient(provider);
  if (!client) {
    return `No API key for ${provider}. Set GROQ_API_KEY and/or OPENAI_API_KEY in .env.`;
  }

  const model = options.model || getDefaultModel(provider);

  const systemParts: string[] = [config.systemPrompt];

  if (config.businessContext) {
    systemParts.push(`Business context: ${config.businessContext}`);
  }
  if (config.companyName) {
    systemParts.push(`When relevant, use this company/product name: ${config.companyName}.`);
  }
  if (config.valueProposition) {
    systemParts.push(`Value proposition to align with: ${config.valueProposition}`);
  }
  if (config.script?.length) {
    systemParts.push('Preferred script lines (use when they fit the conversation):\n' + config.script.map((s) => `- ${s}`).join('\n'));
  }
  if (config.knowledge?.length) {
    systemParts.push('Knowledge to use in answers:\n' + config.knowledge.map((k) => `- ${k}`).join('\n'));
  }
  if (config.compliance) {
    systemParts.push(`Compliance: ${config.compliance}`);
  }
  systemParts.push('Respond in 1-3 short sentences suitable for voice. No markdown.');

  const systemContent = systemParts.filter(Boolean).join('\n\n');

  const tools = config.tools
    .map((name) => toolDefinitions[name])
    .filter(Boolean) as ChatCompletionTool[];
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemContent },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const completion = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    tools: tools.length ? tools : undefined,
    max_tokens: 150,
    temperature: 0.7,
  });

  const choice = completion.choices[0];
  if (!choice) return 'I did not get a response. Can you repeat?';

  const msg = choice.message;
  if (msg.tool_calls?.length) {
    const toolCall = msg.tool_calls[0];
    const fn = toolCall.function;
    const args = (() => {
      try {
        return JSON.parse(fn.arguments || '{}');
      } catch {
        return {};
      }
    })();
    const toolResult = await runTool(fn.name, args);
    const followUp = await client.chat.completions.create({
      model,
      messages: [
        ...openaiMessages,
        msg,
        { role: 'tool', tool_call_id: toolCall.id!, content: toolResult },
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    const text = followUp.choices[0]?.message?.content;
    return text && text.trim() ? text : 'Done. Anything else?';
  }

  const text = msg.content;
  return (text && text.trim()) || 'Anything else I can help with?';
}

async function runTool(name: string, _args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'escalate_to_agent':
      return 'Escalation requested. In production, this would transfer the call to a human agent.';
    case 'book_meeting':
    case 'book_appointment':
      return 'Booking noted. In production, this would integrate with your calendar.';
    case 'update_crm':
      return 'CRM update noted.';
    case 'create_ticket':
      return 'Ticket created. A support agent will follow up.';
    case 'search_kb':
      return 'Knowledge base search completed. Use the answer from the knowledge base in your reply.';
    case 'account_balance':
    case 'recent_transactions':
      return 'In production, verify caller identity then return balance or transactions.';
    case 'cancel_appointment':
      return 'Cancellation noted. In production, this would cancel the appointment.';
    default:
      return `Tool ${name} is not implemented yet.`;
  }
}
