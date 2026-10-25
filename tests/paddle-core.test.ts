// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import { configuredCreditPackPrices, configuredPrices, resolvePrice, verifyPaddleSignature } from '../supabase/functions/_shared/paddle-core';
import { isPublicAddress } from '../supabase/functions/_shared/safe-fetch';
const secret='test-secret';
async function sign(raw: string, ts: number) {
  const key=await webcrypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await webcrypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${ts}:${raw}`));
  return `ts=${ts};h1=${Buffer.from(bytes).toString('hex')}`;
}
describe('webhook authenticity',()=>{
  it('verifies exact raw bytes and rejects tampering and expired signatures',async()=>{
    const now=Date.now(),ts=Math.floor(now/1000),raw='{ "event": "paid" }';
    const header=await sign(raw,ts);
    expect(await verifyPaddleSignature(raw,header,secret,now)).toBe(true);
    expect(await verifyPaddleSignature(raw+' ',header,secret,now)).toBe(false);
    expect(await verifyPaddleSignature(raw,header,secret,now+301000)).toBe(false);
    expect(await verifyPaddleSignature(raw,header,'wrong',now)).toBe(false);
  });
  it('accepts any valid h1 during secret rotation and rejects malformed headers',async()=>{
    const now=Date.now(),ts=Math.floor(now/1000);const header=await sign('body',ts);
    expect(await verifyPaddleSignature('body',header+';h1=invalid',secret,now)).toBe(true);
    expect(await verifyPaddleSignature('body','ts=NaN;h1=no',secret,now)).toBe(false);
  });
});
describe('price trust boundary',()=>{
  const id='pri_'+'a'.repeat(26);const prices=configuredPrices(n=>n==='PADDLE_PRO_MONTHLY_PRICE_ID'?id:undefined);
  it('uses a configured price, not client custom data, to determine access',()=>{
    expect(resolvePrice([{price:{id},quantity:1}],prices).tier).toBe('Pro');
    expect(()=>resolvePrice([{price:{id:'unknown'},quantity:1}],prices)).toThrow();
    expect(()=>resolvePrice([{price:{id},quantity:2}],prices)).toThrow();
    expect(()=>resolvePrice([],prices)).toThrow();
  });
  it('maps only dedicated one-time credit-pack prices and rejects legacy overlap',()=>{
    const pro='pri_'+'b'.repeat(26),business='pri_'+'c'.repeat(26);
    const env=(name:string)=>({PADDLE_PRO_MONTHLY_PRICE_ID:id,
      PADDLE_PRO_CREDIT_PACK_PRICE_ID:pro,PADDLE_BUSINESS_CREDIT_PACK_PRICE_ID:business})[name];
    const packs=configuredCreditPackPrices(env);
    expect(resolvePrice([{price:{id:pro},quantity:1}],packs)).toMatchObject({tier:'Pro',kind:'credit_pack',limit:100});
    expect(resolvePrice([{price:{id:business},quantity:1}],packs)).toMatchObject({tier:'Business',kind:'credit_pack',limit:500});
    expect(()=>configuredCreditPackPrices(name=>name==='PADDLE_PRO_CREDIT_PACK_PRICE_ID'?id:env(name))).toThrow('distinct');
    expect(()=>configuredCreditPackPrices(name=>name==='PADDLE_BUSINESS_CREDIT_PACK_PRICE_ID'?undefined:env(name))).toThrow('missing');
  });
});
describe('website fetch boundary',()=>{
  it.each(['127.0.0.1','10.2.3.4','169.254.169.254','172.16.0.1','192.168.0.1','100.64.0.1','::1','::ffff:127.0.0.1','fd00::1','fe80::1','2002:7f00:1::'])('rejects internal address %s',address=>expect(isPublicAddress(address)).toBe(false));
  it.each(['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])('allows public address %s',address=>expect(isPublicAddress(address)).toBe(true));
});
