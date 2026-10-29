/* Run the shipped HTML with a DOM and IndexedDB, using synthetic books only.
 * No app handlers are replaced. The PDF renderer is stubbed only to test export names.
 * This is an integration simulation, not an iPad/WebKit browser test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const C = require('./core.js');
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
  const initial=await saved(factory);
  const data='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const source={...initial.books[0],title:'Série, tome 1',number:'1',author:'Auteur test',publisher:'Éditeur test',isbn:'9780000000001',year:'2026',shelf:'BD',bookType:'Album',condition:'Bon état',pages:'48',language:'Français',location:'Bureau',colors:['…'],themes:['Dessin'],status:'Lu',favorite:true,createdAt:'2020-01-01T00:00:00.000Z',updatedAt:'2020-01-01T00:00:00.000Z',images:[{id:'old-cover',role:'cover',name:'cover.gif',data,caption:'Couverture'},{id:'old-note',role:'note',name:'note.gif',data,caption:'Note'}],notes:'Texte **en gras** ![Schéma](attachment:old-note)\n![Encore](attachment:old-note)'};
  initial.books[0]=source;initial.libraryName='Séries';
  const db=await database(factory);await new Promise(r=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(initial,'main');tx.oncomplete=r});db.close();
  let ui=await start(factory);
  try{
    ui.$('[data-book="loan"]').click();assert.equal(ui.$('#duplicate-book').textContent,'Dupliquer');ui.click('duplicate-book');
    assert.equal(ui.$('#f-title').value,'Série, tome 1 (copie)');assert.equal(ui.$('#f-author').value,source.author);assert.equal(ui.$('#f-publisher').value,source.publisher);
    assert.equal((await saved(factory)).books.length,2);ui.click('cancel-edit');assert(ui.$('#drawer').hidden);assert.equal((await saved(factory)).books.length,2);
    ui.$('[data-book="loan"]').click();ui.click('duplicate-book');ui.fill('f-title','Série, tome 2');ui.fill('f-number','2');ui.fill('f-isbn','');ui.click('save-book');await until(()=>ui.$('#edit-book'));
    let library=await saved(factory);assert.equal(library.books.length,3);assert.deepEqual(library.books[0],source);
    const copy=library.books[2],copyId=copy.id;assert.notEqual(copy.id,source.id);assert.notEqual(copy.createdAt,source.createdAt);assert.equal(copy.title,'Série, tome 2');assert.equal(copy.number,'2');assert.equal(copy.isbn,'');
    for(const key of ['author','publisher','year','shelf','bookType','condition','pages','language','location','colors','themes','status','favorite','loanName','loanDate'])assert.deepEqual(copy[key],source[key],key);
    for(let i=0;i<2;i++){assert.notEqual(copy.images[i].id,source.images[i].id);assert.equal(copy.images[i].data,source.images[i].data);assert.equal(copy.images[i].caption,source.images[i].caption)}
    assert.equal(copy.notes.split('attachment:'+copy.images[1].id).length,3);assert(!copy.notes.includes('attachment:old-note'));C.validate(library);
    ui.click('close-drawer');ui.click('undo-btn');await until(()=>ui.$('[data-book="'+copyId+'"]')===null);assert.equal((await saved(factory)).books.length,2);
    ui.click('redo-btn');await until(()=>ui.$('[data-book="'+copyId+'"]'));assert.equal((await saved(factory)).books.length,3);
    ui.click('backup-btn');await until(()=>ui.downloads.length===1);const exported=C.validate(JSON.parse(await ui.text(ui.downloads[0].blob)));assert.equal(exported.books.length,3);assert.equal(ui.downloads[0].name,'bibliotheque_series.json');assert.deepEqual(exported.books.find(b=>b.id===copyId),copy);
    ui.close();ui=await start(factory);ui.$('[data-book="'+copyId+'"]').click();ui.click('edit-book');ui.fill('f-author','Auteur de la copie');ui.click('save-book');await until(()=>ui.$('#edit-book'));assert.deepEqual((await saved(factory)).books.find(b=>b.id==='loan'),source);
    ui.click('close-drawer');ui.click('language-switch');ui.$('[data-book="loan"]').click();assert.equal(ui.$('#duplicate-book').textContent,'Duplicate');ui.click('duplicate-book');assert.equal(ui.$('#f-title').value,'Série, tome 1 (copy)');ui.click('cancel-edit');assert.equal((await saved(factory)).books.length,3);
    // Bulk toolbar: placement, disabled state, exactly the selected books, one transaction.
    ui.$('[data-scope="collection:Pro"]').click();ui.click('select-books');
    assert(ui.$('#duplicate-selected').disabled);assert.equal(ui.$('#remove-selected').nextElementSibling.id,'duplicate-selected');assert.equal(ui.$('#duplicate-selected').nextElementSibling.id,'bulk-edit');
    ui.$('[data-book="loan"]').click();ui.$('[data-book="other"]').click();assert(!ui.$('#duplicate-selected').disabled);
    const beforeGroup=await saved(factory),originalIds=new Set(beforeGroup.books.map(b=>b.id));
    ui.click('duplicate-selected');ui.click('duplicate-selected');await until(()=>!ui.w.eval('duplicatingSelection'));
    const afterGroup=await saved(factory),copies=afterGroup.books.filter(b=>!originalIds.has(b.id));assert.equal(copies.length,2);assert.equal(afterGroup.revision,beforeGroup.revision+1);
    assert.deepEqual(afterGroup.books.filter(b=>originalIds.has(b.id)),beforeGroup.books);
    assert.deepEqual([...ui.w.eval('bulkIds')].sort(),copies.map(b=>b.id).sort());assert(ui.$('#drawer').hidden);
    assert(copies.every(b=>b.title.endsWith(' (copy)')));assert(copies.every(b=>b.collection==='Pro'));
    const fullCopy=copies.find(b=>b.author===source.author);assert.equal(fullCopy.images.length,2);assert(fullCopy.notes.includes('(attachment:'+fullCopy.images[1].id+')'));C.validate(afterGroup);
    ui.click('undo-btn');await until(()=>!ui.w.eval('busy'));assert.equal((await saved(factory)).books.length,3);
    ui.click('redo-btn');await until(()=>!ui.w.eval('busy'));assert.equal((await saved(factory)).books.length,5);
    // Select the copies again after Undo/Redo, then use the adjacent bulk editor.
    for(const b of copies)ui.$('[data-book="'+b.id+'"]').click();ui.click('bulk-edit');
    ui.$('[data-bulk-enable="publisher"]').click();ui.fill('bulk-publisher','Éditeur des copies');ui.click('save-bulk');await until(()=>!ui.$('#modal').open);
    const edited=await saved(factory);assert(edited.books.filter(b=>!originalIds.has(b.id)).every(b=>b.publisher==='Éditeur des copies'));assert.deepEqual(edited.books.filter(b=>originalIds.has(b.id)),beforeGroup.books);
    ui.click('grid-btn');ui.click('select-books');assert(ui.$('#duplicate-selected').disabled);
    ui.$('[data-book="other"]').click();assert(!ui.$('#duplicate-selected').disabled);ui.click('duplicate-selected');await until(()=>!ui.w.eval('duplicatingSelection'));assert.equal((await saved(factory)).books.length,6);
    assert.equal(ui.$('.book-card.bulk-selected')?.getAttribute('data-select-id'),[...ui.w.eval('bulkIds')][0]);
    const downloadIndex=ui.downloads.length;ui.click('backup-btn');await until(()=>ui.downloads.length>downloadIndex);const bulkExport=C.validate(JSON.parse(await ui.text(ui.downloads[downloadIndex].blob)));assert.equal(bulkExport.books.length,6);
    ui.close();ui=await start(factory);assert.equal((await saved(factory)).books.length,6);
    ui.$('[data-scope="trash"]').click();assert.equal(ui.$('#duplicate-selected'),null);
    assert.deepEqual(ui.errors.map(e=>e.message),[]);
    console.log('PASS: duplicate draft, cancel/save, metadata, independent images and note links, undo/redo, reload, named JSON export, original unchanged, FR/EN, bulk toolbar placement, table/grid duplication, copied selection and bulk editing.');
  }finally{ui.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
