@echo off
echo ========================================
echo FAQify Production Deployment Script
echo ========================================
echo.
echo This will commit and push all changes to production
echo Changes include:
echo - USD pricing on landing page
echo - Toggle fixes (One Time / Auto Renew)
echo - Removed Indian pricing logic
echo.
pause

echo.
echo 1. Adding all changes to git...
git add .
if %errorlevel% neq 0 (
    echo ERROR: Failed to add files to git
    pause
    exit /b 1
)
echo ✅ Files added successfully

echo.
echo 2. Committing changes...
git commit -m "feat: International strategy - USD pricing, toggle fixes, remove Indian pricing - Landing page: Standard USD pricing ($9/$29) globally - Dashboard: Updated toggle labels (One Time/Auto Renew) - Removed: All location detection and Indian pricing logic - Added: Payment type toggle on landing page - Fixed: Authentication flow for production deployment"
if %errorlevel% neq 0 (
    echo ERROR: Failed to commit changes
    pause
    exit /b 1
)
echo ✅ Changes committed successfully

echo.
echo 3. Pushing to production...
git push origin main
if %errorlevel% neq 0 (
    echo ERROR: Failed to push to production
    pause
    exit /b 1
)
echo ✅ Changes pushed to production successfully!

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Production URL: https://faqify.app/
echo.
echo Please wait 2-5 minutes for deployment to complete, then:
echo 1. Clear browser cache (Ctrl+Shift+R)
echo 2. Test landing page: https://faqify.app/
echo 3. Test dashboard: https://faqify.app/dashboard
echo 4. Verify toggle shows "One Time" and "Auto Renew"
echo 5. Confirm USD pricing ($9/$29)
echo.
pause
