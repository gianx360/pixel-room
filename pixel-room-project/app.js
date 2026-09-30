const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d');
let image = null, name = 'image', block = 24, original = false, loading = false, revision = 0, frame;
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); }
function checkDimensions(w,h){ if(!w || !h || w*h>32000000 || w>16384 || h>16384) throw new Error('This image is too large. Use an image under 32 megapixels and 16,384 pixels per side.'); }
function paint(target, full=false, showOriginal=false) {
  const w=image.width || image.naturalWidth, h=image.height || image.naturalHeight;
  const scale=full?1:Math.min(1,1600/Math.max(w,h));
  target.width=Math.max(1,Math.round(w*scale)); target.height=Math.max(1,Math.round(h*scale));
  const c=target.getContext('2d');
  if(showOriginal || block===1){ c.imageSmoothingEnabled=true; c.drawImage(image,0,0,target.width,target.height); return; }
  const tiny=document.createElement('canvas');
  tiny.width=Math.max(1,Math.ceil(w/block));tiny.height=Math.max(1,Math.ceil(h/block));
  const t=tiny.getContext('2d');t.imageSmoothingEnabled=true;t.imageSmoothingQuality='high';t.drawImage(image,0,0,tiny.width,tiny.height);
  c.imageSmoothingEnabled=false;c.drawImage(tiny,0,0,target.width,target.height);
  tiny.width=tiny.height=1;
}
function render(){ if(image)paint(canvas,false,original); }
function setBlock(value){ const n=Number(value);if(!Number.isInteger(n)||n<1||n>512)throw new Error('Choose a whole number between 1 and 512.');block=n;$('size').value=n;$('slider').value=n;document.querySelectorAll('[data-size]').forEach(b=>b.classList.toggle('active',Number(b.dataset.size)===n));original=false;$('compare').textContent='Show original';$('compare').setAttribute('aria-pressed','false');cancelAnimationFrame(frame);frame=requestAnimationFrame(render); }
async function nativeDecode(blob){
 const url=URL.createObjectURL(blob);
 try {const img=new Image();img.src=url;await img.decode();checkDimensions(img.naturalWidth,img.naturalHeight);return img;}finally{URL.revokeObjectURL(url);}
}
async function decode(file){
 const head=new Uint8Array(await file.slice(0,16).arrayBuffer());
 const tiff=(head[0]===73&&head[1]===73&&head[2]===42)||(head[0]===77&&head[1]===77&&head[3]===42);
 if(tiff){const {default:UTIF}=await import('utif');const buffer=await file.arrayBuffer();const pages=UTIF.decode(buffer);const page=pages.find(p=>p.t256&&p.t257);if(!page)throw new Error('This TIFF contains no readable image.');checkDimensions(page.t256[0],page.t257[0]);UTIF.decodeImage(buffer,page);const out=document.createElement('canvas');out.width=page.width;out.height=page.height;out.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(page)),page.width,page.height),0,0);return out;}
 try{return await nativeDecode(file);}catch(err){if(err.message.includes('too large'))throw err;}
 const brand=String.fromCharCode(...head.slice(8,12));
 if(/\.(heic|heif)$/i.test(file.name)||/hei[cf]|heic|heix|mif1|msf1/.test(brand)||/hei[cf]/i.test(file.type)){
   $('busy').textContent='Converting your HEIC image…';
   const {heicTo}=await import('heic-to/csp');return nativeDecode(await heicTo({blob:file,type:'image/png'}));
 }
 throw new Error('We couldn’t open this image. Try a JPG, PNG, HEIC, TIFF, WebP, GIF, SVG, AVIF or BMP. Camera RAW and PSD files need to be exported first.');
}
async function openFile(file){
 if(!file)return;
 if(file.size>40*1024*1024){message('Choose an image smaller than 40 MB.',true);return;}
 const mine=++revision;
 loading=true;message('');$('busy').textContent='Opening your image…';$('busy').hidden=false;canvas.hidden=true;$('empty').hidden=true;$('download').disabled=true;$('compare').disabled=true;
 try{const next=await decode(file);if(mine!==revision)return;checkDimensions(next.width||next.naturalWidth,next.height||next.naturalHeight);image=next;name=file.name.replace(/\.[^.]+$/,'')||'image';original=false;$('compare').textContent='Show original';$('compare').setAttribute('aria-pressed','false');$('file-label').textContent=file.name;$('dimensions').textContent=`${image.width||image.naturalWidth} × ${image.height||image.naturalHeight} PX`;$('replace').hidden=false;render();}
 catch(err){if(mine===revision)message(err.message||'We couldn’t open this image. Try another file.',true);}
 finally{if(mine===revision){loading=false;$('busy').hidden=true;canvas.hidden=!image;$('empty').hidden=!!image;$('download').disabled=!image;$('compare').disabled=!image;}}
}
$('choose').onclick=$('replace').onclick=()=>$('file').click();
$('file').onchange=()=>{openFile($('file').files[0]);$('file').value='';};
$('slider').oninput=e=>setBlock(Number(e.target.value));
$('size').onchange=e=>{try{setBlock(Number(e.target.value));message('');}catch(err){message(err.message,true);e.target.value=block;}};
document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>setBlock(Number(b.dataset.size)));
$('compare').onclick=()=>{original=!original;$('compare').textContent=original?'Show pixelated':'Show original';$('compare').setAttribute('aria-pressed',String(original));render();};
['dragenter','dragover'].forEach(event=>$('stage').addEventListener(event,e=>{e.preventDefault();$('stage').classList.add('dragging');}));
$('stage').addEventListener('dragleave',e=>{if(!$('stage').contains(e.relatedTarget))$('stage').classList.remove('dragging');});
$('stage').addEventListener('drop',e=>{e.preventDefault();$('stage').classList.remove('dragging');openFile(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
function svgExport(){
 const w=image.width||image.naturalWidth,h=image.height||image.naturalHeight;
 const cols=Math.max(1,Math.ceil(w/block)),rows=Math.max(1,Math.ceil(h/block));
 const start=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;
 // Keep very fine exports usable rather than creating millions of vector shapes.
 if(cols*rows>250000){
  const raster=document.createElement('canvas');paint(raster,true,false);
  const data=raster.toDataURL('image/png');raster.width=raster.height=1;
  return {blob:new Blob([start,`<desc>Pixelated image embedded as PNG at this fine block size.</desc><image width="${w}" height="${h}" href="${data}"/></svg>`],{type:'image/svg+xml'}),embedded:true};
 }
 const grid=document.createElement('canvas');grid.width=cols;grid.height=rows;
 const c=grid.getContext('2d');c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(image,0,0,cols,rows);
 const pixels=c.getImageData(0,0,cols,rows).data;
 const parts=[start,'<desc>Pixelated image made from vector blocks.</desc><g shape-rendering="crispEdges">'];
 for(let y=0;y<rows;y++){
  for(let x=0;x<cols;){
   const i=(y*cols+x)*4;let end=x+1;
   while(end<cols){const j=(y*cols+end)*4;if(pixels[i]!==pixels[j]||pixels[i+1]!==pixels[j+1]||pixels[i+2]!==pixels[j+2]||pixels[i+3]!==pixels[j+3])break;end++;}
   if(pixels[i+3]){
    const left=Math.round(x*w/cols),top=Math.round(y*h/rows),right=Math.round(end*w/cols),bottom=Math.round((y+1)*h/rows);
    const opacity=pixels[i+3]===255?'':` fill-opacity="${pixels[i+3]/255}"`;
    parts.push(`<rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="rgb(${pixels[i]},${pixels[i+1]},${pixels[i+2]})"${opacity}/>`);
   }
   x=end;
  }
 }
 parts.push('</g></svg>');grid.width=grid.height=1;
 return {blob:new Blob(parts,{type:'image/svg+xml'}),embedded:false};
}
$('format').onchange=()=>{
 $('export-note').textContent=$('format').value==='svg'?'Vector blocks with transparency. Very fine settings use an embedded PNG to keep the file manageable.':'Original dimensions. PNG keeps transparency.';
};
$('download').onclick=async()=>{
 if(!image||loading)return;
 const button=$('download');button.disabled=true;message('Preparing your download…');
 let output;
 try{
  await new Promise(r=>requestAnimationFrame(r));
  const format=$('format').value;let blob,embedded=false;
  if(format==='svg'){({blob,embedded}=svgExport());}
  else{
   output=document.createElement('canvas');paint(output,true,false);
   if(format==='jpeg'){const c=output.getContext('2d');c.globalCompositeOperation='destination-over';c.fillStyle='#ffffff';c.fillRect(0,0,output.width,output.height);}
   blob=await new Promise(resolve=>output.toBlob(resolve,`image/${format}`,0.95));
  }
  if(!blob)throw new Error('Couldn’t export this image. Try a smaller image.');
  const ext=blob.type==='image/svg+xml'?'svg':blob.type==='image/webp'?'webp':blob.type==='image/jpeg'?'jpg':'png';
  const link=document.createElement('a');const url=URL.createObjectURL(blob);link.href=url;link.download=`${name}-pixelated-${block}px.${ext}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  message(embedded?'Your SVG is ready. This fine setting uses an embedded PNG.':'Your pixelated image is ready.');
 }catch(err){message(err.message||'Couldn’t download. Please try again.',true);}finally{if(output)output.width=output.height=1;button.disabled=!image||loading;}
};
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 try{Promise.resolve(document.modelContext.registerTool({name:'set_pixelation',title:'Set pixelation',description:'Set the block size of the currently loaded image. A larger size creates bigger pixels.',inputSchema:{type:'object',properties:{blockSize:{type:'integer',minimum:1,maximum:512}},required:['blockSize'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){if(!image||loading)throw new Error('Choose an image first.');if(!input||Object.keys(input).some(k=>k!=='blockSize'))throw new Error('Expected blockSize only.');setBlock(input.blockSize);await new Promise(r=>requestAnimationFrame(r));return {blockSize:block,width:image.width||image.naturalWidth,height:image.height||image.naturalHeight};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
}
