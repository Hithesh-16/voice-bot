/**
 * Twilio telephony layer: inbound/outbound webhooks and TwiML.
 * For real-time AI we use Twilio Media Streams (WebSocket) in streaming handler.
 */

import twilio from 'twilio';
import type { Response } from 'express';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const baseUrl = process.env.BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';

export const twilioClient = accountSid && authToken
  ? twilio(accountSid, authToken)
  : null;

export function getTwilioPhone(): string | undefined {
  return twilioPhone;
}

/**
 * TwiML: Welcome and connect call to Media Stream (WebSocket) for real-time voice AI.
 */
export function twimlConnectStream(response: Response): void {
  const streamUrl = `${baseUrl}/voice/stream`;
  response.type('text/xml');
  response.send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}" track="both_tracks">
      <Parameter name="vertical" value="${process.env.BOT_VERTICAL || 'sales'}" />
    </Stream>
  </Connect>
</Response>`
  );
}

/**
 * TwiML: Say something and hang up (e.g. error or goodbye).
 */
export function twimlSayAndHangup(response: Response, message: string): void {
  response.type('text/xml');
  response.send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`
  );
}

/**
 * TwiML: Say message then redirect (e.g. to stream or another step).
 */
export function twimlSayAndRedirect(
  response: Response,
  message: string,
  redirectUrl: string
): void {
  response.type('text/xml');
  response.send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Redirect>${escapeXml(redirectUrl)}</Redirect>
</Response>`
  );
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
