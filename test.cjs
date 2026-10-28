const assert=require('node:assert/strict'),C=require('./core.js');
const book=C.book({id:'a',title:'Exemple',collection:'Que sais-je ?',notes:'[color=#004d65]Note[/color]',images:[]});
const old={...C.emptyLibrary(),books:[book],libraryName:'Livres pros'};
assert.equal(C.validate(old).libraryName,'Livres pros');
assert.equal(C.merge(old,old,'add').books.length,1);
assert.equal(C.merge(old,{...C.emptyLibrary(),books:[{...book,notes:'Modifiée'}]},'update').books[0].notes,'Modifiée');
const collection=C.collectionBackup(old,'Que sais-je ?');assert.equal(collection.libraryName,'Livres pros');
assert.equal(C.merge(old,collection,'replace-collection').libraryName,'Livres pros');
assert(C.isQueSaisJe(' QUE sais-je ? '));
assert(!C.renderNotes('<script>x</script>').includes('<script>'));
console.log('PASS: JSON backup compatibility, named libraries, collection backups, cover matching and safe notes.');

assert.equal(C.merge(C.emptyLibrary(),old,"add").libraryName,"Livres pros");
assert.equal(C.merge({...C.emptyLibrary(),libraryName:"Existing"},old,"add").libraryName,"Existing");
