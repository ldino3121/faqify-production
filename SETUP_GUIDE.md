# FAQify AI Spark - Complete Setup Guide

This guide will help you set up and test the FAQify AI Spark application locally with all the implemented features.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm/yarn
- Supabase account
- OpenRouter account (for DeepSeek AI)
- Stripe account (for payments)

### 1. Environment Setup

1. **Clone and install dependencies:**
```bash
cd faqify-ai-spark-main
npm install
```

2. **Copy environment file:**
```bash
cp .env.example .env
```

3. **Configure environment variables in `.env`:**
```env
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# OpenRouter API Configuration
DEEPSEEK_API_KEY=your_deepseek_api_key

# Stripe Configuration
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

NODE_ENV=development
```

### 2. Supabase Setup

1. **Create a new Supabase project** at https://supabase.com

2. **Run database migrations:**
```bash
npx supabase db push
```

3. **Deploy edge functions:**
```bash
npx supabase functions deploy analyze-content
npx supabase functions deploy process-document
npx supabase functions deploy export-faqs
npx supabase functions deploy get-faq-widget
npx supabase functions deploy track-analytics
npx supabase functions deploy get-analytics
npx supabase functions deploy create-checkout-session
npx supabase functions deploy stripe-webhook
npx supabase functions deploy manage-subscription
```

4. **Set environment variables in Supabase:**
```bash
npx supabase secrets set DEEPSEEK_API_KEY=your_key
npx supabase secrets set STRIPE_SECRET_KEY=your_key
npx supabase secrets set STRIPE_WEBHOOK_SECRET=your_key
```

### 3. External Service Setup

#### OpenRouter (DeepSeek AI)
1. Sign up at https://openrouter.ai
2. Get your API key
3. Add it to your `.env` file

#### Stripe (Payments)
1. Create a Stripe account at https://stripe.com
2. Get your secret key and webhook secret
3. Set up webhook endpoint: `your-supabase-url/functions/v1/stripe-webhook`
4. Add webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`

### 4. Configure OAuth (Optional)

For Google and GitHub authentication:

1. **Follow the OAuth Setup Guide:**
   ```bash
   # Read the detailed setup instructions
   cat OAUTH_SETUP_GUIDE.md

   # Or use the interactive setup helper
   node setup-oauth.js
   ```

2. **Quick OAuth Setup:**
   - Create Google OAuth app with redirect: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Create GitHub OAuth app with callback: `https://your-project-ref.supabase.co/auth/v1/callback`
   - Enable providers in Supabase Dashboard > Authentication > Providers

### 5. Start Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:8082`

## 🧪 Testing Guide

### Core Features to Test

#### 1. **User Authentication**
- Sign up with email/password
- Sign in/out functionality
- Protected routes (dashboard access)

#### 2. **FAQ Generation**
- **URL Analysis**: Test with public websites
  - Try: `https://example.com`
  - Should extract content and generate 4-6 FAQs
- **Text Input**: Paste content (minimum 50 characters)
- **Document Upload**: Upload PDF, DOCX, or TXT files

#### 3. **FAQ Management**
- View generated FAQ collections
- Edit individual FAQs
- Delete FAQs and collections
- Change collection status (draft/published)

#### 4. **Widget System**
- Generate embed codes
- Test different themes (light, dark, minimal, blue, green, purple, custom)
- Test widget on external website
- Verify analytics tracking

#### 5. **Export Functionality**
- Export FAQs as JSON, CSV, HTML, Markdown
- Download files and verify content

#### 6. **Analytics Dashboard**
- View FAQ performance metrics
- Check widget load tracking
- Monitor user interactions

#### 7. **Payment System** (if Stripe configured)
- Test subscription upgrades
- Verify usage limits
- Test payment flows

### Testing Scenarios

#### Scenario 1: Basic FAQ Generation
1. Sign up for a new account
2. Go to "Create FAQs" tab
3. Enter URL: `https://docs.github.com/en/get-started`
4. Click "Generate FAQs"
5. Verify 4-6 FAQs are generated
6. Save the collection

#### Scenario 2: Widget Embedding
1. Generate FAQs (from Scenario 1)
2. Go to "Manage FAQs" tab
3. Click "Advanced Embed" on a collection
4. Customize theme and options
5. Copy embed code
6. Test on a local HTML file

#### Scenario 3: Analytics Tracking
1. Embed widget on a test page
2. Interact with FAQs (click questions)
3. Go to "Analytics" tab in dashboard
4. Verify events are tracked

#### Scenario 4: Export Testing
1. Create FAQ collection
2. Go to "Manage FAQs"
3. Click export dropdown
4. Test all formats (JSON, CSV, HTML, Markdown)
5. Verify downloaded files

### Demo Page Testing

Visit `/demo` to test the interactive demo:
1. Try URL input with sample content
2. Test text input with custom content
3. Verify FAQ generation simulation
4. Check widget preview

## 🔧 Troubleshooting

### Common Issues

#### 1. **Edge Functions Not Working**
- Check Supabase function logs
- Verify environment variables are set
- Ensure functions are deployed

#### 2. **AI Generation Fails**
- Verify DeepSeek API key is valid
- Check API rate limits
- Review function logs for errors

#### 3. **Widget Not Loading**
- Check browser console for errors
- Verify widget.js is accessible
- Check CORS settings

#### 4. **Payment Issues**
- Verify Stripe keys are correct
- Check webhook configuration
- Review Stripe dashboard for events

### Development Tips

1. **Use Supabase Local Development:**
```bash
npx supabase start
npx supabase functions serve
```

2. **Monitor Function Logs:**
```bash
npx supabase functions logs analyze-content
```

3. **Test Database Changes:**
```bash
npx supabase db reset
```

## 📱 Production Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

### Supabase Production
1. Upgrade to Supabase Pro plan
2. Configure custom domain
3. Set up proper CORS policies
4. Configure rate limiting

## 🎯 Feature Verification Checklist

- [ ] User registration and authentication
- [ ] URL content analysis and FAQ generation
- [ ] Text input processing
- [ ] Document upload (PDF, DOCX, TXT)
- [ ] FAQ collection management (CRUD)
- [ ] Widget embedding with multiple themes
- [ ] Export functionality (JSON, CSV, HTML, Markdown)
- [ ] Analytics tracking and dashboard
- [ ] Payment processing and subscriptions
- [ ] Rate limiting and security measures
- [ ] Error handling and user feedback
- [ ] Responsive design and mobile compatibility

## 🔗 Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [Stripe Integration Guide](https://stripe.com/docs)
- [React Query Documentation](https://tanstack.com/query)

## 🆘 Support

If you encounter issues:
1. Check the browser console for errors
2. Review Supabase function logs
3. Verify all environment variables are set
4. Test with sample data first

The application now includes comprehensive error handling, input validation, rate limiting, and security measures to ensure a robust user experience.
