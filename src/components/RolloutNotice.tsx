import { useEffect, useState, useSyncExternalStore } from 'react';
import { CLIENT_REVISION, PREVIEW_READ_ONLY, refreshRollout, rolloutSnapshot, subscribeRollout } from '@/lib/rollout';
export function RolloutNotice() {
  const status = useSyncExternalStore(subscribeRollout, rolloutSnapshot);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    void refreshRollout();
    const timer = window.setInterval(() => { void refreshRollout(); }, 15000);
    const refresh = () => { void refreshRollout(); };
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const stale = status.minimum_client_revision > CLIENT_REVISION;
  if (PREVIEW_READ_ONLY) return <aside role="status" className="sticky top-0 z-50 bg-amber-100 p-4 text-amber-950">Read-only preview. Sign-in, generation, saving and purchases are disabled. Your production FAQs and embeds are unchanged.</aside>;
  if (status.mode === 'checking') return null;
  if (status.mode === 'open' && !stale) return null;
  // A banner intentionally leaves the editor mounted and all local exports usable.
  return <aside role="alert" className="sticky top-0 z-50 border-b bg-amber-100 p-4 text-amber-950">
    <strong>{stale ? 'An app update is required.' : status.mode === 'drain' ? 'Maintenance is starting.' : 'Writes are temporarily unavailable.'}</strong>
    <p>Keep this tab open. Existing FAQs and embeds remain available. Download any unsaved draft before leaving or refreshing. New generation and checkout are paused.</p>
    {status.mode === 'drain' && <p>Finish your current save before the maintenance freeze.</p>}
    {stale && <div><label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> I have saved or downloaded my unsaved work.</label>{' '}
      <button type="button" disabled={!acknowledged || status.mode !== 'open'} onClick={() => window.location.reload()} className="underline disabled:opacity-50">Refresh app</button></div>}
  </aside>;
}
