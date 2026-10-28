import { requireRolloutOpen } from '@/lib/rollout';
import { escapeHtml, csvCell } from '@/utils/export';

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WIDGET_CONFIG } from "@/config/widget";
import {
  Globe,
  FileText,
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Loader2,
  Copy,
  Download,
  Code,
  ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useCredits } from "@/hooks/useCredits";
import { supabase } from "@/integrations/supabase/client";
import { validateUrl, validateText, validateFile, validateCollectionTitle, sanitizeText, globalRateLimiter } from "@/utils/validation";

interface FAQ {
  question: string;
  answer: string;
  // Only populated once the FAQ has been persisted to the database.
  id?: string;
  order_index?: number;
  is_published?: boolean;
}

interface SavedCollection {
  id: string;
  title: string;
}

interface FAQCreatorProps {
  onNavigateToUpgrade?: () => void;
  onNavigateToManage?: () => void;
}

// URL validation function
const isValidUrl = (string: string) => {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
};

export const FAQCreator = ({ onNavigateToUpgrade, onNavigateToManage }: FAQCreatorProps) => {
  const [activeTab, setActiveTab] = useState("url");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFAQs, setGeneratedFAQs] = useState<FAQ[]>([]);
  const [pendingGenerationId, setPendingGenerationId] = useState<string | null>(null);
  const [generationShortfall, setGenerationShortfall] = useState(0);
  const [lastRequestedCount, setLastRequestedCount] = useState(5);
  const generationInFlight = useRef(false);
  const saveInFlight = useRef(false);
  const [progress, setProgress] = useState(0);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [savedCollection, setSavedCollection] = useState<SavedCollection | null>(null);
  const [savedFAQs, setSavedFAQs] = useState<FAQ[]>([]); // Database FAQs for export/embed
  const { toast } = useToast();
  const { user } = useAuth();
  const { loading: subscriptionLoading, refetch: refetchSubscription, canCreateFAQ: canCreateFAQFromHook } = useSubscription();
  const { balance, loading: creditsLoading, refetch: refetchCredits } = useCredits();

  // Form states
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [faqCount, setFaqCount] = useState(5); // Default to 5 FAQs, range 1-10

  useEffect(() => {
    if (!isGenerating && !pendingGenerationId && !textInput && !urlInput && !uploadedFile) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isGenerating, pendingGenerationId, textInput, urlInput, uploadedFile]);

  const downloadDraft = () => {
    const blob = new Blob([JSON.stringify({ title: collectionTitle, sourceUrl: urlInput,
      sourceText: textInput, fileName: uploadedFile?.name, generationId: pendingGenerationId,
      faqs: generatedFAQs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'faqify-unsaved-draft.json';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Enhanced FAQ generation checking with expiry validation
  const [canCreateFAQ, setCanCreateFAQ] = useState(false);
  const [faqEligibility, setFaqEligibility] = useState<any>(null);
  const remainingUsage = balance?.available ?? 0;

  // Global gating flags used across the Create FAQ UI
  const hasNoQuota = remainingUsage <= 0;
  const isBlocked = !!balance?.hold || hasNoQuota;


  // Check FAQ generation eligibility including expiry
  useEffect(() => {
    const checkEligibility = async () => {
      if (!user) {
        setCanCreateFAQ(false);
        return;
      }

      const eligibility = await canCreateFAQFromHook(1);
      setFaqEligibility(eligibility);
      setCanCreateFAQ(eligibility.canGenerate);
    };

    checkEligibility();
  }, [balance?.available, balance?.hold, user?.id, canCreateFAQFromHook]);

  // Function to check if user can generate a specific number of FAQs
  const canGenerateFAQCount = async (count: number) => {
    if (!user) return false;

    const eligibility = await canCreateFAQFromHook(count);
    return eligibility.canGenerate;
  };

  // Check if current selected FAQ count is valid
  const [canGenerateSelectedCount, setCanGenerateSelectedCount] = useState(false);

  // Update selected count eligibility when faqCount or subscription changes
  useEffect(() => {
    const checkSelectedCount = async () => {
      if (!user) {
        setCanGenerateSelectedCount(false);
        return;
      }

      const canGenerate = await canGenerateFAQCount(faqCount);
      setCanGenerateSelectedCount(canGenerate);
    };

    checkSelectedCount();
  }, [faqCount, balance?.available, balance?.hold, user?.id, canCreateFAQFromHook]);

  // Get maximum FAQ count user can generate based on remaining usage
  const maxGeneratableFAQs = Math.max(0, Math.min(10, remainingUsage));

  // Fetch FAQs from database for a collection
  const fetchCollectionFAQs = async (collectionId: string) => {
    try {
      const { data: faqs, error } = await supabase
        .from('faqs')
        .select('*')
        .eq('collection_id', collectionId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      setSavedFAQs(faqs || []);
      return faqs || [];
    } catch (error) {
      console.error('Error fetching FAQs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch FAQs from database.",
        variant: "destructive",
      });
      return [];
    }
  };

  // Set up real-time subscription for FAQ changes
  useEffect(() => {
    if (!savedCollection?.id) return;

    const channel = supabase
      .channel(`faq-collection-${savedCollection.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'faqs',
        filter: `collection_id=eq.${savedCollection.id}`,
      }, (payload) => {

        fetchCollectionFAQs(savedCollection.id);
      })
      .subscribe();

    // Initial fetch
    fetchCollectionFAQs(savedCollection.id);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [savedCollection?.id]);

  const saveFAQsToDatabase = async (generationId: string, title: string) => {
    if (saveInFlight.current) return { success: false, collectionId: null, collectionTitle: null };
    saveInFlight.current = true;
    try {
      const { data, error } = await (supabase as any).rpc('save_generated_faqs', {
        p_generation_id: generationId, p_title: title.slice(0, 100),
      });
      if (error || !data?.collection_id) {
        toast({ title: 'Save failed', description: error?.message || 'Please retry.', variant: 'destructive' });
        return { success: false, collectionId: null, collectionTitle: null };
      }
      setPendingGenerationId(null);
      await Promise.allSettled([refetchSubscription(), refetchCredits()]);
      window.dispatchEvent(new Event('faqify-billing-updated'));
      return { success: true, collectionId: data.collection_id as string, collectionTitle: data.collection_title as string };
    } finally { saveInFlight.current = false; }
  };

  const generateFAQs = async () => {
    if (generationInFlight.current) return;
    generationInFlight.current = true;
    try {
    try { await requireRolloutOpen(); }
    catch (error) { toast({ title: 'Generation paused', description: (error as Error).message, variant: 'destructive' }); return; }
    if (pendingGenerationId) {
      toast({ title: 'Keep your existing draft', description: 'Retry saving or download your draft before starting another generation.' });
      return;
    }
    // Enhanced eligibility check including expiry validation
    const eligibility = await canCreateFAQFromHook(faqCount);

    if (!eligibility.canGenerate) {
      toast({
        title: 'Cannot generate FAQs',
        description: eligibility.reason,
        variant: "destructive",
        action: eligibility.reason.includes('credit') ? (
          <ToastAction
            altText="Buy credits"
            onClick={() => onNavigateToUpgrade?.()}
          >
            Buy credits
          </ToastAction>
        ) : undefined,
      });
      return;
    }

    // Rate limiting check
    if (!globalRateLimiter.isAllowed(user?.id || 'anonymous')) {
      const resetTime = new Date(globalRateLimiter.getResetTime(user?.id || 'anonymous'));
      toast({
        title: "Rate Limit Exceeded",
        description: `Too many requests. Please try again at ${resetTime.toLocaleTimeString()}.`,
        variant: "destructive",
      });
      return;
    }

    // Validate input based on active tab
    let inputData: {
      type?: string;
      faqCount?: number;
      url?: string;
      text?: string;
      file?: File;
    } = {};
    if (activeTab === "url") {
      const trimmedUrl = urlInput?.trim() || '';

      if (!trimmedUrl) {
        toast({
          title: "Invalid URL",
          description: "URL is required",
          variant: "destructive",
        });
        return;
      }

      // Enhanced URL validation with auto-completion
      let finalUrl = trimmedUrl;

      // Auto-add https:// if missing protocol
      if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
        finalUrl = 'https://' + trimmedUrl;
      }

      try {
        const urlObj = new URL(finalUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new Error('Invalid protocol');
        }

        // Validate hostname exists
        if (!urlObj.hostname || urlObj.hostname.length < 3) {
          throw new Error('Invalid hostname');
        }



        inputData = { url: finalUrl, type: "url", faqCount };
      } catch (error) {
        console.error('URL validation failed for:', trimmedUrl, 'Error:', error);
        toast({
          title: "Invalid URL",
          description: "Please enter a valid URL (e.g., https://example.com/page)",
          variant: "destructive",
        });
        return;
      }
    } else if (activeTab === "text") {
      const textValidation = validateText(textInput);
      if (!textValidation.isValid) {
        toast({
          title: "Invalid Text",
          description: textValidation.error,
          variant: "destructive",
        });
        return;
      }
      inputData = { text: sanitizeText(textInput), type: "text", faqCount };
    } else if (activeTab === "upload") {
      const fileValidation = validateFile(uploadedFile);
      if (!fileValidation.isValid) {
        toast({
          title: "Invalid File",
          description: fileValidation.error,
          variant: "destructive",
        });
        return;
      }

      inputData = { file: uploadedFile, type: "file", faqCount };
    }

    setGenerationShortfall(0);
    setLastRequestedCount(faqCount);
    setIsGenerating(true);
    setProgress(0);

    try {
      // Simulate progress steps
      const steps = [
        { progress: 20, message: "Fetching content..." },
        { progress: 40, message: "Analyzing content..." },
        { progress: 60, message: "Generating questions..." },
        { progress: 80, message: "Creating answers..." },
        { progress: 100, message: "Finalizing FAQs..." }
      ];

      // Update progress
      for (let i = 0; i < steps.length - 1; i++) {
        setTimeout(() => setProgress(steps[i].progress), i * 500);
      }

      // 🔍 DETAILED FRONTEND DEBUGGING



      let response;

      // Handle file upload differently
      if (activeTab === "upload" && inputData.file) {
        // First process the document to extract text
        const formData = new FormData();
        formData.append('file', inputData.file);

        const documentResponse = await supabase.functions.invoke('process-document', {
          body: formData
        });

        if (documentResponse.error) {
          throw new Error(documentResponse.error.message || 'Failed to process document');
        }

        if (!documentResponse.data.success) {
          throw new Error(documentResponse.data.error || 'Failed to extract text from document');
        }

        // Now analyze the extracted text
        response = await supabase.functions.invoke('analyze-content', {
          body: {
            text: documentResponse.data.text,
            type: 'text',
            faqCount,
            fileName: uploadedFile?.name
          }
        });
      } else {
        // Call the edge function to analyze content and generate FAQs

        response = await supabase.functions.invoke('analyze-content', {
          body: inputData
        });
      }



      // Handle SDK-level errors (non-2xx status codes)
      // Note: Edge function now returns 200 for all responses to avoid this
      if (response.error) {
        console.error('SDK-level error:', response.error);
        throw new Error(response.error.message || 'Edge function returned an error');
      }

      // For Supabase functions, the actual data is in response.data
      const responseData = response.data;

      if (!responseData) {
        console.error('No data received from Edge function');
        throw new Error('No data received from content analysis service');
      }



      // Check if responseData contains an application-level error
      // Edge function returns error: true with message in body
      if (responseData.error === true) {
        console.error('Application error:', responseData.message);
        throw new Error(responseData.message || 'Failed to generate FAQs');
      }

      if (!responseData.faqs || !Array.isArray(responseData.faqs)
        || typeof responseData.generation_id !== 'string'
        || responseData.actualFaqCount !== responseData.faqs.length
        || responseData.faqs.length < 1 || responseData.faqs.length > faqCount) {
        throw new Error('Invalid response format from content analysis');
      }

      setProgress(100);
      setGeneratedFAQs(responseData.faqs);
      setPendingGenerationId(responseData.generation_id);
      setGenerationShortfall(Math.max(0, faqCount - responseData.faqs.length));

      // Auto-generate a title based on the input
      let autoTitle;

      if (activeTab === "url") {
        try {
          // Use the final processed URL for title generation
          let finalUrl = urlInput.trim();
          if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
          }
          autoTitle = `FAQs from ${new URL(finalUrl).hostname}`;
        } catch (error) {
          autoTitle = `FAQs from Website`;
        }
      } else if (activeTab === "upload") {
        autoTitle = `FAQs from ${uploadedFile?.name || 'Document'}`;
      } else {
        autoTitle = `FAQs from Text Content`;
      }

      setCollectionTitle(autoTitle);

      // Save to database
      let sourceUrl = undefined;
      if (activeTab === "url") {
        try {
          let finalUrl = urlInput.trim();
          if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
          }
          sourceUrl = finalUrl;
        } catch {
          sourceUrl = urlInput;
        }
      }

      // Funnel: generation succeeded (P1-10)
      trackAnalyticsEvent('generation_success', { count: responseData?.faqs?.length ?? 0, source: activeTab });

      const saveResult = await saveFAQsToDatabase(responseData.generation_id, autoTitle);

      if (saveResult.success && saveResult.collectionId) {


        // Set the collection title in state
        setCollectionTitle(saveResult.collectionTitle || autoTitle);

        setSavedCollection({
          id: saveResult.collectionId,
          title: saveResult.collectionTitle || autoTitle
        });

        // Fetch the actual saved FAQs from database for accurate data
        try {
          const actualFAQs = await fetchCollectionFAQs(saveResult.collectionId);

        } catch (fetchError) {
          console.error('⚠️ Failed to fetch saved FAQs:', fetchError);
          // Fallback to temporary FAQs
          setSavedFAQs(responseData.faqs.map((faq, index) => ({
            ...faq,
            id: `temp-${index}`,
            collection_id: saveResult.collectionId,
            order_index: index,
            is_published: true
          })));
        }

        toast({
          title: "FAQs Generated & Saved!",
          description: `Created ${responseData.faqs.length} of ${faqCount} requested FAQs and saved them to "${saveResult.collectionTitle || autoTitle}".${responseData.faqs.length < faqCount ? ' The AI returned fewer eligible pairs; only saved pairs were charged.' : ''}`,
          action: (
            <ToastAction altText="View Now" onClick={() => onNavigateToManage?.()}>
              View Now
            </ToastAction>
          )
        });

        // Navigate to Manage FAQs tab after successful save with longer delay for sync
        setTimeout(() => {

          onNavigateToManage?.();
        }, 2000); // Longer delay to ensure database sync
      } else {
        console.error('Save failed:', saveResult);
        toast({
          title: "Generation Successful, Save Failed",
          description: "FAQs were generated but could not be saved to database. You can still export them.",
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Error generating FAQs:', error);
      trackAnalyticsEvent('generation_failed', {
        error: error instanceof Error ? error.message : 'unknown',
        source: activeTab,
      });
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate FAQs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
    } finally { generationInFlight.current = false; }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      toast({
        title: "File Uploaded",
        description: `${file.name} is ready for processing.`,
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "FAQ content copied to clipboard.",
    });
  };

  const trackAnalyticsEvent = async (eventType: string, metadata: any = {}) => {
    try {
      await supabase.functions.invoke('track-analytics', {
        body: {
          event_type: eventType,
          user_id: user?.id,
          metadata: metadata
        }
      });
    } catch (error) {
      console.warn('Analytics tracking failed:', error);
    }
  };

  const handleExportFAQs = async (format: 'json' | 'csv' | 'html' = 'json') => {
    // Use saved FAQs from database if available, otherwise use generated FAQs
    const faqsToExport = savedFAQs.length > 0 ? savedFAQs : generatedFAQs;

    if (faqsToExport.length === 0) {
      toast({
        title: "No FAQs to Export",
        description: "Please generate and save FAQs first before exporting.",
        variant: "destructive",
      });
      return;
    }

    try {
      let content = '';
      let filename = '';
      let mimeType = '';

      const title = savedCollection?.title || collectionTitle || 'Generated_FAQs';

      switch (format) {
        case 'json':
          content = JSON.stringify({
            title: title,
            collection_id: savedCollection?.id,
            exported_at: new Date().toISOString(),
            faqs: faqsToExport.map(faq => ({
              question: faq.question,
              answer: faq.answer,
              order_index: 'order_index' in faq ? faq.order_index : undefined,
              is_published: 'is_published' in faq ? faq.is_published : true
            }))
          }, null, 2);
          filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.json`;
          mimeType = 'application/json';
          break;
        case 'csv': {
          const csvHeader = 'Question,Answer,Order,Published\n';
          const csvRows = faqsToExport.map(faq =>
            `${csvCell(faq.question)},${csvCell(faq.answer)},"${'order_index' in faq ? faq.order_index : 0}","${'is_published' in faq ? faq.is_published : true}"`
          ).join('\n');
          content = csvHeader + csvRows;
          filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.csv`;
          mimeType = 'text/csv';
          break;
        }
        case 'html': {
          const publishedFAQs = faqsToExport.filter(faq => 'is_published' in faq ? faq.is_published : true);
          content = `<!DOCTYPE html>
<html>
<head>
    <title>${escapeHtml(title)} - FAQs</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 40px; }
        .faq-item { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .question { font-weight: bold; color: #333; margin-bottom: 8px; }
        .answer { color: #666; line-height: 1.5; }
        .footer { text-align: center; margin-top: 40px; color: #999; font-size: 12px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${escapeHtml(title)}</h1>
        <p><small>Exported on ${new Date().toLocaleDateString()}</small></p>
    </div>
    <div class="faqs">
        ${publishedFAQs.map(faq => `
            <div class="faq-item">
                <div class="question">${escapeHtml(faq.question)}</div>
                <div class="answer">${escapeHtml(faq.answer)}</div>
            </div>
        `).join('')}
    </div>
    <div class="footer">
        <p>Powered by FAQify</p>
    </div>
</body>
</html>`;
          filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.html`;
          mimeType = 'text/html';
          break;
        }
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Track export analytics
      if (savedCollection?.id) {
        await supabase.from('usage_analytics').insert({
          user_id: user?.id,
          action: 'faq_exported',
          action_type: 'faq_exported',
          metadata: {
            collection_id: savedCollection.id,
            format: format,
            faq_count: faqsToExport.length
          }
        });
      }

      toast({
        title: "Export Successful!",
        description: `FAQ collection exported as ${format.toUpperCase()} with ${faqsToExport.length} FAQs.`,
      });
    } catch (error) {
      console.error('Error exporting FAQs:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export FAQ collection.",
        variant: "destructive",
      });
    }
  };

  const generateEmbedCode = async () => {
    if (!savedCollection) {
      toast({
        title: "No Collection Saved",
        description: "Please generate and save FAQs first before getting the embed code.",
        variant: "destructive",
      });
      return;
    }

    // Verify collection exists in database and has FAQs
    try {
      const { data: collection, error: collectionError } = await supabase
        .from('faq_collections')
        .select('id, title, status')
        .eq('id', savedCollection.id)
        .single();

      if (collectionError || !collection) {
        toast({
          title: "Collection Not Found",
          description: "The FAQ collection could not be found in the database.",
          variant: "destructive",
        });
        return;
      }

      const { data: faqs, error: faqsError } = await supabase
        .from('faqs')
        .select('id')
        .eq('collection_id', savedCollection.id)
        .eq('is_published', true);

      if (faqsError) {
        toast({
          title: "Error",
          description: "Failed to verify FAQs in the collection.",
          variant: "destructive",
        });
        return;
      }

      if (!faqs || faqs.length === 0) {
        toast({
          title: "No Published FAQs",
          description: "This collection has no published FAQs to embed.",
          variant: "destructive",
        });
        return;
      }

      const collectionId = savedCollection.id;

      // Track embed generation in analytics
      await supabase.from('usage_analytics').insert({
        user_id: user?.id,
        action: 'embed_generated',
        action_type: 'embed_generated',
        metadata: {
          collection_id: collectionId,
          collection_title: savedCollection.title,
          faq_count: faqs.length
        }
      });

      // 🚀 PRODUCTION-READY: Generate self-contained embed code (with search enabled)
      const embedCode = WIDGET_CONFIG.generateEmbedCode(collectionId, 'light', {
        showPoweredBy: true,
        animation: true,
        collapsible: true,
        search: true
      });

      copyToClipboard(embedCode);
      trackAnalyticsEvent('embed_copied', { collectionId });
      toast({
        title: "Embed Code Copied!",
        description: `Paste this code into your website to display ${faqs.length} FAQs.`,
      });

    } catch (error) {
      console.error('Error generating embed code:', error);
      toast({
        title: "Error",
        description: "Failed to generate embed code.",
        variant: "destructive",
      });
    }
  };

  if (subscriptionLoading || creditsLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {(generatedFAQs.length > 0 || textInput || urlInput || uploadedFile) && <div className="flex flex-wrap gap-3" aria-label="Unsaved draft recovery">
        <Button variant="outline" onClick={downloadDraft}>Download draft (JSON)</Button>
        {pendingGenerationId && <Button disabled={isGenerating} onClick={async () => {
          setIsGenerating(true);
          try {
            const result = await saveFAQsToDatabase(pendingGenerationId, collectionTitle);
            if (result.success && result.collectionId) {
              setSavedCollection({ id: result.collectionId, title: result.collectionTitle || collectionTitle });
              await fetchCollectionFAQs(result.collectionId);
              toast({ title: 'Draft saved' });
            }
          } finally { setIsGenerating(false); }
        }}>Retry saving draft</Button>}
        {pendingGenerationId && <Button variant="outline" disabled={isGenerating} onClick={() => {
          if (window.confirm('Have you downloaded this draft? Starting again will replace the unsaved FAQs in this tab.')) {
            setPendingGenerationId(null);
          }
        }}>Allow a new generation</Button>}
        {pendingGenerationId && <p className="text-sm">Keep this tab open and retry saving. If the draft expires, download it and contact support.</p>}
      </div>}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Create FAQ</h1>
          <p className="text-gray-400">Generate FAQs from a URL, text, or document.</p>
        </div>

        <div className="text-right">
          <div className="text-sm text-gray-400 mb-1">Available FAQ credits</div>
          <Badge variant={remainingUsage > 5 ? "secondary" : "destructive"}>
            {remainingUsage} available
          </Badge>
        </div>
      </div>

      {/* Usage Warning - Only show when actually at limit */}
      {remainingUsage <= 0 && (
        <Card className="bg-red-600/10 border border-red-600/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-red-400 font-medium">
                  FAQ credits exhausted
                </p>
                <p className="text-sm text-red-300">
                  Existing FAQs and embeds remain available. Buy credits to save more AI-generated pairs.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white ml-auto"
                onClick={onNavigateToUpgrade}
              >
                Buy credits
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              <span>Content Input</span>
            </CardTitle>
            <CardDescription className="text-gray-400">
              Choose a source for your FAQs.
            </CardDescription>
          </CardHeader>
          <CardContent>


            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3 bg-gray-800 border border-gray-700">
                <TabsTrigger
                  value="url"
                  className="text-gray-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-gray-700 transition-colors"
                >
                  <Globe className="h-4 w-4 mr-2" />
                  URL
                </TabsTrigger>
                <TabsTrigger
                  value="text"
                  className="text-gray-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-gray-700 transition-colors"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Text
                </TabsTrigger>
                <TabsTrigger
                  value="upload"
                  className="text-gray-300 data-[state=active]:bg-blue-600 data-[state=active]:text-white hover:bg-gray-700 transition-colors"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Website URL
                  </label>
                  <Input
                    placeholder="example.com/your-page or https://example.com/your-page"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    disabled={isBlocked}
                    className="bg-gray-800 border-gray-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Enter a page URL. HTTPS is added if omitted.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="text" className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Content Text
                  </label>
                  <Textarea
                    placeholder="Paste your content here..."
                    rows={8}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    disabled={isBlocked}
                    className="bg-gray-800 border-gray-700 text-white resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Paste the source text for your FAQs.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Upload Document
                  </label>
                  <div className={`border-2 border-dashed border-gray-700 rounded-lg p-6 text-center transition-colors ${isBlocked ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'}`}>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileUpload}
                      disabled={isBlocked}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className={`${isBlocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                      <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-300 mb-1">Click to upload file</p>
                      <p className="text-xs text-gray-400">PDF, DOCX, or TXT files supported</p>
                    </label>
                  </div>
                  {uploadedFile && (
                    <div className="flex items-center space-x-2 mt-2 p-2 bg-gray-800 rounded">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <span className="text-sm text-white">{uploadedFile.name}</span>
                      <CheckCircle className="h-4 w-4 text-green-400 ml-auto" />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* FAQ Count Selector */}
            <div className="mt-6 space-y-3">
              <label className="text-sm font-medium text-gray-300 block">
                Number of FAQs to Generate
              </label>
              <div className="flex items-center space-x-4">
                <Select
                  value={faqCount.toString()}
                  onValueChange={(value) => setFaqCount(parseInt(value))}
                  disabled={isBlocked}
                >
                  <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
                      <SelectItem
                        key={count}
                        value={count.toString()}
                        disabled={!!balance?.hold || count > remainingUsage}
                        className="text-white hover:bg-gray-700 focus:bg-gray-700"
                      >
                        {count} FAQ{count !== 1 ? 's' : ''}
                        {(!!balance?.hold || count > remainingUsage) && (
                          <span className="text-red-400 ml-2">(Exceeds limit)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canGenerateSelectedCount && <p className="text-xs text-red-400" role="status">
                  {faqEligibility?.reason || 'Not enough credits for this count. Choose fewer FAQs or buy credits.'}
                </p>}
              </div>
            </div>

            {isGenerating && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                  <span className="text-white">Generating FAQs...</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            <Button
              onClick={generateFAQs}
              disabled={isBlocked || isGenerating || !canCreateFAQ || !canGenerateSelectedCount}
              className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating {faqCount} FAQ{faqCount !== 1 ? 's' : ''}...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate {faqCount} FAQ{faqCount !== 1 ? 's' : ''}
                </>
              )}
            </Button>

            <p className="text-sm text-muted-foreground mt-3">Each generated FAQ pair uses one credit when saved.</p>
            {generationShortfall > 0 && <p role="status" className="text-sm text-amber-300">The AI returned {generatedFAQs.length} of {lastRequestedCount} requested eligible FAQ pairs. {savedCollection ? `Only ${generatedFAQs.length} saved pairs were charged.` : 'Credits are charged only when eligible pairs are saved.'}</p>}
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">
              {savedCollection ? `${savedCollection.title} - FAQs` : "Generated FAQs"}
            </CardTitle>
            <CardDescription className="text-gray-400">
              {(() => {
                const displayFAQs = savedFAQs.length > 0 ? savedFAQs : generatedFAQs;
                const totalFAQs = displayFAQs.length;
                const publishedFAQs = savedFAQs.length > 0
                  ? savedFAQs.filter(faq => faq.is_published === true).length
                  : totalFAQs;

                if (totalFAQs === 0) {
                  return "Preview generated FAQs here.";
                } else if (savedCollection) {
                  return `${publishedFAQs} published of ${totalFAQs} saved FAQs`;
                } else {
                  return `${totalFAQs} FAQ${totalFAQs === 1 ? '' : 's'} generated and ready to save`;
                }
              })()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const displayFAQs = savedFAQs.length > 0 ? savedFAQs : generatedFAQs;

              if (displayFAQs.length === 0) {
                return (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">Choose a source and generate FAQs.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {savedCollection && (
                    <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-green-400 text-sm">
                        Collection saved.
                      </span>
                    </div>
                  )}

                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {displayFAQs.map((faq, index) => (
                      <div key={savedFAQs.length > 0 ? faq.id : index} className="p-4 bg-gray-800/50 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-white font-medium flex-1">{faq.question}</h3>
                          {savedFAQs.length > 0 && (
                            <div className="flex items-center gap-2 ml-2">
                              {typeof faq.order_index === 'number' && (
                                <Badge variant="outline" className="text-xs">
                                  #{faq.order_index + 1}
                                </Badge>
                              )}
                              {'is_published' in faq && (
                                <Badge
                                  variant={faq.is_published ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {faq.is_published ? "Published" : "Draft"}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">{faq.answer}</p>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(`Q: ${faq.question}\nA: ${faq.answer}`)}
                          className="mt-2 text-blue-400 hover:text-blue-300"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                    ))}
                  </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-800">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleExportFAQs('json')}>
                        Export as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportFAQs('csv')}>
                        Export as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleExportFAQs('html')}>
                        Export as HTML
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button onClick={generateEmbedCode} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white">
                    <Code className="h-4 w-4 mr-2" />
                    Get Embed Code
                  </Button>
                </div>
              </div>
            );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
