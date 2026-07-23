import worker from '/home/mike/projects/kana-flashcards/worker/worker.js';
import fs from 'fs';
import vm from 'vm';

let PASS=0, FAIL=0;
const ok=(c,m)=>{ if(c){PASS++;} else {FAIL++; console.log('  ✗ FAIL:',m);} };

// ---- in-memory KV + worker-backed fetch ----
const store=new Map();
const env={ KANA_KV:{
  async get(k,type){ const v=store.get(k); return v===undefined?null:(type==='json'?JSON.parse(v):v); },
  async put(k,v){ store.set(k,String(v)); } } };
let fetchCount=0;
globalThis.fetch=async(u,init={})=>{ fetchCount++; return worker.fetch(new Request(u,init),env); };

// ---- mock localStorage + minimal KanaApp (mirrors app.js) ----
const T0=1_000_000;
let clock=T0; const now=()=>clock;
function makeLS(){ const m=new Map(); return {getItem:k=>m.has(k)?m.get(k):null,
  setItem:(k,v)=>m.set(k,String(v)), removeItem:k=>m.delete(k), _m:m}; }
const ALLIDS=['a','i','u','e','o','ka','ki'];
function makeApp(ls, profiles){
  const deckKey=pid=>'kana_deck_'+pid;
  const loadMeta=()=>({active:profiles[0].id, profiles});
  const loadDeck=pid=>{ try{const d=JSON.parse(ls.getItem(deckKey(pid))); if(d&&d.cards&&d.introduced)return d;}catch(e){}
    return {cards:{},introduced:[],reviews:0,updatedAt:now(),device:'dev'}; };
  const saveDeck=(pid,d)=>{ d.updatedAt=now(); ls.setItem(deckKey(pid),JSON.stringify(d));
    if(win.KanaSync) win.KanaSync.onSave(pid,d); };
  const mergeDeck=(a,b)=>{ const out={cards:{},introduced:[],reviews:Math.max(a.reviews||0,b.reviews||0)};
    const ids=new Set([...a.introduced,...b.introduced]);
    ids.forEach(id=>{const ca=a.cards[id],cb=b.cards[id]; out.cards[id]=!ca?cb:!cb?ca:(cb.last>=ca.last?cb:ca); out.introduced.push(id);});
    out.introduced.sort((x,y)=>ALLIDS.indexOf(x)-ALLIDS.indexOf(y)); return out; };
  return {loadMeta,loadDeck,saveDeck,mergeDeck};
}

// ---- load sync.js into a shared global `window`, with a patched endpoint ----
const win={};
globalThis.window=win;
function loadSync(endpoint){
  let src=fs.readFileSync('/home/mike/projects/kana-flashcards/sync.js','utf8');
  src=src.replace('const SYNC_ENDPOINT = "";', `const SYNC_ENDPOINT = "${endpoint}";`);
  vm.runInThisContext(src); // defines window.KanaSync
}

function introduce(app,pid,ids){ const d=app.loadDeck(pid); ids.forEach(id=>{ if(!d.cards[id]){ d.cards[id]={S:0,D:0,reps:0,lapses:0,last:0,due:now(),state:'new'}; d.introduced.push(id);} }); app.saveDeck(pid,d); }
function grade(app,pid,id,S){ const d=app.loadDeck(pid); d.cards[id].last=now(); d.cards[id].S=S; d.cards[id].reps++; d.cards[id].state='review'; d.reviews++; app.saveDeck(pid,d); }

// ================= ON-path E2E =================
console.log('== cloud sync ON: two devices, same learner name, different pids ==');
loadSync('http://kv.local');

// Device A — "Emma" pid pA
const lsA=makeLS(), appA=makeApp(lsA,[{id:'pA',name:'Emma'}]);
win.KanaApp=appA;
introduce(appA,'pA',['a','i','u']);
clock=T0+10; grade(appA,'pA','a',5);           // Emma learned 'a' on device A
win.KanaSync.pushNow('pA');
await new Promise(r=>setTimeout(r,20));         // let async worker POST settle
ok(store.has('deck:home:emma'),'remote key deck:home:emma created by push');
const remoteA=JSON.parse(store.get('deck:home:emma'));
ok(remoteA.introduced.includes('a')&&remoteA.cards.a.S===5,'remote holds A\'s graded card');

// Device B — "Emma" pid pB (fresh device, empty local)
const lsB=makeLS(), appB=makeApp(lsB,[{id:'pB',name:'Emma'}]);
win.KanaApp=appB;
ok(appB.loadDeck('pB').introduced.length===0,'device B starts empty');
clock=T0+100;
const changed1=await win.KanaSync.pull('pB');
ok(changed1===true,'pull reports changed=true on first sync');
const deckB=appB.loadDeck('pB');
ok(deckB.introduced.includes('a')&&deckB.introduced.includes('u'),'B pulled A\'s introduced set');
ok(deckB.cards.a && deckB.cards.a.S===5,'B pulled A\'s graded card state');
await new Promise(r=>setTimeout(r,20));

// Conflict: B grades 'i' newer; A grades 'a' again OLDER-in-time-but... test newest-wins per card
clock=T0+200; grade(appB,'pB','i',7); win.KanaSync.pushNow('pB');
await new Promise(r=>setTimeout(r,20));
win.KanaApp=appA; clock=T0+150; grade(appA,'pA','a',9); // A updates 'a' at t=150 (< B's 'i' at 200, but different card)
win.KanaSync.pushNow('pA'); await new Promise(r=>setTimeout(r,20));
clock=T0+300; const changed2=await win.KanaSync.pull('pA');
const deckA2=appA.loadDeck('pA');
ok(deckA2.cards.i && deckA2.cards.i.S===7,'A pulled B\'s newer card i (card-level merge)');
ok(deckA2.cards.a.S===9,'A kept its own newer card a (t=150 > remote t=10)');

// True conflict on SAME card: newest .last wins
win.KanaApp=appB; clock=T0+400; grade(appB,'pB','a',11); win.KanaSync.pushNow('pB');
await new Promise(r=>setTimeout(r,20));
win.KanaApp=appA; clock=T0+500; const changed3=await win.KanaSync.pull('pA');
ok(appA.loadDeck('pA').cards.a.S===11,'same-card conflict: newest .last (t=400) wins over t=150');

// ================= OFF-path: non-breaking =================
console.log('== cloud sync OFF (empty endpoint): must never touch network ==');
await new Promise(r=>setTimeout(r,1600)); // drain any pending ON-path debounce timers first
loadSync(''); // reload KanaSync with sync disabled
ok(win.KanaSync.enabled()===false,'enabled() false when endpoint empty');
const before=fetchCount;
const lsC=makeLS(), appC=makeApp(lsC,[{id:'pC',name:'Kai'}]);
win.KanaApp=appC;
introduce(appC,'pC',['a','i']);        // saveDeck -> onSave (should be no-op)
grade(appC,'pC','a',3);
const offPull=await win.KanaSync.pull('pC');
await new Promise(r=>setTimeout(r,1600)); // longer than debounce — confirm no delayed push
ok(fetchCount===before,`no fetch when sync off (was ${before}, now ${fetchCount})`);
ok(offPull===false,'pull returns false when off');
ok(appC.loadDeck('pC').cards.a.S===3,'app works normally with sync off');

// ---- slug correctness ----
ok(win.KanaSync._slug(' Emma ')==='emma','slug trims+lowercases');
ok(win.KanaSync._slug('Kai 2!')==='kai-2','slug URL-safes');

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL?1:0);
