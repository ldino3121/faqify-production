import ts from 'typescript';
// These handlers may start AI/provider work or mutate entitlements. Read-only widgets
// and exports stay available. Both Razorpay URLs must be covered (one imports the other).
export const rolloutFunctions = [
  'assign-pro-plan', 'send-contact', 'log-error', 'admin-set-plan', 'analyze-content', 'create-checkout-session', 'create-razorpay-order',
  'create-razorpay-subscription', 'fix-database-plans', 'manage-subscription',
  'manage-razorpay-subscription', 'process-document', 'verify-razorpay-payment',
  'stripe-webhook', 'razorpay-webhook', 'razorpay-subscription-webhook', 'track-analytics',
  'create-paddle-checkout', 'paddle-customer-portal', 'paddle-webhook',
];
export function wrapHandler(source, name) {
  if (source.includes('withRolloutGuard(')) throw new Error('Already wrapped; refusing double guard');
  const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const calls = [];
  function walk(node) {
    if (ts.isCallExpression(node) && ['serve', 'Deno.serve'].includes(node.expression.getText(ast))) calls.push(node);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (!calls.length && name === 'razorpay-subscription-webhook' && /import ['"]\.\.\/razorpay-webhook\/index.ts['"]/.test(source)) return source;
  if (calls.length !== 1 || calls[0].arguments.length !== 1) throw new Error(`Review serve signature for ${name}`);
  const arg = calls[0].arguments[0];
  const client = !name.endsWith('-webhook') && !['track-analytics','send-contact','log-error'].includes(name);
  return "import { withRolloutGuard } from '../_shared/rollout.ts';\n" + source.slice(0, arg.getStart(ast)) +
    `withRolloutGuard(${arg.getText(ast)}, '${name}', ${client})` + source.slice(arg.end);
}
