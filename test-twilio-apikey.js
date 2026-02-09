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
const apiKeySid = envVars.TWILIO_API_KEY_SID;
const apiKeySecret = envVars.TWILIO_API_KEY_SECRET;
const phoneNumber = envVars.TWILIO_PHONE_NUMBER;

console.log('🔍 Testing Twilio Configuration...\n');
console.log('Account SID:', accountSid);
console.log('Auth Token:', authToken ? '***' + authToken.slice(-4) : 'NOT SET');
console.log('API Key SID:', apiKeySid);
console.log('API Key Secret:', apiKeySecret ? '***' + apiKeySecret.slice(-4) : 'NOT SET');
console.log('Phone Number:', phoneNumber);
console.log('\n');

async function testWithAuthToken() {
  console.log('═══════════════════════════════════════════');
  console.log('Test 1: Using Auth Token');
  console.log('═══════════════════════════════════════════\n');

  try {
    const client = twilio(accountSid, authToken);
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log('✅ Auth Token works!');
    console.log('   Account Status:', account.status);
    console.log('   Account Name:', account.friendlyName);
    return client;
  } catch (error) {
    console.log('❌ Auth Token failed');
    console.log('   Error:', error.message);
    console.log('   Status:', error.status);
    return null;
  }
}

async function testWithApiKey() {
  console.log('\n═══════════════════════════════════════════');
  console.log('Test 2: Using API Key');
  console.log('═══════════════════════════════════════════\n');

  try {
    const client = twilio(apiKeySid, apiKeySecret, { accountSid });
    const account = await client.api.v2010.accounts(accountSid).fetch();
    console.log('✅ API Key works!');
    console.log('   Account Status:', account.status);
    console.log('   Account Name:', account.friendlyName);
    return client;
  } catch (error) {
    console.log('❌ API Key failed');
    console.log('   Error:', error.message);
    console.log('   Status:', error.status);
    return null;
  }
}

async function checkPhoneNumber(client) {
  if (!client) return;

  console.log('\n═══════════════════════════════════════════');
  console.log('Phone Number Configuration');
  console.log('═══════════════════════════════════════════\n');

  try {
    const numbers = await client.incomingPhoneNumbers.list();
    const ourNumber = numbers.find(n => n.phoneNumber === phoneNumber);

    if (!ourNumber) {
      console.log('❌ Phone number not found:', phoneNumber);
      console.log('\n📞 Available numbers:');
      numbers.forEach(n => console.log('   -', n.phoneNumber));
      return;
    }

    console.log('📱 Number:', ourNumber.phoneNumber);
    console.log('   Friendly Name:', ourNumber.friendlyName);
    console.log('\n🎯 Capabilities:');
    console.log('   Voice:', ourNumber.capabilities.voice ? '✅' : '❌');
    console.log('   SMS:', ourNumber.capabilities.sms ? '✅' : '❌');
    console.log('   MMS:', ourNumber.capabilities.mms ? '✅' : '❌');

    console.log('\n🔗 Webhooks:');
    console.log('   Voice URL:', ourNumber.voiceUrl || '(not set)');
    console.log('   SMS URL:', ourNumber.smsUrl || '(not set)');
    console.log('   Status Callback:', ourNumber.statusCallback || '(not set)');

    if (ourNumber.capabilities.sms) {
      console.log('\n✅ SMS is ENABLED and ready!');
      if (!ourNumber.smsUrl) {
        console.log('⚠️  But SMS webhook is not configured');
        console.log('   You\'ll need to set this for incoming messages');
      }
    } else {
      console.log('\n❌ SMS is NOT enabled on this number');
    }

  } catch (error) {
    console.log('❌ Error checking phone number:', error.message);
  }
}

async function testSendSMS(client) {
  if (!client) return;

  console.log('\n═══════════════════════════════════════════');
  console.log('SMS Send Test (Dry Run)');
  console.log('═══════════════════════════════════════════\n');

  console.log('✅ Ready to send SMS from:', phoneNumber);
  console.log('   Use this format to send:');
  console.log('   await client.messages.create({');
  console.log('     body: "Your message here",');
  console.log('     from: "' + phoneNumber + '",');
  console.log('     to: "+1234567890"');
  console.log('   });');
}

async function main() {
  let workingClient = null;

  // Test auth token first
  workingClient = await testWithAuthToken();

  // If auth token fails, try API key
  if (!workingClient) {
    workingClient = await testWithApiKey();
  }

  // If we have a working client, check phone number
  if (workingClient) {
    await checkPhoneNumber(workingClient);
    await testSendSMS(workingClient);

    console.log('\n═══════════════════════════════════════════');
    console.log('✅ Twilio Configuration Check Complete!');
    console.log('═══════════════════════════════════════════\n');
  } else {
    console.log('\n═══════════════════════════════════════════');
    console.log('❌ Unable to authenticate with Twilio');
    console.log('═══════════════════════════════════════════');
    console.log('\n💡 Next steps:');
    console.log('   1. Log into console.twilio.com');
    console.log('   2. Verify account is active');
    console.log('   3. Generate new credentials if needed');
  }
}

main();
