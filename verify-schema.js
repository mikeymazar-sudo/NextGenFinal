const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vevgcwtruyvdjlcvnuhu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZldmdjd3RydXl2ZGpsY3ZudWh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4MDI3MCwiZXhwIjoyMDg1ODU2MjcwfQ.nVQOe_48V7ybCxZgwObT9VxEBdW0_mXlxjqYZ8jKZDQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifySchema() {
    console.log('Verifying schema via Insert...');

    // Random address to avoid collision
    const testAddr = 'TEST_IMPORT_' + Date.now();

    const payload = {
        address: testAddr,
        created_by: '00000000-0000-0000-0000-000000000000', // Needs a valid UUID? Service role might bypass FK? 
        // Actually created_by usually links to auth.users. 
        // If I use a random UUID it might fail FK constraint if one exists.
        // Let's check schema.ts -> created_by is string.
        // But usually it's a FK.
        // I will try to fetch a user first.
    };

    // 1. Get a user ID to use
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    if (userError || !users.users.length) {
        console.error('Could not list users:', userError);
        return;
    }
    const userId = users.users[0].id;
    console.log('Using User ID:', userId);

    const row = {
        address: testAddr,
        city: 'Test City',
        state: 'FL',
        zip: '33333',
        created_by: userId,
        status: 'new',
        raw_realestate_data: { test: true, anything: 'goes' } // This is what we want to test
    };

    const { data, error } = await supabase
        .from('properties')
        .insert(row)
        .select();

    if (error) {
        console.error('Insert Failed:', error);
        if (error.message.includes('column "raw_realestate_data" of relation "properties" does not exist')) {
            console.error('DIAGNOSIS: Column missing!');
        }
    } else {
        console.log('Insert Successful!', data);
        console.log('DIAGNOSIS: Column exists and works.');

        // Cleanup
        await supabase.from('properties').delete().eq('id', data[0].id);
        console.log('Cleanup done.');
    }
}

verifySchema();
