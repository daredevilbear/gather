const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const events = {}, notifications = [], opened = [], badges = [];
const warnings = [];
let failFetch = false;
let fetches = 0;
let preferences = {badge:true, pushPage:true};
const self = {
 navigator: {setAppBadge:async count=>badges.push(count),clearAppBadge:async()=>badges.push(0)},
 location: {origin:'https://dashboard.example.test'},
 addEventListener: (name, fn)=>events[name]=fn,
 skipWaiting: async()=>{},
 registration:{showNotification:async(title,options)=>notifications.push({title,options})},
 clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},
};
vm.runInNewContext(fs.readFileSync(process.argv[2] || 'notifications/sw.js','utf8').replace('__GATHER_ICON__', JSON.stringify('/icon.png')),{self,URL,MessageChannel,setTimeout,clearTimeout,console:{warn:(...args)=>warnings.push(args)},fetch:async url=>{fetches++;return {ok:!failFetch,json:async()=>url.endsWith('/feed') ? {messages:[{id:'one'},{id:'two'}]} : {states:{one:'read'},preferences}};}});
(async()=>{
 let work;const waitUntil=p=>work=p;
 events.activate({waitUntil});await work;
 assert.equal(badges.at(-1),1);
 assert.equal(notifications.length,0);
 failFetch=true;
 events.activate({waitUntil});await work;
 assert.equal(warnings.at(-1)[1].reason,'activate');
 assert.equal(warnings.at(-1)[1].stage,'inbox-state');
 failFetch=false;
 events.push({data:{json:()=>({id:'message-1',title:'Service alert',body:'Example message',url:'https://untrusted.invalid/'})},waitUntil});await work;
 assert.equal(badges.at(-1),1);
 assert.equal(notifications[0].title,'Service alert');
 assert.equal(notifications[0].options.tag,'message-1');
 assert.equal(notifications[0].options.data.messageId,'message-1');
 events.push({data:{json:()=>{throw Error('Malformed payload')}},waitUntil});await work;
 assert.equal(notifications[1].title,'Gather notification');
 events.notificationclick({notification:{close(){},data:notifications[0].options.data},waitUntil});await work;
 assert.equal(opened[0],'https://dashboard.example.test/notifications?notification=message-1');
 events.notificationclick({notification:{close(){},tag:'legacy-id',data:{url:'https://untrusted.invalid/'}},waitUntil});await work;
 assert.equal(opened[1],'https://dashboard.example.test/notifications?notification=legacy-id');
 events.notificationclick({notification:{close(){},data:{messageId:'../../bad'}},waitUntil});await work;
 assert.equal(opened[2],'https://dashboard.example.test/notifications');
 let navigated,focused=false;
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/notifications',navigate:async url=>{navigated=url;return {focus:async()=>{focused=true;}};}}];
 events.notificationclick({notification:{close(){},data:{messageId:'existing-window'}},waitUntil});await work;
 assert.equal(navigated,'https://dashboard.example.test/notifications?notification=existing-window');assert.equal(focused,true);
 let handedOff;
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/notifications',focus:async()=>{},postMessage:(data,ports)=>{handedOff=data;ports[0].postMessage({opened:true});ports[0].close();},navigate:async()=>{throw Error('Acknowledged handoff should not navigate');}}];
 events.notificationclick({notification:{close(){},data:{messageId:'warm-window'}},waitUntil});await work;
 assert.equal(handedOff.messageId,'warm-window');
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/notifications',focus:async()=>{},postMessage:()=>{},navigate:async url=>{navigated=url;return {focus:async()=>{}};}}];
 events.notificationclick({notification:{close(){},data:{messageId:'old-page'}},waitUntil});await work;
 assert.equal(navigated,'https://dashboard.example.test/notifications?notification=old-page');
 self.clients.matchAll=async()=>[{url:'https://dashboard.example.test/notifications',navigate:async()=>{throw Error('Client closed');}}];
 events.notificationclick({notification:{close(){},data:{messageId:'closed-window'}},waitUntil});await work;
 assert.equal(opened.at(-1),'https://dashboard.example.test/notifications?notification=closed-window');
 preferences = {badge:false,pushPage:false};
 events.push({data:{json:()=>({id:'disabled'})},waitUntil});await work;
 assert.equal(badges.at(-1),0);
 self.clients.matchAll=async()=>[];
 events.notificationclick({notification:{close(){},data:{messageId:'compact'}},waitUntil});await work;
 assert.equal(opened.at(-1),'https://dashboard.example.test/?notification=compact&notifications=open');
 // A suspended app must apply an encrypted push count even with no valid
 // session or network access. Test pushes carry the real inbox count too.
 failFetch=true;
 const fetchesBefore=fetches;
 for (const count of [7,200,0]) {
   events.push({data:{json:()=>({id:'background',title:'Background alert',badgeCount:count})},waitUntil});await work;
   assert.equal(badges.at(-1),count);
   assert.equal(notifications.at(-1).title,'Background alert');
   assert.equal(fetches,fetchesBefore);
 }
 // Invalid/newer payload fields fall back to the existing authenticated refresh.
 failFetch=false;
 preferences={badge:true,pushPage:true};
 for (const count of [-1,201,1.5,'7',null]) {
   const before=fetches;
   events.push({data:{json:()=>({id:'invalid-count',badgeCount:count})},waitUntil});await work;
   assert.equal(badges.at(-1),1);
   assert.equal(fetches,before+2);
 }
 failFetch=true;
 const shownBefore=notifications.length;
 events.push({data:{json:()=>({id:'legacy-offline'})},waitUntil});await work;
 assert.equal(notifications.length,shownBefore+1);
 assert.equal(warnings.at(-1)[1].stage,'inbox-state');
 for (const value of [null,7,'message',[]]) {
   const before=notifications.length;
   events.push({data:{json:()=>value},waitUntil});await work;
   assert.equal(notifications.length,before+1);
   assert.equal(notifications.at(-1).title,'Gather notification');
 }
 // A rejected/unsupported Badging API must not suppress the visible alert.
 const setAppBadge=self.navigator.setAppBadge;
 self.navigator.setAppBadge=async()=>{throw Error('Badge rejected');};
 events.push({data:{json:()=>({id:'badge-rejected',badgeCount:3})},waitUntil});await work;
 assert.equal(notifications.at(-1).options.tag,'badge-rejected');
 assert.equal(warnings.at(-1)[1].stage,'apply');
 delete self.navigator.setAppBadge;
 events.push({data:{json:()=>({id:'badge-unsupported',badgeCount:3})},waitUntil});await work;
 assert.equal(notifications.at(-1).options.tag,'badge-unsupported');
 self.navigator.setAppBadge=setAppBadge;
 assert.equal(events.fetch,undefined);
 console.log('Worker applies background push badges without fetches, supports legacy payloads, displays alerts, and opens only Gather.');
})().catch(e=>{console.error(e);process.exit(1)});
