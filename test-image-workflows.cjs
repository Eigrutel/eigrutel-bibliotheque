/* Run the shipped HTML with a DOM and IndexedDB, using synthetic books only.
 * No app handlers are replaced. The PDF renderer is stubbed only to test export names.
 * This is an integration simulation, not an iPad/WebKit browser test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const C = require('./core.js');
const {createCanvas,Image}=require('@napi-rs/canvas');
const html = fs.readFileSync(process.argv[2] || 'dist/bibliotheque.html', 'utf8');
const delay = () => new Promise(resolve => setTimeout(resolve, 10));
async function until(check) {
  for (let i=0; i<500; i++) { if (check()) return; await delay(); }
  throw Error('Workflow timed out');
}
async function database(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open('eigrutel-bibliotheque-v1',1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function saved(factory) {
  const db=await database(factory);
  return new Promise((resolve,reject)=>{
    const req=db.transaction('state','readonly').objectStore('state').get('main');
    req.onsuccess=()=>{db.close();resolve(req.result)};req.onerror=()=>reject(req.error);
  });
}
async function seed(factory) {
  const db=await database(factory);
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('state','readwrite');
    tx.objectStore('state').put({...C.emptyLibrary(),revision:0,books:[C.book({id:'loan',title:'Un livre test',collection:'Pro',loanName:'Alex',loanDate:'2026-10-28',notes:'Notes de test'}),C.book({id:'other',title:'Autre livre',collection:'Pro'})]},'main');
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });db.close();
}
async function start(factory) {
  const downloads=[],errors=[],blobs=new Map();
  const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e));vc.on('error',e=>errors.push(e));
  const dom=new JSDOM(html,{url:'https://library.test/bibliotheque.html',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.Image=Image;
    const create=w.document.createElement.bind(w.document);
    w.document.createElement=(name,...args)=>name==='canvas'?createCanvas(1,1):create(name,...args);
    w.indexedDB=factory;w.structuredClone=structuredClone;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;
    w.matchMedia=()=>({matches:false,addEventListener(){}});w.confirm=()=>true;
    w.HTMLElement.prototype.scrollIntoView=function(){};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
    w.URL.createObjectURL=blob=>{const url='blob:test-'+blobs.size;blobs.set(url,blob);return url};w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobs.get(this.href)})};
  }});
  const w=dom.window,$=s=>w.document.querySelector(s);
  await until(()=>$('#navigation [data-scope="all"]'));
  const fill=(id,value,event='input')=>{const el=$('#'+id);assert(el,id);el.value=value;el.dispatchEvent(new w.Event(event,{bubbles:true}))};
  const click=id=>{assert($('#'+id),id);$('#'+id).click()};
  const open=()=>{const node=$('[data-book="loan"]');assert(node);node.click();click('edit-book')};
  const text=blob=>new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob)});
  return {w,$,fill,click,open,downloads,errors,blobs,text,close:()=>{w.eval('db?.close()');w.close()}};
}

(async()=>{
 const factory=new IDBFactory();await seed(factory);
 const canvas=createCanvas(1800,2700),c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,1800,2700);
 for(let y=40;y<2700;y+=50){c.fillStyle='#024d65';c.font='30px sans-serif';c.fillText('Notes et couverture : test de lecture',40,y)}
 const original=canvas.toDataURL('image/jpeg',.98);
 const initial=await saved(factory);initial.libraryName='Test images';initial.books[0].images=[{id:'picture',role:'cover',name:'couverture.jpg',data:original,caption:'Légende'}];
 const db=await database(factory);await new Promise(r=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(initial,'main');tx.oncomplete=r});db.close();
 let ui=await start(factory);
 try{
   ui.click('optimize-images-btn');await until(()=>ui.$('#modal').open && ui.$('#optimization-start'));ui.click('optimization-start');await until(()=>!ui.$('#optimization-apply').hidden);
   assert.equal((await saved(factory)).books[0].images[0].data,original);
   assert(ui.$('#optimization-report').textContent.includes('→'));ui.click('optimization-cancel');
   assert.equal((await saved(factory)).books[0].images[0].data,original);
   ui.click('optimize-images-btn');await until(()=>ui.$('#modal').open && ui.$('#optimization-start'));ui.click('optimization-start');await until(()=>!ui.$('#optimization-apply').hidden);ui.click('optimization-apply');await until(()=>!ui.$('#modal').open);
   const optimized=await saved(factory),image=optimized.books[0].images[0];assert(image.data.length<original.length);assert.equal(image.id,'picture');assert.equal(image.caption,'Légende');assert.equal(image.optimization.height,600);
   ui.click('backup-btn');await until(()=>ui.downloads.length===1);await until(()=>!ui.w.eval('busy'));
   const exported=JSON.parse(await ui.text(ui.downloads[0].blob));assert.equal(exported.books[0].images[0].data,image.data);assert(!JSON.stringify(exported).includes(original));assert.equal(ui.downloads[0].name,'bibliotheque_test-images.json');
   ui.click('optimize-images-btn');await until(()=>ui.$('#modal').open && ui.$('#optimization-start'));ui.click('optimization-start');await until(()=>!ui.$('#optimization-apply').hidden);assert(ui.$('#optimization-apply').disabled);ui.click('optimization-cancel');
   // Real FileReader + image encoder upload path, followed by the real form save.
   ui.open();const bytes=Buffer.from(original.split(',')[1],'base64');await ui.w.addImages([new ui.w.File([bytes],'nouvelle.jpg',{type:'image/jpeg'})],'note');
   assert(ui.$('#attachments').textContent.includes('→'));ui.click('save-book');await until(()=>ui.$('#edit-book'));
   const after=await saved(factory);assert.equal(after.books[0].images.length,2);assert(after.books[0].images[1].data.length<original.length);assert.equal(Math.max(after.books[0].images[1].optimization.width,after.books[0].images[1].optimization.height),1600);
   assert.deepEqual(ui.errors.map(e=>e.message),[]);ui.close();ui=await start(factory);
   ui.open();assert.equal(ui.$('#attachments').querySelectorAll('[data-caption]').length,2);
   console.log('PASS: delivered HTML image optimisation preview/cancel/apply, real upload encoding, JSON export, stable image IDs, persistence and repeated optimisation.');
 }finally{ui.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
