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

console.log('🧪 Testing SMS Integration\n');
console.log('Account:', accountSid);
console.log('From Number:', phoneNumber);
console.log('\n');

const client = twilio(accountSid, authToken);

async function testSMSIntegration() {
  console.log('═══════════════════════════════════════════');
  console.log('SMS Integration Test');
  console.log('═══════════════════════════════════════════\n');

  try {
    // Step 1: Check Campaign Status
    console.log('Step 1: Checking A2P Campaign Status...');
    const campaigns = await client.messaging.v1.services.list();

    if (campaigns.length > 0) {
      console.log('✅ Found', campaigns.length, 'messaging service(s)');
      campaigns.forEach(service => {
        console.log('   Service:', service.friendlyName);
        console.log('   SID:', service.sid);
      });
    } else {
      console.log('⚠️  No messaging services found yet');
      console.log('   Campaign is still being processed');
    }

    console.log('\n');

    // Step 2: Check Phone Number Capabilities
    console.log('Step 2: Checking Phone Number...');
    const numbers = await client.incomingPhoneNumbers.list();
    const ourNumber = numbers.find(n => n.phoneNumber === phoneNumber);

    if (ourNumber) {
      console.log('✅ Phone Number Found');
      console.log('   Number:', ourNumber.phoneNumber);
      console.log('   SMS Enabled:', ourNumber.capabilities.sms ? '✅' : '❌');
      console.log('   MMS Enabled:', ourNumber.capabilities.mms ? '✅' : '❌');
      console.log('\n   Webhooks:');
      console.log('   SMS URL:', ourNumber.smsUrl || '❌ Not configured');
      console.log('   Status Callback:', ourNumber.statusCallback || '❌ Not configured');
    } else {
      console.log('❌ Phone number not found');
    }

    console.log('\n');

    // Step 3: Send Test SMS (commented out by default)
    console.log('Step 3: SMS Send Test');
    console.log('⚠️  Test SMS sending is commented out');
    console.log('   To test sending, uncomment the code below and replace the number');
    console.log('   Example:');
    console.log('   ```javascript');
    console.log('   const message = await client.messages.create({');
    console.log('     body: "Test from NextGen Realty SMS Integration",');
    console.log('     from: phoneNumber,');
    console.log('     to: "+12345678900" // Replace with your test number');
    console.log('   });');
    console.log('   console.log("✅ SMS sent!", message.sid);');
    console.log('   ```');

    // Uncomment below to test sending SMS
    /*
    console.log('\n🚀 Sending test SMS...');
    const message = await client.messages.create({
      body: 'Test message from NextGen Realty SMS Integration',
      from: phoneNumber,
      to: '+12345678900' // Replace with your test number
    });
    console.log('✅ SMS Sent Successfully!');
    console.log('   Message SID:', message.sid);
    console.log('   Status:', message.status);
    */

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ Integration Test Complete!');
    console.log('═══════════════════════════════════════════\n');

    console.log('📋 Next Steps:');
    console.log('   1. Wait for A2P campaign approval (1-5 days)');
    console.log('   2. Configure webhooks in Twilio Console');
    console.log('   3. Deploy your app to production');
    console.log('   4. Update webhook URLs to point to your domain');
    console.log('   5. Test sending/receiving SMS');
    console.log('\n📖 See SMS_INTEGRATION_GUIDE.md for detailed instructions\n');

  } catch (error) {
    console.log('❌ Test Failed\n');
    console.log('Error Code:', error.code);
    console.log('Error Message:', error.message);
    console.log('HTTP Status:', error.status);
    console.log('\n');

    if (error.status === 403) {
      console.log('🚫 Account Restricted');
      console.log('   This usually means:');
      console.log('   1. A2P campaign is not yet approved');
      console.log('   2. Account has restrictions');
      console.log('   3. Need to wait for campaign review (1-5 days)');
    } else if (error.code === 21608) {
      console.log('📱 SMS Not Enabled');
      console.log('   Phone number cannot send SMS yet');
      console.log('   Wait for A2P campaign approval');
    }
  }
}

testSMSIntegration();
