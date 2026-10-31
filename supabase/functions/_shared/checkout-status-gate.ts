export async function checkoutStatusGate(action: string | undefined, hasIntent: boolean,
  eligible: () => Promise<boolean>): Promise<{ body: {pending:null;eligible?:boolean;error?:string}; status:number } | null> {
  if (!hasIntent) {
    if (action !== 'pending') return { body:{pending:null}, status:200 };
    return { body:{pending:null,eligible:await eligible()}, status:200 };
  }
  if (!await eligible()) return { body:{pending:null,error:'Sandbox billing is restricted to approved test accounts.'},status:403 };
  return null;
}
