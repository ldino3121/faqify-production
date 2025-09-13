
import { useState, useEffect } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { validateUrl, validateText, validateFile, validateCollectionTitle, sanitizeText, globalRateLimiter } from "@/utils/validation";

interface FAQ {
  question: string;
  answer: string;
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
  const [progress, setProgress] = useState(0);
  const [collectionTitle, setCollectionTitle] = useState("");
  const [savedCollection, setSavedCollection] = useState<SavedCollection | null>(null);
  const [savedFAQs, setSavedFAQs] = useState<FAQ[]>([]); // Database FAQs for export/embed
  const { toast } = useToast();
  const { user } = useAuth();
  const { subscription, loading: subscriptionLoading, refetch: refetchSubscription, canCreateFAQ: canCreateFAQFromHook } = useSubscription();

  // Form states
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [faqCount, setFaqCount] = useState(5); // Default to 5 FAQs, range 3-10

  // Enhanced FAQ generation checking with expiry validation
  const [canCreateFAQ, setCanCreateFAQ] = useState(false);
  const [faqEligibility, setFaqEligibility] = useState<any>(null);
  const remainingUsage = subscription ? subscription.faq_usage_limit - subscription.faq_usage_current : 0;

	  // Derived expiry flag for messaging (prefer backend-computed flag)
	  const isExpired = !!(subscription?.is_expired ?? (subscription && subscription.plan_tier !== 'Free' && subscription.plan_expires_at && (new Date() >= new Date(subscription.plan_expires_at))));


  // Check FAQ generation eligibility including expiry
  useEffect(() => {
    const checkEligibility = async () => {
      if (!subscription || !user) {
        setCanCreateFAQ(false);
        return;
      }

      const eligibility = await canCreateFAQFromHook(1);
      setFaqEligibility(eligibility);
      setCanCreateFAQ(eligibility.canGenerate);
    };

    checkEligibility();
  }, [subscription, user]);

  // Function to check if user can generate a specific number of FAQs
  const canGenerateFAQCount = async (count: number) => {
    if (!subscription || !user) return false;

    const eligibility = await canCreateFAQFromHook(count);
    return eligibility.canGenerate;
  };

  // Check if current selected FAQ count is valid
  const [canGenerateSelectedCount, setCanGenerateSelectedCount] = useState(false);

  // Update selected count eligibility when faqCount or subscription changes
  useEffect(() => {
    const checkSelectedCount = async () => {
      if (!subscription || !user) {
        setCanGenerateSelectedCount(false);
        return;
      }

      const canGenerate = await canGenerateFAQCount(faqCount);
      setCanGenerateSelectedCount(canGenerate);
    };

    checkSelectedCount();
  }, [faqCount, subscription, user]);

  // Get maximum FAQ count user can generate based on remaining usage
  const maxGeneratableFAQs = Math.min(10, remainingUsage);

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
        console.log('FAQ changed:', payload);
        fetchCollectionFAQs(savedCollection.id);
      })
      .subscribe();

    // Initial fetch
    fetchCollectionFAQs(savedCollection.id);

    return () => {
      supabase.removeChannel(channel);
    };
  }, [savedCollection?.id]);

  const saveFAQsToDatabase = async (faqs: FAQ[], sourceUrl?: string, sourceContent?: string, title?: string) => {
    const finalTitle = title || 'Generated FAQs';
    console.log('Starting saveFAQsToDatabase with:', {
      faqCount: faqs.length,
      user: user?.id,
      title: finalTitle,
      sourceUrl
    });

    if (!user) {
      console.error('Save failed: Missing user', { user: !!user });
      toast({
        title: "Authentication Required",
        description: "Please log in to save FAQs.",
        variant: "destructive",
      });
      return { success: false, collectionId: null };
    }

    if (!finalTitle) {
      console.error('Save failed: Missing title', { title: finalTitle });
      toast({
        title: "Error Generating Title",
        description: "Unable to generate a title for your FAQ collection.",
        variant: "destructive",
      });
      return { success: false, collectionId: null };
    }

    // Check if user has a profile (required for RLS)
    console.log('Checking user profile...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    console.log('Profile check result:', { profile, profileError });

    if (profileError || !profile) {
      console.error('User profile not found, creating one...');
      // Try to create profile if it doesn't exist
      const { error: createProfileError } = await supabase
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email || '',
          full_name: user.user_metadata?.full_name || user.email || ''
        });

      if (createProfileError) {
        console.error('Failed to create profile:', createProfileError);
        toast({
          title: "Profile Error",
          description: "Unable to create user profile. Please contact support.",
          variant: "destructive",
        });
        return { success: false, collectionId: null };
      }
      console.log('Profile created successfully');
    }

    // Check if user has a subscription
    console.log('Checking user subscription...');
    const { data: userSubscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    console.log('Subscription check result:', { userSubscription, subscriptionError });

    if (subscriptionError || !userSubscription) {
      console.error('User subscription not found, creating one...');
      // Try to create subscription if it doesn't exist
      const { error: createSubscriptionError } = await supabase
        .from('user_subscriptions')
        .insert({
          user_id: user.id,
          plan_tier: 'Free',
          faq_usage_limit: 5,
          faq_usage_current: 0,
          status: 'active',
          last_reset_date: new Date().toISOString().split('T')[0]
        });

      if (createSubscriptionError) {
        console.error('Failed to create subscription:', createSubscriptionError);
        toast({
          title: "Subscription Error",
          description: "Unable to create user subscription. Please contact support.",
          variant: "destructive",
        });
        return { success: false, collectionId: null };
      }
      console.log('Subscription created successfully');
    }

    // Check if user can generate this many FAQs
    if (!canGenerateFAQCount(faqs.length)) {
      console.error('Save failed: Usage limit exceeded', {
        faqCount: faqs.length,
        remainingUsage,
        canGenerate: canGenerateFAQCount(faqs.length)
      });
      toast({
        title: "Usage Limit Exceeded",
        description: `You can only generate ${remainingUsage} more FAQs this month. This collection has ${faqs.length} FAQs. Please upgrade your plan or reduce the number of FAQs.`,
        variant: "destructive",
      });
      return { success: false, collectionId: null };
    }

    try {
      // Create FAQ collection
      console.log('Creating FAQ collection...');
      const { data: collection, error: collectionError } = await supabase
        .from('faq_collections')
        .insert({
          user_id: user.id,
          title: finalTitle,
          source_url: sourceUrl,
          source_content: sourceContent,
          status: 'published'
        })
        .select('id')
        .single();

      console.log('Collection creation result:', { collection, collectionError });
      if (collectionError) throw collectionError;

      // Insert individual FAQs
      console.log('Inserting FAQs...');
      const faqsToInsert = faqs.map((faq, index) => ({
        collection_id: collection.id,
        question: faq.question,
        answer: faq.answer,
        order_index: index
      }));

      console.log('FAQs to insert:', faqsToInsert.length);
      const { error: faqsError } = await supabase
        .from('faqs')
        .insert(faqsToInsert);

      console.log('FAQ insertion result:', { faqsError });
      if (faqsError) throw faqsError;

      // Check user subscription before updating usage
      console.log('Checking user subscription before usage increment...');
      const { data: subscriptionCheck, error: subCheckError } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      console.log('Subscription check result:', { subscriptionCheck, subCheckError });

      if (subCheckError || !subscriptionCheck) {
        console.error('No subscription found for user:', user.id);
        throw new Error('User subscription not found. Please contact support.');
      }

      // Update usage count based on number of FAQs generated
      console.log('Calling increment_faq_usage_by_count with:', {
        user_uuid: user.id,
        faq_count: faqs.length,
        current_usage: subscriptionCheck.faq_usage_current,
        usage_limit: subscriptionCheck.faq_usage_limit,
        status: subscriptionCheck.status
      });

      const { data: usageResult, error: usageError } = await supabase.rpc('increment_faq_usage_by_count', {
        user_uuid: user.id,
        faq_count: faqs.length
      });

      console.log('Usage increment result:', { usageResult, usageError });

      if (usageError) {
        console.error('Usage increment error:', usageError);
        throw new Error(`Failed to update usage count: ${usageError.message}`);
      }

      if (!usageResult) {
        throw new Error(`Failed to increment usage - Current: ${subscriptionCheck.faq_usage_current}, Limit: ${subscriptionCheck.faq_usage_limit}, Requested: ${faqs.length}`);
      }

      // Refresh subscription data
      await refetchSubscription();

      toast({
        title: "FAQs Saved Successfully!",
        description: `Your FAQ collection "${finalTitle}" has been saved.`,
      });

      console.log('Save successful! Collection ID:', collection.id);
      return { success: true, collectionId: collection.id };
    } catch (error) {
      console.error('Error saving FAQs:', error);
      toast({
        title: "Save Failed",
        description: `Failed to save FAQs to database: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
      return { success: false, collectionId: null };
    }
  };

  const generateFAQs = async () => {
    // Enhanced eligibility check including expiry validation
    const eligibility = await canCreateFAQFromHook(faqCount);

    if (!eligibility.canGenerate) {
      // Check if it's an expiry issue
      if (eligibility.isExpired) {
        toast({
          title: "Subscription Expired",
          description: eligibility.reason,
          variant: "destructive",
          action: (
            <ToastAction
              altText="Upgrade Plan"
              onClick={() => onNavigateToUpgrade?.()}
            >
              Upgrade Plan
            </ToastAction>
          ),
        });
        return;
      }

      // Handle other issues (usage limits, etc.)
      toast({
        title: eligibility.reason.includes("limit") ? "Usage Limit Reached" : "Cannot Generate FAQs",
        description: eligibility.reason,
        variant: "destructive",
        action: eligibility.reason.includes("limit") ? (
          <ToastAction
            altText="Upgrade Plan"
            onClick={() => onNavigateToUpgrade?.()}
          >
            Upgrade Plan
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
    let inputData = {};
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

        console.log('URL validation details:', {
          original: trimmedUrl,
          final: finalUrl,
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          pathname: urlObj.pathname
        });

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
      console.log('🔍 FRONTEND FAQ COUNT DEBUG:', {
        selectedFaqCount: faqCount,
        typeOfFaqCount: typeof faqCount,
        inputDataFaqCount: inputData.faqCount,
        fullInputData: inputData
      });
      console.log('Calling analyze-content function with:', inputData);
      console.log('Supabase URL:', supabase.supabaseUrl);

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
            type: 'text'
          }
        });
      } else {
        // Call the edge function to analyze content and generate FAQs
        console.log('Calling Edge function with data:', inputData);
        response = await supabase.functions.invoke('analyze-content', {
          body: inputData
        });
      }

      console.log('Raw Edge function response:', response);

      // Check if the response itself indicates an error
      if (response.error) {
        console.error('Response error:', response.error);
        throw new Error(response.error.message || 'Edge function returned an error');
      }

      // For Supabase functions, the actual data is in response.data
      const responseData = response.data;

      if (!responseData) {
        console.error('No data received from Edge function');
        throw new Error('No data received from content analysis service');
      }

      console.log('Edge function response data:', responseData);

      // Check if responseData contains an error
      if (responseData.error) {
        console.error('Data contains error:', responseData.error);
        throw new Error(responseData.error);
      }

      if (!responseData.faqs || !Array.isArray(responseData.faqs)) {
        throw new Error('Invalid response format from content analysis');
      }

      setProgress(100);
      setGeneratedFAQs(responseData.faqs);

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

      const saveResult = await saveFAQsToDatabase(
        responseData.faqs,
        sourceUrl,
        activeTab === "text" ? textInput : activeTab === "upload" ? `File: ${uploadedFile?.name}` : undefined,
        autoTitle
      );

      if (saveResult.success && saveResult.collectionId) {
        console.log('✅ FAQs saved successfully, collection ID:', saveResult.collectionId);

        // Set the collection title in state
        setCollectionTitle(autoTitle);

        setSavedCollection({
          id: saveResult.collectionId,
          title: autoTitle
        });

        // Fetch the actual saved FAQs from database for accurate data
        try {
          const actualFAQs = await fetchCollectionFAQs(saveResult.collectionId);
          console.log('✅ Fetched actual FAQs from database:', actualFAQs.length);
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
          description: `Created ${responseData.faqs.length} FAQs and saved them to your collection "${autoTitle}". Redirecting to Manage FAQs...`,
          action: (
            <ToastAction altText="View Now" onClick={() => onNavigateToManage?.()}>
              View Now
            </ToastAction>
          )
        });

        // Navigate to Manage FAQs tab after successful save with longer delay for sync
        setTimeout(() => {
          console.log('🔄 Navigating to Manage FAQs tab');
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
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate FAQs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
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
        case 'csv':
          const csvHeader = 'Question,Answer,Order,Published\n';
          const csvRows = faqsToExport.map(faq =>
            `"${faq.question.replace(/"/g, '""')}","${faq.answer.replace(/"/g, '""')}","${'order_index' in faq ? faq.order_index : 0}","${'is_published' in faq ? faq.is_published : true}"`
          ).join('\n');
          content = csvHeader + csvRows;
          filename = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.csv`;
          mimeType = 'text/csv';
          break;
        case 'html':
          const publishedFAQs = faqsToExport.filter(faq => 'is_published' in faq ? faq.is_published : true);
          content = `<!DOCTYPE html>
<html>
<head>
    <title>${title} - FAQs</title>
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
        <h1>${title}</h1>
        <p><small>Exported on ${new Date().toLocaleDateString()}</small></p>
    </div>
    <div class="faqs">
        ${publishedFAQs.map(faq => `
            <div class="faq-item">
                <div class="question">${faq.question}</div>
                <div class="answer">${faq.answer}</div>
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
        metadata: {
          collection_id: collectionId,
          collection_title: savedCollection.title,
          faq_count: faqs.length
        }
      });

      // 🚀 PRODUCTION-READY: Generate self-contained embed code
      const embedCode = WIDGET_CONFIG.generateEmbedCode(collectionId, 'light', {
        showPoweredBy: true,
        animation: true,
        collapsible: true
      });

      copyToClipboard(embedCode);
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

  if (subscriptionLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Create FAQ</h1>
          <p className="text-gray-400">Generate professional FAQs from any content source</p>
        </div>

        <div className="text-right">
          <div className="text-sm text-gray-400 mb-1">Monthly FAQ Usage</div>
          <Badge variant={remainingUsage > 5 ? "secondary" : "destructive"}>
            {subscription?.faq_usage_current || 0}/{subscription?.faq_usage_limit || 0} FAQs used
          </Badge>
        </div>
      </div>

      {/* Usage Warning - Only show when actually at limit */}
      {remainingUsage === 0 && (
        <Card className="bg-red-600/10 border border-red-600/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div>
                <p className="text-red-400 font-medium">
                  Monthly limit reached
                </p>
                <p className="text-sm text-red-300">
                  You've reached your monthly FAQ limit. Upgrade your plan or wait until your cycle resets.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white ml-auto"
                onClick={onNavigateToUpgrade}
              >
                Upgrade Plan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low Usage Warning - Show when 1-2 FAQs remaining */}
      {remainingUsage > 0 && remainingUsage <= 2 && (
        <Card className="bg-yellow-600/10 border border-yellow-600/20">
          <CardContent className="p-4">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-yellow-400 font-medium">
                  Only {remainingUsage} FAQ{remainingUsage === 1 ? '' : 's'} remaining this month
                </p>
                <p className="text-sm text-yellow-300">
                  Consider renewing for more FAQ generation capacity.
                </p>
              </div>
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
              Choose your content source and let AI generate FAQs
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
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Enter any website URL to analyze and generate FAQs (https:// will be added automatically if missing)
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
                    className="bg-gray-800 border-gray-700 text-white resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Paste any text content, product descriptions, or documentation
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="upload" className="space-y-4 mt-4">
                <div>
                  <label className="text-sm font-medium text-gray-300 mb-2 block">
                    Upload Document
                  </label>
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-gray-600 transition-colors">
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
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
                >
                  <SelectTrigger className="w-32 bg-gray-800 border-gray-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {Array.from({ length: 8 }, (_, i) => i + 3).map((count) => (
                      <SelectItem
                        key={count}
                        value={count.toString()}
                        disabled={!canGenerateFAQCount(count)}
                        className="text-white hover:bg-gray-700 focus:bg-gray-700"
                      >
                        {count} FAQ{count !== 1 ? 's' : ''}
                        {!canGenerateFAQCount(count) && (
                          <span className="text-red-400 ml-2">(Exceeds limit)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1">
                  <p className="text-xs text-gray-400">
                    {canGenerateSelectedCount ? (
                      <>
                        <span className="text-green-400">✓</span> You can generate {faqCount} FAQ{faqCount !== 1 ? 's' : ''}
                        {remainingUsage > faqCount && (
                          <span className="ml-2">({remainingUsage - faqCount} will remain)</span>
                        )}
                      </>
                    ) : (
                      <>
                        {isExpired ? (<>\n                          <span className=\"text-red-400\">⚠</span> Monthly Pass expired.\n                        </>) : (<>\n                          <span className=\"text-red-400\">⚠</span> Not enough quota for {faqCount} FAQ{faqCount !== 1 ? 's' : ''}. You have {remainingUsage} FAQ{remainingUsage !== 1 ? 's' : ''} remaining.\n                        </>)}
                      </>
                    )}
                  </p>
                </div>
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
              disabled={isGenerating || !canCreateFAQ || !canGenerateSelectedCount}
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

            {/* Subscription status display */}
            {subscription && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg text-sm">
                <div className="flex justify-between items-center text-gray-300">
                  <span>Plan: {subscription.plan_tier}</span>
                  <span>Status: {subscription.status === 'active' ? '✅ Active' : '❌ Inactive'}</span>
                </div>
                <div className="flex justify-between items-center text-gray-300 mt-1">
                  <span>Usage: {subscription.faq_usage_current}/{subscription.faq_usage_limit}</span>
                  <span>{remainingUsage} remaining</span>
                </div>
                {!canCreateFAQ && faqEligibility && (
                  <div className="mt-2 text-yellow-400 text-xs">
                    {faqEligibility.isExpired
                      ? '⚠️ Your plan has expired. Please renew to continue.'
                      : '⚠️ You do not have enough remaining quota for the selected number of FAQs.'}
                  </div>
                )}
              </div>
            )}
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
                  ? savedFAQs.filter(faq => faq.is_published).length
                  : totalFAQs;

                if (totalFAQs === 0) {
                  return "Your generated FAQs will appear here";
                } else if (savedCollection) {
                  return `${publishedFAQs} published FAQs (${totalFAQs} total) - Synced with database`;
                } else {
                  return `${totalFAQs} FAQs generated and ready to save`;
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
                    <p className="text-gray-400">No FAQs generated yet</p>
                    <p className="text-sm text-gray-500">Use the form on the left to create your first FAQ set</p>
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {savedCollection && (
                    <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-400" />
                      <span className="text-green-400 text-sm">
                        Collection saved to database - Real-time sync enabled
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
                              {'order_index' in faq && (
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
