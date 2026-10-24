// Preparation only: strict typing for captured legacy source, without replacing
// Gemini generation, provider configuration, or the original save contract.
export function prepareCapturedSource(source, name) {
  let code = source.replace(/catch\s*\((\w+)\)\s*\{/g, (_, variable) =>
    `catch (caught_${variable}) {\n const ${variable} = caught_${variable} instanceof Error ? caught_${variable} : new Error(String(caught_${variable}));`);
  code = code.replace(/(const supabase = createClient\(supabaseUrl, (supabaseServiceKey|supabaseAnonKey))/g,
    (_, call, key) => `if (!supabaseUrl || !${key}) throw new Error('Backend configuration missing');\n    ${call}`);
  if (name === 'assign-pro-plan') {
    code = "import { requireAdmin } from '../_shared/require-admin.ts';\n" + code.replace('  try {',
      '  const denial = await requireAdmin(req); if (denial) return denial;\n  try {');
  }
  if (name === 'create-razorpay-order') code = code.replace("authHeader.replace('Bearer ', '')", "(authHeader ?? '').replace('Bearer ', '')");
  if (name === 'process-document') code = code.replace('extractTextFromFile(file)', 'extractTextFromFile(file: File)').replace('if (!file)', 'if (!(file instanceof File))');
  if (name === 'analyze-content') code = code.replace(/(const|let) fetchOptions =/, '$1 fetchOptions: RequestInit =')
    .replace('let fetchOptions;', 'let fetchOptions: RequestInit & { headers: Record<string, string> };')
    .replace('(content, selector) =>', '(content: string, selector: string) =>')
    .replace('extractContentBySelector(html, selector)', 'extractContentBySelector(html: string, selector: string)')
    .replace('const faqIndex =', 'const faqIndex: number =')
    .replace('const genericFAQ =', 'const genericFAQ: { question: string; answer: string } =')
    .replace('const uniqueQuestion =', 'const uniqueQuestion: string =');
  if (name === 'track-analytics') code = code.replace('updateAggregatedAnalytics(supabase, eventData) {',
    'updateAggregatedAnalytics(supabase: ReturnType<typeof createClient<any>>, eventData: Record<string, any>) {')
    .replace('createAnalyticsFunctions(supabase) {', 'createAnalyticsFunctions(supabase: ReturnType<typeof createClient<any>>) {');
  return code;
}
