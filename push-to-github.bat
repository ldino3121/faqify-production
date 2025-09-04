@echo off
echo 🚀 FAQify GitHub Upload Script
echo ===============================

echo 📁 Initializing Git repository...
git init

echo 📝 Adding all files...
git add .

echo 💾 Creating initial commit...
git commit -m "Initial FAQify production deployment - AI-powered FAQ generation SaaS"

echo 🌿 Setting main branch...
git branch -M main

echo 🔗 Adding remote repository...
git remote add origin https://github.com/ldino3121/faqify-production.git

echo 📤 Pushing to GitHub...
git push -u origin main

echo ✅ Upload complete!
echo 🌐 Your code is now available at: https://github.com/ldino3121/faqify-production

echo.
echo Next steps:
echo 1. Go to vercel.com
echo 2. Import your GitHub repository
echo 3. Deploy to production
echo 4. Add environment variables

pause
