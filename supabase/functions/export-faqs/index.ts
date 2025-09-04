import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

interface FAQ {
  id: string;
  question: string;
  answer: string;
  order_index: number;
  is_published: boolean;
}

interface Collection {
  id: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  faqs: FAQ[];
}

// Export to JSON format
function exportToJSON(collection: Collection): string {
  return JSON.stringify({
    collection: {
      id: collection.id,
      title: collection.title,
      description: collection.description,
      status: collection.status,
      created_at: collection.created_at,
      total_faqs: collection.faqs.length
    },
    faqs: collection.faqs.map(faq => ({
      question: faq.question,
      answer: faq.answer,
      order: faq.order_index,
      published: faq.is_published
    }))
  }, null, 2);
}

// Export to CSV format
function exportToCSV(collection: Collection): string {
  const headers = ['Question', 'Answer', 'Order', 'Published'];
  const csvRows = [headers.join(',')];
  
  collection.faqs.forEach(faq => {
    const row = [
      `"${faq.question.replace(/"/g, '""')}"`,
      `"${faq.answer.replace(/"/g, '""')}"`,
      faq.order_index.toString(),
      faq.is_published.toString()
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Export to HTML format
function exportToHTML(collection: Collection): string {
  const publishedFAQs = collection.faqs.filter(faq => faq.is_published);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${collection.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .faq-container {
            margin-bottom: 20px;
        }
        .faq-question {
            font-weight: 600;
            font-size: 18px;
            margin-bottom: 10px;
            color: #2563eb;
        }
        .faq-answer {
            margin-bottom: 20px;
            padding-left: 20px;
            border-left: 3px solid #e5e7eb;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e5e7eb;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            color: #6b7280;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${collection.title}</h1>
        ${collection.description ? `<p>${collection.description}</p>` : ''}
        <p><small>Generated on ${new Date().toLocaleDateString()}</small></p>
    </div>
    
    <div class="faqs">
        ${publishedFAQs.map(faq => `
            <div class="faq-container">
                <div class="faq-question">${faq.question}</div>
                <div class="faq-answer">${faq.answer}</div>
            </div>
        `).join('')}
    </div>
    
    <div class="footer">
        <p>Powered by FAQify</p>
    </div>
</body>
</html>`;
}

// Export to Markdown format
function exportToMarkdown(collection: Collection): string {
  const publishedFAQs = collection.faqs.filter(faq => faq.is_published);
  
  let markdown = `# ${collection.title}\n\n`;
  
  if (collection.description) {
    markdown += `${collection.description}\n\n`;
  }
  
  markdown += `*Generated on ${new Date().toLocaleDateString()}*\n\n`;
  markdown += `## Frequently Asked Questions\n\n`;
  
  publishedFAQs.forEach((faq, index) => {
    markdown += `### ${index + 1}. ${faq.question}\n\n`;
    markdown += `${faq.answer}\n\n`;
  });
  
  markdown += `---\n*Powered by FAQify*\n`;
  
  return markdown;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const url = new URL(req.url);
    const collectionId = url.searchParams.get('collection_id');
    const format = url.searchParams.get('format') || 'json';
    const authHeader = req.headers.get('authorization');
    
    if (!collectionId) {
      return new Response(JSON.stringify({ 
        error: 'collection_id parameter is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!authHeader) {
      return new Response(JSON.stringify({ 
        error: 'Authorization header is required' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Query for the FAQ collection and its FAQs
    const { data: collection, error } = await supabase
      .from('faq_collections')
      .select(`
        id,
        title,
        description,
        status,
        created_at,
        faqs (
          id,
          question,
          answer,
          order_index,
          is_published
        )
      `)
      .eq('id', collectionId)
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(JSON.stringify({ 
        error: 'FAQ collection not found or access denied' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!collection) {
      return new Response(JSON.stringify({ 
        error: 'FAQ collection not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sort FAQs by order_index
    const sortedFAQs = (collection.faqs || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

    const collectionWithSortedFAQs = {
      ...collection,
      faqs: sortedFAQs
    };

    // Generate export based on format
    let exportContent: string;
    let contentType: string;
    let filename: string;

    switch (format.toLowerCase()) {
      case 'csv':
        exportContent = exportToCSV(collectionWithSortedFAQs);
        contentType = 'text/csv';
        filename = `${collection.title.replace(/[^a-zA-Z0-9]/g, '_')}_faqs.csv`;
        break;
      case 'html':
        exportContent = exportToHTML(collectionWithSortedFAQs);
        contentType = 'text/html';
        filename = `${collection.title.replace(/[^a-zA-Z0-9]/g, '_')}_faqs.html`;
        break;
      case 'markdown':
      case 'md':
        exportContent = exportToMarkdown(collectionWithSortedFAQs);
        contentType = 'text/markdown';
        filename = `${collection.title.replace(/[^a-zA-Z0-9]/g, '_')}_faqs.md`;
        break;
      case 'json':
      default:
        exportContent = exportToJSON(collectionWithSortedFAQs);
        contentType = 'application/json';
        filename = `${collection.title.replace(/[^a-zA-Z0-9]/g, '_')}_faqs.json`;
        break;
    }

    return new Response(exportContent, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      },
    });

  } catch (error) {
    console.error('Error in export-faqs function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
