const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');

async function testPixeldrain() {
  console.log('Testing upload to Pixeldrain...');
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('../test-logo.jpg'));
    
    // Pixeldrain accepts 'file' parameter or just raw binary body
    const res = await axios.post('https://pixeldrain.com/api/file', form, {
      headers: form.getHeaders()
    });

    console.log('Success! Response data:', res.data);
    if (res.data && res.data.id) {
      console.log('Direct image link: https://pixeldrain.com/api/file/' + res.data.id);
    }
  } catch (err) {
    console.error('Error during upload:', err.message);
    if (err.response) {
      console.error('Response data:', err.response.data);
    }
  }
}

testPixeldrain();
