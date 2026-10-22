const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

async function testImgur() {
  console.log('Testing upload to Imgur...');
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream('../test-logo.jpg'));

    // A widely used public client-id
    const clientId = '546c2521c7d8d97'; 
    const res = await axios.post('https://api.imgur.com/3/image', form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Client-ID ${clientId}`
      }
    });

    console.log('Success! Image URL:', res.data.data.link);
  } catch (err) {
    console.error('Error during upload:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
}

testImgur();
