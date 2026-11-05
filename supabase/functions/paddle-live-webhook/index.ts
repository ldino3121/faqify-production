import { withRolloutGuard } from '../_shared/rollout.ts';
import { handlePaddleWebhook } from '../_shared/paddle-webhook-handler.ts';

Deno.serve(withRolloutGuard(req => handlePaddleWebhook(req, 'live'), 'paddle-live-webhook', false));
