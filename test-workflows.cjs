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
  const factory=new IDBFactory();await seed(factory);let ui=await start(factory);
  try {
    // Real click path, persistence, re-open and reload after date deletion.
    ui.open();ui.click('clear-loan-date');
    assert.equal(ui.$('#f-loanDate').value,'');assert.equal(ui.$('#f-loanDate').defaultValue,'');
    ui.click('save-book');await until(()=>ui.$('#edit-book'));
    assert.equal((await saved(factory)).books[0].loanDate,'');
    ui.click('edit-book');assert.equal(ui.$('#f-loanDate').value,'');
    ui.click('cancel-edit');ui.click('close-drawer');ui.close();ui=await start(factory);
    ui.open();assert.equal(ui.$('#f-loanDate').value,'');assert.equal(ui.$('#f-loanName').value,'Alex');
    // New date remains possible, then returning the book clears both saved fields.
    ui.fill('f-loanDate','2026-10-29','change');ui.click('save-book');await until(()=>ui.$('#edit-book'));
    assert.equal((await saved(factory)).books[0].loanDate,'2026-10-29');
    ui.click('return-saved-book');await until(()=>!ui.$('#return-saved-book'));
    assert.equal((await saved(factory)).books[0].loanDate,'');assert.equal((await saved(factory)).books[0].loanName,'');
    ui.click('close-drawer');ui.close();ui=await start(factory);ui.open();
    assert.equal(ui.$('#f-loanDate').value,'');assert.equal(ui.$('#f-loanName').value,'');
    // Editor return, translated interface, draft retained by language switching.
    ui.fill('f-loanDate','2026-10-30');ui.fill('f-loanName','Pat');ui.click('save-book');await until(()=>ui.$('#edit-book'));
    ui.click('edit-book');ui.click('return-loan');ui.click('language-switch');
    assert.equal(ui.$('#f-loanDate').value,'');assert.equal(ui.$('#f-loanName').value,'');
    ui.click('save-book');await until(()=>ui.$('#edit-book'));ui.click('close-drawer');
    assert.equal((await saved(factory)).books[0].loanDate,'');
    // Name blur immediately followed by the actual export button (the original race).
    ui.fill('library-name','Mes Livres','change');ui.click('backup-btn');
    await until(()=>ui.downloads.length===1);await until(()=>!ui.w.eval('busy'));
    assert.equal(ui.downloads[0].name,'bibliotheque_mes-livres.json');
    assert.equal(JSON.parse(await ui.text(ui.downloads[0].blob)).libraryName,'Mes Livres');
    assert.equal((await saved(factory)).libraryName,'Mes Livres');
    assert.equal(JSON.parse(await ui.text(ui.downloads[0].blob)).books[0].loanDate,'');
    // Export without a blur event and rapid changes retain the most recent name.
    ui.fill('library-name','Ancien nom','change');ui.fill('library-name','Étagère BD');ui.click('backup-btn');
    await until(()=>ui.downloads.length===2);await until(()=>!ui.w.eval('busy'));
    assert.equal(ui.downloads[1].name,'bibliotheque_etagere-bd.json');
    assert.equal(JSON.parse(await ui.text(ui.downloads[1].blob)).libraryName,'Étagère BD');
    // Collection export reads the currently typed name too.
    ui.$('[data-scope="collection:Pro"]').click();ui.fill('library-name','Livres Pro');ui.click('collection-backup-btn');
    await until(()=>ui.downloads.length===3);await until(()=>!ui.w.eval('busy'));
    assert.equal(ui.downloads[2].name,'bibliotheque_livres-pro_pro.json');
    assert.equal(JSON.parse(await ui.text(ui.downloads[2].blob)).libraryName,'Livres Pro');
    // PDF naming uses one snapshot for the metadata and download name.
    ui.$('[data-book="loan"]').click();
    ui.w.eval('LibraryPDF.create = async (...args) => {window.pdfLibraryName=args[3];return new Uint8Array([37,80,68,70])}');
    ui.fill('library-name','PDF Étagère');ui.click('pdf-full');await until(()=>ui.$('a.pdf-download'));
    assert.equal(ui.$('a.pdf-download').download,'un-livre-test_pdf-etagere_fiche.pdf');assert.equal(ui.w.pdfLibraryName,'PDF Étagère');
    ui.$('#modal').close();ui.click('pdf-notes');await until(()=>ui.$('#modal').open && ui.$('a.pdf-download')?.download.endsWith('_notes.pdf'));
    assert.equal(ui.$('a.pdf-download').download,'un-livre-test_pdf-etagere_notes.pdf');ui.$('#modal').close();ui.click('close-drawer');
    assert.deepEqual(ui.errors.map(e=>e.message),[]);
    ui.close();ui=await start(factory);assert.equal(ui.$('#library-name').value,'PDF Étagère');
    ui.click('backup-btn');await until(()=>ui.downloads.length===1);await until(()=>!ui.w.eval('busy'));
    assert.equal(ui.downloads[0].name,'bibliotheque_pdf-etagere.json');
    // Restore a different named backup through the actual import dialog.
    const incoming={...C.emptyLibrary(),libraryName:'Bibliothèque restaurée',books:[C.book({id:'loan',title:'Un livre test',collection:'Pro'})]};
    await ui.w.readImport({name:'backup.json',size:100,text:async()=>JSON.stringify(incoming)});
    ui.$('input[value="replace"]').checked=true;ui.click('confirm-import');await until(()=>!ui.$('#modal').open);
    assert.equal(ui.$('#library-name').value,'Bibliothèque restaurée');ui.click('backup-btn');await until(()=>ui.downloads.length===2);await until(()=>!ui.w.eval('busy'));
    assert.equal(ui.downloads[1].name,'bibliotheque_bibliotheque-restauree.json');
    // Safety regression: trash delete is cancelled, then confirmed for one book.
    ui.$('[data-book="loan"]').click();ui.click('delete-book');await until(()=>ui.$('#drawer').hidden);
    ui.$('[data-scope="trash"]').click();assert.equal(ui.$('#trash-actions').hidden,false);
    ui.$('[data-book="loan"]').click();ui.w.confirm=()=>false;ui.click('purge-book');await delay();assert.equal((await saved(factory)).books.length,1);
    ui.w.confirm=()=>true;ui.click('purge-book');await until(()=>ui.$('#drawer').hidden);assert.equal((await saved(factory)).books.length,0);
    assert.deepEqual(ui.errors.map(e=>e.message),[]);
    console.log('PASS: delivered HTML workflows: loan clear/save/reopen/reload, direct return, FR/EN, immediate named JSON/collection/PDF exports, import name sync, trash confirmation.');
  } finally {ui.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
