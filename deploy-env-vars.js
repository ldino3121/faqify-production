/** Manual legacy secret upload. Never run as part of tests or CI. */
import { spawnSync } from 'node:child_process';
const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error('Set DEEPSEEK_API_KEY in the environment.');
if (!process.argv.includes('--apply')) throw new Error('Explicit --apply is required to upload a secret.');
if (/[\r\n]/.test(key)) throw new Error('Invalid credential format.');
const result = spawnSync('npx', ['supabase', 'secrets', 'set', '--env-file', '/dev/stdin'], {
  input: `DEEPSEEK_API_KEY=${key}\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
});
if (result.status !== 0) throw new Error('Secret upload failed; provider output withheld to protect credentials.');
console.log('Secret uploaded.');
