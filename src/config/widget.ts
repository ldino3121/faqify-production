// Widget configuration for embed code generation.
// The public app URL and Supabase API base are environment-driven (src/config/env.ts)
// so embed codes are never tied to a hard-coded domain.
import { PUBLIC_APP_URL, PUBLIC_SUPABASE_URL } from '@/config/env';

export const WIDGET_CONFIG = {
  PRODUCTION_DOMAIN: PUBLIC_APP_URL,

  DOMAINS: {
    development: PUBLIC_APP_URL,
    staging: PUBLIC_APP_URL,
    production: PUBLIC_APP_URL,
  },

  // Single fallback (the configured public app URL)
  FALLBACK_DOMAINS: [
    PUBLIC_APP_URL
  ],
  
  // Always emit the stable public app URL so embeds work on external sites
  // regardless of where they were generated.
  getWidgetDomain(): string {
    return PUBLIC_APP_URL;
  },
  
  // 🚀 PRODUCTION-READY Generate self-contained embed code (no external dependencies)
  generateEmbedCode(collectionId: string, theme: string = 'light', options: any = {}): string {
    const poweredBy = options.showPoweredBy !== false;
    const animation = options.animation !== false;
    const collapsible = options.collapsible !== false;
    const layout = ['accordion', 'list', 'columns'].includes(options.layout) ? options.layout : 'accordion';
    const search = options.search === true;

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
    layout: '${layout}',
    search: ${search},
    apiUrl: '${PUBLIC_SUPABASE_URL}'
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
    // Server is authoritative: Free tier always shows branding; paid tiers may hide it.
    const showPoweredBy = data.brandingRequired ? true : config.showPoweredBy;
    const uid = config.collectionId.replace(/-/g, '_');

    if (faqs.length === 0) {
      container.innerHTML = '<div class="faqify-empty">No FAQs available.</div>';
      return;
    }

    const searchHtml = config.search ?
      '<div class="faqify-search"><input type="search" class="faqify-search-input" placeholder="Search FAQs..." aria-label="Search FAQs" /></div>' : '';

    const itemsHtml = faqs.map(function(faq, index) {
      const open = config.layout !== 'accordion';
      const haystack = (faq.question + ' ' + faq.answer).toLowerCase().replace(/"/g, '');
      return '<div class="faqify-item" data-search="' + haystack + '">' +
        '<button type="button" class="faqify-question" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="answer_' + uid + '_' + index + '" data-index="' + index + '">' +
          '<span class="faqify-question-text">' + escapeHtml(faq.question) + '</span>' +
          '<span class="faqify-icon" aria-hidden="true" id="icon_' + uid + '_' + index + '">' + (config.layout === 'accordion' ? '▼' : '') + '</span>' +
        '</button>' +
        '<div class="faqify-answer' + (open ? ' expanded' : '') + '" id="answer_' + uid + '_' + index + '" role="region">' +
          '<div class="faqify-answer-content">' + escapeHtml(faq.answer) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    const poweredByHtml = showPoweredBy ?
      '<div class="faqify-powered-by">Powered by <a href="#" class="faqify-link">FAQify</a></div>' : '';

    container.innerHTML =
      '<div class="faqify-widget theme-' + config.theme + '" data-layout="' + config.layout + '">' +
        searchHtml +
        '<div class="faqify-container faqify-layout-' + config.layout + '">' +
          itemsHtml +
        '</div>' +
        poweredByHtml +
      '</div>';

    const items = Array.prototype.slice.call(container.querySelectorAll('.faqify-item'));

    // Accordion toggling (accessible buttons)
    items.forEach(function(item) {
      const btn = item.querySelector('.faqify-question');
      const answer = item.querySelector('.faqify-answer');
      const icon = item.querySelector('.faqify-icon');
      if (!btn || !answer) return;
      btn.addEventListener('click', function() {
        if (config.layout !== 'accordion') return;
        const isExpanded = answer.classList.contains('expanded');
        if (config.animation && icon) {
          answer.style.transition = 'all 0.3s ease';
          icon.style.transition = 'transform 0.3s ease';
        }
        if (isExpanded) {
          answer.classList.remove('expanded');
          btn.setAttribute('aria-expanded', 'false');
          if (icon) icon.style.transform = 'rotate(0deg)';
        } else {
          answer.classList.add('expanded');
          btn.setAttribute('aria-expanded', 'true');
          if (icon) icon.style.transform = 'rotate(180deg)';
        }
      });
    });

    // Client-side search (no external service)
    if (config.search) {
      const input = container.querySelector('.faqify-search-input');
      if (input) {
        input.addEventListener('input', function() {
          const q = input.value.toLowerCase().trim();
          items.forEach(function(item) {
            const hay = item.getAttribute('data-search') || '';
            item.style.display = (!q || hay.indexOf(q) !== -1) ? '' : 'none';
          });
        });
      }
    }
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
        width: 100%;
        text-align: left;
        background: transparent;
        border: 0;
        font: inherit;
        color: inherit;
        padding: 15px;
        cursor: pointer;
        font-weight: 600;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        transition: background-color 0.2s ease;
      }
      .faqify-search { margin-bottom: 12px; }
      .faqify-search-input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        font-size: 14px;
        box-sizing: border-box;
      }
      .faqify-layout-list .faqify-answer.expanded { max-height: none; }
      .faqify-layout-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      @media (max-width: 640px) { .faqify-layout-columns { grid-template-columns: 1fr; } }
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
