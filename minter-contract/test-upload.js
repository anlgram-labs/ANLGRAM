const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

async function testUpload() {
  console.log('Testing upload to telegra.ph via corsproxy.io...');
  try {
    const form = new FormData();
    // Use the test-logo.jpg we copied earlier
    form.append('file', fs.createReadStream('../test-logo.jpg'));

    const proxyUrl = 'https://corsproxy.io/?url=' + encodeURIComponent('https://telegra.ph/upload');
    const res = await axios.post(proxyUrl, form, {
      headers: form.getHeaders()
    });

    console.log('Success! Response status:', res.status);
    console.log('Response data:', res.data);
  } catch (err) {
    console.error('Error during upload:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
  }
}

testUpload();
