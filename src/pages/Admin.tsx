import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

type Layer = { provider: 'gemini' | 'deepseek'; model_id: string; enabled: boolean };
type Catalog = Layer & { input_usd_per_million: number; output_usd_per_million: number;
  price_note: string; price_source: string; price_checked_at: string; max_input_chars: number;
  max_output_tokens: number; capabilities: Record<string, boolean> };
type Config = { version: number; layers: Layer[]; created_at: string; action: string };
type ModelData = { catalog: Catalog[]; configs: Config[]; circuits: Array<{provider:string;model_id:string;open_until:string|null;
  last_check_at:string|null;last_success_at:string|null;last_category:string|null}>;
  tests: Array<{provider:string;model_id:string;kind:string;successful:boolean;created_at:string}>;
  credentials: {gemini:boolean;deepseek:boolean} };
type Summary = Record<string, string | number | null | Array<Record<string,string|number>>>;

async function facc<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('admin-control-center', { body: { action, ...args } });
  if (error || data?.error) {
    const detail = await error?.context?.json?.().catch(() => null);
    throw new Error(data?.error || detail?.error || 'Admin request failed. Retry.');
  }
  return data as T;
}
const utcDate = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(value))+' UTC' : 'Unknown';
const count = (value: unknown) => typeof value === 'number' ? value.toLocaleString()
  : typeof value === 'string' ? value : '—';
const rate = (numerator: unknown, denominator: unknown) => typeof numerator === 'number' &&
  typeof denominator === 'number' && denominator > 0 ? `${(numerator/denominator*100).toFixed(1)}%` : '—';
const items = (value: unknown): Array<Record<string,string|number>> => Array.isArray(value) ? value : [];
function paymentTotal(amount: unknown, currency: unknown) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(Number(amount))) return 'Unavailable';
  try {
    const format = new Intl.NumberFormat(undefined,{style:'currency',currency});
    const digits = format.resolvedOptions().maximumFractionDigits;
    return format.format(Number(amount) / 10 ** digits);
  } catch { return 'Unavailable'; }
}

function Metric({ title, value, definition }: {title:string;value:unknown;definition:string}) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm" title={definition}>{title}</CardTitle></CardHeader>
    <CardContent><p className="text-2xl font-semibold">{count(value)}</p></CardContent></Card>;
}

export default function Admin() {
  const { user } = useAuth();
  const client = useQueryClient();
  useEffect(() => () => {
    client.removeQueries({predicate: query => typeof query.queryKey[0] === 'string' && query.queryKey[0].startsWith('facc-')});
  }, [client]);
  const [tab,setTab] = useState('overview');
  const [range,setRange] = useState<'7'|'30'|'custom'>('7');
  const [startDate,setStartDate] = useState('');
  const [endDate,setEndDate] = useState('');
  const [includeSandbox,setIncludeSandbox] = useState(false);
  const [includeAdmin,setIncludeAdmin] = useState(false);
  const [includeTests,setIncludeTests] = useState(false);
  const [draft,setDraft] = useState<Layer[] | null>(null);
  const [draftVersion,setDraftVersion] = useState<number | null>(null);
  const [testResult,setTestResult] = useState<Record<string,unknown> | null>(null);
  const [busy,setBusy] = useState<string | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [auditPage,setAuditPage] = useState(0);
  const now = new Date();
  const end = range === 'custom' && endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : now.toISOString();
  const start = range === 'custom' && startDate ? new Date(`${startDate}T00:00:00Z`).toISOString()
    : new Date(now.getTime()-Number(range === 'custom' ? 7 : range)*86400000).toISOString();
  const filter = { start, end, includeSandbox, includeAdmin, includeTests };
  const summary = useQuery({queryKey:['facc-summary',user?.id,range,startDate,endDate,includeSandbox,includeAdmin,includeTests],
    enabled:!!user && tab!=='audit', queryFn:()=>facc<{summary:Summary}>('summary',filter),staleTime:30000});
  const models = useQuery({queryKey:['facc-models',user?.id],enabled:!!user && tab==='models',
    queryFn:()=>facc<ModelData>('models'),staleTime:15000});
  const health = useQuery({queryKey:['facc-health',user?.id],enabled:!!user && (tab==='health'||tab==='overview'),
    queryFn:()=>facc<Record<string,unknown>>('health'),staleTime:30000});
  const audit = useQuery({queryKey:['facc-audit',user?.id,auditPage],enabled:!!user && tab==='audit',
    queryFn:()=>facc<{rows:Array<{id:number;actor_id:string;action:string;old_version:number;new_version:number;created_at:string;
      old_layers:Layer[];new_layers:Layer[];test_evidence:Array<{kind?:string;provider?:string;model_id?:string;tested_at:string|null;
        successful?:boolean|null;adapter_revision?:string;prompt_revision?:string}>}>;total:number}>('audit',{page:auditPage})});
  useEffect(() => {
    const current = models.data?.configs?.[0];
    if (current && current.version !== draftVersion) {
      setDraft(current.layers.map(layer=>({...layer}))); setDraftVersion(current.version);
    }
  },[models.data?.configs,draftVersion]);
  async function operate(name:string, work:()=>Promise<unknown>) {
    setBusy(name);setError(null);
    try { const result = await work(); setTestResult(result as Record<string,unknown>); return result; }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Request failed.'); return null; }
    finally { setBusy(null); }
  }
  function changeLayer(index:number, patch:Partial<Layer>) {
    setDraft(current => current?.map((layer,i)=>i===index?{...layer,...patch}:layer) ?? null);
  }
  function moveLayer(index:number,direction:number) {
    setDraft(current=>{
      if (!current || index+direction<0 || index+direction>=current.length) return current;
      const next=[...current];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;
    });
  }
  const current = models.data?.configs?.[0];
  const summaryData = summary.data?.summary;
  const openCircuits = ((health.data?.circuits as ModelData['circuits'] | undefined) ?? [])
    .filter(row=>row.open_until && Date.parse(row.open_until)>Date.now());
  return <div className="min-h-screen bg-background text-foreground px-3 py-6 sm:px-6">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center gap-4"><Button asChild variant="outline" size="sm"><Link to="/dashboard"><ArrowLeft className="mr-2 h-4 w-4"/>Dashboard</Link></Button>
        <div><h1 className="text-2xl font-bold">Admin Control Center</h1><p className="text-xs text-muted-foreground">Private operations · UTC reporting</p></div></header>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="models">AI Models &amp; Tests</TabsTrigger>
          <TabsTrigger value="billing">Billing &amp; Usage</TabsTrigger><TabsTrigger value="health">System Health</TabsTrigger>
          <TabsTrigger value="audit">Audit History</TabsTrigger>
        </TabsList>
        {['overview','models','billing','health'].includes(tab) && <div className="mt-5 flex flex-wrap items-end gap-3 text-sm">
          <label>Range <select aria-label="Date range" className="ml-2 rounded border border-border bg-background p-2" value={range} onChange={e=>setRange(e.target.value as typeof range)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom UTC range</option></select></label>
          {range==='custom' && <><label>From <input type="date" className="ml-2 rounded border border-border bg-background p-2" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
            <label>To (exclusive) <input type="date" className="ml-2 rounded border border-border bg-background p-2" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></>}
          <label><input type="checkbox" checked={includeSandbox} onChange={e=>setIncludeSandbox(e.target.checked)}/> Include sandbox</label>
          <label><input type="checkbox" checked={includeAdmin} onChange={e=>setIncludeAdmin(e.target.checked)}/> Include admins</label>
          <label><input type="checkbox" checked={includeTests} onChange={e=>setIncludeTests(e.target.checked)}/> Include manual tests</label>
          <span className="text-muted-foreground">{utcDate(start)} – {utcDate(end)} (end exclusive)</span>
        </div>}
        {summary.isError && <p role="alert" className="mt-4 text-destructive">{summary.error.message} <Button variant="link" onClick={()=>void summary.refetch()}>Retry</Button></p>}
        <TabsContent value="overview" className="space-y-5">
          {openCircuits.length>0 && <p role="alert" className="rounded border border-amber-500/50 p-3 text-amber-200">
            Model health needs attention: {openCircuits.map(row=>`${row.provider}/${row.model_id}`).join(', ')}. Review System Health before changing routing.
          </p>}
          {summary.isPending ? <p>Loading metrics…</p> : summaryData && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric title="Total accounts" value={summaryData.total_accounts} definition="Accounts created before the end of this UTC range, after selected exclusions."/>
              <Metric title="New signups" value={summaryData.new_signups} definition="Accounts created inside this UTC range."/>
              <Metric title="Active users" value={summaryData.active_users} definition="Distinct accounts with a recorded generation request or credit-consuming save in this range."/>
              <Metric title="Paying customers" value={summaryData.paying_customers} definition="Distinct customers with a verified completed Paddle payment in this range, live by default."/>
              <Metric title="Repeat purchasers" value={summaryData.repeat_purchasers} definition="Customers with at least two completed purchases inside this range."/>
              <Metric title="Completed purchases" value={summaryData.completed_purchases} definition="Recorded completed Paddle payments; not recurring revenue."/>
              <Metric title="Generated pairs" value={summaryData.generated_pairs} definition="Pairs in completed generation tickets, not inferred from saved FAQ rows."/>
              <Metric title="Saved pairs" value={summaryData.saved_pairs} definition="Credit-consuming pairs recorded in the usage ledger."/>
            </div>
            <p className="text-xs text-muted-foreground">AI attempt and cost telemetry tracked since {summaryData.tracked_since ? utcDate(String(summaryData.tracked_since)) : 'the FACC migration (no samples yet)'}. Historical costs and provider attempts are unknown.</p>
          </>}
        </TabsContent>
        <TabsContent value="billing" className="space-y-5">
          {summary.isPending ? <p>Loading billing and usage…</p> : summaryData && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric title="Pro packs" value={items(summaryData.pack_sales).find(x=>x.pack==='Pro')?.count ?? 0} definition="Completed Pro credit-pack payments in range."/>
              <Metric title="Business packs" value={items(summaryData.pack_sales).find(x=>x.pack==='Business')?.count ?? 0} definition="Completed Business credit-pack payments in range."/>
              <Metric title="Adjustment reviews" value={summaryData.adjustment_reviews} definition="Billing adjustments awaiting explicit review, not a refund amount."/>
              <Metric title="Collections created" value={summaryData.collections_created} definition="Collections created inside the UTC range."/>
              <Metric title="Successful generations" value={summaryData.generations_succeeded} definition="Completed generation tickets in range."/>
              <Metric title="Generation failures" value={summaryData.generations_failed} definition="Generation tickets marked failed in range."/>
              <Metric title="Credits consumed" value={summaryData.saved_pairs} definition="Ledger usage deductions; one per saved generated FAQ pair."/>
            </div>
            <Card><CardHeader><CardTitle>Collected payment totals by currency</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {items(summaryData.payment_totals).map(row=><p key={String(row.currency)}>{String(row.currency)}: {paymentTotal(row.amount_minor,row.currency)} recorded collected · {count(row.purchases)} payments</p>)}
              {!items(summaryData.payment_totals).length && <p>No completed payments for these filters.</p>}
              <p className="text-muted-foreground">Paddle recorded transaction totals include tax where charged. Tax-exclusive revenue, fees, settlements and net proceeds are unavailable from current records.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Refund and adjustment events</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {items(summaryData.adjustment_events).map((row,index)=><p key={`${row.action}:${row.resolution}:${index}`}>{String(row.action)} · {String(row.resolution)}: {count(row.count)}</p>)}
              {!items(summaryData.adjustment_events).length && <p>No recorded adjustment events for these filters.</p>}
              <p className="text-muted-foreground">Event counts are available. Refund amounts and Paddle fees are not stored in the current reporting tables.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Credit use by source</CardTitle></CardHeader><CardContent className="text-sm">
              {items(summaryData.consumption_by_bucket).map(row=><p key={String(row.bucket)}>{String(row.bucket)}: {count(row.credits)} credits</p>)}
              {!items(summaryData.consumption_by_bucket).length && <p>No recorded credit use in this range.</p>}
            </CardContent></Card>
          </>}
        </TabsContent>
        <TabsContent value="models" className="space-y-5">
          {models.isPending && <p>Loading model configuration…</p>}
          {models.isError && <p role="alert" className="text-destructive">{models.error.message} <Button variant="link" onClick={()=>void models.refetch()}>Retry</Button></p>}
          {models.data && current && draft && <>
            <p className="text-sm text-muted-foreground">Version {current.version} · {utcDate(current.created_at)}. Gemini {models.data.credentials.gemini?'configured':'not configured'} · DeepSeek {models.data.credentials.deepseek?'configured':'not configured'}.</p>
            <div className="grid gap-3 lg:grid-cols-3">{draft.map((layer,index)=>{
              const catalog=models.data.catalog.filter(item=>item.provider===layer.provider);
              const info=models.data.catalog.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id);
              const circuit=models.data.circuits.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id);
              const recent=models.data.tests.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id&&item.kind==='real');
              return <Card key={`${layer.provider}-${layer.model_id}-${index}`}><CardHeader><CardTitle className="flex items-center justify-between text-base">Layer {index+1} · {layer.provider}
                <Badge variant={layer.enabled?'secondary':'outline'}>{layer.enabled?'Enabled':'Disabled'}</Badge></CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <label className="block">Approved model <select aria-label={`Layer ${index+1} model`} className="mt-1 w-full rounded border border-border bg-background p-2" value={layer.model_id} onChange={e=>changeLayer(index,{model_id:e.target.value})}>
                    {catalog.map(item=><option key={item.model_id} value={item.model_id}>{item.model_id}</option>)}</select></label>
                  <label className="block"><input type="checkbox" checked={layer.enabled} onChange={e=>changeLayer(index,{enabled:e.target.checked})}/> Enabled</label>
                  <div className="flex gap-2"><Button size="sm" variant="outline" disabled={index===0} onClick={()=>moveLayer(index,-1)}>Move up</Button><Button size="sm" variant="outline" disabled={index===2} onClick={()=>moveLayer(index,1)}>Move down</Button></div>
                  <p>Credential: {models.data.credentials[layer.provider]?'Configured':'Not configured'}</p>
                  <p>Health: {circuit?.open_until && Date.parse(circuit.open_until)>Date.now()?'Circuit open':circuit?.last_category??'Unknown'} · last check {utcDate(circuit?.last_check_at)}</p>
                  <p>Last real test: {recent ? `${recent.successful?'passed':'failed'} · ${utcDate(recent.created_at)}`:'None'}</p>
                  {info && <><p>Text / JSON · {info.max_input_chars.toLocaleString()} input characters · {info.max_output_tokens.toLocaleString()} output tokens</p>
                    <p>Estimated standard/peak USD per million tokens: input ${info.input_usd_per_million}, output ${info.output_usd_per_million}</p>
                    <p className="text-muted-foreground">{info.price_note} · checked {info.price_checked_at}</p></>}
                  <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!!busy} onClick={()=>void operate('test',()=>facc('test',{provider:layer.provider,model:layer.model_id}))}>Real test</Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void operate('availability',()=>facc('availability',{provider:layer.provider,model:layer.model_id}))}>Check listing</Button></div>
                </CardContent></Card>})}</div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!busy} onClick={()=>void operate('real chain',()=>facc('test_chain',{layers:draft}))}>Test draft routing chain</Button>
              <Button variant="outline" disabled={!!busy} onClick={()=>void operate('simulate',()=>facc('simulate_chain'))}>Simulate fallback</Button>
              <Button disabled={!!busy} onClick={()=>void operate('apply',async()=>{
                const result=await facc('apply',{expectedVersion:current.version,layers:draft});
                await client.invalidateQueries({queryKey:['facc-models',user?.id]});return result;
              })}>Apply tested configuration</Button></div>
            <Card><CardHeader><CardTitle>Previous versions</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              {models.data.configs.slice(1).map(config=><div className="flex items-center gap-3" key={config.version}>
                <span>v{config.version} · {utcDate(config.created_at)}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void operate('restore',async()=>{
                  const result=await facc('restore',{expectedVersion:current.version,restoreVersion:config.version});
                  await client.invalidateQueries({queryKey:['facc-models',user?.id]});return result;
                })}>Restore</Button></div>)}
              {models.data.configs.length===1 && <p>No previous configuration.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Recorded provider usage · selected UTC range</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Metric title="Tracked AI requests" value={summaryData?.ai_requests} definition="Completed customer requests after telemetry installation; started/stale requests excluded."/>
                <Metric title="Request success rate" value={rate(summaryData?.ai_successes,summaryData?.ai_requests)} definition="Successful completed AI requests divided by all completed AI requests in range."/>
                <Metric title="Fallback rate" value={rate(summaryData?.fallback_requests,summaryData?.ai_requests)} definition="Distinct tracked requests with a fallback attempt divided by completed tracked requests."/>
                <Metric title="Provider attempt failures" value={summaryData?.provider_attempt_failures} definition="Failed model attempts, including retries; separate from final request failures."/>
                <Metric title="Request p50" value={summaryData?.ai_p50_ms==null?'—':`${Math.round(Number(summaryData.ai_p50_ms))} ms`} definition="Median tracked end-to-end request latency. Small samples can be unstable."/>
                <Metric title="Request p95" value={summaryData?.ai_p95_ms==null?'—':`${Math.round(Number(summaryData.ai_p95_ms))} ms`} definition="95th-percentile tracked end-to-end latency. Small samples can be unstable."/>
                <Metric title="Estimated AI cost" value={summaryData?.estimated_ai_cost_usd==null?'—':`$${Number(summaryData.estimated_ai_cost_usd).toFixed(4)}`} definition="Partial USD estimate from provider-reported tokens at catalog prices; unreported attempts are unknown."/>
              </div>
              {items(summaryData?.model_stats).map(row=><p key={`${row.provider}:${row.model_id}`}>{row.provider} / {row.model_id}: {count(row.successes)}/{count(row.attempts)} successful attempts · {count(row.fallback_attempts)} fallback attempts · p50 {count(row.p50_ms)} ms · p95 {count(row.p95_ms)} ms · {count(row.input_tokens)} input / {count(row.output_tokens)} output tokens · estimated USD {String(row.estimated_cost_usd??'unknown')}</p>)}
              {!items(summaryData?.model_stats).length && <p>No tracked provider attempts for these filters.</p>}
            </CardContent></Card>
          </>}
          {busy && <p role="status">Running {busy}…</p>}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {testResult && <Card><CardHeader><CardTitle>Latest test or change</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            <p>{String(testResult.kind??'Configuration update')} · {testResult.success===false?'Failed':'Completed'} · {testResult.category?`Category: ${String(testResult.category)}`:''}</p>
            {testResult.requestedCount!=null && <p>Requested {String(testResult.requestedCount)} · returned {String(testResult.returnedCount)} · {String(testResult.latencyMs)} ms</p>}
            {testResult.provider && <p>Provider: {String(testResult.provider)} · model: {String(testResult.model)}{testResult.returnedModel?` · returned version: ${String(testResult.returnedModel)}`:''}{testResult.fallbackUsed?' · fallback used':''}</p>}
            {testResult.inputTokens!=null && <p>Tokens: {String(testResult.inputTokens)} input / {String(testResult.outputTokens)} output · estimated call cost: {testResult.estimatedCostUsd==null?'unknown':`$${Number(testResult.estimatedCostUsd).toFixed(6)} USD`}</p>}
            {testResult.attempts && <p>Real chain attempts: {(testResult.attempts as Array<{provider:string;model:string;category:string}>).map(attempt=>`${attempt.provider}/${attempt.model}: ${attempt.category}`).join(' → ')}</p>}
            {Array.isArray(testResult.sample) && <ul className="space-y-2">{testResult.sample.map((pair,index)=><li key={index}><strong>{String((pair as {question:string}).question)}</strong><p>{String((pair as {answer:string}).answer)}</p></li>)}</ul>}
            {testResult.sequence && <p>Simulated sequence: {String((testResult.sequence as string[]).join(' → '))}. This does not prove a real provider outage.</p>}
          </CardContent></Card>}
        </TabsContent>
        <TabsContent value="health" className="space-y-4">
          {health.isPending && <p>Loading health…</p>}
          {health.isError && <p role="alert" className="text-destructive">{health.error.message} <Button variant="link" onClick={()=>void health.refetch()}>Retry</Button></p>}
          {health.data && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Open checkout intents" value={health.data.openCheckouts} definition="Local checkout intents not marked closed; remote status is not implied."/>
            <Metric title="Payments awaiting grant" value={health.data.completedAwaitingGrant} definition="Recorded completed credit-pack payments without a matching grant, within the bounded scan."/>
            <Metric title="Adjustment reviews" value={health.data.adjustmentReviews} definition="Billing adjustments requiring human reconciliation."/>
            <Metric title="Old reservations" value={health.data.oldReservations} definition="Generation tickets past their expiry that still show a reservation."/>
            <Metric title="Stale AI requests" value={health.data.staleAIRequests} definition="Telemetry requests still marked started after ten minutes; investigate before interpreting rates."/>
            <Metric title="Monitor failures (24h)" value={health.data.monitorFailures24h} definition="Failed or expired scheduled runs. Probe failures do not open customer generation circuits."/>
            <Metric title="Delayed processed webhooks" value={health.data.delayedProcessedWebhooks} definition="Recorded Paddle events processed more than fifteen minutes after their event time. Failed deliveries without a processed record remain unknown."/>
          </div><p className="text-sm text-muted-foreground">Last processed Paddle event: {utcDate(health.data.lastProcessedWebhook as string|null)}. Webhook failures: {String(health.data.webhookFailures)}. A local intent does not prove the remote Paddle status.</p>
          <p className="text-sm text-muted-foreground">Last monitor run: {utcDate(health.data.lastMonitorRun as string|null)}. Last successful run: {utcDate(health.data.lastSuccessfulMonitor as string|null)}.</p>
          <Card><CardHeader><CardTitle>Model health</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            {(health.data.circuits as ModelData['circuits']).map(row=><p key={`${row.provider}:${row.model_id}`}>{row.provider} / {row.model_id}: {row.last_category??'Unknown'} · last check {utcDate(row.last_check_at)} {row.open_until && Date.parse(row.open_until)>Date.now()?'· circuit open':''}</p>)}
            {!(health.data.circuits as unknown[]).length && <p>Unknown; no tracked attempts yet.</p>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Final generation errors · selected UTC range</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
            {items(summaryData?.recent_error_categories).map(row=><p key={String(row.error_category)}>{String(row.error_category)}: {count(row.failures)}</p>)}
            {!items(summaryData?.recent_error_categories).length && <p>No tracked final failures for these filters.</p>}
          </CardContent></Card></>}
        </TabsContent>
        <TabsContent value="audit" className="space-y-4">
          {audit.isPending && <p>Loading audit history…</p>}
          {audit.isError && <p role="alert" className="text-destructive">{audit.error.message} <Button variant="link" onClick={()=>void audit.refetch()}>Retry</Button></p>}
          {audit.data && <><Card><CardHeader><CardTitle>Model configuration changes</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            {audit.data.rows.map(row=><details key={row.id} className="rounded border border-border p-3"><summary className="cursor-pointer">v{row.old_version} → v{row.new_version} · {row.action} · {utcDate(row.created_at)} · actor {row.actor_id}</summary>
              <p className="mt-2">Previous: {row.old_layers.map((layer,index)=>`${index+1}. ${layer.provider}/${layer.model_id} ${layer.enabled?'enabled':'disabled'}`).join(' · ')}</p>
              <p>Applied: {row.new_layers.map((layer,index)=>`${index+1}. ${layer.provider}/${layer.model_id} ${layer.enabled?'enabled':'disabled'}`).join(' · ')}</p>
              <p>Test evidence: {row.test_evidence.map(item=>item.kind==='chain'
                ? `Exact chain: ${item.adapter_revision}/${item.prompt_revision} at ${utcDate(item.tested_at)}`
                : `${item.provider}/${item.model_id}: ${item.successful===true?'passed':item.successful===false?'failed':'not recorded'} at ${utcDate(item.tested_at)}`).join(' · ') || 'None recorded'}</p>
            </details>)}
            {!audit.data.rows.length && <p>No configuration changes yet.</p>}
          </CardContent></Card><div className="flex items-center gap-3"><Button variant="outline" disabled={auditPage===0} onClick={()=>setAuditPage(x=>x-1)}>Previous</Button>
            <span>Page {auditPage+1}</span><Button variant="outline" disabled={(auditPage+1)*20>=audit.data.total} onClick={()=>setAuditPage(x=>x+1)}>Next</Button></div></>}
        </TabsContent>
      </Tabs>
    </div>
  </div>;
}
