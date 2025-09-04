// 🛡️ BULLETPROOF Widget configuration for embed code generation
export const WIDGET_CONFIG = {
  // 🛡️ BULLETPROOF Production domain where widget.js will be hosted
  PRODUCTION_DOMAIN: 'https://faqify.app', // Your actual production domain

  // 🛡️ BULLETPROOF Alternative domains for different environments
  DOMAINS: {
    development: 'http://localhost:8084',
    staging: 'https://staging-faqify.app', // If you have staging
    production: 'https://faqify.app' // Your actual production domain
  },

  // 🛡️ BULLETPROOF Fallback domains in case primary fails
  FALLBACK_DOMAINS: [
    'https://faqify.app',
    'https://www.faqify.app', // Alternative if needed
    'https://faqify-production.vercel.app' // Vercel fallback
  ],
  
  // 🛡️ BULLETPROOF Get the appropriate domain based on current environment
  getWidgetDomain(): string {
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    // 🛡️ BULLETPROOF: Always use production domain for embed codes
    // This ensures embed codes work on external websites regardless of where they're generated
    if (currentOrigin.includes('localhost') || currentOrigin.includes('127.0.0.1')) {
      console.log('🛡️ Development environment detected - using production domain for embed');
      return this.PRODUCTION_DOMAIN;
    }

    // 🛡️ BULLETPROOF: If running on staging, still use production for embed codes
    if (currentOrigin.includes('staging')) {
      console.log('🛡️ Staging environment detected - using production domain for embed');
      return this.PRODUCTION_DOMAIN; // Changed from staging to production for reliability
    }

    // 🛡️ BULLETPROOF: Validate current origin before using it
    if (currentOrigin && currentOrigin.startsWith('https://') && !currentOrigin.includes('localhost')) {
      console.log('🛡️ Production environment detected - using current origin');
      return currentOrigin;
    }

    // 🛡️ BULLETPROOF: Final fallback to production domain
    console.log('🛡️ Fallback to production domain');
    return this.PRODUCTION_DOMAIN;
  },
  
  // 🚀 PRODUCTION-READY Generate self-contained embed code (no external dependencies)
  generateEmbedCode(collectionId: string, theme: string = 'light', options: any = {}): string {
    const poweredBy = options.showPoweredBy !== false;
    const animation = options.animation !== false;
    const collapsible = options.collapsible !== false;

    // 🛡️ BULLETPROOF: Validate collection ID
    if (!collectionId || collectionId.trim() === '') {
      throw new Error('Collection ID is required for embed code generation');
    }

    // Generate unique widget ID to avoid conflicts
    const widgetId = `faqify-widget-${collectionId.substring(0, 8)}`;

    // Theme-based styling
    const themeStyles = this.getThemeStyles(theme);

    // Get the theme styles
    const styles = this.getThemeStyles(theme);

    // 🚀 PRODUCTION-READY: Self-contained embed code with no external dependencies
    return `<!-- 🚀 FAQify Widget - Production Ready (No External Dependencies) -->
<div id="${widgetId}" style="font-family: Arial, sans-serif; max-width: 100%; margin: 0 auto;"></div>
<script>
(function() {
  'use strict';

  // Configuration
  const config = {
    collectionId: '${collectionId}',
    theme: '${theme}',
    showPoweredBy: ${poweredBy},
    animation: ${animation},
    collapsible: ${collapsible},
    apiUrl: 'https://dlzshcshqjdghmtzlbma.supabase.co'
  };

  const container = document.getElementById('${widgetId}');
  if (!container) {
    console.error('FAQify: Container not found');
    return;
  }

  // Theme styles
  const styles = \`${styles.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;

  // Inject styles
  if (!document.getElementById('faqify-styles-${theme}')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'faqify-styles-${theme}';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Show loading state
  container.innerHTML = '<div class="faqify-loading">Loading FAQs...</div>';

  // Fetch and render FAQs
  fetch(config.apiUrl + '/functions/v1/get-faq-widget?collection_id=' + config.collectionId)
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }

      renderWidget(container, data, config);
    })
    .catch(error => {
      console.error('FAQify Error:', error);
      container.innerHTML = '<div class="faqify-error">Failed to load FAQs. Please try again later.</div>';
    });

  // Render widget function
  function renderWidget(container, data, config) {
    const faqs = data.faqs || [];

    if (faqs.length === 0) {
      container.innerHTML = '<div class="faqify-empty">No FAQs available.</div>';
      return;
    }

    const faqsHtml = faqs.map((faq, index) =>
      '<div class="faqify-item">' +
        '<div class="faqify-question" onclick="toggleFAQ_' + config.collectionId.replace(/-/g, '_') + '(' + index + ')" data-index="' + index + '">' +
          '<span class="faqify-question-text">' + escapeHtml(faq.question) + '</span>' +
          '<span class="faqify-icon" id="icon_' + config.collectionId.replace(/-/g, '_') + '_' + index + '">▼</span>' +
        '</div>' +
        '<div class="faqify-answer" id="answer_' + config.collectionId.replace(/-/g, '_') + '_' + index + '">' +
          '<div class="faqify-answer-content">' + escapeHtml(faq.answer) + '</div>' +
        '</div>' +
      '</div>'
    ).join('');

    const poweredByHtml = config.showPoweredBy ?
      '<div class="faqify-powered-by">Powered by <a href="#" class="faqify-link">FAQify</a></div>' : '';

    container.innerHTML =
      '<div class="faqify-widget theme-' + config.theme + '">' +
        '<div class="faqify-container">' +
          faqsHtml +
          poweredByHtml +
        '</div>' +
      '</div>';

    // Add toggle functionality
    window['toggleFAQ_' + config.collectionId.replace(/-/g, '_')] = function(index) {
      const answer = document.getElementById('answer_' + config.collectionId.replace(/-/g, '_') + '_' + index);
      const icon = document.getElementById('icon_' + config.collectionId.replace(/-/g, '_') + '_' + index);

      if (!answer || !icon) return;

      const isExpanded = answer.classList.contains('expanded');

      if (config.animation) {
        answer.style.transition = 'all 0.3s ease';
        icon.style.transition = 'transform 0.3s ease';
      }

      if (isExpanded) {
        answer.classList.remove('expanded');
        icon.style.transform = 'rotate(0deg)';
      } else {
        answer.classList.add('expanded');
        icon.style.transform = 'rotate(180deg)';
      }
    };
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();
</script>`;
  },

  // Get theme-specific styles
  getThemeStyles(theme: string): string {
    const baseStyles = `
      .faqify-widget {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      .faqify-container {
        max-width: 100%;
      }
      .faqify-item {
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        margin-bottom: 10px;
        overflow: hidden;
        background: #fff;
      }
      .faqify-question {
        padding: 15px;
        cursor: pointer;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        transition: background-color 0.2s ease;
      }
      .faqify-question:hover {
        background-color: #f8f9fa;
      }
      .faqify-question-text {
        flex: 1;
        margin-right: 10px;
      }
      .faqify-icon {
        font-size: 12px;
        transition: transform 0.3s ease;
        color: #666;
      }
      .faqify-answer {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease;
      }
      .faqify-answer.expanded {
        max-height: 1000px;
      }
      .faqify-answer-content {
        padding: 15px;
        color: #555;
        border-top: 1px solid #f0f0f0;
      }
      .faqify-powered-by {
        text-align: center;
        margin-top: 20px;
        font-size: 12px;
        color: #888;
      }
      .faqify-link {
        color: #007bff;
        text-decoration: none;
      }
      .faqify-link:hover {
        text-decoration: underline;
      }
      .faqify-loading, .faqify-error, .faqify-empty {
        padding: 20px;
        text-align: center;
        color: #666;
        font-style: italic;
      }
      .faqify-error {
        color: #d32f2f;
      }
    `;

    // Theme-specific styles
    const themeStyles: { [key: string]: string } = {
      light: `
        .faqify-widget.theme-light .faqify-question {
          background-color: #f8f9fa;
        }
        .faqify-widget.theme-light .faqify-question:hover {
          background-color: #e9ecef;
        }
      `,
      dark: `
        .faqify-widget.theme-dark {
          color: #fff;
        }
        .faqify-widget.theme-dark .faqify-item {
          background: #2d3748;
          border-color: #4a5568;
        }
        .faqify-widget.theme-dark .faqify-question {
          background-color: #4a5568;
          color: #fff;
        }
        .faqify-widget.theme-dark .faqify-question:hover {
          background-color: #5a6578;
        }
        .faqify-widget.theme-dark .faqify-answer-content {
          color: #e2e8f0;
          border-top-color: #4a5568;
        }
      `,
      minimal: `
        .faqify-widget.theme-minimal .faqify-item {
          border: none;
          border-bottom: 1px solid #e0e0e0;
          border-radius: 0;
          margin-bottom: 0;
        }
        .faqify-widget.theme-minimal .faqify-question {
          background: transparent;
          padding: 12px 0;
        }
        .faqify-widget.theme-minimal .faqify-question:hover {
          background: transparent;
        }
      `
    };

    return baseStyles + (themeStyles[theme] || themeStyles.light);
  }
};

export default WIDGET_CONFIG;
