const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// Parse .env.local file
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const accountSid = envVars.TWILIO_ACCOUNT_SID;
const authToken = envVars.TWILIO_AUTH_TOKEN;
const phoneNumber = envVars.TWILIO_PHONE_NUMBER;

console.log('Testing Twilio Authentication...\n');
console.log('Account SID:', accountSid);
console.log('Phone Number:', phoneNumber);
console.log('Auth Token:', authToken ? '***' + authToken.slice(-4) : 'NOT SET');
console.log('\n');

const client = twilio(accountSid, authToken);

async function testAuth() {
  try {
    console.log('Attempting to fetch account info...');
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log('✅ Authentication successful!');
    console.log('Account Status:', account.status);
    console.log('Account Name:', account.friendlyName);
  } catch (error) {
    console.error('❌ Authentication failed!');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Status:', error.status);

    if (error.status === 403) {
      console.log('\n⚠️  HTTP 403 Forbidden - Possible causes:');
      console.log('   1. Invalid or expired Auth Token');
      console.log('   2. Account has been suspended or restricted');
      console.log('   3. Account requires secondary authentication');
      console.log('   4. API access has been disabled for this account');
      console.log('\n💡 Try:');
      console.log('   - Log into console.twilio.com and verify account status');
      console.log('   - Generate a new Auth Token from Account Settings');
      console.log('   - Check if your trial account has expired');
    }

    if (error.status === 401) {
      console.log('\n⚠️  HTTP 401 Unauthorized - Your credentials are incorrect');
      console.log('   - Verify TWILIO_ACCOUNT_SID matches your Account SID');
      console.log('   - Verify TWILIO_AUTH_TOKEN is correct');
    }
  }
}

testAuth();
