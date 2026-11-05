import {confirmInitialization} from './projects/standard-init-confirmation.mjs';

const request={wallet:{address:'DIAGNOSTIC ONLY - no wallet operation'},
  quote:{network:'-3',fingerprint:'00'.repeat(32),validUntil:Math.floor(Date.now()/1000)+45}};
console.log('Opening the diagnostic window. If you see it, click Cancel. No wallet operation is available.');
try {
  await confirmInitialization(request,{dialog:true});
  console.log('DIALOG_RESPONSE_RECEIVED');
} catch(error) {
  if(error.message==='Owner cancelled')console.log('DIALOG_CANCELLED');
  else {
    console.error(error.message.includes('expired')?'DIALOG_TIMED_OUT':'DIALOG_UNAVAILABLE');
    process.exitCode=1;
  }
}
