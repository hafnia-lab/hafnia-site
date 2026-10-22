/* Refresh crawlable public HTML from the same admin API used by the browser. No invented content. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('sharp');
const ROOT=__dirname,BASE='https://hafnia-control-auth.sylvestweb.workers.dev';
const imageOk=p=>typeof p==='string'&&(/^images\/[a-zA-Z0-9_.-]+$/.test(p)||/^https:\/\/hafnia-control-auth\.sylvestweb\.workers\.dev\/media\/mobile-[a-f0-9-]+\.(jpg|png|webp)$/.test(p));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('da-DK').format(n);
async function get(url){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{signal:controller.signal,headers:{accept:'application/json'}});if(!r.ok)throw Error('API '+r.status);return await r.json()}finally{clearTimeout(timeout)}}
function update(file,transform){const p=path.join(ROOT,file),old=fs.readFileSync(p,'utf8'),next=transform(old);if(!next||next===old){console.log(file,'unchanged');return}fs.writeFileSync(p,next,'utf8');console.log(file,'updated')}
function replaceOne(s,re,next,label){if(!re.test(s))throw Error('Missing '+label);return s.replace(re,next)}
async function makeThumbs(gallery){const result={};const dir=path.join(ROOT,'images','thumbs');fs.mkdirSync(dir,{recursive:true});for(const src of gallery){const hash=crypto.createHash('sha256').update(src).digest('hex').slice(0,20);const dest='images/thumbs/'+hash+'.webp';const abs=path.join(ROOT,dest);if(!fs.existsSync(abs)){let bytes;if(src.startsWith('images/'))bytes=fs.readFileSync(path.join(ROOT,src));else{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);try{const r=await fetch(src,{signal:controller.signal});if(!r.ok)throw Error('Image '+r.status);const len=Number(r.headers.get('content-length')||0);if(len>15000000)throw Error('Image too large');bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>15000000)throw Error('Image too large')}finally{clearTimeout(timer)}}await sharp(bytes).rotate().resize({width:700,withoutEnlargement:true}).webp({quality:76,effort:4}).toFile(abs)}result[src]=dest}return result}
(async()=>{
const [data,kbh]=await Promise.all([get(BASE+'/api/public'),get(BASE+'/api/public/koebenhavn')]);
if(!['four_hours','full_day','hourly'].every(k=>Number.isInteger(data[k])&&data[k]>=0&&data[k]<=1000000))throw Error('Invalid prices');
if(!Array.isArray(data.gallery)||data.gallery.length>80||!data.gallery.every(imageOk))throw Error('Invalid gallery');
if(!Array.isArray(kbh.gallery)||kbh.gallery.length>80||!kbh.gallery.every(imageOk))throw Error('Invalid Copenhagen gallery');
const thumbs=await makeThumbs(data.gallery);
const offers={};for(const c of data.activeCampaigns||[]){if(typeof c.name!=='string'||!Number.isInteger(c.discount)||!Array.isArray(c.services))continue;for(const service of c.services){if(!['four_hours','full_day'].includes(service)||offers[service]||c.discount<=0||c.discount>=data[service])continue;offers[service]=c}}
const discounted=k=>data[k]-(offers[k]?.discount||0);
const summary='Hos Hafnia Tattoo starter priser fra '+fmt(discounted('four_hours'))+' kr. for 4 timer og '+fmt(discounted('full_day'))+' kr. for heldagssession. Mindre projekter kan også bookes til '+fmt(data.hourly)+' kr. i timen.';
update('index.html',s=>{
let i=0;s=s.replace(/(<div class="amount">)(?:Henter pris\.\.\.|[\s\S]*?)(<\/div>)/g,(whole,a,b)=>{if(i>=2)return whole;const key=i++===0?'four_hours':'full_day';return a+fmt(discounted(key))+' <span>kr.</span>'+b});if(i!==2)throw Error('Missing homepage price cards');
s=replaceOne(s,/(<span data-price-summary>)[\s\S]*?(<\/span>)/,(_,a,b)=>a+esc(summary)+b,'homepage summary');
const gallery=data.gallery.map((src,i)=>'<figure class="work-card" onclick="openLightbox('+String.fromCharCode(39)+esc(src)+String.fromCharCode(39)+')"><img src="'+esc(thumbs[src])+'" alt="Tatovering udført hos Hafnia Tattoo, galleri '+(i+1)+'" loading="lazy" decoding="async"></figure>').join('\n          ');
s=replaceOne(s,/(<script type="application\/json" id="hafnia-thumb-map">)[\s\S]*?(<\/script>)/,(_,a,b)=>a+JSON.stringify(thumbs)+b,'thumbnail map');
s=replaceOne(s,/(<div class="work-grid">)[\s\S]*?(<\/div>)/,(_,a,b)=>a+'\n          '+gallery+'\n        '+b,'homepage gallery');return s});
update('tattoo-koebenhavn.html',s=>{
for(const key of ['four_hours','full_day','hourly'])s=s.replace(new RegExp('(<span data-hafnia-price="'+key+'">)[^<]*(<\\/span>)','g'),(_,a,b)=>a+fmt(key==='hourly'?data[key]:discounted(key))+b);
return s});
console.log('SEO public snapshot updated from admin API; prices and gallery remain dynamically refreshable.');
})().catch(e=>{console.error(e);process.exitCode=1});