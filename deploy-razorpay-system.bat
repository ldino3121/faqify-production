@echo off
echo ========================================
echo   Deploying Razorpay Dual Payment System
echo ========================================
echo.

echo Step 1: Deploying edge functions...
echo.

echo Deploying create-razorpay-order function...
supabase functions deploy create-razorpay-order
if %errorlevel% neq 0 (
    echo ERROR: Failed to deploy create-razorpay-order
    pause
    exit /b 1
)

echo Deploying create-razorpay-subscription function...
supabase functions deploy create-razorpay-subscription
if %errorlevel% neq 0 (
    echo ERROR: Failed to deploy create-razorpay-subscription
    pause
    exit /b 1
)

echo Deploying razorpay-webhook function...
supabase functions deploy razorpay-webhook
if %errorlevel% neq 0 (
    echo ERROR: Failed to deploy razorpay-webhook
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Deployment Complete!
echo ========================================
echo.
echo Next steps:
echo 1. Update Plan IDs in UPDATE_RAZORPAY_PLAN_IDS.sql
echo 2. Run the SQL in Supabase SQL editor
echo 3. Configure webhook in Razorpay dashboard
echo 4. Test both payment flows
echo.
echo See RAZORPAY-DUAL-PAYMENT-SETUP.md for detailed instructions
echo.
pause
