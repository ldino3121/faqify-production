@echo off
echo ========================================
echo   DEPLOYING ENHANCED CONTENT EXTRACTION
echo ========================================
echo.

echo 🚀 Deploying enhanced analyze-content edge function...
echo.

cd /d "c:\Users\acer\Downloads\faqify-ai-spark-main"

echo 📍 Current directory: %CD%
echo.

echo 🔧 Deploying to Supabase...
supabase functions deploy analyze-content

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ SUCCESS: Enhanced content extraction deployed!
    echo.
    echo 🧪 Next steps:
    echo 1. Open test-enhanced-content-extraction.html in your browser
    echo 2. Configure your Supabase credentials
    echo 3. Test with the Indian Express URL
    echo 4. Verify that author bio content is filtered out
    echo.
    echo 📋 Test URL: https://indianexpress.com/article/india/shubhanshu-shukla-returns-to-earth-after-20-days-in-space-10128252/
    echo.
) else (
    echo.
    echo ❌ DEPLOYMENT FAILED!
    echo.
    echo 🔧 Troubleshooting:
    echo 1. Make sure Supabase CLI is installed
    echo 2. Check if you're logged in: supabase auth login
    echo 3. Verify project is linked: supabase link
    echo.
)

echo.
echo Press any key to exit...
pause >nul
