const fs = require('fs');
const d = JSON.parse(fs.readFileSync('build/anlgram-factory.compiled.json', 'utf-8'));
// func-js returns codeBoc as base64 string directly
console.log('hex field type:', typeof d.hex);
console.log('hex starts with:', d.hex.slice(0, 40));
// Try to see if it's already base64
const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(d.hex.replace(/\s/g,''));
console.log('Is valid base64:', isBase64);
// If already base64, just use it directly
if (isBase64) {
  console.log('BASE64_BOC=' + d.hex);
  fs.writeFileSync('factory-boc-b64.txt', d.hex);
  console.log('Saved to factory-boc-b64.txt');
}
