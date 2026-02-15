const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
// Service Role Key
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Testing Supabase Admin connection...');
    try {
        const { data, error } = await supabase.from('properties').select('count').limit(1);
        if (error) {
            console.error('Connection failed:', error.message);
            if (error.hint) console.error('Hint:', error.hint);
        } else {
            console.log('Admin Connection successful!');
            console.log('Data:', data);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();
