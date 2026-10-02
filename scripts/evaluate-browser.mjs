import {WebSocket} from 'ws';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise(r=>ws.once('open',r));
ws.once('message',raw=>{const m=JSON.parse(raw);console.log(JSON.stringify(m.result,null,2));ws.close();});
ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:process.argv[2]||'window.marsDiagnostics()',returnByValue:true,awaitPromise:true}}));
