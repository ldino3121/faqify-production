// Offline only: complete per-entrypoint bundles, preserving each capture's imports.
import { readFile, writeFile, mkdir, realpath, cp, access, chmod, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { rolloutFunctions, wrapHandler } from './rollout-wrapper.mjs';
import { prepareCapturedSource } from './captured-compat.mjs';
process.umask(0o077);
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const [sourceArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !outputArg) throw new Error('Usage: node scripts/prepare-rollout-functions.mjs PRIVATE_DOWNLOAD_ROOT PRIVATE_NEW_OUTPUT');
const source = await realpath(sourceArg);
const output = path.join(await realpath(path.dirname(path.resolve(outputArg))), path.basename(outputArg));
for (const p of [source, output]) if (p === root || p.startsWith(root + path.sep)) throw new Error('Captured artifacts must be outside Git');
const prepared = [];
for (const name of rolloutFunctions.filter(n => !n.includes('paddle'))) {
  const bundle = path.join(source,name,'supabase/functions');
  const original = await readFile(path.join(bundle,name,'index.ts'),'utf8');
  const code = wrapHandler(prepareCapturedSource(original,name),name);
  prepared.push({name,bundle,code,sha256:createHash('sha256').update(original).digest('hex')});
}
await mkdir(output, { mode: 0o700 }); // Refuse accidental replacement of reviewed bundles.
const protect = async dir => {
  await chmod(dir,0o700);
  for (const item of await readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,item.name);
    if (item.isSymbolicLink()) throw new Error('Unexpected symlink in capture');
    if (item.isDirectory()) await protect(file); else await chmod(file,0o600);
  }
};
for (const {name,bundle,code} of prepared) {
  const out=path.join(output,name,'supabase/functions');
  await cp(bundle,out,{recursive:true});
  await writeFile(path.join(out,name,'index.ts'),code,{mode:0o600});
  await mkdir(path.join(out,'_shared'),{recursive:true,mode:0o700});
  for (const file of ['rollout.ts',...(name==='assign-pro-plan'?['require-admin.ts','paddle.ts']:[])])
    await cp(path.join(root,'supabase/functions/_shared',file),path.join(out,'_shared',file));
  const alias=path.join(out,'razorpay-webhook/index.ts');
  if (name==='razorpay-subscription-webhook' && await access(alias).then(()=>true,()=>false))
    await writeFile(alias,wrapHandler(prepareCapturedSource(await readFile(alias,'utf8'),'razorpay-webhook'),'razorpay-webhook'));
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(prepared.map(({name,sha256})=>({name,captured_source_sha256:sha256})),null,2),{mode:0o600});
await protect(output);
console.log(`Prepared ${prepared.length} complete captured bundles. Typecheck/review before separately authorized deployment. Nothing deployed.`);
