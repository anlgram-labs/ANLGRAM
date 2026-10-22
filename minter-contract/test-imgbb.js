const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

async function testImgbb2() {
  console.log('Testing upload to ImgBB with key 6d2...bc...');
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream('../test-logo.jpg'));

    const key = '6d207e02111d8e40fcfd8fb6990416bc';
    const res = await axios.post(`https://api.imgbb.com/1/upload?key=${key}`, form, {
      headers: form.getHeaders()
    });

    console.log('Success! Image URL:', res.data.data.url);
  } catch (err) {
    console.error('Error during upload:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
}

testImgbb2();
