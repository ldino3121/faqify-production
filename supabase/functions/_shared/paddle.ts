import { createClient } from 'npm:@supabase/supabase-js@2.50.2';
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export type PaddleEnvironment = 'sandbox' | 'live';
export function environment(): PaddleEnvironment {
  const env = Deno.env.get('PADDLE_ENVIRONMENT');
  if (env !== 'sandbox' && env !== 'live') throw new Error('Paddle environment is not configured');
  return env;
}
export async function paddleApi(path: string, body?: unknown, method?: string,
  mode: PaddleEnvironment = environment()) {
  const base = mode === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const key = Deno.env.get(mode === 'sandbox' ? 'PADDLE_API_KEY' : 'PADDLE_LIVE_API_KEY');
  if (!key) throw new Error('Paddle API is not configured');
  const response = await fetch(base + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Paddle-Version': '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) { console.error('Paddle request failed', path, response.status, result.error?.code); throw new Error('Billing service request failed. Please contact support.'); }
  return result.data;
}
export async function authenticated(req: Request, db: ReturnType<typeof adminClient>) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await db.auth.getUser(token);
  return error ? null : data.user;
}
