import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, json } from '../_shared/paddle.ts';
import { generateWithDeepSeek } from '../_shared/ai-routing.ts';
import { GeminiFailure, generateWithGemini } from '../_shared/gemini-reliability.ts';

function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let difference = x.length ^ y.length;
  for (let i=0;i<Math.max(x.length,y.length);i++) difference |= (x[i]??0) ^ (y[i]??0);
  return difference===0 && x.length>20;
}
const source = 'FAQify saves generated question-and-answer pairs into user collections. One credit is charged only when an eligible generated pair is successfully saved. Existing saved FAQs remain accessible if a balance reaches zero.';
const prompt = `Create one FAQ pair supported by this source. Return ONLY a JSON array with question and answer keys. SOURCE:\n${source}`;

Deno.serve(withRolloutGuard(async req => {
  if (req.method!=='POST') return json({error:'Method not allowed'},405);
  const expected = Deno.env.get('FACC_MONITOR_TOKEN') ?? '';
  if (!sameSecret(req.headers.get('x-facc-monitor-token') ?? '',expected)) return json({error:'Unauthorized'},401);
  const db = adminClient();
  const {data:config,error:configError} = await db.from('facc_ai_configs').select('version,layers')
    .order('version',{ascending:false}).limit(1).single();
  if (configError || !config) return json({error:'Configuration unavailable'},503);
  const layers = config.layers as Array<{provider:'gemini'|'deepseek';model_id:string;enabled:boolean}>;
  const results: Array<{provider:string;model:string;available:boolean;probe:string}> = [];
  for (const layer of layers.filter(item=>item.enabled)) {
    const key = layer.provider==='gemini'
      ? Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY')
      : Deno.env.get('DEEPSEEK_API_KEY');
    if (!key) { results.push({provider:layer.provider,model:layer.model_id,available:false,probe:'not_configured'});continue; }
    let available=false;
    try {
      const response = await fetch(layer.provider==='gemini'
        ? `https://generativelanguage.googleapis.com/v1beta/models/${layer.model_id}` : 'https://api.deepseek.com/models',{
        headers:layer.provider==='gemini'?{'x-goog-api-key':key}:{Authorization:`Bearer ${key}`},
        signal:AbortSignal.timeout(8000)});
      const data = response.ok ? await response.json() : null;
      available = response.ok && (layer.provider==='gemini'
        ? data?.name===`models/${layer.model_id}` && data?.supportedGenerationMethods?.includes('generateContent')
        : Array.isArray(data?.data) && data.data.some((item:{id?:string})=>item.id===layer.model_id));
    } catch { /* Unknown availability is recorded; one failure is not retirement. */ }
    const requestId=crypto.randomUUID(),started=Date.now();
    const {error:startError}=await db.from('facc_ai_requests').insert({id:requestId,purpose:'health_probe',
      input_type:'probe',config_version:config.version,requested_count:1,status:'started'});
    if (startError) return json({error:'Probe tracking unavailable'},503);
    let seq=0,category='unknown',status:'success'|'failed'='failed';
    const record=async (metric:{model:string;category:string;latency_ms:number;status:number;input_tokens?:number;output_tokens?:number;returned_model?:string})=>{
      const {error}=await db.rpc('facc_record_ai_attempt',{p_request:requestId,p_seq:++seq,p_provider:layer.provider,
        p_model:metric.model,p_returned_model:metric.returned_model??null,p_category:metric.category,
        p_latency:metric.latency_ms,p_status:metric.status||null,p_input_tokens:metric.input_tokens??null,
        p_output_tokens:metric.output_tokens??null,p_cost:null,p_fallback:false});
      if (error) console.error('facc_probe_attempt_tracking_failed');
    };
    const metrics: Parameters<typeof record>[0][]=[];
    try {
      if (!available) throw new GeminiFailure('model_unavailable');
      if (layer.provider==='gemini') await generateWithGemini({apiKey:key,models:{primary:layer.model_id},
        payload:{contents:[{parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:512,temperature:0.3}},
        count:1,requestStartedAt:started,record:metric=>metrics.push(metric)});
      else await generateWithDeepSeek({apiKey:key,model:layer.model_id,prompt,count:1,requestStartedAt:started,
        record:metric=>metrics.push(metric)});
      status='success';category='success';
    } catch(error) { category=error instanceof GeminiFailure?error.category:'unknown'; }
    for (const metric of metrics) await record(metric);
    if (!metrics.length) await record({model:layer.model_id,category,latency_ms:Date.now()-started,status:0});
    await db.from('facc_ai_requests').update({status,error_category:status==='failed'?category:null,
      returned_count:status==='success'?1:0,finished_at:new Date().toISOString()}).eq('id',requestId);
    results.push({provider:layer.provider,model:layer.model_id,available,probe:category});
  }
  return json({checked:results.length,failures:results.filter(item=>item.probe!=='success').length});
},'admin-model-monitor',false));
