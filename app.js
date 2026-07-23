/* Kana Cards — offline-first flashcards with FSRS + drawing + stroke animation.
 * Multi-profile. Progress in localStorage (source of truth); cloud sync bolts on later. */
(function(){
  "use strict";
  const KANA = window.KANA, FSRS = window.FSRS;
  const $ = s => document.querySelector(s);
  const now = () => Date.now();

  // ---- ordered introduction list: all hiragana (by gojuon order), then all katakana ----
  const ALLIDS = Object.keys(KANA).sort((a,b)=>{
    const A=KANA[a], B=KANA[b];
    if(A.type!==B.type) return A.type==='hiragana' ? -1 : 1;
    return A.order-B.order;
  });
  const TOTAL = ALLIDS.length;

  // ---- persistence ----
  const META_KEY = 'kana_meta_v1';
  const deckKey = pid => 'kana_deck_'+pid;
  function deviceId(){
    let d = localStorage.getItem('kana_device');
    if(!d){ d = 'd'+Math.random().toString(36).slice(2,10); localStorage.setItem('kana_device',d); }
    return d;
  }
  function loadMeta(){
    try{ return JSON.parse(localStorage.getItem(META_KEY)) || {active:null,profiles:[]}; }
    catch(e){ return {active:null,profiles:[]}; }
  }
  function saveMeta(m){ localStorage.setItem(META_KEY, JSON.stringify(m)); }
  function loadDeck(pid){
    try{ const d=JSON.parse(localStorage.getItem(deckKey(pid)));
         if(d&&d.cards&&d.introduced) return d; }catch(e){}
    return {cards:{}, introduced:[], reviews:0, updatedAt:now(), device:deviceId()};
  }
  function saveDeck(pid,d){ d.updatedAt=now(); d.device=deviceId();
    localStorage.setItem(deckKey(pid), JSON.stringify(d)); }

  // ---- app state ----
  let meta = loadMeta();
  let pid = meta.active;
  let deck = pid ? loadDeck(pid) : null;
  let session = [];        // in-memory queue of due cardIds
  let flipped = false;
  let curDrawn = false;

  // ---- profile helpers ----
  function profileName(id){ const p=meta.profiles.find(p=>p.id===id); return p?p.name:'—'; }
  function newProfile(name){
    const id='p'+Math.random().toString(36).slice(2,8);
    meta.profiles.push({id,name}); meta.active=id; saveMeta(meta);
    pid=id; deck=loadDeck(pid); saveDeck(pid,deck);
    introduceNext(3); // start everyone with 3 cards
  }
  function switchProfile(id){ meta.active=id; saveMeta(meta); pid=id; deck=loadDeck(pid); startSession(); }

  // ---- deck logic ----
  function introduceNext(n){
    let added=0;
    for(const id of ALLIDS){
      if(added>=n) break;
      if(!deck.cards[id]){
        deck.cards[id]={S:0,D:0,reps:0,lapses:0,last:0,due:now(),state:'new'};
        deck.introduced.push(id); added++;
      }
    }
    saveDeck(pid,deck);
    return added;
  }
  function dueIds(){
    const t=now();
    return deck.introduced.filter(id=>deck.cards[id].due<=t)
      .sort((a,b)=>deck.cards[a].due-deck.cards[b].due);
  }
  function learnedCount(){
    // "learned" = introduced & has passed at least one non-Bad review (reps>0 & state review & S>=1day)
    return deck.introduced.filter(id=>{const c=deck.cards[id];return c.reps>0 && c.S>=1;}).length;
  }
  function startSession(){ session = dueIds(); flipped=false; render(); }

  function grade(g){ // g: 1 bad, 2 okay, 3 good
    const id=session[0]; if(!id) return;
    const c=deck.cards[id];
    const r=FSRS.schedule(c,g,now());
    Object.assign(c,r);
    deck.reviews=(deck.reviews||0)+1;
    saveDeck(pid,deck);
    session.shift();
    if(g===1){ // Bad → re-show soon this session
      const pos=Math.min(3,session.length);
      session.splice(pos,0,id);
    }
    flipped=false; curDrawn=false;
    if(session.length===0) session=dueIds(); // pick up anything newly due
    render();
  }

  // ================= RENDERING =================
  const main = $('#main');

  function render(){
    updateHeader();
    if(!pid){ renderProfileCreate(); return; }
    if(session.length===0){ renderCaughtUp(); return; }
    renderCard(session[0]);
  }
  function updateHeader(){
    $('#profileName').textContent = pid ? profileName(pid) : '—';
    $('#totalCount').textContent = TOTAL;
    if(deck){
      $('#dueCount').textContent = dueIds().length;
      $('#learnedCount').textContent = learnedCount();
    }
  }

  function renderProfileCreate(){
    main.innerHTML =
     `<div class="center">
        <h2>Who's studying?</h2>
        <p>Make a profile for each learner. Everyone gets their own deck and progress.</p>
        <input id="pname" placeholder="Type a name" maxlength="16"
          style="font-size:18px;padding:14px;border:1px solid #dfe3ef;border-radius:14px;width:220px;text-align:center">
        <button class="bigbtn" id="createP">Start learning →</button>
        ${meta.profiles.length? `<div style="margin-top:10px">${meta.profiles.map(p=>
            `<button class="bigbtn ghost" style="margin:4px" data-pid="${p.id}">${esc(p.name)}</button>`).join('')}</div>`:''}
      </div>`;
    $('#createP').onclick=()=>{ const n=$('#pname').value.trim(); if(n){ newProfile(n); render(); } };
    main.querySelectorAll('[data-pid]').forEach(b=>b.onclick=()=>switchProfile(b.dataset.pid));
  }

  function renderCaughtUp(){
    const remaining = TOTAL - deck.introduced.length;
    const next = dueIds(); // 0 here
    // find soonest future due
    let soon=null;
    deck.introduced.forEach(id=>{const d=deck.cards[id].due; if(d>now()&&(soon===null||d<soon))soon=d;});
    const soonTxt = soon? `Next review ready ${relTime(soon)}.` : '';
    main.innerHTML =
     `<div class="center">
        <h2>🎉 All caught up!</h2>
        <p>${soonTxt||'Nice work.'} ${remaining>0?`You've learned ${deck.introduced.length} of ${TOTAL} characters.`:'You\'ve unlocked every character!'}</p>
        ${remaining>0?`<button class="bigbtn" id="addBtn">➕ Add 3 new cards</button>`:''}
        ${soon?`<button class="bigbtn ghost" id="reviewAhead">Review ahead anyway</button>`:''}
      </div>`;
    if(remaining>0) $('#addBtn').onclick=()=>{ introduceNext(3); startSession(); };
    if(soon) $('#reviewAhead') && ($('#reviewAhead').onclick=()=>{
      session=deck.introduced.slice().sort((a,b)=>deck.cards[a].due-deck.cards[b].due).slice(0,10); render(); });
  }

  function renderCard(id){
    const c=KANA[id];
    main.innerHTML =
     `<div class="card">
        <div class="prompt">
          <div class="label">Draw this sound</div>
          <div class="romaji">${esc(c.romaji)}</div>
          <div class="type">${c.type}</div>
        </div>
        <div id="answer">
          <div class="strokebox">
            <svg class="stroke" id="strokeSvg" viewBox="0 0 109 109"></svg>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:center">
              <div class="kana">${esc(c.kana)}</div>
              <button class="replay" id="replayBtn">▶ Replay</button>
            </div>
          </div>
        </div>
        <div class="drawwrap">
          <div class="drawhint">✍️ Trace it with your finger</div>
          <canvas id="pad"></canvas>
          <button class="clearbtn" id="clearBtn">Clear</button>
        </div>
      </div>
      <div class="actions">
        <button class="flipbtn" id="flipBtn">Flip →</button>
        <div class="grade" id="grade">
          <button class="b-bad"  data-g="1">Bad<span class="sub">again</span></button>
          <button class="b-okay" data-g="2">Okay<span class="sub">soon</span></button>
          <button class="b-good" data-g="3">Good<span class="sub">later</span></button>
        </div>
      </div>`;
    setupPad();
    $('#flipBtn').onclick=()=>doFlip(id);
    $('#grade').querySelectorAll('button').forEach(b=>b.onclick=()=>grade(+b.dataset.g));
  }

  function doFlip(id){
    if(flipped) return; flipped=true;
    $('#answer').classList.add('show');
    $('#flipBtn').style.display='none';
    $('#grade').classList.add('show');
    buildStrokes(id);
    $('#replayBtn').onclick=()=>buildStrokes(id);
  }

  // ---- stroke-order animation ----
  function buildStrokes(id){
    const strokes=KANA[id].strokes;
    const svg=$('#strokeSvg'); svg.innerHTML='';
    const NS='http://www.w3.org/2000/svg';
    // faint guides (whole character)
    strokes.forEach(d=>{ const p=document.createElementNS(NS,'path');
      p.setAttribute('d',d); p.setAttribute('class','guide'); svg.appendChild(p); });
    // animated live strokes, drawn sequentially
    const live=strokes.map(d=>{ const p=document.createElementNS(NS,'path');
      p.setAttribute('d',d); p.setAttribute('class','live'); svg.appendChild(p); return p; });
    live.forEach(p=>{ const L=p.getTotalLength(); p.style.strokeDasharray=L; p.style.strokeDashoffset=L; });
    let i=0;
    (function step(){
      if(i>=live.length) return;
      const p=live[i], L=p.getTotalLength();
      const dur=Math.max(320, L*7); // speed ~ length
      p.animate([{strokeDashoffset:L},{strokeDashoffset:0}],
                {duration:dur,fill:'forwards',easing:'ease-in-out'});
      i++; setTimeout(step, dur+180);
    })();
  }

  // ---- drawing pad ----
  function setupPad(){
    const cv=$('#pad'); if(!cv) return;
    const fit=()=>{
      const r=cv.getBoundingClientRect(); const dpr=window.devicePixelRatio||1;
      cv.width=r.width*dpr; cv.height=r.height*dpr;
      const ctx=cv.getContext('2d'); ctx.scale(dpr,dpr);
      ctx.lineWidth=6; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#222';
      cv._ctx=ctx; cv._w=r.width; cv._h=r.height;
    };
    fit();
    let drawing=false,lx=0,ly=0;
    const pos=e=>{ const r=cv.getBoundingClientRect();
      const t=e.touches?e.touches[0]:e; return [t.clientX-r.left,t.clientY-r.top]; };
    const down=e=>{ e.preventDefault(); drawing=true; curDrawn=true; [lx,ly]=pos(e); };
    const move=e=>{ if(!drawing)return; e.preventDefault(); const[x,y]=pos(e);
      const ctx=cv._ctx; ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(x,y); ctx.stroke(); [lx,ly]=[x,y]; };
    const up=()=>{ drawing=false; };
    cv.addEventListener('pointerdown',down); cv.addEventListener('pointermove',move);
    window.addEventListener('pointerup',up);
    $('#clearBtn').onclick=()=>{ cv._ctx.clearRect(0,0,cv._w,cv._h); };
    // refit if orientation changes mid-card
    cv._fit=fit;
  }

  // ================= SETTINGS SHEET =================
  $('#gearBtn').onclick=()=>openSheet();
  $('#profileBtn').onclick=()=>openSheet(true);
  $('#closeSheet').onclick=()=>$('#sheet').classList.remove('show');
  $('#sheet').addEventListener('click',e=>{ if(e.target.id==='sheet') e.target.classList.remove('show'); });

  function openSheet(focusProfiles){
    $('#s_learned').textContent = deck? learnedCount()+' / '+TOTAL : '0';
    $('#s_reviews').textContent = deck? (deck.reviews||0) : '0';
    injectProfileControls();
    $('#sheet').classList.add('show');
  }
  function injectProfileControls(){
    let box=$('#profileControls');
    if(!box){ box=document.createElement('div'); box.id='profileControls';
      const inner=$('.sheetinner'); inner.insertBefore(box, inner.children[1]); }
    box.innerHTML =
      `<div class="row"><span>Profile</span><span>
        <select id="profSel" style="font-size:14px;padding:6px;border-radius:8px;border:1px solid #dfe3ef">
          ${meta.profiles.map(p=>`<option value="${p.id}" ${p.id===pid?'selected':''}>${esc(p.name)}</option>`).join('')}
        </select></span></div>
       <div class="row"><span>Add another learner</span>
        <button class="ghost" id="addProf" style="color:var(--accent)">+ New</button></div>`;
    $('#profSel').onchange=e=>{ switchProfile(e.target.value); $('#sheet').classList.remove('show'); };
    $('#addProf').onclick=()=>{ const n=prompt('New learner name:'); if(n&&n.trim()){ newProfile(n.trim()); $('#sheet').classList.remove('show'); render(); } };
  }

  // ---- backup / restore (manual cross-device bridge until cloud sync) ----
  $('#backupBtn').onclick=()=>{
    const payload={v:1, meta, decks:{}};
    meta.profiles.forEach(p=>payload.decks[p.id]=loadDeck(p.id));
    const code=b64(JSON.stringify(payload));
    $('#backupArea').value=code;
    if(navigator.clipboard) navigator.clipboard.writeText(code).catch(()=>{});
    $('#backupBtn').textContent='Copied ✓ — paste on the other device';
    setTimeout(()=>$('#backupBtn').textContent='Copy backup code',2500);
  };
  $('#restoreBtn').onclick=()=>{
    try{
      const p=JSON.parse(unb64($('#backupArea').value.trim()));
      if(!p||!p.decks||!p.meta) throw 0;
      // merge: per profile, per card keep the most recently reviewed version
      const inMeta=p.meta;
      inMeta.profiles.forEach(prof=>{
        if(!meta.profiles.find(x=>x.id===prof.id)) meta.profiles.push(prof);
        const local=loadDeck(prof.id), incoming=p.decks[prof.id];
        if(!incoming) return;
        const merged=mergeDeck(local,incoming);
        saveDeck(prof.id,merged);
      });
      meta.active=inMeta.active||meta.active; saveMeta(meta);
      pid=meta.active; deck=loadDeck(pid);
      $('#sheet').classList.remove('show'); startSession();
      alert('Progress restored & merged ✓');
    }catch(e){ alert('That code didn\'t look right — recopy it from the other device.'); }
  };
  function mergeDeck(a,b){
    const out={cards:{},introduced:[],reviews:Math.max(a.reviews||0,b.reviews||0)};
    const ids=new Set([...a.introduced,...b.introduced]);
    ids.forEach(id=>{
      const ca=a.cards[id], cb=b.cards[id];
      out.cards[id]= !ca?cb : !cb?ca : (cb.last>=ca.last? cb:ca); // newest review wins
      out.introduced.push(id);
    });
    out.introduced.sort((x,y)=>ALLIDS.indexOf(x)-ALLIDS.indexOf(y));
    return out;
  }

  $('#resetBtn').onclick=()=>{
    if(!confirm('Erase ALL progress for '+profileName(pid)+'? This cannot be undone.')) return;
    localStorage.removeItem(deckKey(pid)); deck=loadDeck(pid); introduceNext(3); startSession();
    $('#sheet').classList.remove('show');
  };

  // ---- utils ----
  function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function b64(s){ return btoa(unescape(encodeURIComponent(s))); }
  function unb64(s){ return decodeURIComponent(escape(atob(s))); }
  function relTime(t){
    const m=Math.round((t-now())/60000);
    if(m<60) return 'in '+Math.max(1,m)+' min';
    const h=Math.round(m/60); if(h<24) return 'in '+h+' hr';
    return 'in '+Math.round(h/24)+' day'+(Math.round(h/24)>1?'s':'');
  }

  // ---- boot ----
  if(pid){ deck=loadDeck(pid); if(deck.introduced.length===0) introduceNext(3); startSession(); }
  else render();

  // expose a hook for future cloud sync
  window.KanaApp={ loadDeck, saveDeck, loadMeta, mergeDeck, get pid(){return pid;} };
})();
