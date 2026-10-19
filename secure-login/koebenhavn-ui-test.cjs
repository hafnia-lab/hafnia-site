
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
class Element{constructor(){this.children=[];this.style={setProperty:(key,value)=>this[key]=value};this.value='';this.files=[]}append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items.flatMap(x=>x.fragment?x.children:[x])}click(){}}
const initial={hero:'images/statue.png',gallery:['images/work1.jpg','images/work2.jpg','images/work3.jpg']};
(async()=>{
const page=fs.readFileSync('tattoo-koebenhavn.html','utf8');
const code=page.match(/<script id="hafnia-koebenhavn-content">([\s\S]*?)<\/script>/)[1];
for(const [name,data,shouldChange] of [['valid',initial,true],['malicious',{hero:'javascript:evil()',gallery:[]},false],['empty',{...initial,gallery:[]},true]]){
 const grid=new Element(),root=new Element();grid.children=['original'];
 await vm.runInNewContext(code,{document:{getElementById:()=>grid,documentElement:root,createDocumentFragment:()=>Object.assign(new Element(),{fragment:true}),createElement:()=>new Element()},fetch:async()=>({ok:true,json:async()=>data}),console});
 assert.equal(grid.children[0]==='original',!shouldChange,name);
 if(shouldChange){assert.equal(grid.children.length,data.gallery.length);assert.ok(root['--hafnia-kbh-hero'].includes(data.hero))}
}
const a=JSON.parse(fs.readFileSync('secure-login/admin-page.js','utf8').slice('export default '.length).trim().replace(/;$/,''));
const elements=Object.fromEntries([...a.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));
let state=structuredClone(initial),home={four_hours:2500,full_day:3500,gallery:['images/a1.jpg']},writes=[];
const context=vm.createContext({document:{getElementById:id=>elements[id],createElement:()=>new Element()},location:{hash:'',pathname:'/admin'},history:{replaceState(){}},URLSearchParams,Uint8Array,console,btoa:s=>Buffer.from(s,'binary').toString('base64'),fetch:async(url,opts)=>{
 const route=new URL(url,'https://control.test').pathname,body=opts.body?JSON.parse(opts.body):null;
 if(body)writes.push(route);
 let out;
 if(route==='/api/koebenhavn'){if(body)state=structuredClone(body);out=structuredClone(state)}
 else if(route==='/api/upload')out={url:'https://hafnia-control-auth.sylvestweb.workers.dev/media/mobile-abcd.png'};
 else out=structuredClone(home);
 return {ok:true,json:async()=>out};
}});
vm.runInContext(a.match(/<script>([\s\S]*?)<\/script>/)[1],context);
await new Promise(r=>setTimeout(r,20));
assert.equal(elements['kbh-tiles'].children.length,3);
const oldHome=JSON.stringify(home);
const heroFile=elements['kbh-hero'].children[0].children[1];
heroFile.files=[{size:8,type:'image/png',arrayBuffer:async()=>new Uint8Array([137,80,78,71,13,10,26,10]).buffer}];
await heroFile.onchange();
elements['kbh-tiles'].children[0].children[3].onclick();
await elements['kbh-save'].onclick();
assert.match(state.hero,/mobile-abcd.png$/);assert.equal(state.gallery.length,2);
assert.equal(JSON.stringify(home),oldHome);assert.ok(!writes.includes('/api/content'));
console.log('PASS frontend checks: public rendering, malicious-data fallback, empty gallery, admin replacement/removal/save, and homepage isolation.');
})().catch(e=>{console.error(e.stack);process.exitCode=1});
