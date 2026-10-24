import { Buffer } from 'node:buffer';
import { extractText, getDocumentProxy } from 'npm:unpdf@1.4.0';
import mammoth from 'npm:mammoth@1.11.0';
export async function documentText(bytes: Uint8Array, filename: string): Promise<string> {
  const ext = filename.toLowerCase().split('.').pop();
  let text: string;
  if (ext === 'txt') text = new TextDecoder().decode(bytes);
  else if (ext === 'pdf') {
    const pdf = await getDocumentProxy(bytes);
    try {
      if (pdf.numPages > 100) throw new Error('Please upload a document with 100 pages or fewer.');
      const result = await extractText(pdf, { mergePages: true });
      text = result.text;
    } finally { await pdf.destroy(); }
  } else if (ext === 'docx') text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  else throw new Error('Please upload a PDF, DOCX, or TXT document.');
  text = text.replace(/\u0000/g, '').trim();
  if (text.length < 50) throw new Error('Not enough readable text. Scanned PDFs need OCR; try pasting the text instead.');
  return text;
}
