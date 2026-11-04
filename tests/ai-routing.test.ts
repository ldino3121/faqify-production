// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { generateWithRouting, generateWithDeepSeek, validatedLayers, type AILayer } from '../supabase/functions/_shared/ai-routing';
import { GeminiFailure } from '../supabase/functions/_shared/gemini-reliability';

const pair = [{question:'When are credits charged?',answer:'When a generated FAQ pair is successfully saved.'}];
const layers: AILayer[] = [
  {provider:'gemini',model_id:'gemini-2.5-flash',enabled:true},
  {provider:'gemini',model_id:'gemini-2.5-flash-lite',enabled:true},
  {provider:'deepseek',model_id:'deepseek-flash',enabled:false},
];
const geminiSuccess = () => new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(pair)}]}}]}),{status:200});
const deepSeekSuccess = () => new Response(JSON.stringify({model:'deepseek-flash',choices:[{finish_reason:'stop',message:{content:JSON.stringify({faqs:pair})}}],
  usage:{prompt_tokens:42,completion_tokens:35}}),{status:200});
const unavailable = () => new Response(JSON.stringify({error:{status:'UNAVAILABLE'}}),{status:503});
const blocked = () => new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}}),{status:200});
function run(responses:Response[], selected=layers, extra:Record<string,unknown>={}) {
  const calls:string[]=[];
  const fetcher=vi.fn(async (url:string) => {calls.push(url);const response=responses.shift();if(!response)throw new Error('unexpected provider call');return response;});
  const result=generateWithRouting({layers:selected,geminiKey:'test-gemini',deepSeekKey:'test-deepseek',
    geminiPayload:{contents:[]},prompt:'Return JSON from a synthetic FAQify source',count:1,
    requestStartedAt:Date.now(),fetcher:fetcher as unknown as typeof fetch,circuitOpen:async()=>false,
    ...extra});
  return {result,calls};
}
describe('three-layer routing',()=>{
  it('rejects malformed or unapproved stored configurations before provider calls',()=>{
    expect(validatedLayers(layers)).toEqual(layers);
    expect(()=>validatedLayers([{provider:'gemini',model_id:'unreviewed',enabled:true},...layers.slice(1)])).toThrow();
    expect(()=>validatedLayers([layers[0],layers[0],layers[2]])).toThrow();
    expect(()=>validatedLayers(layers.map(layer=>({...layer,enabled:false})))).toThrow();
    expect(()=>validatedLayers([{provider:'unknown',model_id:'x',enabled:true},...layers.slice(1)])).toThrow();
  });
  it('keeps the deployed Gemini primary when it succeeds and never calls a disabled provider',async()=>{
    const x=run([geminiSuccess()]);
    await expect(x.result).resolves.toMatchObject({provider:'gemini',model:'gemini-2.5-flash',fallbackUsed:false,faqs:pair});
    expect(x.calls).toHaveLength(1);
  });
  it('uses the approved Gemini backup only after bounded transient attempts',async()=>{
    const x=run([unavailable(),unavailable(),geminiSuccess()]);
    await expect(x.result).resolves.toMatchObject({model:'gemini-2.5-flash-lite',fallbackUsed:true,attempts:3});
    expect(x.calls.map(url=>url.split('/').at(-1))).toEqual(['gemini-2.5-flash:generateContent','gemini-2.5-flash:generateContent','gemini-2.5-flash-lite:generateContent']);
  });
  it('uses DeepSeek only when enabled and both Gemini layers fail',async()=>{
    const enabled=layers.map(layer=>layer.provider==='deepseek'?{...layer,enabled:true}:layer);
    const x=run([unavailable(),unavailable(),unavailable(),unavailable(),deepSeekSuccess()],enabled);
    await expect(x.result).resolves.toMatchObject({provider:'deepseek',model:'deepseek-flash',fallbackUsed:true,
      returnedModel:'deepseek-flash',inputTokens:42,outputTokens:35});
    expect(x.calls).toHaveLength(5);
  });
  it('does not use another model after a safety block or invalid output',async()=>{
    const safety=run([blocked(),geminiSuccess()]);
    await expect(safety.result).rejects.toMatchObject({category:'safety_block'});
    expect(safety.calls).toHaveLength(1);
    const invalid=run([new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]}),{status:200})]);
    await expect(invalid.result).rejects.toMatchObject({category:'invalid_output'});
    expect(invalid.calls).toHaveLength(1);
  });
  it('respects shared circuit state and one overall deadline',async()=>{
    const x=run([geminiSuccess()],layers,{circuitOpen:async(layer:AILayer)=>layer.model_id==='gemini-2.5-flash'});
    await expect(x.result).resolves.toMatchObject({model:'gemini-2.5-flash-lite',fallbackUsed:true});
    expect(x.calls).toHaveLength(1);
    const late=run([],layers,{requestStartedAt:0,now:()=>121000});
    await expect(late.result).rejects.toMatchObject({category:'timeout'});
  });
  it('does not call a provider when shared health state is unavailable',async()=>{
    const x=run([geminiSuccess()],layers,{circuitOpen:async()=>{throw new Error('health database unavailable');}});
    await expect(x.result).rejects.toThrow('health database unavailable');
    expect(x.calls).toHaveLength(0);
  });
  it('rejects missing DeepSeek credentials and malformed DeepSeek output without a charge',async()=>{
    const onlyDeepSeek:AILayer[]=[{provider:'deepseek',model_id:'deepseek-flash',enabled:true}];
    const missing=run([],onlyDeepSeek,{deepSeekKey:undefined});
    await expect(missing.result).rejects.toMatchObject({category:'authentication'});
    expect(missing.calls).toHaveLength(0);
    const malformed=await generateWithDeepSeek({apiKey:'test',model:'deepseek-flash',prompt:'synthetic',count:1,
      requestStartedAt:Date.now(),fetcher:vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"faqs":[]}'} }]}),{status:200})) as typeof fetch})
      .catch(error=>error);
    expect(malformed).toBeInstanceOf(GeminiFailure);
    expect(malformed.category).toBe('invalid_output');
  });
});
