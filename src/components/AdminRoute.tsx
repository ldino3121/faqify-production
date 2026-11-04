import { type ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { clearAdminWorkspace } from '@/lib/admin-workspace';
import { Button } from '@/components/ui/button';

/**
 * Guards admin-only routes. Verifies via the `is_admin()` DB function so the
 * check is server-authoritative (RLS also protects the underlying data).
 */
async function verifyAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    // An expired/invalid session is a denial. A network or database failure is
    // recoverable and must not revoke a previously verified same-user view.
    const status = Number((error as { status?: number }).status);
    if (status === 401 || status === 403 || error.code === 'PGRST301') return false;
    throw error;
  }
  return data === true;
}

export const AdminRoute = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const client = useQueryClient();
  const userId = user?.id;
  const access = useQuery({
    queryKey: ['facc-access', userId],
    queryFn: verifyAdmin,
    enabled: !loading && !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  useEffect(() => {
    if (userId && access.data === false) {
      clearAdminWorkspace();
      client.removeQueries({ predicate: query => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('facc-') && query.queryKey[0] !== 'facc-access' });
    }
  }, [access.data, client, userId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-foreground">Checking access…</div>;
  if (!userId) return <Navigate to="/login" replace />;
  if (access.data === false) return <Navigate to="/dashboard" replace />;
  if (access.data !== true) return <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background text-foreground">
    {access.isError ? <><p role="alert">Could not verify admin access.</p><Button onClick={() => void access.refetch()}>Retry access check</Button></> : <p>Checking access…</p>}
  </div>;
  return <>
    {access.isError && <div role="status" className="mx-auto max-w-7xl px-4 pt-2 text-sm text-amber-300">Admin access could not be rechecked. <Button variant="link" onClick={() => void access.refetch()}>Retry</Button></div>}
    {children}
  </>;
};

export default AdminRoute;
