const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyODAyNzAsImV4cCI6MjA4NTg1NjI3MH0.VF-4gaO_r6N-jpMVjTw9c97XcKzsAhlA1VsAj3LmyrQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    console.log('Testing Supabase connection...');
    try {
        const { data, error } = await supabase.from('properties').select('count').limit(1);
        if (error) {
            console.error('Connection failed:', error.message);
            if (error.hint) console.error('Hint:', error.hint);
        } else {
            console.log('Connection successful!');
            console.log('Data:', data);
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

testConnection();
