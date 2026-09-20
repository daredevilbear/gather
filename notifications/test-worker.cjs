const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = {}, notifications = [], opened = [];
const self = {
 location: {origin:'https://dashboard.example.test'},
 addEventListener: (name, fn)=>events[name]=fn,
 skipWaiting: async()=>{},
 registration:{showNotification:async(title,options)=>notifications.push({title,options})},
 clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},
};
vm.runInNewContext(fs.readFileSync(process.argv[2] || 'notifications/sw.js','utf8').replace('__GATHER_ICON__', JSON.stringify('/icon.png')),{self,URL,MessageChannel,setTimeout,clearTimeout});
(async()=>{
 let work;const waitUntil=p=>work=p;
 events.push({data:{json:()=>({id:'message-1',title:'Service alert',body:'Example message',url:'https://untrusted.invalid/'})},waitUntil});await work;
 assert.equal(notifications[0].title,'Service alert');
 assert.equal(notifications[0].options.tag,'message-1');
 assert.equal(notifications[0].options.data.messageId,'message-1');
 events.push({data:{json:()=>{throw Error('Malformed payload')}},waitUntil});await work;
 assert.equal(notifications[1].title,'Gather notification');
 events.notificationclick({notification:{close(){},data:notifications[0].options.data},waitUntil});await work;
 assert.equal(opened[0],'https://dashboard.example.test/?notifications=open&notification=message-1');
 events.notificationclick({notification:{close(){},tag:'legacy-id',data:{url:'https://untrusted.invalid/'}},waitUntil});await work;
 assert.equal(opened[1],'https://dashboard.example.test/?notifications=open&notification=legacy-id');
 events.notificationclick({notification:{close(){},data:{messageId:'../../bad'}},waitUntil});await work;
 assert.equal(opened[2],'https://dashboard.example.test/?notifications=open');
 let navigated,focused=false;
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/',navigate:async url=>{navigated=url;return {focus:async()=>{focused=true;}};}}];
 events.notificationclick({notification:{close(){},data:{messageId:'existing-window'}},waitUntil});await work;
 assert.equal(navigated,'https://dashboard.example.test/?notifications=open&notification=existing-window');assert.equal(focused,true);
 let handedOff;
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/',focus:async()=>{},postMessage:(data,ports)=>{handedOff=data;ports[0].postMessage({opened:true});ports[0].close();},navigate:async()=>{throw Error('Acknowledged handoff should not navigate');}}];
 events.notificationclick({notification:{close(){},data:{messageId:'warm-window'}},waitUntil});await work;
 assert.equal(handedOff.messageId,'warm-window');
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/',focus:async()=>{},postMessage:()=>{},navigate:async url=>{navigated=url;return {focus:async()=>{}};}}];
 events.notificationclick({notification:{close(){},data:{messageId:'old-page'}},waitUntil});await work;
 assert.equal(navigated,'https://dashboard.example.test/?notifications=open&notification=old-page');
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/',navigate:async()=>{throw Error('Client closed');}}];
 events.notificationclick({notification:{close(){},data:{messageId:'closed-window'}},waitUntil});await work;
 assert.equal(opened.at(-1),'https://dashboard.example.test/?notifications=open&notification=closed-window');
 assert.equal(events.fetch,undefined);
 console.log('Worker displays pushes, handles malformed payloads, opens only Homepage, and does not intercept page requests.');
})().catch(e=>{console.error(e);process.exit(1)});
