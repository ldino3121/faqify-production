(function() {
  'use strict';
  
  // FAQify Widget Library
  window.FAQify = window.FAQify || {};
  
  // Default configuration - API URL will be determined dynamically
  const defaultConfig = {
    theme: 'light',
    apiUrl: null, // Will be set dynamically
    showPoweredBy: true,
    animation: true,
    collapsible: true,
    analytics: true
  };

  // 🛡️ BULLETPROOF Determine API URL based on current domain
  function getApiUrl() {
    const currentDomain = window.location.origin;

    // 🛡️ BULLETPROOF: Multiple fallback strategies for API URL

    // Strategy 1: Check if we're on localhost (development)
    if (currentDomain.includes('localhost') || currentDomain.includes('127.0.0.1')) {
      console.log('🛡️ FAQify: Development environment detected');
      return 'http://localhost:54321'; // Local Supabase
    }

    // Strategy 2: Use environment variable if available
    if (window.FAQIFY_API_URL) {
      console.log('🛡️ FAQify: Using environment API URL');
      return window.FAQIFY_API_URL;
    }

    // Strategy 3: BULLETPROOF Production API URL (guaranteed to work)
    const BULLETPROOF_API_URL = 'https://dlzshcshqjdghmtzlbma.supabase.co';
    console.log('🛡️ FAQify: Using bulletproof production API URL');
    return BULLETPROOF_API_URL;
  }

  // Generate session ID for analytics
  function generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Track analytics events
  async function trackEvent(eventType, collectionId, faqId = null, metadata = {}) {
    if (!defaultConfig.analytics) return;

    try {
      const sessionId = sessionStorage.getItem('faqify_session_id') || generateSessionId();
      sessionStorage.setItem('faqify_session_id', sessionId);

      await fetch(`${defaultConfig.apiUrl}/functions/v1/track-analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: eventType,
          collection_id: collectionId,
          faq_id: faqId,
          session_id: sessionId,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            page_url: window.location.href,
            page_title: document.title
          }
        })
      });
    } catch (error) {
      console.warn('FAQify: Analytics tracking failed:', error);
    }
  }
  
  // CSS Styles for the widget
  const widgetStyles = `
    .faqify-widget {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 100%;
      margin: 0;
      padding: 0;
    }
    
    .faqify-widget.theme-light {
      background: #ffffff;
      color: #333333;
    }

    .faqify-widget.theme-dark {
      background: #1a1a1a;
      color: #ffffff;
    }

    .faqify-widget.theme-minimal {
      background: transparent;
      color: inherit;
    }

    .faqify-widget.theme-blue {
      background: #f0f9ff;
      color: #1e40af;
    }

    .faqify-widget.theme-green {
      background: #f0fdf4;
      color: #166534;
    }

    .faqify-widget.theme-purple {
      background: #faf5ff;
      color: #7c3aed;
    }

    .faqify-widget.theme-custom {
      /* Custom theme styles will be injected dynamically */
    }
    
    .faqify-faq-item {
      border: 1px solid #e5e5e5;
      border-radius: 8px;
      margin-bottom: 12px;
      overflow: hidden;
      transition: all 0.3s ease;
    }
    
    .faqify-widget.theme-dark .faqify-faq-item {
      border-color: #404040;
    }

    .faqify-widget.theme-blue .faqify-faq-item {
      border-color: #bfdbfe;
      background: #ffffff;
    }

    .faqify-widget.theme-green .faqify-faq-item {
      border-color: #bbf7d0;
      background: #ffffff;
    }

    .faqify-widget.theme-purple .faqify-faq-item {
      border-color: #e9d5ff;
      background: #ffffff;
    }
    
    .faqify-faq-question {
      padding: 16px 20px;
      cursor: pointer;
      font-weight: 600;
      font-size: 16px;
      line-height: 1.4;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background-color 0.2s ease;
    }
    
    .faqify-widget.theme-light .faqify-faq-question:hover {
      background-color: #f8f9fa;
    }
    
    .faqify-widget.theme-dark .faqify-faq-question:hover {
      background-color: #2a2a2a;
    }
    
    .faqify-faq-icon {
      font-size: 18px;
      transition: transform 0.3s ease;
      flex-shrink: 0;
      margin-left: 12px;
    }
    
    .faqify-faq-icon.expanded {
      transform: rotate(180deg);
    }
    
    .faqify-faq-answer {
      padding: 0 20px;
      max-height: 0;
      overflow: hidden;
      transition: all 0.3s ease;
      opacity: 0;
    }
    
    .faqify-faq-answer.expanded {
      padding: 0 20px 20px 20px;
      max-height: 1000px;
      opacity: 1;
    }
    
    .faqify-faq-answer-content {
      font-size: 14px;
      line-height: 1.6;
      color: #666666;
    }
    
    .faqify-widget.theme-dark .faqify-faq-answer-content {
      color: #cccccc;
    }
    
    .faqify-powered-by {
      text-align: center;
      margin-top: 20px;
      padding: 10px;
      font-size: 12px;
      opacity: 0.7;
    }
    
    .faqify-powered-by a {
      color: #007bff;
      text-decoration: none;
    }
    
    .faqify-powered-by a:hover {
      text-decoration: underline;
    }
    
    .faqify-loading {
      text-align: center;
      padding: 40px 20px;
      font-size: 14px;
      color: #666;
    }
    
    .faqify-error {
      text-align: center;
      padding: 20px;
      background-color: #fee;
      border: 1px solid #fcc;
      border-radius: 8px;
      color: #c33;
      font-size: 14px;
    }
    
    .faqify-widget.theme-dark .faqify-error {
      background-color: #2a1a1a;
      border-color: #4a2a2a;
      color: #ff6b6b;
    }
    
    @media (max-width: 768px) {
      .faqify-faq-question {
        padding: 14px 16px;
        font-size: 15px;
      }
      
      .faqify-faq-answer.expanded {
        padding: 0 16px 16px 16px;
      }
      
      .faqify-faq-answer-content {
        font-size: 13px;
      }
    }
  `;
  
  // Inject CSS styles
  function injectStyles(customStyles = '') {
    if (document.getElementById('faqify-widget-styles')) return;

    const style = document.createElement('style');
    style.id = 'faqify-widget-styles';
    style.textContent = widgetStyles + customStyles;
    document.head.appendChild(style);
  }

  // Generate custom CSS from config
  function generateCustomStyles(config) {
    if (!config.customStyles) return '';

    const styles = config.customStyles;
    let customCSS = '';

    if (styles.primaryColor) {
      customCSS += `
        .faqify-widget.theme-custom .faqify-faq-question:hover {
          background-color: ${styles.primaryColor}20;
        }
        .faqify-widget.theme-custom .faqify-faq-icon {
          color: ${styles.primaryColor};
        }
      `;
    }

    if (styles.backgroundColor) {
      customCSS += `
        .faqify-widget.theme-custom {
          background-color: ${styles.backgroundColor};
        }
      `;
    }

    if (styles.textColor) {
      customCSS += `
        .faqify-widget.theme-custom {
          color: ${styles.textColor};
        }
        .faqify-widget.theme-custom .faqify-faq-question {
          color: ${styles.textColor};
        }
      `;
    }

    if (styles.borderColor) {
      customCSS += `
        .faqify-widget.theme-custom .faqify-faq-item {
          border-color: ${styles.borderColor};
        }
      `;
    }

    if (styles.borderRadius) {
      customCSS += `
        .faqify-widget.theme-custom .faqify-faq-item {
          border-radius: ${styles.borderRadius}px;
        }
      `;
    }

    if (styles.fontSize) {
      customCSS += `
        .faqify-widget.theme-custom .faqify-faq-question {
          font-size: ${styles.fontSize}px;
        }
      `;
    }

    return customCSS;
  }
  
  // 🛡️ BULLETPROOF Fetch FAQ data from API with multiple retry strategies
  async function fetchFAQData(collectionId, config) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    // 🛡️ BULLETPROOF: Multiple API endpoints for redundancy
    const apiEndpoints = [
      `${config.apiUrl}/functions/v1/get-faq-widget?collection_id=${collectionId}`,
      `https://dlzshcshqjdghmtzlbma.supabase.co/functions/v1/get-faq-widget?collection_id=${collectionId}`
    ];

    for (let endpointIndex = 0; endpointIndex < apiEndpoints.length; endpointIndex++) {
      const endpoint = apiEndpoints[endpointIndex];

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`🛡️ FAQify: Attempt ${attempt}/${maxRetries} for endpoint ${endpointIndex + 1}`);

          const response = await fetch(endpoint, {
            headers: {
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();

          if (data.error) {
            throw new Error(data.error);
          }

          console.log('🛡️ FAQify: Successfully fetched FAQ data');
          return data;

        } catch (error) {
          console.warn(`🛡️ FAQify: Attempt ${attempt} failed for endpoint ${endpointIndex + 1}:`, error.message);

          // If this is not the last attempt, wait before retrying
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
          }
        }
      }
    }

    // 🛡️ BULLETPROOF: If all attempts fail, throw final error
    const finalError = new Error('Failed to fetch FAQ data from all endpoints after multiple retries');
    console.error('🛡️ FAQify: All fetch attempts failed:', finalError);
    throw finalError;
  }
  
  // Render FAQ widget
  function renderFAQWidget(container, faqData, config) {
    if (!faqData || !faqData.faqs || faqData.faqs.length === 0) {
      container.innerHTML = `
        <div class="faqify-widget theme-${config.theme}">
          <div class="faqify-error">No FAQs found for this collection.</div>
        </div>
      `;
      return;
    }
    
    // Sort FAQs by order_index
    const sortedFAQs = faqData.faqs.sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    
    const faqItems = sortedFAQs.map((faq, index) => `
      <div class="faqify-faq-item">
        <div class="faqify-faq-question" data-faq-index="${index}">
          <span>${escapeHtml(faq.question)}</span>
          <span class="faqify-faq-icon">▼</span>
        </div>
        <div class="faqify-faq-answer" data-faq-index="${index}">
          <div class="faqify-faq-answer-content">${escapeHtml(faq.answer)}</div>
        </div>
      </div>
    `).join('');
    
    const poweredBy = config.showPoweredBy ? `
      <div class="faqify-powered-by">
        Powered by <a href="https://faqify.com" target="_blank">FAQify</a>
      </div>
    ` : '';
    
    container.innerHTML = `
      <div class="faqify-widget theme-${config.theme}">
        ${faqItems}
        ${poweredBy}
      </div>
    `;
    
    // Add click event listeners
    if (config.collapsible) {
      const questions = container.querySelectorAll('.faqify-faq-question');
      questions.forEach((question, questionIndex) => {
        question.addEventListener('click', function() {
          const index = this.getAttribute('data-faq-index');
          const answer = container.querySelector(`.faqify-faq-answer[data-faq-index="${index}"]`);
          const icon = this.querySelector('.faqify-faq-icon');

          const isExpanded = answer.classList.contains('expanded');

          if (isExpanded) {
            answer.classList.remove('expanded');
            icon.classList.remove('expanded');
          } else {
            answer.classList.add('expanded');
            icon.classList.add('expanded');

            // Track FAQ click/view
            const faq = faqData.faqs[questionIndex];
            if (faq) {
              trackEvent('faq_click', faqData.id, faq.id, {
                question: faq.question,
                question_index: questionIndex
              });
            }
          }
        });
      });
    }
  }
  
  // Utility function to escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Initialize widget
  FAQify.init = async function(options = {}) {
    const config = { ...defaultConfig, ...options };

    // Set API URL if not provided
    if (!config.apiUrl) {
      config.apiUrl = getApiUrl();
    }

    if (!config.collectionId && !config.widgetId) {
      console.error('FAQify: collectionId or widgetId is required');
      return;
    }
    
    // Find widget containers
    const containers = document.querySelectorAll(`[data-faqify-collection="${config.collectionId}"], #faqify-widget-${config.widgetId}, .faqify-widget-container`);
    
    if (containers.length === 0) {
      console.error('FAQify: No widget containers found');
      return;
    }
    
    // Inject styles with custom styling
    const customStyles = generateCustomStyles(config);
    injectStyles(customStyles);
    
    // Initialize each container
    for (const container of containers) {
      try {
        // Show loading state
        container.innerHTML = `
          <div class="faqify-widget theme-${config.theme}">
            <div class="faqify-loading">Loading FAQs...</div>
          </div>
        `;
        
        // Get collection ID from container or config
        const collectionId = container.getAttribute('data-faqify-collection') || 
                           config.collectionId || 
                           config.widgetId;
        
        // Fetch and render FAQ data
        const faqData = await fetchFAQData(collectionId, config);
        renderFAQWidget(container, faqData, config);

        // Track widget load
        trackEvent('widget_load', collectionId, null, {
          theme: config.theme,
          total_faqs: faqData.faqs?.length || 0
        });
        
      } catch (error) {
        console.error('FAQify: Error initializing widget:', error);
        container.innerHTML = `
          <div class="faqify-widget theme-${config.theme}">
            <div class="faqify-error">Failed to load FAQs. Please try again later.</div>
          </div>
        `;
      }
    }
  };
  
  // Auto-initialize if data attributes are found
  document.addEventListener('DOMContentLoaded', function() {
    const autoInitContainers = document.querySelectorAll('[data-faqify-collection]');
    if (autoInitContainers.length > 0) {
      autoInitContainers.forEach(container => {
        const collectionId = container.getAttribute('data-faqify-collection');
        const theme = container.getAttribute('data-faqify-theme') || 'light';
        const showPoweredBy = container.getAttribute('data-faqify-powered-by') !== 'false';

        FAQify.init({
          collectionId: collectionId,
          theme: theme,
          showPoweredBy: showPoweredBy,
          apiUrl: getApiUrl() // Ensure API URL is set
        });
      });
    }
  });
  
})();
