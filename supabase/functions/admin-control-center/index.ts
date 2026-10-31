import { withRolloutGuard } from '../_shared/rollout.ts';
import { adminClient, authenticated, json } from '../_shared/paddle.ts';
import { GeminiFailure, generateWithGemini } from '../_shared/gemini-reliability.ts';
import { generateWithDeepSeek, generateWithRouting, type AILayer } from '../_shared/ai-routing.ts';

const fixture = 'FAQify is a tool that turns supplied source material into question-and-answer pairs. A user chooses a count from one to ten, previews generated pairs, and saves eligible pairs to a collection. One credit is used only when a generated pair is saved. Existing collections and published embeds remain available when credits reach zero.';
const prompt = `Create two distinct, source-grounded FAQ pairs from this source. Return ONLY a JSON array of objects with string keys "question" and "answer". Do not invent facts. SOURCE:\n${fixture}`;
const payload = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, topK: 20, topP: 0.8, maxOutputTokens: 1024 } };
const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
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
        db.from('facc_ai_tests').select('provider,model_id,kind,successful,created_at,error_category').order('created_at',{ascending:false}).limit(30),
      ]);
      if (catalog.error || configs.error || circuits.error || tests.error) throw new Error('Model configuration unavailable');
      return json({ catalog: catalog.data, configs: configs.data, circuits: circuits.data, tests: tests.data,
        credentials: { gemini: !!(Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY')),
          deepseek: !!Deno.env.get('DEEPSEEK_API_KEY') } });
    }
    if (action === 'audit') {
      const page = Number.isInteger(body.page) && body.page >= 0 && body.page < 1000 ? body.page : 0;
      const { data, error, count } = await db.from('facc_ai_audit')
        .select('id,actor_id,action,old_version,new_version,old_layers,new_layers,test_evidence,created_at',{count:'exact'})
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19);
      if (error) throw error;
      return json({ rows: data, total: count, page });
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
    if (action === 'test' || action === 'availability' || action === 'test_chain') {
      if (action === 'test_chain') {
        const { data: config, error: configError } = await db.from('facc_ai_configs').select('layers')
          .order('version',{ascending:false}).limit(1).single();
        if (configError || !config) throw new Error('Routing configuration unavailable');
        const layers = config.layers as AILayer[];
        const first = layers.find(layer=>layer.enabled);
        if (!first) return json({error:'No enabled model is configured.'},409);
        const { data: testId, error: limitError } = await db.rpc('facc_begin_ai_test', {
          p_actor:user.id,p_provider:first.provider,p_model:first.model_id,p_kind:'chain' });
        if (limitError) return json({error:'Model-test rate limit reached. Retry later.'},429);
        const started = Date.now();
        const attempts: Array<{provider:string;model:string;category:string;input_tokens?:number;output_tokens?:number}> = [];
        try {
          const result = await generateWithRouting({layers,
            geminiKey:Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || Deno.env.get('GOOGLE_GEMINI_API_KEY') || '',
            deepSeekKey:Deno.env.get('DEEPSEEK_API_KEY') || undefined,
            geminiPayload:payload,prompt,count:2,requestStartedAt:started,
            record:async event=>{attempts.push({provider:event.provider,model:event.model,category:event.category,
              input_tokens:event.input_tokens,output_tokens:event.output_tokens});},
            circuitOpen:async layer=>{
              const {data,error}=await db.from('facc_ai_circuits').select('open_until')
                .eq('provider',layer.provider).eq('model_id',layer.model_id).maybeSingle();
              if(error)throw error;
              return !!data?.open_until && Date.parse(data.open_until)>Date.now();
            },
          });
          await db.from('facc_ai_tests').update({provider:result.provider,model_id:result.model,
            successful:true,returned_count:result.faqs.length,latency_ms:Date.now()-started,
            input_tokens:result.inputTokens,output_tokens:result.outputTokens}).eq('id',testId);
          const {data:price}=await db.from('facc_model_catalog').select('input_usd_per_million,output_usd_per_million')
            .eq('provider',result.provider).eq('model_id',result.model).single();
          return json({kind:'real-chain',provider:result.provider,model:result.model,returnedModel:result.returnedModel,
            requestedCount:2,returnedCount:result.faqs.length,sample:result.faqs,
            fallbackUsed:result.fallbackUsed,attempts:attempts.map(item=>({provider:item.provider,model:item.model,category:item.category})),
            latencyMs:Date.now()-started,inputTokens:result.inputTokens??null,outputTokens:result.outputTokens??null,
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
        .select('provider,model_id,input_usd_per_million,output_usd_per_million').eq('provider',provider).eq('model_id',model).maybeSingle();
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
          : await generateWithDeepSeek({apiKey:key,model,prompt,count:2,requestStartedAt:started,
              record:metric=>metrics.push(metric)});
        const latest = metrics.at(-1);
        await db.from('facc_ai_tests').update({successful:true,returned_count:result.faqs.length,
          latency_ms:Date.now()-started,input_tokens:latest?.input_tokens,output_tokens:latest?.output_tokens}).eq('id',testId);
        return json({ kind, provider, model, returnedModel:result.returnedModel,
          requestedCount:2,returnedCount:result.faqs.length,valid:true,sample:result.faqs,
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
      const layers = (config?.layers ?? []) as AILayer[];
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
      if (!Array.isArray(layers) || layers.length!==3 || layers.some(layer=>
        !layer || !['gemini','deepseek'].includes(layer.provider) || typeof layer.model_id!=='string' || typeof layer.enabled!=='boolean'))
        return json({error:'Invalid model configuration.'},400);
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
