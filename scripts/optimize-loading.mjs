// Re-encode the uploaded cinematic through Chrome's built-in H.264 encoder.
// Original ../loading.mp4 is unchanged. Requires Chrome CDP on port 9331 and local game server.
import {WebSocket} from 'ws';
import {writeFile,copyFile} from 'node:fs/promises';
await copyFile('../loading.mp4','public/assets/loading.mp4');
const root=await(await fetch('http://127.0.0.1:9331/json/version')).json();
const browser=new WebSocket(root.webSocketDebuggerUrl);await new Promise(r=>browser.once('open',r));
function channel(ws){let id=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}});return (method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id:n,method,params}));});}
const callBrowser=channel(browser),{targetId}=await callBrowser('Target.createTarget',{url:'http://localhost:3001/health'});
let page;
try{
 const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();page=new WebSocket(tabs.find(t=>t.id===targetId).webSocketDebuggerUrl);await new Promise(r=>page.once('open',r));const call=channel(page);
 await call('Page.bringToFront');
 const encoded=await call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const video=document.createElement('video');video.src='/assets/loading.mp4';video.muted=true;video.playsInline=true;video.preload='auto';document.body.replaceChildren(video);
  await new Promise((r,j)=>{video.onloadeddata=r;video.onerror=j;});
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;document.body.append(canvas);const ctx=canvas.getContext('2d',{alpha:false});
  const stream=canvas.captureStream(30),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/mp4;codecs=avc1.42001E',videoBitsPerSecond:1400000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(r=>recorder.onstop=r);
  function frame(){ctx.drawImage(video,0,0,1280,720);if(!video.ended)video.requestVideoFrameCallback(frame);}
  ctx.drawImage(video,0,0,1280,720);recorder.start();frame();await video.play();
  await new Promise(r=>video.onended=r);recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
  const bytes=new Uint8Array(await new Blob(chunks,{type:'video/mp4'}).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return {base64:btoa(text),width:1280,height:720,sourceDuration:video.duration};
 })()`});
 if(encoded.exceptionDetails)throw Error(encoded.exceptionDetails.exception?.description||encoded.exceptionDetails.text);
 const data=encoded.result.value,buffer=Buffer.from(data.base64,'base64');await writeFile('public/assets/loading.mp4',buffer);
 console.log(JSON.stringify({bytes:buffer.length,width:data.width,height:data.height,sourceDuration:data.sourceDuration}));
}finally{page?.close();await callBrowser('Target.closeTarget',{targetId});browser.close();}
