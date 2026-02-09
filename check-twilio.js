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

const client = twilio(accountSid, authToken);

async function checkTwilioConfig() {
  console.log('🔍 Checking Twilio Configuration...\n');

  try {
    // 1. Check Account Status
    console.log('📋 ACCOUNT INFO:');
    const account = await client.api.accounts(accountSid).fetch();
    console.log(`   Status: ${account.status}`);
    console.log(`   Type: ${account.type}`);
    console.log(`   Friendly Name: ${account.friendlyName}\n`);

    // 2. Check Phone Number Details
    console.log('📞 PHONE NUMBER CONFIGURATION:');
    const numbers = await client.incomingPhoneNumbers.list();
    const ourNumber = numbers.find(n => n.phoneNumber === phoneNumber);

    if (!ourNumber) {
      console.log(`   ❌ Phone number ${phoneNumber} not found in account!`);
      console.log(`   Available numbers:`);
      numbers.forEach(n => console.log(`      - ${n.phoneNumber}`));
    } else {
      console.log(`   Number: ${ourNumber.phoneNumber}`);
      console.log(`   Friendly Name: ${ourNumber.friendlyName}`);
      console.log(`   \n   📱 CAPABILITIES:`);
      console.log(`      Voice: ${ourNumber.capabilities.voice ? '✅' : '❌'}`);
      console.log(`      SMS: ${ourNumber.capabilities.sms ? '✅' : '❌'}`);
      console.log(`      MMS: ${ourNumber.capabilities.mms ? '✅' : '❌'}`);

      console.log(`   \n   🔗 WEBHOOK CONFIGURATION:`);
      console.log(`      Voice URL: ${ourNumber.voiceUrl || '(not set)'}`);
      console.log(`      Voice Method: ${ourNumber.voiceMethod || 'POST'}`);
      console.log(`      SMS URL: ${ourNumber.smsUrl || '(not set)'}`);
      console.log(`      SMS Method: ${ourNumber.smsMethod || 'POST'}`);
      console.log(`      Status Callback: ${ourNumber.statusCallback || '(not set)'}`);

      console.log(`   \n   ⚙️  OTHER SETTINGS:`);
      console.log(`      Address Required: ${ourNumber.addressRequirements || 'none'}`);
      console.log(`      Emergency Enabled: ${ourNumber.emergencyStatus || 'inactive'}`);
    }

    // 3. Check Messaging Services
    console.log('\n💬 MESSAGING SERVICES:');
    const messagingServices = await client.messaging.v1.services.list();
    if (messagingServices.length === 0) {
      console.log('   ℹ️  No messaging services configured (not required for basic SMS)');
    } else {
      messagingServices.forEach((service, idx) => {
        console.log(`   ${idx + 1}. ${service.friendlyName}`);
        console.log(`      SID: ${service.sid}`);
        console.log(`      Inbound Request URL: ${service.inboundRequestUrl || '(not set)'}`);
        console.log(`      Status Callback URL: ${service.statusCallback || '(not set)'}`);
      });
    }

    // 4. Check recent messages
    console.log('\n📨 RECENT MESSAGES (last 5):');
    const messages = await client.messages.list({ limit: 5 });
    if (messages.length === 0) {
      console.log('   No messages sent yet');
    } else {
      messages.forEach((msg, idx) => {
        console.log(`   ${idx + 1}. ${msg.direction} | ${msg.from} → ${msg.to}`);
        console.log(`      Status: ${msg.status} | ${msg.dateCreated}`);
        console.log(`      Body: ${msg.body?.substring(0, 50)}${msg.body?.length > 50 ? '...' : ''}`);
      });
    }

    console.log('\n✅ Twilio configuration check complete!\n');

    // 5. Recommendations
    console.log('💡 RECOMMENDATIONS:');
    if (!ourNumber?.smsUrl) {
      console.log('   ⚠️  SMS webhook not configured - you need to set this up for incoming messages');
      console.log('      Recommended URL: https://yourdomain.com/api/sms/webhook');
    }
    if (ourNumber?.capabilities.sms) {
      console.log('   ✅ SMS is enabled and ready to use!');
    }

  } catch (error) {
    console.error('❌ Error checking Twilio config:', error.message);
    if (error.code === 20003) {
      console.error('   Authentication failed - check your ACCOUNT_SID and AUTH_TOKEN');
    }
  }
}

checkTwilioConfig();
