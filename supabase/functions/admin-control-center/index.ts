import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, json } from '../_shared/paddle.ts';
import { GeminiFailure, generateWithGemini } from '../_shared/gemini-reliability.ts';
import { AI_ADAPTER_REVISION, AI_PROMPT_REVISION, generateWithDeepSeek, generateWithRouting, validatedLayers, type AILayer } from '../_shared/ai-routing.ts';

const fixture = 'FAQify is a tool that turns supplied source material into question-and-answer pairs. A user chooses a count from one to ten, previews generated pairs, and saves eligible pairs to a collection. One credit is used only when a generated pair is saved. Existing collections and published embeds remain available when credits reach zero.';
const prompt = `Create two distinct, source-grounded FAQ pairs from this source. Return ONLY a JSON array of objects with string keys "question" and "answer". Do not invent facts. SOURCE:\n${fixture}`;
const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, topK: 20, topP: 0.8, maxOutputTokens: 1024 } };
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const validModelId = (value: unknown): value is string => typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/.test(value);
type Provider = 'gemini'|'deepseek';
const providerKey = (provider: Provider) => provider==='gemini'
  ? Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY')
  : Deno.env.get('DEEPSEEK_API_KEY');
async function providerModels(provider: Provider,key: string) {
  if (provider==='gemini') {
    const found: Array<{model_id:string;name:string;input_limit:number;output_limit:number;compatible:boolean}> = [];
    let pageToken='';
    for(let page=0;page<3;page++) {
      const url=new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize','100');
      if(pageToken) url.searchParams.set('pageToken',pageToken);
      const response=await fetch(url,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(8000)});
      if(!response.ok) throw new Error('Provider model listing unavailable');
      const data=await response.json();
      for(const item of Array.isArray(data.models)?data.models:[]) {
        const id=String(item.name??'').replace(/^models\//,'');
        if(!validModelId(id)) continue;
        const input=Number(item.inputTokenLimit),output=Number(item.outputTokenLimit);
        found.push({model_id:id,name:String(item.displayName??id).slice(0,120),input_limit:input,output_limit:output,
          compatible:Array.isArray(item.supportedGenerationMethods) && item.supportedGenerationMethods.includes('generateContent') && input>=8192 && output>=4096});
      }
      pageToken=typeof data.nextPageToken==='string'?data.nextPageToken:'';
      if(!pageToken) break;
    }
    return found.slice(0,200);
  }
  const response=await fetch('https://api.deepseek.com/models',{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok) throw new Error('Provider model listing unavailable');
  const data=await response.json();
  return (Array.isArray(data.data)?data.data:[]).filter((item:Record<string,unknown>)=>validModelId(item.id))
    .slice(0,200).map((item:Record<string,unknown>)=>({model_id:String(item.id),name:String(item.name??item.id).slice(0,120),
      input_limit:Number(item.context_window)-Number(item.max_output_tokens),output_limit:Number(item.max_output_tokens),
      compatible:Array.isArray(item.input_modalities)&&item.input_modalities.includes('text') &&
        Array.isArray(item.output_modalities)&&item.output_modalities.includes('text') &&
        Number(item.context_window)>=12288 && Number(item.max_output_tokens)>=4096}));
}
async function verifiedModel(provider:Provider,model:string,key:string) {
  if(provider==='gemini') {
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`,
      {headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw new Error('The provider did not confirm access to this exact model.');
    const data=await response.json();
    const input=Number(data.inputTokenLimit),output=Number(data.outputTokenLimit);
    if(data.name!==`models/${model}` || !Array.isArray(data.supportedGenerationMethods) ||
      !data.supportedGenerationMethods.includes('generateContent') || input<8192 || output<4096)
      throw new Error('This model does not meet text generation and token-limit requirements.');
    return {input,output};
  }
  const models=await providerModels(provider,key);
  const match=models.find(item=>item.model_id===model && item.compatible);
  if(!match) throw new Error('The provider did not confirm a compatible text model with required limits.');
  return {input:match.input_limit,output:match.output_limit};
}
async function approvedSet(db:ReturnType<typeof adminClient>) {
  const {data,error}=await db.from('facc_model_catalog').select('provider,model_id').eq('approval_status','approved');
  if(error||!data) throw new Error('Approved model registry unavailable');
  return new Set(data.map(row=>`${row.provider}:${row.model_id}`));
}
function estimatedUsd(input: number | undefined, output: number | undefined,
  inputPrice: number | null | undefined, outputPrice: number | null | undefined) {
  return input == null || output == null || inputPrice == null || outputPrice == null
    ? null : (input * inputPrice + output * outputPrice) / 1_000_000;
}

Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const db = adminClient();
  const user = await authenticated(req, db);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const { data: role, error: roleError } = await db.from('user_roles').select('role')
    .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (roleError || !role) return json({ error: 'Forbidden' }, 403);
  if (Number(req.headers.get('content-length') || 0)>8192) return json({error:'Admin request is too large.'},413);
  const rawBody=await req.text();
  if (rawBody.length>8192) return json({error:'Admin request is too large.'},413);
  const body=(()=>{try{return JSON.parse(rawBody);}catch{return {};}})();
  const action = body?.action;
  try {
    if (action === 'summary') {
      const end = validDate(body.end) ? new Date(body.end) : new Date();
      const start = validDate(body.start) ? new Date(body.start) : new Date(end.getTime()-7*86400000);
      if (start >= end || end.getTime()-start.getTime()>366*86400000 || end.getTime()>Date.now()+86400000)
        return json({ error: 'Choose a range of up to one year.' }, 400);
      const { data, error } = await db.rpc('facc_admin_summary', {
        p_start: start.toISOString(), p_end: end.toISOString(),
        p_include_sandbox: body.includeSandbox === true,
        p_include_admin: body.includeAdmin === true,
        p_include_tests: body.includeTests === true,
      });
      if (error) throw error;
      return json({ summary: data });
    }
    if (action === 'models') {
      const [catalog, configs, circuits, tests] = await Promise.all([
        db.from('facc_model_catalog').select('*').order('provider'),
        db.from('facc_ai_configs').select('version,layers,created_at,action').order('version', { ascending: false }).limit(15),
        db.from('facc_ai_circuits').select('provider,model_id,failure_streak,open_until,last_check_at,last_success_at,last_category'),
        db.from('facc_ai_tests').select('actor_id,provider,model_id,kind,successful,created_at,error_category,requested_count,returned_count,adapter_revision,prompt_revision,tested_layers').order('created_at',{ascending:false}).limit(100),
      ]);
      if (catalog.error || configs.error || circuits.error || tests.error) throw new Error('Model configuration unavailable');
      return json({ catalog: catalog.data, configs: configs.data, circuits: circuits.data, tests: tests.data,
        adapterRevision:AI_ADAPTER_REVISION,promptRevision:AI_PROMPT_REVISION,
        credentials: { gemini: !!(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY')),
          deepseek: !!Deno.env.get('DEEPSEEK_API_KEY') } });
    }
    if (action === 'deepseek_balance') {
      const key = Deno.env.get('DEEPSEEK_API_KEY');
      if (!key) return json({ error: 'DeepSeek is not configured.' }, 409);
      const response = await fetch('https://api.deepseek.com/user/balance', {
        headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return json({ available: false, providerStatus: response.status });
      const balance = await response.json();
      return json({ available: balance.is_available === true });
    }
    if (action === 'audit') {
      const page = Number.isInteger(body.page) && body.page >= 0 && body.page < 1000 ? body.page : 0;
      const registryPage = Number.isInteger(body.registryPage) && body.registryPage >= 0 && body.registryPage < 1000 ? body.registryPage : 0;
      const { data, error, count } = await db.from('facc_ai_audit')
        .select('id,actor_id,action,old_version,new_version,old_layers,new_layers,test_evidence,created_at',{count:'exact'})
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19);
      if (error) throw error;
      const {data:registryAudit,error:registryError,count:registryTotal}=await db.from('facc_model_registry_audit')
        .select('id,actor_id,action,provider,model_id,price_status,created_at',{count:'exact'})
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(registryPage*20,registryPage*20+19);
      if(registryError) throw registryError;
      return json({ rows: data, total: count, page, registryAudit, registryTotal, registryPage });
    }
    if (action === 'health') {
      const [circuits, totals] = await Promise.all([
        db.from('facc_ai_circuits').select('provider,model_id,open_until,last_check_at,last_success_at,last_category'),
        db.rpc('facc_admin_health'),
      ]);
      if (circuits.error || totals.error) throw new Error('Health data unavailable');
      return json({ circuits:circuits.data, ...totals.data,
        webhookFailures:'Unavailable from current database records' });
    }
    if(action==='discover_models' || action==='register_candidate' || action==='approve_candidate') {
      const provider=body.provider;
      if(provider!=='gemini' && provider!=='deepseek') return json({error:'Choose a supported provider.'},400);
      if(action==='approve_candidate') {
        if(!validModelId(body.model)) return json({error:'Enter an exact model ID.'},400);
        const {error}=await db.rpc('facc_approve_model_candidate',{p_actor:user.id,p_provider:provider,p_model:body.model});
        if(error) return json({error:'A recent successful exact-count generation test is required before approval.'},409);
        return json({approved:true,provider,model:body.model});
      }
      const key=providerKey(provider);
      if(!key) return json({error:`${provider} credential is not configured.`},409);
      if(action==='discover_models') {
        const models=await providerModels(provider,key);
        return json({provider,checkedAt:new Date().toISOString(),models});
      }
      if(!validModelId(body.model)) return json({error:'Enter an exact model ID.'},400);
      const known=body.priceStatus==='known';
      const unknown=body.priceStatus==='unknown' && body.unknownPriceAcknowledged===true;
      const inputPrice=Number(body.inputPrice),outputPrice=Number(body.outputPrice);
      if(!known&&!unknown || known&&(body.inputPrice===''||body.outputPrice===''||body.inputPrice==null||body.outputPrice==null||
        !Number.isFinite(inputPrice)||!Number.isFinite(outputPrice)||inputPrice<0||outputPrice<0))
        return json({error:'Provide provider token prices or explicitly acknowledge unknown pricing before testing.'},400);
      const limits=await verifiedModel(provider,body.model,key);
      if(known && (typeof body.priceSource!=='string' || body.priceSource.trim().length<4 || body.priceSource.length>240))
        return json({error:'Record the source and date of the provider price estimate.'},400);
      const source=known ? body.priceSource.trim() : 'Pricing unknown; administrator acknowledged before billable test';
      const {error}=await db.rpc('facc_register_model_candidate',{p_actor:user.id,p_provider:provider,p_model:body.model,
        p_input_price:known?inputPrice:null,p_output_price:known?outputPrice:null,p_price_status:known?'known':'unknown',
        p_price_note:known?'Admin-supplied estimate; verify current provider pricing':'Unknown price; explicit admin acknowledgement',
        p_price_source:source,p_provider_input_limit:limits.input,p_provider_output_limit:limits.output});
      if(error) return json({error:'Candidate already exists or could not be registered.'},409);
      return json({registered:true,provider,model:body.model,limits});
    }
    if (action === 'test' || action === 'availability' || action === 'test_chain') {
      if (action === 'test_chain') {
        const controlledGeminiFailure = body.controlledGeminiFailure === true;
        const { data: config, error: configError } = await db.from('facc_ai_configs').select('layers')
          .order('version',{ascending:false}).limit(1).single();
        if (configError || !config) throw new Error('Routing configuration unavailable');
        const layers = validatedLayers(body.layers ?? config.layers,await approvedSet(db));
        if (layers.some(layer=>layer.enabled && layer.provider==='deepseek' && !Deno.env.get('DEEPSEEK_API_KEY')))
          return json({error:'DeepSeek is not configured.'},409);
        const first = layers.find(layer=>layer.enabled);
        if (!first) return json({error:'No enabled model is configured.'},409);
        const { data: testId, error: limitError } = await db.rpc('facc_begin_ai_test', {
          p_actor:user.id,p_provider:first.provider,p_model:first.model_id,p_kind:'chain' });
        if (limitError) return json({error:'Model-test rate limit reached. Retry later.'},429);
        const started = Date.now();
        const attempts: Array<{provider:string;model:string;category:string;input_tokens?:number;output_tokens?:number}> = [];
        try {
          const result = await generateWithRouting({layers,testOutputCap:1024,
            geminiKey:Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY') || '',
            deepSeekKey:Deno.env.get('DEEPSEEK_API_KEY') || undefined,
            geminiPayload:payload,prompt,count:2,requestStartedAt:started,
            fetcher: controlledGeminiFailure ? ((input, init) => {
              if (String(input).startsWith('https://generativelanguage.googleapis.com/'))
                return Promise.resolve(new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 }));
              return fetch(input, init);
            }) as typeof fetch : undefined,
            record:async event=>{attempts.push({provider:event.provider,model:event.model,category:event.category,
              input_tokens:event.input_tokens,output_tokens:event.output_tokens});},
            circuitOpen:async layer=>{
              const {data,error}=await db.from('facc_ai_circuits').select('open_until')
                .eq('provider',layer.provider).eq('model_id',layer.model_id).maybeSingle();
              if(error)throw error;
              return !!data?.open_until && Date.parse(data.open_until)>Date.now();
            },
          });
          const complete=result.faqs.length===2;
          await db.from('facc_ai_tests').update({provider:result.provider,model_id:result.model,
            successful:complete,returned_count:result.faqs.length,latency_ms:Date.now()-started,
            input_tokens:result.inputTokens,output_tokens:result.outputTokens,
            tested_layers:layers,adapter_revision:AI_ADAPTER_REVISION,prompt_revision:AI_PROMPT_REVISION}).eq('id',testId);
          const {data:price}=await db.from('facc_model_catalog').select('input_usd_per_million,output_usd_per_million')
            .eq('provider',result.provider).eq('model_id',result.model).single();
          return json({kind:'real-chain',success:complete,provider:result.provider,model:result.model,returnedModel:result.returnedModel,
            controlledGeminiFailure,
            requestedCount:2,returnedCount:result.faqs.length,sample:result.faqs,
            fallbackUsed:result.fallbackUsed,attempts:attempts.map(item=>({provider:item.provider,model:item.model,category:item.category})),
            latencyMs:Date.now()-started,inputTokens:result.inputTokens??null,outputTokens:result.outputTokens??null,
            testedConfiguration:layers,adapterRevision:AI_ADAPTER_REVISION,promptRevision:AI_PROMPT_REVISION,
            estimatedCostUsd:estimatedUsd(result.inputTokens,result.outputTokens,
              price?.input_usd_per_million,price?.output_usd_per_million)});
        } catch(error) {
          const category=error instanceof GeminiFailure?error.category:'unknown';
          await db.from('facc_ai_tests').update({successful:false,error_category:category,latency_ms:Date.now()-started}).eq('id',testId);
          return json({kind:'real-chain',success:false,category,latencyMs:Date.now()-started,
            attempts:attempts.map(item=>({provider:item.provider,model:item.model,category:item.category}))});
        }
      }
      const provider = body.provider;
      const model = body.model;
      const { data: candidate, error: candidateError } = await db.from('facc_model_catalog')
        .select('provider,model_id,input_usd_per_million,output_usd_per_million,price_status,approval_status').eq('provider',provider).eq('model_id',model).maybeSingle();
      if (candidateError || !candidate) return json({ error: 'Select an approved model.' }, 400);
      const key = provider === 'gemini'
        ? Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY')
        : Deno.env.get('DEEPSEEK_API_KEY');
      if (!key) return json({ error: `${provider} is not configured.` }, 409);
      if (body.simulated === true) return json({error:'Use the separate simulated-chain test.'},400);
      const kind = action === 'availability' ? 'availability' : 'real';
      const { data: testId, error: limitError } = await db.rpc('facc_begin_ai_test', {
        p_actor:user.id,p_provider:provider,p_model:model,p_kind:kind });
      if (limitError) return json({ error: 'Model-test rate limit reached. Retry later.' }, 429);
      const started = Date.now();
      try {
        if (action === 'availability') {
          const url = provider === 'gemini'
            ? `https://generativelanguage.googleapis.com/v1beta/models/${model}` : 'https://api.deepseek.com/models';
          const response = await fetch(url,{headers: provider === 'gemini' ? {'x-goog-api-key':key} : {'Authorization':`Bearer ${key}`},signal:AbortSignal.timeout(8000)});
          const result = response.ok ? await response.json() : null;
          const available = response.ok && (provider === 'gemini'
            ? result?.name === `models/${model}` && result?.supportedGenerationMethods?.includes('generateContent')
            : Array.isArray(result?.data) && result.data.some((item:{id?:string}) => item.id===model));
          await db.from('facc_ai_tests').update({successful:available,latency_ms:Date.now()-started,error_category:available?null:'unavailable'}).eq('id',testId);
          return json({ kind, available, latencyMs:Date.now()-started });
        }
        const metrics: Array<{ input_tokens?:number; output_tokens?:number }> = [];
        const result = provider === 'gemini'
          ? await generateWithGemini({apiKey:key,models:{primary:model},payload,count:2,requestStartedAt:started,
              record:metric=>metrics.push(metric)})
          : await generateWithDeepSeek({apiKey:key,model,prompt,count:2,requestStartedAt:started,maxOutputTokens:1024,
              record:metric=>metrics.push(metric)});
        const latest = metrics.at(-1);
        const complete=result.faqs.length===2;
        await db.from('facc_ai_tests').update({successful:complete,returned_count:result.faqs.length,
          latency_ms:Date.now()-started,input_tokens:latest?.input_tokens,output_tokens:latest?.output_tokens,
          adapter_revision:AI_ADAPTER_REVISION,prompt_revision:AI_PROMPT_REVISION}).eq('id',testId);
        return json({ kind, success:complete, provider, model, returnedModel:result.returnedModel,
          requestedCount:2,returnedCount:result.faqs.length,valid:complete,sample:result.faqs,
          latencyMs:Date.now()-started,inputTokens:latest?.input_tokens ?? null,outputTokens:latest?.output_tokens ?? null,
          estimatedCostUsd:estimatedUsd(latest?.input_tokens,latest?.output_tokens,
            candidate.input_usd_per_million,candidate.output_usd_per_million) });
      } catch(error) {
        const category = error instanceof GeminiFailure ? error.category : 'unknown';
        await db.from('facc_ai_tests').update({successful:false,latency_ms:Date.now()-started,error_category:category}).eq('id',testId);
        return json({ kind, provider, model, success:false, category, latencyMs:Date.now()-started });
      }
    }
    if (action === 'simulate_chain') {
      // No provider call, collection, generation ticket, or customer credit.
      const { data: config } = await db.from('facc_ai_configs').select('layers').order('version',{ascending:false}).limit(1).single();
      const layers = validatedLayers(config?.layers,await approvedSet(db));
      const sequence: string[] = [];
      const sample = [{question:'When are credits used?',answer:'When an eligible generated pair is saved.'}];
      const fake = async (url: string) => {
        sequence.push(url.includes('deepseek') ? 'deepseek' : 'gemini');
        if (sequence.length <= 2) return new Response(JSON.stringify({error:{status:'UNAVAILABLE'}}),{status:503});
        if (url.includes('deepseek')) return new Response(JSON.stringify({choices:[{
          finish_reason:'stop',message:{content:JSON.stringify({faqs:sample})}}]}),{status:200});
        return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{
          text:JSON.stringify(sample)}]}}]}),{status:200});
      };
      const result = await generateWithRouting({layers,geminiKey:'simulation',geminiPayload:payload,prompt,count:1,
        requestStartedAt:Date.now(),fetcher:fake as typeof fetch,circuitOpen:async()=>false});
      return json({kind:'simulated',fallbackUsed:result.fallbackUsed,sequence,returnedCount:result.faqs.length});
    }
    if (action === 'apply' || action === 'restore') {
      const { data: current, error: currentError } = await db.from('facc_ai_configs').select('version,layers')
        .order('version',{ascending:false}).limit(1).single();
      if (currentError) throw currentError;
      let layers: AILayer[];
      if (action === 'restore') {
        const { data: prior, error } = await db.from('facc_ai_configs').select('layers').eq('version',body.restoreVersion).single();
        if (error || !prior) return json({error:'Previous configuration not found.'},404);
        layers = prior.layers as AILayer[];
      } else layers = body.layers;
      try { layers=validatedLayers(layers,await approvedSet(db)); }
      catch { return json({error:'Invalid model configuration.'},400); }
      if (layers.some(layer=>layer.enabled && layer.provider==='deepseek' && !Deno.env.get('DEEPSEEK_API_KEY')))
        return json({error:'DeepSeek is not configured.'},409);
      if (layers.some(layer=>layer.enabled && layer.provider==='gemini' &&
        !(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY'))))
        return json({error:'Gemini is not configured.'},409);
      const { data, error } = await db.rpc('facc_apply_ai_config',{
        p_actor:user.id,p_expected_version:body.expectedVersion,p_layers:layers,p_action:action });
      if (error) return json({error:error.message?.includes('changed')?'Configuration changed. Reload before applying.':'Configuration requires approved models and recent real tests.'},409);
      return json({version:data,previousVersion:current.version});
    }
    return json({error:'Unknown admin action.'},400);
  } catch(error) {
    console.error('facc_action_failed',{category:error instanceof Error?error.name:'unknown'});
    return json({error:'Admin data is temporarily unavailable. Please retry.'},503);
  }
},'admin-control-center',true));
