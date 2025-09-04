import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read environment variables from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });

  return envVars;
}

async function deployEnvironmentVariables() {
  console.log('🚀 Deploying Environment Variables to Supabase...\n');

  try {
    const envVars = loadEnvFile();
    
    // Check if DEEPSEEK_API_KEY exists
    if (!envVars.DEEPSEEK_API_KEY || envVars.DEEPSEEK_API_KEY === 'your_deepseek_api_key') {
      console.error('❌ DEEPSEEK_API_KEY not found or not configured in .env file');
      console.log('Please set a valid OpenRouter API key in your .env file');
      process.exit(1);
    }

    console.log('📋 Environment variables to deploy:');
    console.log(`   DEEPSEEK_API_KEY: ${envVars.DEEPSEEK_API_KEY.substring(0, 10)}...`);
    
    // Deploy DEEPSEEK_API_KEY to Supabase
    console.log('\n🔧 Setting DEEPSEEK_API_KEY in Supabase...');
    
    try {
      execSync(`npx supabase secrets set DEEPSEEK_API_KEY="${envVars.DEEPSEEK_API_KEY}"`, {
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log('✅ DEEPSEEK_API_KEY deployed successfully');
    } catch (error) {
      console.error('❌ Failed to deploy DEEPSEEK_API_KEY:', error.message);
      console.log('\n💡 Alternative: Set the secret manually using:');
      console.log(`   npx supabase secrets set DEEPSEEK_API_KEY="${envVars.DEEPSEEK_API_KEY}"`);
    }

    // Redeploy the analyze-content function to pick up the new environment variable
    console.log('\n🔄 Redeploying analyze-content function...');
    
    try {
      execSync('npx supabase functions deploy analyze-content', {
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log('✅ analyze-content function redeployed successfully');
    } catch (error) {
      console.error('❌ Failed to redeploy function:', error.message);
      console.log('\n💡 Try redeploying manually using:');
      console.log('   npx supabase functions deploy analyze-content');
    }

    console.log('\n🎉 Environment variable deployment complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Test FAQ generation to verify it\'s working');
    console.log('2. Check the function logs if issues persist');
    console.log('3. Verify the API key is valid in your OpenRouter account');

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Check if Supabase CLI is available
function checkSupabaseCLI() {
  try {
    execSync('npx supabase --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    console.error('❌ Supabase CLI not found. Please install it first:');
    console.log('   npm install -g supabase');
    return false;
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!checkSupabaseCLI()) {
    process.exit(1);
  }

  deployEnvironmentVariables();
}

export { deployEnvironmentVariables, loadEnvFile };
