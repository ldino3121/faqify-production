@echo off
echo ========================================
echo FAQify Git vs Local Code Analysis
echo ========================================
echo.

echo 1. Checking Git Status...
git status
echo.

echo 2. Checking Modified Files...
git diff --name-only
echo.

echo 3. Checking Recent Commits...
git log --oneline -5
echo.

echo 4. Checking Untracked Files...
git ls-files --others --exclude-standard
echo.

echo 5. Checking Authentication File Differences...
git diff src/hooks/useAuth.tsx
echo.

echo 6. Checking Dashboard Component Differences...
git diff src/components/dashboard/PlanUpgrade.tsx
echo.

echo 7. Checking Login Page Differences...
git diff src/pages/Login.tsx
echo.

echo 8. Checking Supabase Client Differences...
git diff src/integrations/supabase/client.ts
echo.

echo ========================================
echo Analysis Complete!
echo ========================================
pause
