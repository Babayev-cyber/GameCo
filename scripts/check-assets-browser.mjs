import {WebSocket} from 'ws';
const tabs=await(await fetch('http://127.0.0.1:9331/json')).json(),ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));
let id=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){pending.get(m.id)?.(m.result);pending.delete(m.id);}if(m.method==='Network.responseReceived'&&m.params.response.status>=400)console.log(m.params.response.status,m.params.response.url);if(m.method==='Runtime.exceptionThrown')console.log(m.params.exceptionDetails.exception?.description);});
const call=(method,params={})=>new Promise(r=>{pending.set(++id,r);ws.send(JSON.stringify({id,method,params}));});
await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Runtime.enable');await call('Page.navigate',{url:process.env.MARS_TEST_URL||'http://localhost:3004'});await new Promise(r=>setTimeout(r,5000));ws.close();
