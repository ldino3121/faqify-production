import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Enhanced text extraction for different file types
async function extractTextFromFile(file: File): Promise<string> {
  const fileType = file.type;
  const fileName = file.name.toLowerCase();
  
  try {
    if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      const text = await file.text();
      return text.trim();
    }
    
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      // For PDF processing - this is a simplified version
      // In production, you'd want to use a proper PDF parsing library like pdf-parse
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Look for text content in PDF
      let text = '';
      const decoder = new TextDecoder('utf-8', { fatal: false });
      
      // Try to extract readable text
      for (let i = 0; i < uint8Array.length - 1; i++) {
        const char = uint8Array[i];
        // Look for printable ASCII characters
        if (char >= 32 && char <= 126) {
          text += String.fromCharCode(char);
        } else if (char === 10 || char === 13) {
          text += ' ';
        }
      }
      
      // Clean up the extracted text
      text = text
        .replace(/[^\x20-\x7E\n]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/(.)\1{3,}/g, '$1') // Remove repeated characters
        .trim();
      
      if (text.length < 100) {
        throw new Error('Could not extract sufficient text from PDF. The PDF might be image-based or encrypted.');
      }
      
      return text;
    }
    
    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
      // For DOCX processing - simplified version
      // In production, you'd want to use a proper DOCX parsing library
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Convert to string and look for XML content
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const content = decoder.decode(uint8Array);
      
      // Extract text from XML content (simplified)
      let text = content
        .replace(/<[^>]*>/g, ' ') // Remove XML tags
        .replace(/[^\x20-\x7E\n]/g, ' ') // Keep only printable ASCII
        .replace(/\s+/g, ' ')
        .trim();
      
      if (text.length < 50) {
        throw new Error('Could not extract sufficient text from DOCX file.');
      }
      
      return text;
    }
    
    throw new Error(`Unsupported file type: ${fileType}. Please upload PDF, DOCX, or TXT files.`);
    
  } catch (error) {
    console.error('Error extracting text from file:', error);
    throw new Error(`Failed to process ${fileName}: ${error.message}`);
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      throw new Error('No file provided');
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size too large. Maximum size is 10MB.');
    }
    
    // Validate file type
    const allowedTypes = [
      'text/plain',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const allowedExtensions = ['.txt', '.pdf', '.docx'];
    const fileName = file.name.toLowerCase();
    const isValidType = allowedTypes.includes(file.type) || 
                       allowedExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValidType) {
      throw new Error('Invalid file type. Please upload PDF, DOCX, or TXT files only.');
    }
    
    console.log('Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
    
    // Extract text from the file
    const extractedText = await extractTextFromFile(file);
    
    // Limit content length for AI processing
    const contentToAnalyze = extractedText.substring(0, 8000);
    
    console.log('Extracted text length:', extractedText.length, 'Truncated to:', contentToAnalyze.length);
    
    return new Response(JSON.stringify({ 
      success: true,
      text: contentToAnalyze,
      originalLength: extractedText.length,
      fileName: file.name,
      fileType: file.type
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-document function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message || 'Failed to process document' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
