@echo off
echo 🚀 FAQify Production Deployment Script
echo =====================================

echo 📦 Installing dependencies...
npm install

echo 🔨 Building production version...
npm run build

echo ✅ Build complete! 
echo 📁 Files ready in 'dist' folder
echo 🌐 Ready for Vercel deployment

echo.
echo Next steps:
echo 1. Push code to GitHub
echo 2. Import to Vercel
echo 3. Add environment variables
echo 4. Deploy!

pause
