
const fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
const base=process.env.TEST_BASE||'http://127.0.0.1:8787',origin='https://hafnia-control-auth.sylvestweb.workers.dev';
const secret=JSON.parse(fs.readFileSync('.hafnia-private/local-test.json','utf8'));let cookie='';
let count=0;const password=crypto.randomBytes(24).toString('hex'),next=crypto.randomBytes(24).toString('hex');
async function call(route,body,expected=200,extra={}){const r=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});assert.equal(r.status,expected,route+': '+await r.clone().text());count++;return r}
(async()=>{
await call('/api/content',undefined,401);
await call('/api/setup',{setupKey:'invalid',password},403);
await call('/api/setup',{setupKey:secret.SETUP_KEY,password});
await call('/api/setup',{setupKey:secret.SETUP_KEY,password},409);
await call('/api/login',{password:'wrong'},401);
let r=await call('/api/login',{password});cookie=r.headers.get('set-cookie').split(';')[0];
assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.match(cookie,/^__Host-/);
const initial=await(await call('/api/content')).json();
await call('/api/content',{...initial,four_hours:2600,full_day:3600});
assert.equal((await(await call('/api/public')).json()).four_hours,2600);
await call('/api/content',{...initial,four_hours:-1},400);
await call('/api/upload',{type:'image/png',data:Buffer.from('not an image').toString('base64')},400);
r=await call('/api/upload',{type:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII='});
const image=(await r.json()).url;
await call('/api/content',{...initial,gallery:[...initial.gallery,image]});
r=await call(new URL(image).pathname);assert.equal(r.headers.get('content-type'),'image/png');
await call('/api/content',initial);
await call('/api/password',{oldPassword:password,newPassword:next});
await call('/api/content',undefined,401);
cookie='';await call('/api/login',{password},401);
r=await call('/api/login',{password:next});cookie=r.headers.get('set-cookie').split(';')[0];
await call('/api/content',undefined,200);
await call('/api/content',initial,403,{origin:'https://attacker.example'});
await call('/api/content',initial,403,{origin:''});
await call('/api/logout',{});await call('/api/content',undefined,401);assert.match((await call('/admin')).headers.get('content-security-policy'),/frame-ancestors 'none'/);
cookie='';
let limited=false;for(let i=0;i<12;i++){r=await fetch(base+'/api/login',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({password:'wrong'})});if(r.status===429){limited=true;break}}assert.ok(limited);count++;
console.log('PASS '+count+' checks: setup, login, secure cookie, prices, image upload/read/removal, validation, password rotation/session revocation, CSRF, logout, CSP and rate limit. LOCAL DATA ONLY.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
