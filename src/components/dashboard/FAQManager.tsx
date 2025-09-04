import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Eye,
  Edit,
  Trash2,
  Code,
  Download,
  Calendar,
  Globe,
  Plus,
  Loader2,
  Copy,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import WIDGET_CONFIG from "@/config/widget";

interface FAQCollection {
  id: string;
  title: string;
  description?: string;
  status: 'draft' | 'published' | 'archived';
  created_at: string;
  updated_at: string;
  source_url?: string;
  source_content?: string;
  faqs: FAQ[];
}

interface FAQ {
  id: string;
  question: string;
  answer: string;
  order_index: number;
  is_published: boolean;
  collection_id: string;
}

interface FAQManagerProps {
  onNavigateToCreate?: () => void;
}

export const FAQManager = ({ onNavigateToCreate }: FAQManagerProps) => {
  const [collections, setCollections] = useState<FAQCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<FAQCollection | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [embedDialogOpen, setEmbedDialogOpen] = useState(false);
  const [embedCode, setEmbedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    faqs: [] as { id: string; question: string; answer: string; order_index: number }[]
  });
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      fetchCollections();
    }
  }, [user]);

  // Set up real-time subscription for FAQ collections
  useEffect(() => {
    if (!user) return;

    console.log('🔄 Setting up real-time subscription for FAQ collections');

    const collectionsChannel = supabase
      .channel('faq-collections-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'faq_collections',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        console.log('📡 FAQ collection changed:', payload);
        fetchCollections(); // Refetch all collections when any collection changes
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'faqs',
      }, (payload) => {
        console.log('📡 FAQ changed:', payload);
        // Only refetch if this FAQ belongs to one of our collections
        const affectedCollection = collections.find(c =>
          c.faqs.some(f => f.id === payload.old?.id || f.id === payload.new?.id)
        );
        if (affectedCollection) {
          fetchCollections();
        }
      })
      .subscribe();

    return () => {
      console.log('🔄 Cleaning up real-time subscription');
      supabase.removeChannel(collectionsChannel);
    };
  }, [user, collections]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      console.log('🔄 Fetching FAQ collections for user:', user?.id);

      const { data: collectionsData, error: collectionsError } = await supabase
        .from('faq_collections')
        .select(`
          *,
          faqs (*)
        `)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (collectionsError) {
        console.error('❌ Error fetching collections:', collectionsError);
        throw collectionsError;
      }

      console.log('✅ Fetched collections:', collectionsData?.length || 0);
      console.log('Collections data:', collectionsData);

      // Sort FAQs within each collection by order_index
      const sortedCollections = (collectionsData || []).map(collection => ({
        ...collection,
        faqs: (collection.faqs || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      }));

      setCollections(sortedCollections);
    } catch (error) {
      console.error('Error fetching collections:', error);
      toast({
        title: "Error",
        description: "Failed to load FAQ collections.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteCollection = async (collectionId: string) => {
    try {
      const { error } = await supabase
        .from('faq_collections')
        .delete()
        .eq('id', collectionId);

      if (error) throw error;

      setCollections(collections.filter(c => c.id !== collectionId));
      toast({
        title: "Collection Deleted",
        description: "FAQ collection has been deleted successfully.",
      });
    } catch (error) {
      console.error('Error deleting collection:', error);
      toast({
        title: "Error",
        description: "Failed to delete collection.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-600">Published</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const handleViewCollection = (collection: FAQCollection) => {
    setSelectedCollection(collection);
    setViewDialogOpen(true);
  };

  const handleEditCollection = (collection: FAQCollection) => {
    setSelectedCollection(collection);
    setEditForm({
      title: collection.title,
      description: collection.description || "",
      faqs: collection.faqs.map(faq => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        order_index: faq.order_index
      }))
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCollection || !editForm.title.trim()) {
      toast({
        title: "Validation Error",
        description: "Collection title is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      // Update collection details
      const { error: collectionError } = await supabase
        .from('faq_collections')
        .update({
          title: editForm.title.trim(),
          description: editForm.description.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCollection.id);

      if (collectionError) throw collectionError;

      // Update individual FAQs
      for (const faq of editForm.faqs) {
        const { error: faqError } = await supabase
          .from('faqs')
          .update({
            question: faq.question,
            answer: faq.answer,
            order_index: faq.order_index,
            updated_at: new Date().toISOString()
          })
          .eq('id', faq.id);

        if (faqError) throw faqError;
      }

      // Refresh collections
      await fetchCollections();

      setEditDialogOpen(false);
      toast({
        title: "Collection Updated!",
        description: "Your FAQ collection has been updated successfully.",
      });
    } catch (error) {
      console.error('Error updating collection:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update FAQ collection. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateFAQ = (index: number, field: 'question' | 'answer', value: string) => {
    const updatedFAQs = [...editForm.faqs];
    updatedFAQs[index] = { ...updatedFAQs[index], [field]: value };
    setEditForm({ ...editForm, faqs: updatedFAQs });
  };

  const removeFAQ = async (index: number) => {
    const faqToRemove = editForm.faqs[index];

    try {
      // Delete from database
      const { error } = await supabase
        .from('faqs')
        .delete()
        .eq('id', faqToRemove.id);

      if (error) throw error;

      // Remove from form state
      const updatedFAQs = editForm.faqs.filter((_, i) => i !== index);
      setEditForm({ ...editForm, faqs: updatedFAQs });

      toast({
        title: "FAQ Removed",
        description: "FAQ has been removed from the collection.",
      });
    } catch (error) {
      console.error('Error removing FAQ:', error);
      toast({
        title: "Error",
        description: "Failed to remove FAQ. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportCollection = (collection: FAQCollection, format: 'json' | 'csv' | 'html' = 'json') => {
    try {
      let content = '';
      let filename = '';
      let mimeType = '';

      switch (format) {
        case 'json':
          content = JSON.stringify({
            title: collection.title,
            description: collection.description,
            faqs: collection.faqs.map(faq => ({
              question: faq.question,
              answer: faq.answer
            }))
          }, null, 2);
          filename = `${collection.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.json`;
          mimeType = 'application/json';
          break;
        case 'csv':
          const csvHeader = 'Question,Answer\n';
          const csvRows = collection.faqs.map(faq =>
            `"${faq.question.replace(/"/g, '""')}","${faq.answer.replace(/"/g, '""')}"`
          ).join('\n');
          content = csvHeader + csvRows;
          filename = `${collection.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.csv`;
          mimeType = 'text/csv';
          break;
        case 'html':
          content = `<!DOCTYPE html>
<html>
<head>
    <title>${collection.title} - FAQs</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .faq-item { margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .question { font-weight: bold; color: #333; margin-bottom: 8px; }
        .answer { color: #666; line-height: 1.5; }
    </style>
</head>
<body>
    <h1>${collection.title}</h1>
    ${collection.description ? `<p>${collection.description}</p>` : ''}
    <div class="faqs">
        ${collection.faqs.map(faq => `
            <div class="faq-item">
                <div class="question">${faq.question}</div>
                <div class="answer">${faq.answer}</div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
          filename = `${collection.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_faqs.html`;
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

      toast({
        title: "Export Successful!",
        description: `FAQ collection exported as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      console.error('Error exporting collection:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export FAQ collection.",
        variant: "destructive",
      });
    }
  };

  const generateEmbedCode = (collection: FAQCollection) => {
    // Generate production-ready self-contained embed code
    const code = WIDGET_CONFIG.generateEmbedCode(collection.id, 'light', {
      showPoweredBy: true,
      animation: true,
      collapsible: true
    });

    setEmbedCode(code);
    setSelectedCollection(collection);
    setEmbedDialogOpen(true);
  };

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);

      toast({
        title: "Embed Code Copied!",
        description: "The embed code has been copied to your clipboard.",
      });
    } catch (error) {
      console.error('Error copying embed code:', error);
      toast({
        title: "Error",
        description: "Failed to copy embed code.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-400">Loading FAQ collections...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Manage FAQs</h1>
          <p className="text-gray-400">View, edit, and manage all your generated FAQ collections</p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white"
          onClick={() => onNavigateToCreate?.()}
        >
          <Plus className="h-4 w-4 mr-2" />
          Create New FAQ
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {collections.length === 0 ? (
          <Card className="bg-gray-900/50 border-gray-800">
            <CardContent className="p-12 text-center">
              <div className="text-gray-400 mb-4">
                <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No FAQ collections found</p>
                <p className="text-sm">Create your first FAQ collection to get started</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          collections.map((collection) => (
            <Card key={collection.id} className="bg-gray-900/50 border-gray-800 hover:border-gray-700 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <Globe className="h-4 w-4 text-blue-400" />
                      <h3 className="text-lg font-semibold text-white">{collection.title}</h3>
                      {getStatusBadge(collection.status)}
                    </div>
                    {collection.description && (
                      <p className="text-sm text-gray-400 mb-2">{collection.description}</p>
                    )}
                    <div className="flex items-center space-x-6 text-sm text-gray-400">
                      <span className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>Created {new Date(collection.created_at).toLocaleDateString()}</span>
                      </span>
                      <span>{collection.faqs?.length || 0} questions</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleViewCollection(collection)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>

                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleEditCollection(collection)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>

                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => generateEmbedCode(collection)}
                    >
                      <Code className="h-4 w-4 mr-1" />
                      Embed
                    </Button>

                    <Button
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => handleExportCollection(collection, 'json')}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-700 text-red-400 hover:bg-red-900/20"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this collection?')) {
                          deleteCollection(collection.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* FAQ Preview */}
                {collection.faqs && collection.faqs.length > 0 && (
                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-3">FAQ Preview</h4>
                    <div className="space-y-2">
                      {collection.faqs.slice(0, 3).map((faq, index) => (
                        <div key={faq.id} className="bg-gray-800/50 rounded p-3">
                          <p className="text-sm font-medium text-white mb-1">{faq.question}</p>
                          <p className="text-xs text-gray-400 line-clamp-2">{faq.answer}</p>
                        </div>
                      ))}
                      {collection.faqs.length > 3 && (
                        <p className="text-xs text-gray-400 text-center py-2">
                          +{collection.faqs.length - 3} more FAQs
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* View Collection Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button]:text-white [&>button]:hover:text-gray-300 [&>button]:hover:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedCollection?.title}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              {selectedCollection?.description || "FAQ Collection Details"}
            </DialogDescription>
          </DialogHeader>

          {selectedCollection && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white ml-2">
                    {new Date(selectedCollection.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Total FAQs:</span>
                  <span className="text-white ml-2">{selectedCollection.faqs?.length || 0}</span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-lg font-semibold text-white">FAQs</h4>
                {selectedCollection.faqs?.map((faq, index) => (
                  <div key={faq.id} className="bg-gray-800 rounded-lg p-4">
                    <h5 className="font-medium text-white mb-2">
                      {index + 1}. {faq.question}
                    </h5>
                    <p className="text-gray-300 text-sm leading-relaxed">
                      {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Collection Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 [&>button]:text-white [&>button]:hover:text-gray-300 [&>button]:hover:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit Collection: {selectedCollection?.title}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Modify your FAQ collection details and individual questions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Collection Details */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-title" className="text-white">Collection Title</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  placeholder="Enter collection title"
                />
              </div>

              <div>
                <Label htmlFor="edit-description" className="text-white">Description (Optional)</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                  placeholder="Enter collection description"
                  rows={3}
                />
              </div>
            </div>

            {/* FAQs List */}
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white">FAQs</h4>
              {editForm.faqs.map((faq, index) => (
                <div key={faq.id} className="bg-gray-800 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-medium text-white">FAQ {index + 1}</h5>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-700 text-red-400 hover:bg-red-900/20"
                      onClick={() => removeFAQ(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div>
                    <Label className="text-gray-300">Question</Label>
                    <Input
                      value={faq.question}
                      onChange={(e) => updateFAQ(index, 'question', e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white mt-1"
                      placeholder="Enter question"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300">Answer</Label>
                    <Textarea
                      value={faq.answer}
                      onChange={(e) => updateFAQ(index, 'answer', e.target.value)}
                      className="bg-gray-700 border-gray-600 text-white mt-1"
                      placeholder="Enter answer"
                      rows={3}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t border-gray-700">
              <Button
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white border-blue-600 hover:border-blue-700"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.title.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Embed Code Dialog */}
      <Dialog open={embedDialogOpen} onOpenChange={setEmbedDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-900 border-gray-700 [&>button]:text-white [&>button]:hover:text-gray-300 [&>button]:hover:bg-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              Embed Code for {selectedCollection?.title}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Copy this code and paste it into your website where you want the FAQs to appear.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="bg-black rounded-lg p-4 relative">
              <pre className="text-green-400 text-xs overflow-x-auto whitespace-pre-wrap max-h-[50vh] overflow-y-auto pr-20">
                <code>{embedCode}</code>
              </pre>
              <Button
                onClick={copyEmbedCode}
                size="sm"
                className="absolute top-2 right-2 bg-blue-600 hover:bg-blue-700 text-white z-10"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>

            <div className="text-sm text-gray-400 bg-gray-800 p-3 rounded-lg">
              <p><strong>✅ Ready to Use:</strong> This widget will display your FAQs with a clean, responsive design that matches your website's style.</p>
              <p className="mt-2"><strong>📋 Instructions:</strong> Copy the code above and paste it into your Elementor HTML widget or any HTML section of your website.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
