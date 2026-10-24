import { adminClient, authenticated, json } from './paddle.ts';
export async function requireAdmin(req: Request): Promise<Response | null> {
  const db = adminClient();
  const user = await authenticated(req, db);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const { data } = await db.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  return data ? null : json({ error: 'Forbidden' }, 403);
}
