import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { readAdminWorkspace, writeAdminWorkspace } from '@/lib/admin-workspace';

type Layer = { provider: 'gemini' | 'deepseek'; model_id: string; enabled: boolean };
type Catalog = Layer & { input_usd_per_million: number | null; output_usd_per_million: number | null;
  price_note: string; price_source: string; price_checked_at: string; max_input_chars: number;
  max_output_tokens: number; capabilities: Record<string, boolean>; approval_status?: 'candidate'|'approved';
  provider_input_token_limit?: number|null; provider_output_token_limit?: number|null };
type Config = { version: number; layers: Layer[]; created_at: string; action: string };
type ModelData = { catalog: Catalog[]; configs: Config[]; circuits: Array<{provider:string;model_id:string;open_until:string|null;
  last_check_at:string|null;last_success_at:string|null;last_category:string|null}>;
  tests: Array<{actor_id:string;provider:string;model_id:string;kind:string;successful:boolean;created_at:string;
    requested_count:number;returned_count:number|null;adapter_revision:string|null;prompt_revision:string|null;tested_layers:Layer[]|null;
    error_category:string|null}>;
  credentials: {gemini:boolean;deepseek:boolean}; adapterRevision:string; promptRevision:string };
type DiscoveredModel = {model_id:string;name:string;input_limit:number;output_limit:number;compatible:boolean};
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
  const workspace = useMemo(() => readAdminWorkspace(user?.id ?? ''), [user?.id]);
  const saved = workspace.state;
  const [tab,setTab] = useState((saved.tab as string) ?? 'overview');
  const [range,setRange] = useState<'7'|'30'|'custom'>((saved.range as '7'|'30'|'custom') ?? '7');
  const [startDate,setStartDate] = useState((saved.startDate as string) ?? '');
  const [endDate,setEndDate] = useState((saved.endDate as string) ?? '');
  const [includeSandbox,setIncludeSandbox] = useState((saved.includeSandbox as boolean) ?? false);
  const [includeAdmin,setIncludeAdmin] = useState((saved.includeAdmin as boolean) ?? false);
  const [includeTests,setIncludeTests] = useState((saved.includeTests as boolean) ?? false);
  const [reportEnd,setReportEnd] = useState((saved.reportEnd as string) ?? new Date().toISOString());
  const [draft,setDraft] = useState<Layer[] | null>((saved.draft as Layer[]) ?? null);
  const [draftBase,setDraftBase] = useState<Layer[] | null>((saved.draftBase as Layer[]) ?? null);
  const [draftVersion,setDraftVersion] = useState<number | null>((saved.draftVersion as number) ?? null);
  const [testResult,setTestResult] = useState<Record<string,unknown> | null>(null);
  const [busy,setBusy] = useState<string | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [auditPage,setAuditPage] = useState((saved.auditPage as number) ?? 0);
  const [registryPage,setRegistryPage] = useState((saved.registryPage as number) ?? 0);
  const [candidateProvider,setCandidateProvider] = useState<'gemini'|'deepseek'>('gemini');
  const [candidateModel,setCandidateModel] = useState('');
  const [discovered,setDiscovered] = useState<DiscoveredModel[]>([]);
  const [discoveredAt,setDiscoveredAt] = useState<string|null>(null);
  const [priceStatus,setPriceStatus] = useState<'known'|'unknown'>('unknown');
  const [inputPrice,setInputPrice] = useState('');
  const [outputPrice,setOutputPrice] = useState('');
  const [priceSource,setPriceSource] = useState('');
  const [unknownPriceAcknowledged,setUnknownPriceAcknowledged] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    writeAdminWorkspace(user.id,workspace.generation,{tab,range,startDate,endDate,includeSandbox,includeAdmin,
      includeTests,reportEnd,draft,draftBase,draftVersion,auditPage,registryPage});
  },[user?.id,workspace.generation,tab,range,startDate,endDate,includeSandbox,includeAdmin,includeTests,reportEnd,draft,draftBase,draftVersion,auditPage,registryPage]);
  const now = new Date(reportEnd);
  const end = range === 'custom' && endDate ? new Date(`${endDate}T00:00:00Z`).toISOString() : reportEnd;
  const start = range === 'custom' && startDate ? new Date(`${startDate}T00:00:00Z`).toISOString()
    : new Date(now.getTime()-Number(range === 'custom' ? 7 : range)*86400000).toISOString();
  const filter = { start, end, includeSandbox, includeAdmin, includeTests };
  const summary = useQuery({queryKey:['facc-summary',user?.id,range,startDate,endDate,reportEnd,includeSandbox,includeAdmin,includeTests],
    enabled:!!user && tab!=='audit' && tab!=='health', queryFn:()=>facc<{summary:Summary}>('summary',filter),staleTime:30000});
  const models = useQuery({queryKey:['facc-models',user?.id],enabled:!!user && tab==='models',
    queryFn:()=>facc<ModelData>('models'),staleTime:15000});
  const health = useQuery({queryKey:['facc-health',user?.id],enabled:!!user && (tab==='health'||tab==='overview'),
    queryFn:()=>facc<Record<string,unknown>>('health'),staleTime:30000});
  const audit = useQuery({queryKey:['facc-audit',user?.id,auditPage,registryPage],enabled:!!user && tab==='audit',
    queryFn:()=>facc<{rows:Array<{id:number;actor_id:string;action:string;old_version:number;new_version:number;created_at:string;
      old_layers:Layer[];new_layers:Layer[];test_evidence:Array<{kind?:string;provider?:string;model_id?:string;tested_at:string|null;
        successful?:boolean|null;adapter_revision?:string;prompt_revision?:string}>}>;total:number;
      registryAudit:Array<{id:number;actor_id:string;action:string;provider:string;model_id:string;price_status:string;created_at:string}>;
      registryTotal:number}>('audit',{page:auditPage,registryPage})});
  useEffect(() => {
    const latest = models.data?.configs?.[0];
    if (!latest || latest.version === draftVersion) return;
    if (draft && draftBase && JSON.stringify(draft) !== JSON.stringify(draftBase)) return;
    const layers=latest.layers.map(layer=>({...layer}));
    setDraft(layers);setDraftBase(layers);setDraftVersion(latest.version);
  },[models.data?.configs,draft,draftBase,draftVersion]);
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
  const draftDirty = !!draft && !!draftBase && JSON.stringify(draft)!==JSON.stringify(draftBase);
  const draftConflict = !!current && draftVersion!==null && current.version!==draftVersion;
  const recentTest = (test: ModelData['tests'][number]) => test.successful && test.returned_count===test.requested_count &&
    test.adapter_revision===models.data?.adapterRevision && test.prompt_revision===models.data?.promptRevision &&
    Date.now()-Date.parse(test.created_at)<24*60*60*1000;
  const untestedLayers = draft?.filter(layer=>layer.enabled && !models.data?.tests.some(test=>test.kind==='real' &&
    test.provider===layer.provider && test.model_id===layer.model_id && recentTest(test))) ?? [];
  const chainTested = !!draft && !!models.data?.tests.some(test=>test.kind==='chain' && test.actor_id===user?.id &&
    recentTest(test) && JSON.stringify(test.tested_layers)===JSON.stringify(draft));
  const draftAssignments = draft?.map(layer=>`${layer.provider}:${layer.model_id}`) ?? [];
  const draftStructureValid = !!draft && new Set(draftAssignments).size===3 && draft.filter(layer=>layer.enabled).length>=2 &&
    draft.some(layer=>layer.enabled&&layer.provider==='gemini') && draft.every(layer=>models.data?.catalog.some(item=>
      item.provider===layer.provider&&item.model_id===layer.model_id&&item.approval_status!=='candidate'));
  const canApply = draftDirty && draftStructureValid && !draftConflict && untestedLayers.length===0 && chainTested;
  const summaryData = summary.data?.summary;
  const openCircuits = ((health.data?.circuits as ModelData['circuits'] | undefined) ?? [])
    .filter(row=>row.open_until && Date.parse(row.open_until)>Date.now());
  const monitorEnabled = health.data?.monitorScheduleEnabled === true;
  const lastScheduledMonitor = health.data?.lastScheduledMonitor as string|null|undefined;
  const lastMonitorStatus = health.data?.lastMonitorStatus as string|null|undefined;
  const nextMonitorWindow = new Date();
  nextMonitorWindow.setUTCHours(4,17,0,0);
  if (nextMonitorWindow.getTime()<=Date.now()) nextMonitorWindow.setUTCDate(nextMonitorWindow.getUTCDate()+1);
  const previousMonitorWindow = new Date(nextMonitorWindow.getTime()-86400000);
  const monitorOverdue = monitorEnabled && Date.now()>previousMonitorWindow.getTime()+3*3600000 &&
    Date.parse(String(health.data?.monitorEnabledAt ?? ''))<=previousMonitorWindow.getTime() &&
    (!lastScheduledMonitor || Date.parse(lastScheduledMonitor)<previousMonitorWindow.getTime());
  const monitorStatus = !health.data?'Status unavailable':!monitorEnabled?'Disabled (operator schedule gate)':
    monitorOverdue?'Overdue':!health.data.lastMonitorRun?'Never run / not yet verified':
    lastMonitorStatus==='failed'?'Failed':lastMonitorStatus==='running'?'Running':lastMonitorStatus==='success'?'Healthy':'Status unavailable';
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
        {['overview','models','billing'].includes(tab) && <div className="mt-5 flex flex-wrap items-end gap-3 text-sm">
          <label>Range <select aria-label="Date range" className="ml-2 rounded border border-border bg-background p-2" value={range} onChange={e=>setRange(e.target.value as typeof range)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="custom">Custom UTC range</option></select></label>
          {range==='custom' && <><label>From <input type="date" className="ml-2 rounded border border-border bg-background p-2" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
            <label>To (exclusive) <input type="date" className="ml-2 rounded border border-border bg-background p-2" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label></>}
          <label><input type="checkbox" checked={includeSandbox} onChange={e=>setIncludeSandbox(e.target.checked)}/> Include sandbox</label>
          <label><input type="checkbox" checked={includeAdmin} onChange={e=>setIncludeAdmin(e.target.checked)}/> Include admins</label>
          <label><input type="checkbox" checked={includeTests} onChange={e=>setIncludeTests(e.target.checked)}/> Include manual tests</label>
          <span className="text-muted-foreground">{utcDate(start)} – {utcDate(end)} (end exclusive)</span>
          <Button size="sm" variant="outline" disabled={summary.isFetching} onClick={()=>setReportEnd(new Date().toISOString())}>
            {summary.isFetching?'Refreshing…':'Refresh report'}
          </Button>
          <span className="text-muted-foreground">{summary.dataUpdatedAt?`Last updated ${utcDate(new Date(summary.dataUpdatedAt).toISOString())}`:'Not loaded yet'}{summary.isError && summary.data?' · stale':''}</span>
        </div>}
        {summary.isError && <p role="alert" className="mt-4 text-destructive">{summary.error.message} <Button variant="link" onClick={()=>void summary.refetch()}>Retry</Button></p>}
        <TabsContent value="overview" className="space-y-5">
          {openCircuits.length>0 && <p role="alert" className="rounded border border-amber-500/50 p-3 text-amber-200">
            Model health needs attention: {openCircuits.map(row=>`${row.provider}/${row.model_id}`).join(', ')}. Review System Health before changing routing.
          </p>}
          {summary.isPending ? <p>Loading metrics…</p> : summaryData && <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric title="Total accounts (as of range end)" value={summaryData.total_accounts} definition="Account count before the selected UTC end boundary, after selected exclusions. This is a point-in-time figure, not new signups."/>
              <Metric title="New signups" value={summaryData.new_signups} definition="Accounts created inside this UTC range."/>
              <Metric title="Active users" value={summaryData.active_users} definition="Distinct accounts with a recorded generation request or credit-consuming save in this range."/>
              <Metric title="Paying customers" value={summaryData.paying_customers} definition="Distinct customers with a verified completed Paddle payment in this range, live by default."/>
              <Metric title="Repeat purchasers" value={summaryData.repeat_purchasers} definition="Customers with at least two completed purchases inside this range."/>
              <Metric title="Completed purchases" value={summaryData.completed_purchases} definition="Recorded completed Paddle payments; not recurring revenue."/>
              <Metric title="Generated pairs" value={summaryData.generated_pairs} definition="Pairs in completed generation tickets, not inferred from saved FAQ rows."/>
              <Metric title="Saved pairs" value={summaryData.saved_pairs} definition="Credit-consuming pairs recorded in the usage ledger."/>
            </div>
            <p className="text-xs text-muted-foreground">AI attempts and estimated costs tracked since {summaryData.tracked_since ? utcDate(String(summaryData.tracked_since)) : 'FACC installation (no samples yet)'}. Earlier values are unknown.</p>
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
            <Card><CardHeader><CardTitle>Recorded purchase amounts by currency and basis</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {items(summaryData.payment_totals).map(row=><p key={`${String(row.currency)}:${String(row.basis)}`}>{String(row.currency)}: {paymentTotal(row.amount_minor,row.currency)} · {row.basis==='catalog_price'?'Pack catalog price before checkout tax':'Paddle transaction total'} · {count(row.purchases)} payments</p>)}
              {!items(summaryData.payment_totals).length && <p>No completed payments for these filters.</p>}
              <p className="text-muted-foreground">Pack tax, refund amounts, fees, settlements and net proceeds are not in these records.</p>
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Refund and adjustment events</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
              {items(summaryData.adjustment_events).map((row,index)=><p key={`${row.action}:${row.resolution}:${index}`}>{String(row.action)} · {String(row.resolution)}: {count(row.count)}</p>)}
              {!items(summaryData.adjustment_events).length && <p>No recorded adjustment events for these filters.</p>}
              <p className="text-muted-foreground">Refund amounts and Paddle fees are not recorded here.</p>
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
            <div className="rounded border border-border p-3 text-sm">
              <p><strong>Serving customer requests:</strong> version {current.version} · {utcDate(current.created_at)}</p>
              <p><strong>Draft:</strong> based on version {draftVersion ?? 'unknown'}{draftDirty?' · Unsaved changes':' · No changes'}</p>
              {draftConflict && <p role="alert" className="text-amber-300">Another admin activated version {current.version}. Your draft is preserved. Review it against the active version before continuing. <Button size="sm" variant="outline" onClick={()=>{
                if (draftDirty && !window.confirm('Discard your unsaved model draft and load the active configuration?')) return;
                const layers=current.layers.map(layer=>({...layer}));setDraft(layers);setDraftBase(layers);setDraftVersion(current.version);
              }}>Discard draft and load active</Button></p>}
            </div>
            <Card><CardHeader><CardTitle>Replacement model candidates</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
              <p>Discovery does not change customer routing. Only supported provider adapters are available; a listed model still needs a generation test and approval.</p>
              <div className="flex flex-wrap items-end gap-2">
                <label>Provider <select className="ml-2 rounded border border-border bg-background p-2" value={candidateProvider} onChange={event=>{setCandidateProvider(event.target.value as 'gemini'|'deepseek');setDiscovered([]);setCandidateModel('');}}>
                  <option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></label>
                <Button size="sm" variant="outline" disabled={!!busy || !models.data.credentials[candidateProvider]} onClick={()=>void operate('model discovery',async()=>{
                  const result=await facc<{models:DiscoveredModel[];checkedAt:string}>('discover_models',{provider:candidateProvider});
                  setDiscovered(result.models);setDiscoveredAt(result.checkedAt);return result;
                })}>Refresh available models</Button>
                <span className="text-muted-foreground">{discoveredAt?`Listed ${utcDate(discoveredAt)}`:'Listing not checked'} · credential {models.data.credentials[candidateProvider]?'present':'missing'}</span>
              </div>
              {discovered.length>0 && <label className="block">Provider listing <select aria-label="Listed model candidate" className="ml-2 max-w-full rounded border border-border bg-background p-2" value="" onChange={event=>setCandidateModel(event.target.value)}>
                <option value="">Choose a listed model</option>{discovered.map(item=><option key={item.model_id} value={item.model_id} disabled={!item.compatible}>{item.model_id}{item.compatible?'':' (insufficient metadata or limits)'}</option>)}
              </select></label>}
              <label className="block">Exact model ID <input aria-label="Exact candidate model ID" className="ml-2 w-full max-w-sm rounded border border-border bg-background p-2" value={candidateModel} onChange={event=>setCandidateModel(event.target.value.trim())} placeholder="provider model ID"/></label>
              <div className="flex flex-wrap gap-3"><label><input type="radio" checked={priceStatus==='known'} onChange={()=>setPriceStatus('known')}/> Known token prices</label>
                <label><input type="radio" checked={priceStatus==='unknown'} onChange={()=>setPriceStatus('unknown')}/> Pricing unknown</label></div>
              {priceStatus==='known' ? <div className="flex flex-wrap gap-2">
                <label>Input USD / 1M tokens <input type="number" min="0" step="0.0001" className="ml-1 w-28 rounded border border-border bg-background p-2" value={inputPrice} onChange={event=>setInputPrice(event.target.value)}/></label>
                <label>Output USD / 1M tokens <input type="number" min="0" step="0.0001" className="ml-1 w-28 rounded border border-border bg-background p-2" value={outputPrice} onChange={event=>setOutputPrice(event.target.value)}/></label>
                <label>Pricing source <input className="ml-1 max-w-sm rounded border border-border bg-background p-2" value={priceSource} onChange={event=>setPriceSource(event.target.value)} placeholder="Official pricing page"/></label>
              </div> : <label className="block"><input type="checkbox" checked={unknownPriceAcknowledged} onChange={event=>setUnknownPriceAcknowledged(event.target.checked)}/> I understand test cost cannot be estimated without provider pricing.</label>}
              <Button size="sm" disabled={!!busy || !candidateModel || priceStatus==='unknown'&&!unknownPriceAcknowledged || priceStatus==='known'&&(!inputPrice||!outputPrice||!priceSource)} onClick={()=>void operate('candidate registration',async()=>{
                const result=await facc('register_candidate',{provider:candidateProvider,model:candidateModel,priceStatus,inputPrice,outputPrice,priceSource,unknownPriceAcknowledged});
                await models.refetch();return result;
              })}>Validate and register candidate</Button>
              <p className="text-muted-foreground">Registration checks provider access, text generation and token limits. It does not approve or activate a model. Unknown pricing stays clearly marked.</p>
              {models.data.catalog.filter(item=>item.approval_status==='candidate').map(item=>{
                const passed=models.data.tests.some(test=>test.kind==='real'&&test.provider===item.provider&&test.model_id===item.model_id&&recentTest(test));
                return <div key={`${item.provider}:${item.model_id}`} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                  <span>{item.provider}/{item.model_id} · candidate · price {item.input_usd_per_million==null?'unknown':'recorded'} · {passed?'compatibility test passed':'generation test required'}</span>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>{
                    if(!window.confirm(`Run a billable two-FAQ compatibility test for ${item.model_id}? ${item.input_usd_per_million==null?'Pricing is unknown.':'Provider token charges may apply.'}`))return;
                    void operate('candidate generation test',async()=>{const result=await facc('test',{provider:item.provider,model:item.model_id});await models.refetch();return result;});
                  }}>Run generation test</Button>
                  <Button size="sm" disabled={!!busy||!passed} onClick={()=>void operate('candidate approval',async()=>{
                    const result=await facc('approve_candidate',{provider:item.provider,model:item.model_id});await models.refetch();return result;
                  })}>Approve candidate</Button>
                </div>;
              })}
              {models.data.catalog.filter(item=>item.approval_status==='approved' && !current.layers.some(layer=>layer.provider===item.provider&&layer.model_id===item.model_id)).map(item=><div key={`${item.provider}:${item.model_id}`} className="flex flex-wrap items-center gap-2 rounded border border-border p-2">
                <span>{item.provider}/{item.model_id} · approved</span>{[0,1,2].map(index=><Button key={index} size="sm" variant="outline" onClick={()=>changeLayer(index,{provider:item.provider,model_id:item.model_id,enabled:item.provider==='deepseek'?false:draft[index].enabled})}>Assign to layer {index+1}</Button>)}
              </div>)}
            </CardContent></Card>
            <div className="grid gap-3 lg:grid-cols-3">{draft.map((layer,index)=>{
              const catalog=models.data.catalog.filter(item=>item.provider===layer.provider && item.approval_status!=='candidate');
              const info=models.data.catalog.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id);
              const circuit=models.data.circuits.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id);
              const recent=models.data.tests.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id&&item.kind==='real');
              const availability=models.data.tests.find(item=>item.provider===layer.provider&&item.model_id===layer.model_id&&item.kind==='availability');
              return <Card key={`${layer.provider}-${layer.model_id}-${index}`}><CardHeader><CardTitle className="flex items-center justify-between text-base">Layer {index+1} · {layer.provider}
                <Badge variant={layer.enabled?'secondary':'outline'}>{layer.enabled?'Enabled':'Disabled'}</Badge></CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <label className="block">Approved model <select aria-label={`Layer ${index+1} model`} className="mt-1 w-full rounded border border-border bg-background p-2" value={layer.model_id} onChange={e=>changeLayer(index,{model_id:e.target.value})}>
                    {catalog.map(item=><option key={item.model_id} value={item.model_id}>{item.model_id}</option>)}</select></label>
                  <label className="block"><input type="checkbox" checked={layer.enabled} onChange={e=>changeLayer(index,{enabled:e.target.checked})}/> Enabled</label>
                  <div className="flex gap-2"><Button size="sm" variant="outline" disabled={index===0} onClick={()=>moveLayer(index,-1)}>Move up</Button><Button size="sm" variant="outline" disabled={index===2} onClick={()=>moveLayer(index,1)}>Move down</Button></div>
                  <p>Credential present: {models.data.credentials[layer.provider]?'Yes':'No'} (authentication not verified)</p>
                  <p>Customer routing: {layer.enabled?'Enabled in draft':'Disabled in draft'}; {current.layers.some(active=>active.provider===layer.provider&&active.model_id===layer.model_id&&active.enabled)?'active now':'not active now'}.</p>
                  <p>Model availability: {availability ? `${availability.successful?'available':'unavailable'} · ${utcDate(availability.created_at)}`:'Not checked'}</p>
                  <p>Generation test: {recent ? `${recent.successful?'passed':'failed'} · ${utcDate(recent.created_at)}`:'Not run'}</p>
                  <p>Recent customer health: {!layer.enabled?'Disabled in draft':circuit?.open_until && Date.parse(circuit.open_until)>Date.now()?'Circuit open':circuit?.last_category??'Unknown'} · last attempt {utcDate(circuit?.last_check_at)}</p>
                  {info && <><p>Customer source limit: {info.max_input_chars.toLocaleString()} characters · requested output cap: {info.max_output_tokens.toLocaleString()} tokens. Admin test uses fixed shorter input and 1,024 output tokens.</p>
                    <p>Estimated USD per million tokens: input {info.input_usd_per_million ?? 'unknown'}, output {info.output_usd_per_million ?? 'unknown'}</p>
                    <p className="text-muted-foreground">{info.price_note} · checked {info.price_checked_at}</p></>}
                  <div className="flex flex-wrap gap-2"><Button size="sm" disabled={!!busy} onClick={()=>{
                    if (!window.confirm('Run a billable two-FAQ generation test with fixed synthetic text? Estimated cost depends on tokens and your provider plan.')) return;
                    void operate('generation test',async()=>{const result=await facc('test',{provider:layer.provider,model:layer.model_id});await models.refetch();return result;});
                  }}>Run generation test</Button>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void operate('availability',async()=>{const result=await facc('availability',{provider:layer.provider,model:layer.model_id});await models.refetch();return result;})}>Check model availability</Button></div>
                </CardContent></Card>})}</div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!busy} onClick={()=>{
              if (!window.confirm('Run a billable routing-chain test with fixed synthetic text? Only enabled layers are called as needed.')) return;
              void operate('routing test',async()=>{const result=await facc('test_chain',{layers:draft});await models.refetch();return result;});
            }}>Run routing-chain generation test</Button>
              <Button variant="outline" disabled={!!busy} onClick={()=>void operate('simulate',()=>facc('simulate_chain'))}>Simulate fallback</Button>
              <Button disabled={!!busy || !canApply} onClick={()=>void operate('apply',async()=>{
                const result=await facc('apply',{expectedVersion:current.version,layers:draft});
                setDraft(null);setDraftBase(null);setDraftVersion(null);
                await client.invalidateQueries({queryKey:['facc-models',user?.id]});return result;
              })}>Apply tested configuration</Button></div>
            {!canApply && <p className="text-sm text-muted-foreground">{!draftDirty?'Change the draft before applying.':draftConflict?'Resolve the newer active version first.':!draftStructureValid?'Use three distinct approved models, with at least two enabled including Gemini.':untestedLayers.length?`Run a current generation test for: ${untestedLayers.map(layer=>layer.model_id).join(', ')}.`:!chainTested?'Run a current generation test of this exact draft routing chain.':'Activation unavailable.'}</p>}
            <Card><CardHeader><CardTitle>Previous versions</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              {models.data.configs.slice(1).map(config=><div className="flex items-center gap-3" key={config.version}>
                <span>v{config.version} · {utcDate(config.created_at)}</span><Button size="sm" variant="outline" disabled={!!busy} onClick={()=>{
                  if (draftDirty && !window.confirm('Restore a previous active configuration and discard your unsaved draft?')) return;
                  void operate('restore',async()=>{
                  const result=await facc('restore',{expectedVersion:current.version,restoreVersion:config.version});
                  setDraft(null);setDraftBase(null);setDraftVersion(null);
                  await client.invalidateQueries({queryKey:['facc-models',user?.id]});return result;
                });}}>Restore</Button></div>)}
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
                <Metric title="Partial estimated AI cost" value={summaryData?.estimated_ai_cost_usd==null?'—':`$${Number(summaryData.estimated_ai_cost_usd).toFixed(4)}`} definition="Partial USD estimate from provider-reported tokens at catalog prices; unreported attempts are unknown."/>
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
          {health.data && <><div className="flex flex-wrap items-center gap-3 text-sm"><p>Current unresolved issues across sandbox, live, admin and customer activity. Reporting filters do not apply.</p>
            <Button size="sm" variant="outline" disabled={health.isFetching} onClick={()=>void health.refetch()}>{health.isFetching?'Checking…':'Refresh health'}</Button>
            <span className="text-muted-foreground">Checked {utcDate(health.data.checkedAt as string|null)}{health.isError?' · stale':''}</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric title="Open checkout intents" value={health.data.openCheckouts} definition="Local checkout intents not marked closed; remote status is not implied."/>
            <Metric title="Payments awaiting grant" value={health.data.completedAwaitingGrant} definition="Recorded completed credit-pack payments without a matching grant, within the bounded scan."/>
            <Metric title="Adjustment reviews" value={health.data.adjustmentReviews} definition="Billing adjustments requiring human reconciliation."/>
            <Metric title="Old reservations" value={health.data.oldReservations} definition="Generation tickets past their expiry that still show a reservation."/>
            <Metric title="Stale AI requests" value={health.data.staleAIRequests} definition="Telemetry requests still marked started after ten minutes; investigate before interpreting rates."/>
            <Metric title="Monitor failures (24h)" value={health.data.monitorFailures24h} definition="Failed or expired monitor invocations in the last 24 hours. A zero count is not proof that monitoring ran."/>
            <Metric title="Processed late (24h)" value={health.data.processedLate24h} definition="Successfully processed Paddle events that arrived more than 15 minutes late in the last 24 hours; historical timing, not an unresolved failure."/>
          </div><p className="text-sm text-muted-foreground">Last processed Paddle event: {utcDate(health.data.lastProcessedWebhook as string|null)}. Failed deliveries without a processed event are not measurable here; consult Paddle destination logs. A local intent does not prove remote Paddle status.</p>
          <Card><CardHeader><CardTitle>Scheduled model monitor: {monitorStatus}</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
            <p>Last invocation: {utcDate(health.data.lastMonitorRun as string|null)} · source {String(health.data.lastMonitorSource??'unknown')}</p>
            <p>Last scheduled invocation: {utcDate(lastScheduledMonitor)} · last success: {utcDate(health.data.lastSuccessfulMonitor as string|null)}</p>
            <p>Next expected window: {monitorEnabled?utcDate(nextMonitorWindow.toISOString()):'Not scheduled while disabled'} (allow three hours for scheduler delay)</p>
            <p className="text-muted-foreground">Manual checks and staging runs do not prove a production schedule event.</p>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Model health</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            {(health.data.circuits as ModelData['circuits']).map(row=><p key={`${row.provider}:${row.model_id}`}>{row.provider} / {row.model_id}: {row.last_category??'Unknown'} · last check {utcDate(row.last_check_at)} {row.open_until && Date.parse(row.open_until)>Date.now()?'· circuit open':''}</p>)}
            {!(health.data.circuits as unknown[]).length && <p>Unknown; no tracked attempts yet.</p>}
          </CardContent></Card>
          </>}
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
          </CardContent></Card><Card><CardHeader><CardTitle>Model registry activity</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
            {audit.data.registryAudit.map(row=><p key={row.id}>{utcDate(row.created_at)} · {row.action} · {row.provider}/{row.model_id} · pricing {row.price_status} · actor {row.actor_id}</p>)}
            {!audit.data.registryAudit.length && <p>No candidate activity yet.</p>}
            {audit.data.registryTotal>0 && <div className="flex items-center gap-3"><Button variant="outline" disabled={registryPage===0} onClick={()=>setRegistryPage(x=>x-1)}>Previous registry page</Button>
              <span>Page {registryPage+1}</span><Button variant="outline" disabled={(registryPage+1)*20>=audit.data.registryTotal} onClick={()=>setRegistryPage(x=>x+1)}>Next registry page</Button></div>}
          </CardContent></Card>{audit.data.total>0 && <div className="flex items-center gap-3"><Button variant="outline" disabled={auditPage===0} onClick={()=>setAuditPage(x=>x-1)}>Previous</Button>
            <span>Page {auditPage+1}</span><Button variant="outline" disabled={(auditPage+1)*20>=audit.data.total} onClick={()=>setAuditPage(x=>x+1)}>Next</Button></div>}</>}
        </TabsContent>
      </Tabs>
    </div>
  </div>;
}
