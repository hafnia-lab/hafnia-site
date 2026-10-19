import adminPage from './admin-page.js';
const te=new TextEncoder();
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0}
const json=(x,s=200,h={})=>new Response(JSON.stringify(x),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...h}});
const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
const ub=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
async function derive(p,s){const k=await crypto.subtle.importKey('raw',te.encode(p),'PBKDF2',false,['deriveBits']);return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:s,iterations:210000},k,256))}
async function check(p,h){if(!h||typeof p!=='string')return false;const [v,s]=h.split(':');if(!v||!s)return false;const a=await derive(p,ub(s)),b=ub(v);return equal(a,b)}
async function mac(v,k){const key=await crypto.subtle.importKey('raw',te.encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,te.encode(v))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
const origin='https://hafnia.tattoo';
const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-headers':'content-type','access-control-allow-methods':'GET,POST,OPTIONS','vary':'Origin'};
const initial={four_hours:2500,full_day:3500,gallery:['images/a12.jpg','images/a14.jpg','images/a1.jpg','images/9.jpg','images/a9.jpg','images/a6.jpg']};
async function session(req,env){const v=(req.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-hafnia_session=([^;]+)/)?.[1];const p=v?.split('.')||[];return p.length===2&&/^\d+$/.test(p[0])&&Number(p[0])>Date.now()&&equal(te.encode(await mac(p[0],env.SESSION_KEY)),te.encode(p[1]))}
const app={async fetch(req,env){const u=new URL(req.url);if(req.method==='OPTIONS')return new Response(null,{headers:cors});const requestedOrigin=req.headers.get('origin');if(req.method==='POST'&&requestedOrigin!=='https://hafnia-control-auth.sylvestweb.workers.dev')return json({error:'Origin denied'},403,cors);
try{
if(u.pathname==='/api/public'&&req.method==='GET'){const data=await env.SETTINGS.get('content','json');return json(data||initial,200,{...cors,'cache-control':'public,max-age=60'})}
if(u.pathname.startsWith('/media/')&&req.method==='GET'){const key=u.pathname.slice(7);if(!/^mobile-[a-f0-9-]+\.(jpg|png|webp)$/.test(key))return json({error:'Invalid image'},400,cors);const obj=await env.MEDIA.getWithMetadata(key,'arrayBuffer');if(!obj.value)return json({error:'Not found'},404,cors);return new Response(obj.value,{headers:{'content-type':obj.metadata?.type||'image/jpeg','cache-control':'public,max-age=3600','access-control-allow-origin':'*'}})}
const stored=await env.SETTINGS.get('password_hash');
if(u.pathname==='/api/setup'&&req.method==='POST'){if(stored)return json({error:'Already configured'},409,cors);const {setupKey,password}=await req.json();if(!env.SETUP_KEY||(typeof setupKey!=='string'||!equal(te.encode(setupKey),te.encode(env.SETUP_KEY)))||typeof password!=='string'||password.length<12||password.length>128)return json({error:'Invalid setup'},403,cors);const salt=crypto.getRandomValues(new Uint8Array(16));await env.SETTINGS.put('password_hash',b64(await derive(password,salt))+':'+b64(salt));return json({ok:true},200,cors)}
if(u.pathname==='/api/login'&&req.method==='POST'){const {password}=await req.json();if(typeof password!=='string'||password.length>128)return json({error:'Forkert adgangskode'},401,cors);if(!await check(password,stored))return json({error:'Forkert adgangskode'},401,cors);const exp=String(Date.now()+28800000);return json({ok:true},200,{...cors,'set-cookie':'__Host-hafnia_session='+exp+'.'+await mac(exp,env.SESSION_KEY)+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800'})}
if(u.pathname==='/api/logout'&&req.method==='POST')return json({ok:true},200,{...cors,'set-cookie':'__Host-hafnia_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});
if(!env.SESSION_KEY||!(await session(req,env)))return json({error:'Login required'},401,cors);
if(u.pathname==='/api/content'&&req.method==='GET')return json(await env.SETTINGS.get('content','json')||initial,200,cors);
if(u.pathname==='/api/content'&&req.method==='POST'){const d=await req.json();if(!Number.isInteger(d.four_hours)||!Number.isInteger(d.full_day)||d.four_hours<0||d.full_day<0||d.four_hours>1000000||d.full_day>1000000||!Array.isArray(d.gallery)||d.gallery.length>80||d.gallery.some(p=>typeof p!=='string'||!(/^(images\/[a-zA-Z0-9_.-]+|https:\/\/hafnia-control-auth\.sylvestweb\.workers\.dev\/media\/mobile-[a-f0-9-]+\.(jpg|png|webp))$/.test(p))))return json({error:'Invalid content'},400,cors);await env.SETTINGS.put('content',JSON.stringify({four_hours:d.four_hours,full_day:d.full_day,gallery:d.gallery}));return json({ok:true},200,cors)}
if(u.pathname==='/api/upload'&&req.method==='POST'){const d=await req.json();if(!['image/jpeg','image/png','image/webp'].includes(d.type)||typeof d.data!=='string'||d.data.length>11000000)return json({error:'Invalid image'},400,cors);const bytes=ub(d.data);const valid=d.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:d.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v):String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';if(!valid)return json({error:'Invalid image format'},400,cors);if(bytes.byteLength>8e6)return json({error:'Image too large'},413,cors);const ext=d.type==='image/jpeg'?'jpg':d.type==='image/png'?'png':'webp';const key='mobile-'+crypto.randomUUID()+'.'+ext;await env.MEDIA.put(key,bytes,{metadata:{type:d.type}});return json({url:'https://hafnia-control-auth.sylvestweb.workers.dev/media/'+key},200,cors)}
if(u.pathname==='/api/password'&&req.method==='POST'){const {oldPassword,newPassword}=await req.json();if(!await check(oldPassword,stored))return json({error:'Forkert nuværende kode'},403,cors);if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)return json({error:'Mindst 12 tegn'},400,cors);const salt=crypto.getRandomValues(new Uint8Array(16));await env.SETTINGS.put('password_hash',b64(await derive(newPassword,salt))+':'+b64(salt));return json({ok:true},200,cors)}
return json({error:'Not found'},404,cors)
}catch(e){return json({error:'Server error'},500,cors)}
}};
const host='https://hafnia-control-auth.sylvestweb.workers.dev';
export class AuthState {
 constructor(ctx,env){this.ctx=ctx;this.env=env}
 async fetch(req){return this.ctx.blockConcurrencyWhile(async()=>{
  const route=new URL(req.url).pathname;
  if(!this.env.SESSION_KEY||!this.env.SETUP_KEY)return json({error:'Login is not configured'},503);
  if(req.method==='POST'&&req.headers.get('origin')!==host)return json({error:'Origin denied'},403);
  if(req.method==='POST'&&!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  if(Number(req.headers.get('content-length')||0)>(route==='/api/upload'?11001000:32000))return json({error:'Request too large'},413);
  if(['/api/login','/api/setup','/api/password'].includes(route)&&req.method==='POST'){
   const now=Date.now(), ip=req.headers.get('CF-Connecting-IP')||'unknown';
   const keys=['rate:global','rate:'+await mac(ip,this.env.SESSION_KEY)];
   for(const key of keys){let v=await this.ctx.storage.get(key);if(!v||v.until<now)v={count:0,until:now+900000};if(v.count>=(key==='rate:global'?100:10))return json({error:'For mange forsøg. Vent 15 minutter.'},429,{'retry-after':'900'});}
   for(const key of keys){let v=await this.ctx.storage.get(key);if(!v||v.until<now)v={count:0,until:now+900000};v.count++;await this.ctx.storage.put(key,v);}
   await this.ctx.storage.setAlarm(now+901000);
  }
  const kv=this.env.SETTINGS, store=this.ctx.storage;
  const settings={get:(key,...args)=>key==='password_hash'?store.get(key):kv.get(key,...args),put:(key,value,...args)=>key==='password_hash'?store.put(key,value):kv.put(key,value,...args)};
  const hash=(await store.get('password_hash')||'unconfigured')+':'+(await store.get('session_epoch')||'0');
  if(route==='/api/logout'&&req.method==='POST')await store.put('session_epoch',crypto.randomUUID());
  return app.fetch(req,{...this.env,SETTINGS:settings,SESSION_KEY:await mac(hash,this.env.SESSION_KEY)});
 })}
 async alarm(){const entries=await this.ctx.storage.list({prefix:'rate:'});for(const [key,value] of entries)if(value.until<Date.now())await this.ctx.storage.delete(key);}
}
export default {async fetch(req,env){
 const url=new URL(req.url);let response;
 if(req.method==='POST'){const limit=url.pathname==='/api/upload'?11001000:32000;let size=0;const chunks=[];const reader=req.body?.getReader();if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return json({error:'Request too large'},413)}chunks.push(value)}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}req=new Request(req,{body:bytes})}}
 if(['/','/admin','/admin.html','/setup'].includes(url.pathname)&&req.method==='GET'){
  response=new Response(adminPage,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://hafnia.tattoo https://hafnia-control-auth.sylvestweb.workers.dev; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"}});
 }else if(url.pathname==='/api/public'||url.pathname.startsWith('/media/'))response=await app.fetch(req,env);
 else response=await env.AUTH.get(env.AUTH.idFromName('hafnia-admin-v1')).fetch(req);
 const out=new Response(response.body,response);out.headers.set('x-content-type-options','nosniff');out.headers.set('referrer-policy','no-referrer');out.headers.set('x-frame-options','DENY');out.headers.set('strict-transport-security','max-age=31536000');return out;
}};
