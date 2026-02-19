/**
 * Twilio voice webhooks: inbound and outbound entry points.
 */

import type { Request, Response } from 'express';
import {
  twimlConnectStream,
  twimlSayAndHangup,
} from './twilio.js';

/**
 * Inbound call: connect to Media Stream for real-time AI.
 * URL: POST /voice/inbound
 */
export function handleInbound(req: Request, res: Response): void {
  twimlConnectStream(res);
}

/**
 * Outbound call (e.g. from campaign orchestrator): same flow.
 * URL: POST /voice/outbound
 */
export function handleOutbound(req: Request, res: Response): void {
  twimlConnectStream(res);
}

/**
 * Fallback / error: say message and hang up.
 * URL: POST /voice/fallback
 */
export function handleFallback(req: Request, res: Response): void {
  const message = 'We are unable to take your call right now. Please try again later.';
  twimlSayAndHangup(res, message);
}
