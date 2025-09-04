import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WIDGET_CONFIG } from "@/config/widget";
import { 
  Copy, 
  Code, 
  Eye, 
  Palette, 
  Settings, 
  Check,
  Download,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmbedConfig {
  theme: string;
  showPoweredBy: boolean;
  animation: boolean;
  collapsible: boolean;
  customStyles: {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    borderColor: string;
    borderRadius: number;
    fontSize: number;
  };
}

interface AdvancedEmbedGeneratorProps {
  collectionId: string;
  collectionTitle: string;
}

export const AdvancedEmbedGenerator = ({ collectionId, collectionTitle }: AdvancedEmbedGeneratorProps) => {
  const [config, setConfig] = useState<EmbedConfig>({
    theme: 'light',
    showPoweredBy: true,
    animation: true,
    collapsible: true,
    customStyles: {
      primaryColor: '#3B82F6',
      backgroundColor: '#FFFFFF',
      textColor: '#1F2937',
      borderColor: '#E5E7EB',
      borderRadius: 8,
      fontSize: 16
    }
  });
  const [copied, setCopied] = useState(false);
  const [activePreview, setActivePreview] = useState('basic');
  const { toast } = useToast();

  const themes = [
    { id: 'light', name: 'Light', preview: '#FFFFFF' },
    { id: 'dark', name: 'Dark', preview: '#1A1A1A' },
    { id: 'minimal', name: 'Minimal', preview: 'transparent' },
    { id: 'blue', name: 'Blue', preview: '#F0F9FF' },
    { id: 'green', name: 'Green', preview: '#F0FDF4' },
    { id: 'purple', name: 'Purple', preview: '#FAF5FF' },
    { id: 'custom', name: 'Custom', preview: 'linear-gradient(45deg, #FF6B6B, #4ECDC4)' }
  ];

  const generateEmbedCode = (type: 'basic' | 'advanced' | 'react' | 'wordpress') => {

    switch (type) {
      case 'basic':
        // Use the new self-contained embed code generation
        return WIDGET_CONFIG.generateEmbedCode(collectionId, config.theme, {
          showPoweredBy: config.showPoweredBy,
          animation: config.animation,
          collapsible: config.collapsible
        });

      case 'advanced':
        // Advanced version with custom styling support
        return WIDGET_CONFIG.generateEmbedCode(collectionId, config.theme === 'custom' ? 'light' : config.theme, {
          showPoweredBy: config.showPoweredBy,
          animation: config.animation,
          collapsible: config.collapsible,
          customStyles: config.theme === 'custom' ? config.customStyles : {}
        });

      case 'react':
        return `// React Component - Self-Contained FAQify Widget
import { useEffect, useRef } from 'react';

const FAQWidget = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const config = {
      collectionId: '${collectionId}',
      theme: '${config.theme}',
      showPoweredBy: ${config.showPoweredBy},
      animation: ${config.animation},
      collapsible: ${config.collapsible},
      apiUrl: 'https://dlzshcshqjdghmtzlbma.supabase.co'
    };

    const container = containerRef.current;

    // Show loading state
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Loading FAQs...</div>';

    // Fetch and render FAQs
    fetch(\`\${config.apiUrl}/functions/v1/get-faq-widget?collection_id=\${config.collectionId}\`)
      .then(response => response.json())
      .then(data => {
        if (data.error) throw new Error(data.error);

        const faqs = data.faqs || [];
        const faqsHtml = faqs.map((faq, index) => \`
          <div key={\${index}} style={{
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            marginBottom: '10px',
            overflow: 'hidden'
          }}>
            <div
              onClick={() => toggleFAQ(index)}
              style={{
                padding: '15px',
                background: '#f8f9fa',
                cursor: 'pointer',
                fontWeight: 'bold',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span>{\${faq.question}}</span>
              <span>▼</span>
            </div>
            <div style={{
              padding: '15px',
              display: 'none'
            }}>
              {\${faq.answer}}
            </div>
          </div>
        \`).join('');

        container.innerHTML = faqsHtml;
      })
      .catch(error => {
        container.innerHTML = '<div style="padding: 20px; color: #d32f2f;">Failed to load FAQs</div>';
      });
  }, []);

  return <div ref={containerRef} style={{ fontFamily: 'Arial, sans-serif' }} />;
};

export default FAQWidget;`;

      case 'wordpress':
        return `<!-- WordPress Integration - Self-Contained -->
<!-- Method 1: Direct HTML (Recommended) -->
<!-- Add this to any page/post using HTML block or Custom HTML widget -->

${WIDGET_CONFIG.generateEmbedCode(collectionId, config.theme, {
  showPoweredBy: config.showPoweredBy,
  animation: config.animation,
  collapsible: config.collapsible
})}

<!-- Method 2: Shortcode (Advanced) -->
<!-- Add this to your theme's functions.php file -->

function faqify_shortcode($atts) {
    $atts = shortcode_atts(array(
        'collection' => '${collectionId}',
        'theme' => '${config.theme}',
        'powered_by' => '${config.showPoweredBy}',
        'animation' => '${config.animation}'
    ), $atts);

    ob_start();
    ?>
    ${WIDGET_CONFIG.generateEmbedCode(collectionId, config.theme, {
      showPoweredBy: config.showPoweredBy,
      animation: config.animation,
      collapsible: config.collapsible
    }).replace(/`/g, '\\`')}
    <?php
    return ob_get_clean();
}
add_shortcode('faqify', 'faqify_shortcode');

<!-- Then use: [faqify] anywhere in your content -->`;

      default:
        return '';
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Code Copied!",
      description: "Embed code has been copied to your clipboard.",
    });
  };

  const downloadAsFile = (code: string, filename: string) => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <Code className="h-4 w-4 mr-2" />
          Advanced Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Advanced Embed Options</DialogTitle>
          <DialogDescription className="text-gray-400">
            Customize your FAQ widget appearance and generate embed code for {collectionTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <div className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Palette className="h-5 w-5 mr-2" />
                  Appearance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Theme Selection */}
                <div>
                  <Label className="text-gray-300">Theme</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {themes.map((theme) => (
                      <button
                        key={theme.id}
                        onClick={() => setConfig({ ...config, theme: theme.id })}
                        className={`p-3 rounded-lg border text-sm transition-all ${
                          config.theme === theme.id
                            ? 'border-blue-500 bg-blue-500/20'
                            : 'border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div 
                          className="w-full h-6 rounded mb-2"
                          style={{ background: theme.preview }}
                        ></div>
                        <span className="text-gray-300">{theme.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Styles (only for custom theme) */}
                {config.theme === 'custom' && (
                  <div className="space-y-3 p-4 bg-gray-700/50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-300">Custom Styling</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-400">Primary Color</Label>
                        <Input
                          type="color"
                          value={config.customStyles.primaryColor}
                          onChange={(e) => setConfig({
                            ...config,
                            customStyles: { ...config.customStyles, primaryColor: e.target.value }
                          })}
                          className="h-8 w-full"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">Background</Label>
                        <Input
                          type="color"
                          value={config.customStyles.backgroundColor}
                          onChange={(e) => setConfig({
                            ...config,
                            customStyles: { ...config.customStyles, backgroundColor: e.target.value }
                          })}
                          className="h-8 w-full"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">Text Color</Label>
                        <Input
                          type="color"
                          value={config.customStyles.textColor}
                          onChange={(e) => setConfig({
                            ...config,
                            customStyles: { ...config.customStyles, textColor: e.target.value }
                          })}
                          className="h-8 w-full"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-400">Border Color</Label>
                        <Input
                          type="color"
                          value={config.customStyles.borderColor}
                          onChange={(e) => setConfig({
                            ...config,
                            customStyles: { ...config.customStyles, borderColor: e.target.value }
                          })}
                          className="h-8 w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Options */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Show "Powered by FAQify"</Label>
                    <input
                      type="checkbox"
                      checked={config.showPoweredBy}
                      onChange={(e) => setConfig({ ...config, showPoweredBy: e.target.checked })}
                      className="rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Enable Animations</Label>
                    <input
                      type="checkbox"
                      checked={config.animation}
                      onChange={(e) => setConfig({ ...config, animation: e.target.checked })}
                      className="rounded"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-gray-300">Collapsible FAQs</Label>
                    <input
                      type="checkbox"
                      checked={config.collapsible}
                      onChange={(e) => setConfig({ ...config, collapsible: e.target.checked })}
                      className="rounded"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Code Generation Panel */}
          <div className="space-y-6">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center">
                  <Code className="h-5 w-5 mr-2" />
                  Embed Code
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activePreview} onValueChange={setActivePreview}>
                  <TabsList className="grid w-full grid-cols-4 bg-gray-700">
                    <TabsTrigger value="basic" className="text-xs">Basic</TabsTrigger>
                    <TabsTrigger value="advanced" className="text-xs">Advanced</TabsTrigger>
                    <TabsTrigger value="react" className="text-xs">React</TabsTrigger>
                    <TabsTrigger value="wordpress" className="text-xs">WordPress</TabsTrigger>
                  </TabsList>

                  {['basic', 'advanced', 'react', 'wordpress'].map((type) => (
                    <TabsContent key={type} value={type} className="mt-4">
                      <div className="bg-black rounded-lg p-4 relative">
                        <pre className="text-green-400 text-xs overflow-x-auto overflow-y-auto max-h-80 pr-20">
                          <code>{generateEmbedCode(type as any)}</code>
                        </pre>
                        <div className="absolute top-2 right-2 flex space-x-2 z-10">
                          <Button
                            onClick={() => copyToClipboard(generateEmbedCode(type as any))}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </Button>
                          <Button
                            onClick={() => downloadAsFile(
                              generateEmbedCode(type as any),
                              `faqify-embed-${type}.${type === 'react' ? 'jsx' : type === 'wordpress' ? 'php' : 'html'}`
                            )}
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
