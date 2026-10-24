import { withRolloutGuard } from '../_shared/rollout.ts';
import { documentText } from '../_shared/document-text.ts';
import { adminClient, authenticated, json } from '../_shared/paddle.ts';
Deno.serve(withRolloutGuard(async req => {
  if (req.method === 'OPTIONS') return json({});
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    if (!await authenticated(req, adminClient())) return json({ error: 'Please sign in.' }, 401);
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new Error('Please upload a document.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Maximum document size is 10 MB.');
    const text = await documentText(new Uint8Array(await file.arrayBuffer()), file.name);
    return json({ success: true, text: text.slice(0, 8000), originalLength: text.length, fileName: file.name });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Unable to process document.' });
  }
}, 'process-document', true));
