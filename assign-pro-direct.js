// Direct Pro plan assignment script
// This calls the edge function to assign Pro plan to faqify18@gmail.com

const supabaseUrl = 'https://dlzshcshqjdghmtzlbma.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsenNoY3NocWpkZ2htdHpsYm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExODUzODgsImV4cCI6MjA2Njc2MTM4OH0.EL4By0nom419JiorSHKiFckLqnh1sqmFvYnWTylB9Gk';

async function assignProPlan() {
    console.log('🚀 Assigning Pro plan to faqify18@gmail.com...');
    
    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/assign-pro-plan`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
                email: 'faqify18@gmail.com'
            })
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Success:', result.message);
            console.log('📊 Subscription:', result.subscription);
            console.log('\n🔄 Please refresh your dashboard to see the Pro plan!');
        } else {
            console.error('❌ Error:', result.error);
        }
        
    } catch (error) {
        console.error('❌ Exception:', error.message);
    }
}

// Run the assignment
assignProPlan();
