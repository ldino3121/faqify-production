// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { guardedHandler } from '../supabase/functions/_shared/rollout';
import { wrapHandler } from '../scripts/rollout-wrapper.mjs';
const db = new PGlite();
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
    CREATE TABLE faq_collections(id int PRIMARY KEY); CREATE TABLE faqs(id int PRIMARY KEY,collection_id int REFERENCES faq_collections);
    INSERT INTO faq_collections VALUES(1); INSERT INTO faqs VALUES(1,1);
    GRANT SELECT,INSERT,UPDATE,DELETE ON faq_collections,faqs TO authenticated,service_role;
    CREATE FUNCTION public.legacy_save() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$INSERT INTO faq_collections VALUES(90)$$;`);
  await db.exec(readFileSync('supabase/rollout/maintenance.sql','utf8'));
},60000);
afterAll(() => db.close());
beforeEach(async () => {
  await db.exec("RESET ROLE; SELECT set_config('request.jwt.claim.role','',false); SELECT faqify_set_rollout('open',0); DELETE FROM faqify_rollout_leases;");
});
const freeze = () => db.exec("SELECT faqify_set_rollout('drain',0); SELECT faqify_set_rollout('frozen',0)");
describe('server-side maintenance on the original schema', () => {
  it('preserves public FAQ reads while blocking old direct saves, definer RPCs, service writes and truncation', async () => {
    await freeze();
    for (const role of ['authenticated','service_role']) {
      await db.exec(`SET ROLE ${role}`);
      expect((await db.query('select * from faqs')).rows).toHaveLength(1);
      await expect(db.exec('insert into faq_collections values(2)')).rejects.toThrow('Maintenance');
      await expect(db.exec('select legacy_save()')).rejects.toThrow('Maintenance');
      await db.exec('RESET ROLE');
    }
    await expect(db.exec('truncate faqs')).rejects.toThrow('Maintenance');
    expect((await db.query('select * from faq_collections')).rows).toEqual([{id:1}]);
  });
  it('allows a legacy save to finish while draining; retains partial committed rows if freeze interrupts its next request',async()=>{
    await db.exec("SELECT faqify_set_rollout('drain',0); INSERT INTO faq_collections VALUES(2); INSERT INTO faqs VALUES(2,2); INSERT INTO faq_collections VALUES(3)");
    await db.exec("SELECT faqify_set_rollout('frozen',0)");
    await expect(db.exec('INSERT INTO faqs VALUES(3,3)')).rejects.toThrow('Maintenance');
    expect((await db.query('select id from faq_collections order by id')).rows).toEqual([{id:1},{id:2},{id:3}]);
    expect((await db.query('select id from faqs order by id')).rows).toEqual([{id:1},{id:2}]);
  });
  it('requires drain and refuses freeze until the last admitted handler finishes; new work and webhooks get retryable errors',async()=>{
    await expect(db.exec("select faqify_set_rollout('frozen',0)")).rejects.toThrow('Enter drain');
    const lease=(await db.query<{id:string}>("select faqify_enter_operation('analyze-content',0,true) id")).rows[0].id;
    await db.exec("select faqify_set_rollout('drain',0)");
    for(const client of [true,false]) await expect(db.query('select faqify_enter_operation($1,0,$2)',['worker',client])).rejects.toThrow('Maintenance');
    await expect(db.exec("select faqify_set_rollout('frozen',0)")).rejects.toThrow('active function leases');
    await db.query('select faqify_leave_operation($1)',[lease]);
    await db.exec("select faqify_set_rollout('frozen',0)");
  });
  it('blocks old tabs after reopening while allowing revision 1 saves; rejects malformed revision headers',async()=>{
    await db.exec("select faqify_set_rollout('open',1); select set_config('request.jwt.claim.role','authenticated',false)");
    for(const header of ['{}','{"x-faqify-client":"bogus"}','{"x-faqify-client":"99999999999999999"}']) {
      await db.query("select set_config('request.headers',$1,false)",[header]);
      await expect(db.exec('update faqs set id=id')).rejects.toThrow('Refresh required');
    }
    await db.exec(`SELECT set_config('request.headers','{"x-faqify-client":"1"}',false); UPDATE faqs SET id=id;`);
    await expect(db.exec("select faqify_enter_operation('analyze-content',0,true)")).rejects.toThrow('Refresh required');
  });
  it('clients cannot disable maintenance, create leases, install triggers or access the control tables',async()=>{
    for(const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      for(const sql of ["select faqify_set_rollout('open',0)",'select * from faqify_rollout_control',"select faqify_enter_operation('x',0,false)",'select faqify_install_write_guards()']) {
        await expect(db.exec(sql)).rejects.toThrow('permission denied');
      }
      expect((await db.query('select faqify_rollout_status() status')).rows).toHaveLength(1);
      await db.exec('RESET ROLE');
    }
    await db.exec('SET ROLE service_role');
    await expect(db.exec("select faqify_set_rollout('open',0)")).rejects.toThrow('permission denied');
  });
  it('covers new tables and is reversible without deleting any FAQ',async()=>{
    await db.exec('CREATE TABLE new_ledger(id int); SELECT faqify_install_write_guards()');
    await freeze();
    await expect(db.exec('insert into new_ledger values(1)')).rejects.toThrow('Maintenance');
    await db.exec("select faqify_set_rollout('open',0); insert into new_ledger values(1)");
    expect((await db.query('select count(*)::int n from faqs')).rows[0]).toEqual({n:2});
  });
});
describe('Edge admission and offline wrapping',()=>{
  it.each(['PT503','UNAVAILABLE','PT426'])('never invokes a handler on failed admission (%s)',async(code)=>{
    const handler=vi.fn(()=>new Response('unexpected')); const rpc=vi.fn(async()=>({data:null,error:code}));
    const response=await guardedHandler(handler,'worker',true,rpc)(new Request('https://example.com',{method:'POST'}));
    expect(response.status).toBe(code==='PT426'?426:503); expect(handler).not.toHaveBeenCalled();
    expect(response.headers.get('Retry-After')).toBe('30');
  });
  it('releases only after awaited handler work and retains ordinary errors for retries',async()=>{
    const calls:string[]=[];
    const rpc=async(name:string)=>{calls.push(name);return{data:name==='faqify_enter_operation'?'lease':null};};
    const handler=async()=>{calls.push('handler-start');await Promise.resolve();calls.push('handler-end');return new Response('',{status:500});};
    expect((await guardedHandler(handler,'paddle-webhook',false,rpc)(new Request('https://example.com'))).status).toBe(500);
    expect(calls).toEqual(['faqify_enter_operation','handler-start','handler-end','faqify_leave_operation']);
  });
  it('releases on thrown errors and bypasses only CORS preflight',async()=>{
    const rpc=vi.fn(async()=>({data:'lease'}));
    const handler=guardedHandler(()=>{throw new Error('private error');},'worker',true,rpc);
    const options=await handler(new Request('https://example.com',{method:'OPTIONS'}));
    expect(options.headers.get('Access-Control-Allow-Headers')).toContain('x-faqify-client'); expect(rpc).not.toHaveBeenCalled();
    expect((await handler(new Request('https://example.com'))).status).toBe(503); expect(rpc).toHaveBeenCalledTimes(2);
  });
  it('wraps original handlers without substituting new-schema application code and rejects ambiguous shapes',()=>{
    const source="import {serve} from 'server';\nserve(async req => new Response('original'));";
    expect(wrapHandler(source,'analyze-content')).toContain("withRolloutGuard(async req => new Response('original'), 'analyze-content', true)");
    expect(()=>wrapHandler(source+source,'analyze-content')).toThrow('serve signature');
    expect(()=>wrapHandler(wrapHandler(source,'analyze-content'),'analyze-content')).toThrow('Already wrapped');
  });
});
