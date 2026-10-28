/** Regression checks for direct translation without document replacement. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const acorn = require('acorn');
const C = require('./core.js');
const dictionary = require('./locales/en.json');
const i18nSource = fs.readFileSync('i18n.js', 'utf8').replace('__CATALOG__', JSON.stringify(dictionary));

// Exercise the actual static binding logic. User content is inserted afterwards.
const staticText = {nodeValue:'  Ajouter un livre  ', isConnected:true, parentElement:{closest(){return null;}}};
const placeholder = {attrs:{placeholder:'Ma bibliothèque'},isConnected:true,getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v}};
const languageButton = {setAttribute(k,v){this[k]=v}};
const memory = new Map();
const document = {
  documentElement:{lang:'fr'},
  getElementById(id){return id==='language-switch'?languageButton:null;},
  createTreeWalker(){let i=0;return {currentNode:null,nextNode(){this.currentNode=staticText;return i++===0;}}},
  querySelectorAll(){return [placeholder]},
};
const ctx = vm.createContext({document,NodeFilter:{SHOW_TEXT:4},localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)}});
const run = code=>vm.runInContext(code,ctx);
run(i18nSource);
assert.equal(staticText.nodeValue,'  Ajouter un livre  ');
run('I18n.setLanguage("en")');
assert.equal(staticText.nodeValue,'  Add a book  ');
assert.equal(placeholder.attrs.placeholder,'My library');
assert.equal(languageButton.textContent,'Français');
assert.equal(document.documentElement.lang,'en');
const userText = {nodeValue:'Ajouter un livre'};
for(let i=0;i<4;i++){
  run('I18n.setLanguage("fr")');
  assert.equal(staticText.nodeValue,'  Ajouter un livre  ');
  run('I18n.setLanguage("en")');
  assert.equal(staticText.nodeValue,'  Add a book  ');
}
assert.equal(userText.nodeValue,'Ajouter un livre');
assert.equal(memory.get('eigrutel-bibliotheque-language'),'en');
// A new page reads the remembered preference, without affecting saved enum values.
const fresh = vm.createContext({document,NodeFilter:{SHOW_TEXT:4},localStorage:ctx.localStorage});
vm.runInContext(i18nSource.replace('I18n.bindStatic();',''),fresh);
assert.equal(vm.runInContext('I18n.language',fresh),'en');
assert.equal(run('I18n.t("Bon état")'),'Good');
assert.equal(C.book({condition:'Bon état',status:'Lu'}).condition,'Bon état');

// Run the production switch with DOM doubles which replace draft inputs on render.
const app = fs.readFileSync('app.js','utf8');
const tree = acorn.parse(app,{ecmaVersion:'latest'});
const fn = tree.body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='switchLanguage');
const field = (id,value,start=null,end=null)=>({id,value,checked:false,type:'text',selectionStart:start,selectionEnd:end,setSelectionRange(s,e){this.selectionStart=s;this.selectionEnd=e},focus(){document.activeElement=this}});
let fields = [field('f-title','Ajouter un livre',2,8),field('f-notes','**Annuler** [color=#004d65]Notes[/color]',0,7),field('f-loanDate','2026-10-28'),field('f-condition','Bon état'),field('f-pages','128'),field('appearance-accent-hex','#009988')];
const els = {
  '#modal':{open:false}, '#lightbox':{open:false}, '#drawer':{hidden:false}, '#drawer-body':{scrollTop:320},
  '#notes-preview':{hidden:false}, '#preview-notes':{textContent:'Écrire'}, '#toast':{hidden:false},
  '#search':{value:'test'}, '#status-filter':{value:'Lu'}, '#filters':{hidden:false},
};
document.getElementById = id=>id==='language-switch'?languageButton:fields.find(f=>f.id===id);
document.activeElement=fields[0];
Object.assign(ctx,{
  $:sel=>els[sel] || fields.find(f=>'#'+f.id===sel),
  $$:()=>fields,
  state:{libraryName:'Annuler',books:[C.book({id:'one',title:'Ajouter un livre',notes:'Annuler'})]},
  draft:{images:[],notes:'old'},editing:true,dirty:true,locale:'en-GB',
  scope:'collection:Annuler',bulkMode:true,bulkIds:new Set(['one']),undoHistory:[{saved:true}],redoHistory:[],
  render(){},syncSidebar(){},storageStatus(){},bindImages(){},C,
  renderEditor(){ fields=fields.map(f=>field(f.id,'rendered'));els['#drawer-body'].scrollTop=0;els['#notes-preview'].hidden=true;},
  renderDetail(){throw Error('Must keep editor open')},
});
run(app.slice(fn.start,fn.end));
const before=JSON.stringify(ctx.state);
for(let i=0;i<4;i++){
  run('switchLanguage()');
  assert.equal(fields.find(f=>f.id==='f-title').value,'Ajouter un livre');
  assert.equal(fields.find(f=>f.id==='f-notes').value,'**Annuler** [color=#004d65]Notes[/color]');
  assert.equal(fields.find(f=>f.id==='f-condition').value,'Bon état');
  assert.equal(fields.find(f=>f.id==='f-pages').value,'128');
  assert.equal(fields.find(f=>f.id==='f-loanDate').value,'2026-10-28');
  assert.equal(fields.find(f=>f.id==='appearance-accent-hex').value,'#009988');
  assert.equal(els['#drawer-body'].scrollTop,320);
  assert.equal(els['#notes-preview'].hidden,false);
  assert(els['#notes-preview'].innerHTML.includes('<strong>Annuler</strong>'));
  assert.equal(document.activeElement.id,'f-title');
  assert.equal(document.activeElement.selectionStart,2);
  assert.equal(ctx.dirty,true);
  assert.equal(els['#search'].value,'test');
  assert.equal(els['#status-filter'].value,'Lu');
  assert.equal(els['#filters'].hidden,false);
  assert.deepEqual([...ctx.bulkIds],['one']);
  assert.equal(ctx.undoHistory.length,1);
  assert.equal(ctx.scope,'collection:Annuler');
  assert.equal(JSON.stringify(ctx.state),before);
}
// Never dismiss an open modal and discard its unsaved bulk-edit values.
els['#modal'].open=true;
const lang=run('I18n.language');
run('switchLanguage()');
assert.equal(run('I18n.language'),lang);
console.log('PASS: reversible static labels, remembered language, canonical values, drafts and selection/history preserved.');
