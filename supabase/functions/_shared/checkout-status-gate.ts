export async function checkoutStatusGate(action: string | undefined, hasIntent: boolean,
  eligible: () => Promise<boolean>, denialMessage = 'Sandbox billing is restricted to approved test accounts.'):
  Promise<{ body: {pending:null;eligible?:boolean;error?:string}; status:number } | null> {
  if (!hasIntent) {
    if (action !== 'pending') return { body:{pending:null}, status:200 };
    return { body:{pending:null,eligible:await eligible()}, status:200 };
  }
  if (!await eligible()) return { body:{pending:null,error:denialMessage},status:403 };
  return null;
}
