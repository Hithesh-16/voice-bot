# Training the Model for Your Business Type

The voice bot does not use ML “training” in the usual sense. Instead, you **align** the model with your business by configuring **verticals** (business types) with prompts, scripts, and knowledge. The same LLM then behaves differently per vertical.

## How It Works

1. **Vertical** = one business type (sales, support, HR, hospitality, or your own).
2. Each vertical has:
   - **System prompt** – role, goals, tone (e.g. “You are a sales assistant…”).
   - **Greeting** – first thing the bot says.
   - **Tools** – e.g. book_meeting, create_ticket, escalate_to_agent.
   - **Compliance** – rules (e.g. “Always offer a human,” “No medical advice”).
3. **Optional “training” fields** (align the model with your business):
   - **businessContext** – who you are, what you do, who you serve.
   - **companyName** – name to use in replies.
   - **valueProposition** – one line the model can use when relevant.
   - **script** – preferred phrases the model should use when they fit.
   - **knowledge** – facts, FAQs, pricing, policies the model must use.

The brain builds the system message from: system prompt + business context + company name + value prop + script + knowledge + compliance. So the model responds **as per your script and knowledge** without fine-tuning.

## Built-in Business Types

| Vertical     | Use case                          |
|-------------|------------------------------------|
| **sales**   | Lead qualification, demos, CRM    |
| **support** | Tickets, knowledge base, escalation|
| **banking** | Balance, transactions, security   |
| **healthcare** | Appointments, front desk, HIPAA  |
| **hr**      | Policies, leave, benefits, onboarding |
| **hospitality** | Reservations, front desk, amenities |

Set default in `.env`:

```bash
BOT_VERTICAL=sales   # or support, banking, healthcare, hr, hospitality
```

In the test UI you can switch **Business type** per session without changing `.env`.

## Custom Verticals (Your Own Business Types)

To add your own business type (e.g. “retail”, “legal”, “real estate”):

1. Copy the example config:
   ```bash
   cp config/custom-verticals.json.example config/custom-verticals.json
   ```
2. Edit `config/custom-verticals.json`. You can use either format:

   **Object format** (one key per vertical):

   ```json
   {
     "retail": {
       "name": "Retail",
       "systemPrompt": "You are a friendly retail assistant...",
       "greeting": "Thanks for calling. How can I help?",
       "tools": ["book_meeting", "escalate_to_agent"],
       "compliance": "Escalate refunds and complaints to a manager.",
       "businessContext": "We are Acme Retail, 50 stores, focus on outdoor gear.",
       "companyName": "Acme Retail",
       "valueProposition": "Best selection of outdoor gear with expert advice.",
       "script": [
         "We have a 30-day return policy with receipt.",
         "Would you like me to check stock at your nearest store?"
       ],
       "knowledge": [
         "Stores open 9am–9pm weekdays, 10am–6pm weekends.",
         "Free shipping on orders over $50."
       ]
     }
   }
   ```

   **Array format** (each item has an `id`):

   ```json
   [
     {
       "id": "retail",
       "name": "Retail",
       "systemPrompt": "...",
       "greeting": "...",
       "tools": ["book_meeting", "escalate_to_agent"],
       "compliance": "...",
       "businessContext": "...",
       "script": ["..."],
       "knowledge": ["..."]
     }
   ]
   ```

3. Restart the server. Your vertical(s) appear in the **Business type** dropdown.

Optional: set a custom path:

```bash
CUSTOM_VERTICALS_PATH=/path/to/your/verticals.json
```

## “Training” Checklist (Alignment Without Fine-Tuning)

- **System prompt** – Describe the role, goals, and tone for this business type.
- **businessContext** – Company name, what you do, who you serve, differentiators.
- **companyName** & **valueProposition** – So the model uses your name and pitch.
- **script** – Exact or preferred phrases (e.g. opening, closing, objection handlers).
- **knowledge** – Facts the model must use: pricing, hours, policies, FAQs.
- **compliance** – What the bot must never do; when to escalate.

The model is not retrained; it follows these instructions and knowledge on each call. For very large or changing knowledge, consider adding a **RAG** (retrieve from your docs) step later.

## Available Tools (for `tools` array)

- `book_meeting` / `book_appointment` – Schedule a meeting or appointment.
- `update_crm` – Update CRM with note/status (sales).
- `create_ticket` – Create support ticket.
- `search_kb` – Search knowledge base.
- `escalate_to_agent` – Transfer to human (use in every vertical).
- `account_balance`, `recent_transactions` – Banking (after verification).
- `cancel_appointment` – Cancel appointment.

Use only the tools that make sense for the vertical.

## Summary

- **Multiple business types**: Use the **Business type** dropdown (sales, support, HR, hospitality, or your custom verticals).
- **Align with your business**: Edit system prompt, `businessContext`, `script`, and `knowledge` in code (`src/config/verticals.ts`) or in `config/custom-verticals.json`.
- **No ML training needed**: The model responds according to the configured script and knowledge for the selected vertical.
