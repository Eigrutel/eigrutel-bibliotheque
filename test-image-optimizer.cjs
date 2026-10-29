const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createCanvas,Image,loadImage}=require('@napi-rs/canvas');
const C=require('./core.js');
const ctx={Image,document:{createElement:()=>createCanvas(1,1)},atob,module:{exports:{}}};
vm.runInNewContext(fs.readFileSync('image-optimizer.js','utf8'),ctx);const O=ctx.module.exports;
function picture(w,h,alpha=false){
 const canvas=createCanvas(w,h),c=canvas.getContext('2d');
 if(!alpha){c.fillStyle='#f0eadc';c.fillRect(0,0,w,h)}
 for(let y=40;y<h;y+=55){c.fillStyle=`hsl(${y%360} 55% 35%)`;c.font='28px sans-serif';c.fillText('Texte de lecture : Aa Bb 123456789',30,y);c.fillRect(w/2,y,100,12)}
 return canvas.toDataURL(alpha?'image/png':'image/jpeg',.97);
}
(async()=>{
 const data=picture(1800,2700);const source={id:'cover',name:'cover.jpg',role:'cover',caption:'Test',data};
 const cover=await O.optimize(source);assert(cover.changed);assert(cover.after<cover.before);const ci=await loadImage(cover.image.data);assert.equal(ci.height,600);assert.equal(ci.width,400);
 assert(JSON.stringify(cover.image).length<JSON.stringify(source).length);assert.equal(source.data,data);assert.equal(cover.image.id,'cover');assert.equal(cover.image.caption,'Test');
 assert.equal((await O.optimize(cover.image)).image.data,cover.image.data);
 // A cover already optimised by 1.1.0 must reach the new size once, then stay unchanged.
 const oldData=picture(667,1000),oldBytes=O.bytes(oldData);
 const older={...source,data:oldData,optimization:{version:1,sourceBytes:source.data.length,bytes:oldBytes,width:667,height:1000}};
 const reduced=await O.optimize(older);assert(reduced.changed);assert.equal(reduced.image.optimization.height,600);assert.equal(reduced.image.optimization.width,400);assert.equal(reduced.image.optimization.sourceBytes,older.optimization.sourceBytes);
 assert.equal((await O.optimize(reduced.image)).image.data,reduced.image.data);
 assert.deepEqual({...O.dimensions(3000,500,'cover')},{width:960,height:160});
 const note=await O.optimize({id:'note',name:'note.png',role:'note',data:picture(2400,1800,true)});const ni=await loadImage(note.image.data);assert.equal(ni.width,1600);assert.equal(ni.height,1200);
 const alpha=createCanvas(ni.width,ni.height);alpha.getContext('2d').drawImage(ni,0,0);assert.equal(alpha.getContext('2d').getImageData(0,0,1,1).data[3],0);
 const small=await O.optimize({id:'small',name:'small.jpg',role:'cover',data:picture(180,260)});const si=await loadImage(small.image.data);assert.equal(si.width,180);assert.equal(si.height,260);assert(small.after<=small.before);
 const tinySource={id:'tiny',name:'tiny.png',role:'note',data:createCanvas(2,2).toDataURL('image/png')};const tiny=await O.optimize(tinySource);assert(JSON.stringify(tiny.image).length<=JSON.stringify(tinySource).length);
 const gif={id:'gif',name:'animation.gif',data:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',role:'note'};assert.equal((await O.optimize(gif)).image.data,gif.data);
 await assert.rejects(()=>O.optimize({id:'broken',name:'x.png',data:'data:image/png;base64,AAAA',role:'note'}));
 const library=C.validate({...C.emptyLibrary(),books:[C.book({title:'Test',notes:'![image](attachment:note)',images:[cover.image,note.image]})]});
 const json=JSON.stringify(library);assert(!json.includes(data));assert(json.includes('attachment:note'));assert.equal(C.validate(JSON.parse(json)).books[0].images[0].data,cover.image.data);
 console.log(`PASS: actual encoding, cover 1800×2700 → ${ci.width}×${ci.height}, ${cover.before} → ${cover.after} bytes; alpha notes 1600×1200; small images, idempotence, GIF and JSON.`);
})().catch(e=>{console.error(e);process.exitCode=1});
