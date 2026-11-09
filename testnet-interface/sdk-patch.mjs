import {createHash} from 'node:crypto';
export const PIN='2aebf1039a9fd15e42b4229828bda288160c6610ed4166ce1fae24d0e7c4f880';
export function patchSdk(source,guardPath){
 if(createHash('sha256').update(source).digest('hex')!==PIN)throw Error('Unreviewed SDK source: stop build');
 const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('SDK patch context changed');return s.replace(a,b);};
 const start=source.indexOf('    sendTransaction(transaction, optionsOrOnRequestSent) {'),end=source.indexOf('    signData(data, options) {',start);
 if(start<0||end<0)throw Error('Missing SDK method');let method=source.slice(start,end);
 method=once(method,'return __awaiter(this, void 0, void 0, function* () {','return guardedMinterSend(transaction, this.wallet, optionsOrOnRequestSent, (guardedOptions) => __awaiter(this, void 0, void 0, function* () {\n            const optionsOrOnRequestSent = guardedOptions;');
 method=once(method,'{ onRequestSent: options.onRequestSent, signal: abortController.signal });','{ onRequestSent: options.onRequestSent, signal: abortController.signal, attempts: 1, ttl: Math.max(1, transaction.validUntil - Math.floor(Date.now()/1000)) });');
 if(!method.endsWith('        });\n    }\n'))throw Error('SDK method ending changed');method=method.slice(0,-'        });\n    }\n'.length)+'        }));\n    }\n';
 let patched=source.slice(0,start)+method+source.slice(end);
 patched=once(patched,'options.attempts = optionsOrOnRequestSent === null || optionsOrOnRequestSent === void 0 ? void 0 : optionsOrOnRequestSent.attempts;','options.attempts = optionsOrOnRequestSent === null || optionsOrOnRequestSent === void 0 ? void 0 : optionsOrOnRequestSent.attempts;\n            options.ttl = optionsOrOnRequestSent === null || optionsOrOnRequestSent === void 0 ? void 0 : optionsOrOnRequestSent.ttl;');
 patched=once(patched,'{ attempts: options === null || options === void 0 ? void 0 : options.attempts, signal: options === null || options === void 0 ? void 0 : options.signal });','{ attempts: options === null || options === void 0 ? void 0 : options.attempts, signal: options === null || options === void 0 ? void 0 : options.signal, ttl: options === null || options === void 0 ? void 0 : options.ttl });');
 // Financial topic gets one attempt even if called through another SDK path.
 patched=once(patched,'attempts: (_a = options === null || options === void 0 ? void 0 : options.attempts) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER,',"attempts: topic === 'sendTransaction' ? 1 : ((_a = options === null || options === void 0 ? void 0 : options.attempts) !== null && _a !== void 0 ? _a : Number.MAX_SAFE_INTEGER),");
 // A 307/308 redirect must not create another outbound financial POST.
 patched=once(patched,"method: 'post',\n                body: body,\n                signal: signal","method: 'post',\n                body: body,\n                ...(new URL(url).searchParams.get('topic') === 'sendTransaction' ? {redirect:'manual'} : {}),\n                signal: signal");
 return `import {guardedMinterSend} from ${JSON.stringify(guardPath)};\n`+patched;
}
