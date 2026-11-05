import { withRolloutGuard } from '../_shared/rollout.ts';
import { handlePaddleWebhook } from '../_shared/paddle-webhook-handler.ts';

// Keep late sandbox payments and subscription events bound to their original key.
Deno.serve(withRolloutGuard(req => handlePaddleWebhook(req, 'sandbox'), 'paddle-webhook', false));
