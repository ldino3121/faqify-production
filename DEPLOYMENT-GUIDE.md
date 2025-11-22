# FAQify - Deployment Guide

## 🚀 DEPLOYMENT STEPS

### Step 1: Verify All Changes
```bash
# Check modified files
git status

# Expected changes:
# - src/components/dashboard/FAQCreator.tsx (modified)
# - supabase/functions/analyze-content/index.ts (modified)
# - src/hooks/useExpirationCountdown.tsx (new)
# - src/utils/errorLogger.ts (new)
# - supabase/functions/log-error/index.ts (new)
# - supabase/functions/health-check/index.ts (new)
```

### Step 2: Build Frontend
```bash
cd faqify-ai-spark-main
npm install  # If needed
npm run build
```

### Step 3: Deploy Edge Functions
```bash
# Deploy error logging function
supabase functions deploy log-error

# Deploy health check function
supabase functions deploy health-check

# Deploy updated analyze-content function
supabase functions deploy analyze-content
```

### Step 4: Create Error Logs Table (if needed)
```sql
CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  error_message TEXT,
  error_stack TEXT,
  error_context JSONB,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_agent TEXT,
  origin TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX idx_error_logs_user_id ON error_logs(user_id);
CREATE INDEX idx_error_logs_timestamp ON error_logs(timestamp);
```

### Step 5: Deploy to Production
```bash
# Option 1: Using Vercel (if deployed there)
vercel deploy --prod

# Option 2: Using your hosting provider
# Follow your provider's deployment process
```

### Step 6: Verify Deployment
```bash
# Test health check endpoint
curl https://your-domain.com/api/health-check

# Test error logging
curl -X POST https://your-domain.com/api/log-error \
  -H "Content-Type: application/json" \
  -d '{"error": {"message": "Test error"}, "context": {"test": true}}'

# Test FAQ generation with new model
# Use the FAQCreator UI to generate a test FAQ
```

---

## ✅ POST-DEPLOYMENT CHECKLIST

- [ ] Frontend builds successfully
- [ ] Edge functions deployed
- [ ] Error logs table created
- [ ] Health check endpoint responds
- [ ] Error logging endpoint works
- [ ] FAQ generation works with new model
- [ ] Expired plans show greyed out inputs
- [ ] Status displays "Expired" correctly
- [ ] Error messages display properly
- [ ] No console errors in browser

---

## 🔍 MONITORING

### Monitor Error Logs
```sql
-- Check recent errors
SELECT * FROM error_logs 
ORDER BY timestamp DESC 
LIMIT 10;

-- Check errors by user
SELECT user_id, COUNT(*) as error_count 
FROM error_logs 
GROUP BY user_id 
ORDER BY error_count DESC;
```

### Monitor API Health
```bash
# Check health status regularly
curl https://your-domain.com/api/health-check | jq .
```

### Monitor FAQ Generation
- Check Supabase function logs
- Monitor error_logs table
- Check browser console for errors

---

## 🆘 ROLLBACK PLAN

If issues occur:

```bash
# Rollback edge functions
supabase functions deploy analyze-content --version <previous-version>

# Rollback frontend
# Redeploy previous version from git

# Restore database
# Use Supabase backup if needed
```

---

## 📞 SUPPORT

For issues:
1. Check error_logs table
2. Check Supabase function logs
3. Check browser console
4. Review TEST-RESULTS.md
5. Review FIXES-IMPLEMENTED.md

---

## 🎉 SUCCESS INDICATORS

- ✅ No errors in error_logs table
- ✅ Health check returns 200
- ✅ FAQ generation works
- ✅ Expired plans show correctly
- ✅ Users report improved experience

