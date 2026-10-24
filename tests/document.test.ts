// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { documentText } from '../supabase/functions/_shared/document-text';
describe('real document extraction',()=>{
  it('extracts text from a compressed PDF',async()=>{
    const text=await documentText(new Uint8Array(readFileSync('tests/fixtures/sample.pdf')),'sample.pdf');
    expect(text).toContain('Customers can edit and embed');expect(text).not.toContain('endstream');
  });
  it('unzips DOCX and preserves non-ASCII text',async()=>{
    const text=await documentText(new Uint8Array(readFileSync('tests/fixtures/sample.docx')),'sample.docx');
    expect(text).toContain('Customers can edit');expect(text).toContain('नमस्ते दुनिया');
  });
  it('rejects unreadable or unsupported documents',async()=>{
    await expect(documentText(new TextEncoder().encode('too short'),'sample.txt')).rejects.toThrow('readable');
    await expect(documentText(new Uint8Array(),'sample.exe')).rejects.toThrow('PDF, DOCX, or TXT');
  });
});
