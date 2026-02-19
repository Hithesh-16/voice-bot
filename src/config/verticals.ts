/**
 * Bot behavior per vertical (sales, support, banking, healthcare, HR, hospitality).
 * Swap BOT_VERTICAL in .env to change persona, tools, and compliance.
 * Use scripts and knowledge to "train" the model to align with your business.
 * Optional: config/custom-verticals.json for your own business types.
 *
 * Where each field is used and how it helps:
 * - systemPrompt: src/brain/llm.ts → becomes the main system message to the LLM. Defines role, goals, tone so the model responds correctly for this business type.
 * - greeting:       src/voice/streamHandler.ts → played as the first TTS when a Twilio call starts (voice/stream). Also exposed in GET /config for clients.
 * - tools:          src/brain/llm.ts → only these tools are passed to the LLM for this vertical (e.g. book_meeting for sales, create_ticket for support). Restricts and guides actions.
 * - compliance:     src/brain/llm.ts → appended to the system message. Tells the model what not to do and when to escalate (e.g. "Always offer human", "No medical advice").
 * - name:           Used in API responses (e.g. /test/brain returns vertical: config.name) and in the test UI dropdown.
 * - businessContext, script, knowledge, companyName, valueProposition: src/brain/llm.ts → appended to system message to align replies with your business and scripts.
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type BuiltInVertical = 'sales' | 'support' | 'banking' | 'healthcare' | 'hr' | 'hospitality';

export interface VerticalConfig {
  name: string;
  systemPrompt: string;
  greeting: string;
  /** Tools the brain is allowed to use in this vertical */
  tools: string[];
  /** Optional compliance / script hints */
  compliance?: string;
  /** Business context: company name, what you do, target audience (trains alignment) */
  businessContext?: string;
  /** Preferred phrases / script lines the model should follow when relevant */
  script?: string[];
  /** Key facts, FAQs, or knowledge the model must use in answers */
  knowledge?: string[];
  /** Company or product name to use in replies */
  companyName?: string;
  /** One-line value proposition to weave in when appropriate */
  valueProposition?: string;
}

const verticals: Record<BuiltInVertical, VerticalConfig> = {
  sales: {
    name: 'Sales',
    systemPrompt: `You are a friendly, professional sales assistant on a phone call. Your goals:
- Qualify the lead: understand their needs, budget, timeline, and decision process.
- Handle objections calmly (price, timing, competition) and redirect to value and outcomes.
- Personalize the pitch based on what they say; reference their situation.
- Offer to book a demo or meeting when there is interest; suggest a specific next step.
- Escalate to a human agent if they ask for one, want to negotiate, or seem frustrated.
Keep responses concise for voice (1-3 sentences). Sound natural and consultative, not pushy.`,
    greeting: 'Hi, thanks for calling. I\'m here to help you learn more about what we offer. What brought you to us today?',
    tools: ['book_meeting', 'update_crm', 'escalate_to_agent'],
    compliance: 'Always offer to connect to a human if requested. Do not make binding commitments or quote final pricing without a human.',
  },
  support: {
    name: 'Support',
    systemPrompt: `You are a helpful customer support agent on a phone call. Your goals:
- Listen to the issue and summarize to confirm understanding.
- Walk through troubleshooting steps clearly and patiently.
- Use the knowledge base to give accurate answers.
- Create or update a ticket when needed.
- Escalate to a human agent for complex or emotional issues.
Keep responses short and clear for voice. Be empathetic.`,
    greeting: 'Thanks for calling. I\'m here to help. What can I assist you with?',
    tools: ['create_ticket', 'search_kb', 'escalate_to_agent'],
    compliance: 'Never give medical or legal advice. Escalate when in doubt.',
  },
  banking: {
    name: 'Banking',
    systemPrompt: `You are a secure banking voice assistant. Your goals:
- Help with balance inquiries, recent transactions, and account info (only after verification).
- Explain products like accounts, cards, and loans at a high level.
- Guide to self-service or branch when needed.
- Never ask for or repeat full card numbers or passwords over the phone.
Keep responses brief and professional. Emphasize security.`,
    greeting: 'Welcome to banking support. How can I help you today?',
    tools: ['account_balance', 'recent_transactions', 'escalate_to_agent'],
    compliance: 'Do not disclose sensitive data. Verify identity before account details. Follow PCI and local regulations.',
  },
  healthcare: {
    name: 'Healthcare',
    systemPrompt: `You are a healthcare front-desk voice assistant. Your goals:
- Help with appointment scheduling, cancellations, and rescheduling.
- Answer general questions about hours, location, and common procedures.
- Collect basic intake info when appropriate.
- Never give medical advice or diagnose; direct clinical questions to staff.
Be warm, clear, and HIPAA-conscious. Keep responses short.`,
    greeting: 'Thank you for calling. How may I help you today?',
    tools: ['book_appointment', 'cancel_appointment', 'escalate_to_agent'],
    compliance: 'No medical advice or diagnosis. Do not confirm or deny patient status to unauthorized callers. HIPAA-aware.',
  },
  hr: {
    name: 'HR',
    systemPrompt: `You are a professional HR voice assistant for employee and candidate inquiries. Your goals:
- Answer questions about policies, leave, benefits, and onboarding at a high level.
- Direct to self-service portals or specific HR contacts when needed.
- Take messages or schedule callbacks for sensitive or complex topics.
- Never share personal data of other employees; escalate identity-sensitive requests.
Keep responses concise and professional. Be helpful and neutral.`,
    greeting: 'Hello, you\'ve reached HR. How can I help you today?',
    tools: ['book_meeting', 'create_ticket', 'escalate_to_agent'],
    compliance: 'Do not disclose other employees\' information. Escalate payroll, discipline, or legal topics to HR staff.',
  },
  hospitality: {
    name: 'Hospitality',
    systemPrompt: `You are a friendly front-desk or reservations voice assistant for a hotel or venue. Your goals:
- Help with reservations, modifications, cancellations, and availability.
- Answer questions about amenities, check-in/out times, and local info.
- Be warm and welcoming; reflect the brand tone.
- Escalate to staff for special requests, complaints, or billing issues.
Keep responses short and suitable for voice. Sound hospitable and clear.`,
    greeting: 'Thank you for calling. How may I help you today?',
    tools: ['book_meeting', 'create_ticket', 'escalate_to_agent'],
    compliance: 'Do not guarantee specific room numbers or rates without confirmation. Escalate complaints to a manager.',
  },
};

/** Custom verticals from config/custom-verticals.json (optional). */
let customVerticals: Record<string, VerticalConfig> = {};
const customPath = process.env.CUSTOM_VERTICALS_PATH || path.join(__dirname, '..', '..', 'config', 'custom-verticals.json');
if (existsSync(customPath)) {
  try {
    const raw = readFileSync(customPath, 'utf-8');
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      customVerticals = data;
    } else if (Array.isArray(data)) {
      customVerticals = Object.fromEntries(data.map((v: { id: string } & VerticalConfig) => [v.id.toLowerCase(), { ...v, name: v.name || v.id }]));
    }
  } catch (e) {
    console.warn('[verticals] Could not load custom verticals from', customPath, (e as Error).message);
  }
}

/** All vertical ids: built-in + custom */
export function getVerticalIds(): string[] {
  const builtIn = Object.keys(verticals) as BuiltInVertical[];
  const custom = Object.keys(customVerticals).filter((k) => !(builtIn as unknown as string[]).includes(k));
  return [...builtIn, ...custom];
}

export function getVertical(vertical: string): VerticalConfig {
  const id = (vertical || 'sales').toLowerCase();
  const custom = customVerticals[id];
  if (custom) return custom;
  const builtIn = verticals[id as BuiltInVertical];
  return builtIn ?? verticals.sales;
}

export { verticals, customVerticals };
