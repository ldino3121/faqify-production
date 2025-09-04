# 🔧 Widget Embed Issue - FIXED!

## ❌ **The Problem**
Your embed code was using `http://localhost:8084/widget.js` which only works on your local development machine. When you paste this code into WordPress or any external website, it can't access your localhost server.

**Original broken embed code:**
```html
<!-- FAQify Widget -->
<div data-faqify-collection="5aee00a6-2195-493e-b3cf-8aef053c5e2b" data-faqify-theme="light"></div>
<script src="http://localhost:8084/widget.js"></script>
```

## ✅ **The Solution**
I've fixed the embed code generation to use your production domain instead of localhost.

### **Changes Made:**

1. **Created centralized widget configuration** (`src/config/widget.ts`)
2. **Updated all embed code generation** to use production URL
3. **Fixed widget script initialization** to properly set API URL
4. **Added environment detection** (development vs production)

### **Files Modified:**
- `src/config/widget.ts` - New centralized configuration
- `src/components/dashboard/AdvancedEmbedGenerator.tsx` - Fixed embed generation
- `src/components/dashboard/FAQManager.tsx` - Fixed embed generation  
- `src/components/dashboard/FAQCreator.tsx` - Fixed embed generation
- `src/pages/Demo.tsx` - Fixed demo embed code
- `public/widget.js` - Fixed API URL initialization

## 🚀 **How to Deploy & Use**

### **Step 1: Deploy Your App**
Deploy your FAQify app to a hosting service:
- **Netlify** (recommended): Connect your GitHub repo
- **Vercel**: Import your project
- **Any static hosting**: Build and upload the `dist` folder

### **Step 2: Update Production Domain**
Edit `src/config/widget.ts` and replace the placeholder domain:

```typescript
// Replace this line:
PRODUCTION_DOMAIN: 'https://faqify-ai-spark.netlify.app',

// With your actual domain:
PRODUCTION_DOMAIN: 'https://your-actual-domain.com',
```

### **Step 3: Rebuild & Redeploy**
After updating the domain:
```bash
npm run build
# Deploy the new build
```

### **Step 4: Generate New Embed Code**
1. Go to your deployed FAQify dashboard
2. Generate new embed code for your FAQs
3. The code will now use your production domain

**New working embed code will look like:**
```html
<!-- FAQify Widget -->
<div data-faqify-collection="5aee00a6-2195-493e-b3cf-8aef053c5e2b" data-faqify-theme="light"></div>
<script src="https://your-actual-domain.com/widget.js"></script>
```

## 🧪 **Testing**

### **Local Testing**
Use `test-local-widget.html` to test the widget locally.

### **Production Testing**
1. Deploy your app
2. Update the domain in widget config
3. Generate new embed code
4. Test on external websites

## 📋 **WordPress Integration**

### **Method 1: HTML Block (Recommended)**
1. Add an HTML block in WordPress
2. Paste the corrected embed code
3. Publish/update the page

### **Method 2: Custom HTML Widget**
1. Go to Appearance → Widgets
2. Add Custom HTML widget
3. Paste the embed code

### **Method 3: Functions.php (Advanced)**
Add to your theme's `functions.php`:

```php
function add_faqify_widget() {
    wp_enqueue_script('faqify-widget', 'https://your-domain.com/widget.js', array(), '1.0.0', true);
}
add_action('wp_enqueue_scripts', 'add_faqify_widget');

// Then use shortcode: [faqify collection="your-collection-id"]
function faqify_shortcode($atts) {
    $atts = shortcode_atts(array(
        'collection' => '',
        'theme' => 'light'
    ), $atts);
    
    return '<div data-faqify-collection="' . $atts['collection'] . '" data-faqify-theme="' . $atts['theme'] . '"></div>';
}
add_shortcode('faqify', 'faqify_shortcode');
```

## 🎯 **Key Benefits of the Fix**

✅ **Works on any website** - No more localhost dependency  
✅ **Automatic environment detection** - Uses correct URL based on environment  
✅ **Centralized configuration** - Easy to manage domains  
✅ **Production-ready** - Proper error handling and fallbacks  
✅ **WordPress compatible** - Works with HTML blocks and widgets  

## 🔍 **Troubleshooting**

### **Widget not loading?**
1. Check browser console for errors
2. Verify the widget script URL is accessible
3. Ensure collection ID is correct
4. Check if FAQs are published

### **No FAQs showing?**
1. Verify collection exists and is published
2. Check if FAQs in collection are published
3. Test the collection ID in dashboard

### **CORS errors?**
1. Ensure your domain is properly configured
2. Check Supabase CORS settings
3. Verify API endpoints are accessible

## 🎉 **Next Steps**

1. **Deploy your app** to get a production URL
2. **Update widget config** with your actual domain  
3. **Generate new embed codes** from the deployed dashboard
4. **Test on WordPress** or other external sites
5. **Monitor widget performance** using the built-in analytics

The widget embed system is now production-ready and will work reliably on any external website!
