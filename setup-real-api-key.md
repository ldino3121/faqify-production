# 🔑 PERMANENT API KEY SETUP

## The Real Issue
Your FAQ generation keeps failing because we don't have a valid OpenRouter API key. All the "fixes" have been temporary because the root cause is missing credentials.

## PERMANENT SOLUTION

### Step 1: Get Real OpenRouter API Key
1. Go to https://openrouter.ai/
2. Sign up with your email
3. Go to "Keys" section in dashboard
4. Click "Create Key"
5. Copy the key (starts with `sk-or-v1-...`)
6. Add $5-10 credits to your account

### Step 2: Set Environment Variable in Supabase
Run this command with YOUR real API key:

```bash
npx supabase secrets set DEEPSEEK_API_KEY="your-real-api-key-here"
```

### Step 3: Redeploy Function
```bash
npx supabase functions deploy analyze-content
```

## Alternative: Use OpenAI API Key
If you have an OpenAI API key, you can use that instead:

1. Set the environment variable:
```bash
npx supabase secrets set OPENAI_API_KEY="your-openai-key"
```

2. Update the function to use OpenAI instead of OpenRouter

## Why This Keeps Breaking
- The hardcoded API keys in the code are fake/expired
- Environment variables aren't set in Supabase
- Without valid credentials, the AI API returns 401/402 errors
- This causes the "non 2xx status code" error in your dashboard

## After Setup
Once you have a real API key configured:
- FAQ generation will work permanently
- No more demo mode issues
- No more "non 2xx status code" errors
- Production-ready functionality

## Cost
- OpenRouter: ~$0.01-0.05 per FAQ generation
- OpenAI: ~$0.02-0.10 per FAQ generation
- Very affordable for a production tool
