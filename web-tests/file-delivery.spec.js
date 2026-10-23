import {test,expect} from '@playwright/test';
test('modal ZIP download survives closing the dialog and preserves a 13 MB video',async({page},info)=>{
 await page.goto('/pwa/');
 await page.evaluate(async()=>{
  Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});
  const {exportFigure}=await import('/pwa/package.js'),{saveFile}=await import('/pwa/file-delivery.js');
  const bytes=Uint8Array.from({length:13946061},(_,i)=>i%251);window.expectedZipVideo=bytes.length;
  const blob=await exportFigure({title:'ZIP Speichertest',description:'Originalbytes',tags:[]},[{name:'Video',blob:new Blob([bytes],{type:'video/mp4'})}]);
  const file=new File([blob],'ZIP-Speichertest.zip',{type:'application/zip'}),dialog=document.createElement('dialog'),button=document.createElement('button');
  button.textContent='Test-ZIP speichern';dialog.append(button);document.body.append(dialog);dialog.showModal();
  button.onclick=()=>{window.delivery=saveFile(file,{container:dialog});dialog.close();window.delivery.then(result=>window.deliveryResult=result);};
 });
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Test-ZIP speichern'}).click();const download=await pending;
 expect(download.suggestedFilename()).toBe('ZIP-Speichertest.zip');const file=info.outputPath('13mb.zip');await download.saveAs(file);
 await expect.poll(()=>page.evaluate(()=>window.deliveryResult)).toBe('download');
 await page.evaluate(()=>{const input=document.createElement('input');input.id='checkDownloadedZip';input.type='file';document.body.append(input);});
 await page.locator('#checkDownloadedZip').setInputFiles(file);
 const result=await page.evaluate(async()=>{const {importFigure,checksum}=await import('/pwa/package.js');const data=await importFigure(document.querySelector('#checkDownloadedZip').files[0]);const video=data.drafts[0].blob;return{title:data.title,size:video.size,crc:await checksum(video)};});
 expect(result).toEqual({title:'ZIP Speichertest',size:13946061,crc:3357519416});
});
test('save picker starts in the click and write failures abort the writer',async({page})=>{
 await page.goto('/pwa/');
 const result=await page.evaluate(async()=>{
  const {saveFile}=await import('/pwa/file-delivery.js');const calls=[];
  window.showSaveFilePicker=options=>{calls.push(options.suggestedName);return Promise.resolve({createWritable:async()=>({write:async file=>{calls.push(file.size);throw Error('Speicher voll');},close:async()=>calls.push('close'),abort:async()=>calls.push('abort')})});};
  const promise=saveFile(new File(['zip'],'Test.zip'));const synchronous=calls[0];let error;try{await promise;}catch(e){error=e.message;}return{calls,error,synchronous};
 });
 expect(result).toEqual({calls:['Test.zip',3,'abort'],error:'Speicher voll',synchronous:'Test.zip'});
});
