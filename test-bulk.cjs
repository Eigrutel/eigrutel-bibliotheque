const assert=require('node:assert/strict'),C=require('./core.js');
const state={format:C.FORMAT,schemaVersion:1,palette:C.PALETTE,books:[C.book({id:'a',title:'A',number:'10',isbn:'123',notes:'Note',colors:['old'],themes:['old']}),C.book({id:'b',title:'B'}),C.book({id:'c',title:'C'})]};
const before=C.clone(state),patch={collection:'Pro',author:'Auteur',publisher:'Éditeur',shelf:'A',bookType:'Manuel',year:'2026',location:'Bureau',status:'Lu',condition:'Bon état',favorite:true,colors:[C.PALETTE[0].id],themes:['Dessin'],loanName:'Camille',loanDate:'2026-10-28'};
const out=C.bulkUpdate(state,['a','b'],patch);
assert.deepEqual(state,before);assert.deepEqual(out.books[2],before.books[2]);
for(const book of out.books.slice(0,2)){for(const [key,value] of Object.entries(patch))assert.deepEqual(book[key],value);}
for(const key of ['title','number','isbn','notes','images','id','createdAt'])assert.deepEqual(out.books[0][key],before.books[0][key]);
for(const key of ['title','number','isbn','notes','images','id','deletedAt'])assert.throws(()=>C.bulkUpdate(state,['a'],{[key]:'bad'}));
assert.throws(()=>C.bulkUpdate(state,['missing'],patch));assert.throws(()=>C.bulkUpdate(state,['a'],{loanDate:'2026-02-30'}));assert.throws(()=>C.bulkUpdate(state,['a'],{favorite:'yes'}));assert.throws(()=>C.bulkUpdate(state,['a'],{}));
assert.throws(()=>C.bulkUpdate(state,['a'],{condition:'Inconnu'}));
const restored=C.validate(JSON.parse(JSON.stringify(out)));assert.equal(restored.books[0].loanName,'Camille');assert.equal(C.collectionBackup(out,'Pro').books[0].loanDate,'2026-10-28');
const cleared=C.bulkUpdate(out,['a'],{loanName:'',loanDate:'',colors:[],themes:[]});assert.equal(cleared.books[0].loanName,'');assert.equal(cleared.books[1].loanName,'Camille');
console.log('PASS: actions groupées ciblées, champs interdits protégés, prêt réversible et sauvegardes compatibles.');
