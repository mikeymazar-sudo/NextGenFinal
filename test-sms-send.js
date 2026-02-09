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

console.log('🧪 Testing Twilio SMS Capabilities\n');
console.log('Account:', accountSid);
console.log('From Number:', phoneNumber);
console.log('\n');

const client = twilio(accountSid, authToken);

async function testSMSCapability() {
  console.log('═══════════════════════════════════════════');
  console.log('Checking SMS Send Capability');
  console.log('═══════════════════════════════════════════\n');

  try {
    // Try to send a test SMS to the same number (will give us specific error)
    console.log('Attempting to send test SMS...');
    console.log('(Note: Sending to the same number to avoid charges)\n');

    const message = await client.messages.create({
      body: 'Test SMS from NextGen Realty',
      from: phoneNumber,
      to: phoneNumber // Send to itself as a test
    });

    console.log('✅ SMS SENT SUCCESSFULLY!');
    console.log('   Message SID:', message.sid);
    console.log('   Status:', message.status);
    console.log('   From:', message.from);
    console.log('   To:', message.to);
    console.log('\n🎉 Your Twilio SMS is working perfectly!');

  } catch (error) {
    console.log('❌ SMS Send Failed\n');
    console.log('Error Code:', error.code);
    console.log('Error Message:', error.message);
    console.log('HTTP Status:', error.status);
    console.log('\n');

    // Provide specific guidance based on error code
    if (error.code === 20003 || error.status === 401) {
      console.log('🔐 AUTHENTICATION ERROR');
      console.log('   Your Account SID or Auth Token is invalid');
      console.log('   → Log into console.twilio.com');
      console.log('   → Go to Account → API keys & tokens');
      console.log('   → Create a new Auth Token');
    }
    else if (error.code === 21608) {
      console.log('📱 PHONE NUMBER NOT SMS CAPABLE');
      console.log('   This phone number cannot send SMS messages');
      console.log('   → Check phone number capabilities in Twilio console');
      console.log('   → You may need to buy an SMS-capable number');
    }
    else if (error.code === 21211) {
      console.log('📵 INVALID PHONE NUMBER');
      console.log('   The "To" number is not valid');
      console.log('   → Verify phone number format (+1XXXXXXXXXX)');
    }
    else if (error.status === 403) {
      console.log('🚫 ACCOUNT SUSPENDED OR RESTRICTED');
      console.log('   Your Twilio account has been restricted');
      console.log('   → Check account status at console.twilio.com');
      console.log('   → Verify billing information is up to date');
      console.log('   → Check if trial account needs upgrade');
      console.log('   → Look for account suspension notices');
    }
    else if (error.code === 20429 || error.status === 429) {
      console.log('⏱️  RATE LIMIT EXCEEDED');
      console.log('   Too many requests - wait a moment and try again');
    }
    else if (error.code === 21606) {
      console.log('📍 GEOGRAPHIC PERMISSIONS');
      console.log('   Your account cannot send to this country');
      console.log('   → Enable geographic permissions in Twilio console');
    }
    else if (error.code === 20404) {
      console.log('🔍 PHONE NUMBER NOT FOUND');
      console.log('   The FROM number doesn\'t exist in your account');
      console.log('   → Verify TWILIO_PHONE_NUMBER in .env.local');
      console.log('   → Check Active Numbers in Twilio console');
    }
    else {
      console.log('❓ UNKNOWN ERROR');
      console.log('   Check Twilio console for account status');
      console.log('   Error details above may provide clues');
    }
  }
}

testSMSCapability();
