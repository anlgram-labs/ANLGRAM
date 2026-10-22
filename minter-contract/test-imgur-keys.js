const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

const keys = [
  'e78b776269df16a',
  '95147573d82a4d3',
  'c02279b30c5e31d',
  '52e5d95eefc3bf8',
  '2d7335d259c687e',
  '3a2b72c91c3be2d'
];

async function testKeys() {
  console.log('Testing Imgur Client-IDs...');
  for (const k of keys) {
    try {
      const form = new FormData();
      form.append('image', fs.createReadStream('../test-logo.jpg'));
      const res = await axios.post('https://api.imgur.com/3/image', form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Client-ID ${k}`
        }
      });
      console.log(`Success with key ${k}! Link:`, res.data.data.link);
      return;
    } catch (err) {
      console.log(`Key ${k} failed: ${err.message} (status: ${err.response ? err.response.status : 'no response'})`);
    }
  }
}

testKeys();
