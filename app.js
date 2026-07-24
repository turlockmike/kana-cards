/* Japanese Cards — one app, two decks: KANA (stroke-order) + WORDS (picture → kana+audio).
 * Consolidated 2026-07-23 (Mike's order): word625 picture-cards grafted into the kana app.
 *
 * ONE profile list (kana_meta_v1) holds BOTH decks. A mode toggle (Kana | Words) swaps the
 * active deck + card renderer. Decks are namespaced by mode in localStorage:
 *     kana_deck_<pid>          -> KANA deck  (unchanged — existing progress preserved)
 *     kana_deck_<pid>_words    -> WORDS deck
 * FSRS scheduling is per-card, independent per mode. localStorage is the source of truth;
 * optional cloud sync (sync.js, off by default) round-trips BOTH decks per profile.
 *
 * WORDS pedagogy (Mike, 2026-07-23): PICTURE on front -> produce kana + audio on back,
 * NO English on the card. Card content loaded at boot from two static JSON files:
 *     media/img/images.json  -> [{en, slug, file, category, status, ...}]  (images we have)
 *     data/words.json        -> [{id|en, kana, en, audio}]                 (kana + audio)
 */
(function(){
  "use strict";
  const KANA = window.KANA, FSRS = window.FSRS;
  const $ = s => document.querySelector(s);
  const now = () => Date.now();

  // ================= CONTENT PROVIDERS =================
  // --- KANA: hiragana (gojuon order) then katakana. Synchronous (from kana.js). ---
  const KANA_IDS = Object.keys(KANA).sort((a,b)=>{
    const A=KANA[a], B=KANA[b];
    if(A.type!==B.type) return A.type==='hiragana' ? -1 : 1;
    return A.order-B.order;
  });

  // --- WORDS: picture cards. Loaded async from JSON, SW-cached for offline. ---
  const IMG_DIR = 'media/img/', AUDIO_DIR = 'media/audio/';
  const W = { cards:{}, ids:[], ready:false };   // cards: slug -> {slug,en,file,category,kana,audio}
  async function loadJSON(url){
    try{ const r = await fetch(url, {cache:'no-cache'}); if(!r.ok) throw 0; return await r.json(); }
    catch(e){ return null; }
  }
  async function loadWords(){
    const imgs = await loadJSON(IMG_DIR+'images.json') || [];
    const words = await loadJSON('data/words.json');
    const sents = await loadJSON('data/sentences.json') || {};   // slug -> {s, hl, a}
    const byEn = {};
    if(Array.isArray(words)){
      words.forEach(w=>{ const k=(w.en||w.english||'').trim().toLowerCase(); if(k) byEn[k]=w; });
    }
    imgs.filter(e=>e && e.status==='ok' && e.file).forEach(e=>{
      const slug = (e.slug || e.en || '').trim().toLowerCase();
      if(!slug) return;
      const w = byEn[(e.en||slug).trim().toLowerCase()] || null;
      const sent = sents[slug] || null;
      W.cards[slug] = {
        slug, en: e.en||slug, file: e.file, category: e.category||'',
        kana:  w ? (w.kana||null) : null,
        audio: w ? (w.audio||null) : null,
        sentence: sent ? (sent.s||null) : null,
        hl:       sent ? (sent.hl||null) : null,
        saudio:   sent ? (sent.a||null) : null
      };
    });
    // keep images.json order (already category-grouped)
    const orderIdx = {}; let i=0;
    imgs.forEach(e=>{ const s=(e.slug||e.en||'').trim().toLowerCase(); if(s && !(s in orderIdx)) orderIdx[s]=i++; });
    W.ids = Object.keys(W.cards).sort((a,b)=>(orderIdx[a]??1e9)-(orderIdx[b]??1e9));
    W.ready = true;
  }

  // --- mode registry ---
  const MODES = {
    kana:  { label:'Kana',  unit:'characters', suffix:'',       ids:()=>KANA_IDS, ready:()=>true,      order:KANA_IDS },
    words: { label:'Words', unit:'words',      suffix:'_words', ids:()=>W.ids,    ready:()=>W.ready,   order:null }
  };
  let mode = localStorage.getItem('kana_mode');
  // URL hash wins on entry (#words / #kana) — lets the old word625 bookmark land in Words mode.
  const hash = (location.hash||'').replace('#','').toLowerCase();
  if(hash==='words' || hash==='kana') mode=hash;
  if(mode!=='kana' && mode!=='words') mode='kana';
  localStorage.setItem('kana_mode', mode);
  const idsOf   = m => MODES[m].ids();
  const readyOf = m => MODES[m].ready();
  const contentOf = (m,id) => m==='kana' ? KANA[id] : W.cards[id];
  const orderIndex = (m,id) => m==='kana' ? KANA_IDS.indexOf(id) : W.ids.indexOf(id);

  // ================= PERSISTENCE =================
  const META_KEY = 'kana_meta_v1';
  const deckKey = (pid,m) => 'kana_deck_'+pid + MODES[m].suffix;
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
  function loadDeck(pid,m){
    m = m||mode;
    try{ const d=JSON.parse(localStorage.getItem(deckKey(pid,m)));
         if(d&&d.cards&&d.introduced) return d; }catch(e){}
    return {cards:{}, introduced:[], reviews:0, updatedAt:now(), device:deviceId()};
  }
  function saveDeck(pid,m,d){
    // tolerate legacy 2-arg calls: saveDeck(pid, deck)
    if(d===undefined && m && typeof m==='object'){ d=m; m=mode; }
    d.updatedAt=now(); d.device=deviceId();
    localStorage.setItem(deckKey(pid,m), JSON.stringify(d));
    if(window.KanaSync) window.KanaSync.onSave(pid,d,m); // additive: no-op when sync off/unreachable
  }

  // ================= APP STATE =================
  let meta = loadMeta();
  let pid = meta.active;
  let deck = pid ? loadDeck(pid,mode) : null;
  let session = [];        // in-memory queue of due cardIds (current mode)
  let flipped = false;
  let curDrawn = false;
  let showPicker = false;

  // ================= PROFILE HELPERS =================
  function profileName(id){ const p=meta.profiles.find(p=>p.id===id); return p?p.name:'—'; }
  function newProfile(name){
    const id='p'+Math.random().toString(36).slice(2,8);
    meta.profiles.push({id,name}); meta.active=id; saveMeta(meta);
    pid=id; deck=loadDeck(pid,mode); saveDeck(pid,mode,deck);
    showPicker=false;
    introduceNext(3);
    startSession();
    syncPull();
  }
  function switchProfile(id){ showPicker=false; meta.active=id; saveMeta(meta); pid=id; deck=loadDeck(pid,mode);
    if(readyOf(mode) && deck.introduced.length===0) introduceNext(3);
    startSession(); syncPull(); }
  function deleteProfile(id){
    // remove BOTH decks for this profile (all modes)
    Object.keys(MODES).forEach(m=>localStorage.removeItem(deckKey(id,m)));
    meta.profiles = meta.profiles.filter(p=>p.id!==id);
    if(meta.active===id){ meta.active = meta.profiles[0] ? meta.profiles[0].id : null; }
    saveMeta(meta);
    pid = meta.active; deck = pid? loadDeck(pid,mode) : null;
    if(pid && readyOf(mode) && deck.introduced.length===0) introduceNext(3);
    render();
  }

  // ================= DECK LOGIC (operates on current mode) =================
  function introduceNext(n){
    let added=0;
    for(const id of idsOf(mode)){
      if(added>=n) break;
      if(!deck.cards[id]){
        deck.cards[id]={S:0,D:0,reps:0,lapses:0,last:0,due:now(),state:'new'};
        deck.introduced.push(id); added++;
      }
    }
    saveDeck(pid,mode,deck);
    return added;
  }
  function dueIds(){
    const t=now();
    return deck.introduced.filter(id=>deck.cards[id] && deck.cards[id].due<=t)
      .sort((a,b)=>deck.cards[a].due-deck.cards[b].due);
  }
  function learnedCount(){
    return deck.introduced.filter(id=>{const c=deck.cards[id];return c && c.reps>0 && c.S>=1;}).length;
  }
  function startSession(){ session = (pid && readyOf(mode)) ? dueIds() : []; flipped=false; curDrawn=false; render(); }

  function syncPull(){
    if(!window.KanaSync || !pid) return;
    const target=pid;
    window.KanaSync.pull(target).then(changed=>{
      if(changed && pid===target){ deck=loadDeck(pid,mode); render(); }
    }).catch(()=>{});
  }

  function grade(g){ // g: 1 bad, 2 okay, 3 good
    const id=session[0]; if(!id) return;
    const c=deck.cards[id];
    const r=FSRS.schedule(c,g,now());
    Object.assign(c,r);
    deck.reviews=(deck.reviews||0)+1;
    saveDeck(pid,mode,deck);
    session.shift();
    if(g===1){ const pos=Math.min(3,session.length); session.splice(pos,0,id); }
    flipped=false; curDrawn=false;
    if(session.length===0) session=dueIds();
    render();
  }

  // ================= MODE SWITCH =================
  function setMode(m){
    if(m===mode || !MODES[m]) return;
    mode=m; localStorage.setItem('kana_mode',m);
    deck = pid ? loadDeck(pid,mode) : null;
    if(pid && readyOf(mode) && deck.introduced.length===0) introduceNext(3);
    startSession();
    updateModeBar();
  }
  function updateModeBar(){
    document.querySelectorAll('#modebar [data-mode]').forEach(b=>{
      b.classList.toggle('on', b.dataset.mode===mode);
    });
  }

  // ================= RENDERING =================
  const main = $('#main');

  function render(){
    updateHeader();
    updateModeBar();
    if(!readyOf(mode)){ renderLoading(); return; }
    if(idsOf(mode).length===0){ renderNoContent(); return; }
    if(!pid || showPicker){ renderPicker(); return; }
    if(session.length===0){ renderCaughtUp(); return; }
    renderCard(session[0]);
  }
  function updateHeader(){
    $('#profileName').textContent = pid ? profileName(pid) : '—';
    $('#totalCount').textContent = idsOf(mode).length;
    if(deck && readyOf(mode)){
      $('#dueCount').textContent = dueIds().length;
      $('#learnedCount').textContent = learnedCount();
    } else {
      $('#dueCount').textContent = 0; $('#learnedCount').textContent = 0;
    }
  }

  function renderLoading(){ main.innerHTML = `<div class="center"><h2>Loading…</h2></div>`; }
  function renderNoContent(){
    main.innerHTML = `<div class="center"><h2>No cards yet</h2>
      <p>Content for this mode hasn't been added yet.</p></div>`;
  }

  function renderPicker(){
    const has = meta.profiles.length>0;
    const list = meta.profiles.map(p=>
      `<div class="pcard ${p.id===pid?'active':''}" data-pick="${p.id}">
         <span style="display:flex;align-items:center"><span class="av">${esc((p.name[0]||'?')).toUpperCase()}</span>${esc(p.name)}</span>
         <button class="del" data-del="${p.id}" title="remove">✕</button>
       </div>`).join('');
    main.innerHTML =
     `<div class="center">
        <h2>Who's studying?</h2>
        ${has ? `<div class="plist">${list}</div>` :
                `<p>No login, no password — just make a profile for each learner.</p>`}
        <div id="createWrap" style="${has?'display:none':''};display:flex;flex-direction:column;gap:10px;align-items:center;width:100%;max-width:300px">
          <input id="pname" placeholder="Type a name" maxlength="16"
            style="font-size:18px;padding:14px;border:2px solid #e6e9f5;border-radius:14px;width:100%;text-align:center">
          <button class="bigbtn" id="createP" style="width:100%">Start learning →</button>
        </div>
        ${has ? `<button class="bigbtn ghost" id="showCreate" style="max-width:300px;width:100%">➕ New profile</button>` : ''}
      </div>`;
    main.querySelectorAll('[data-pick]').forEach(el=>el.onclick=e=>{
      if(e.target.closest('[data-del]')) return;
      switchProfile(el.dataset.pick);
    });
    main.querySelectorAll('[data-del]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      const id=b.dataset.del, nm=profileName(id);
      if(confirm('Remove '+nm+' and their progress (both Kana and Words) from THIS device?')) deleteProfile(id);
    });
    const sc=$('#showCreate'); if(sc) sc.onclick=()=>{ $('#createWrap').style.display='flex'; sc.style.display='none'; $('#pname').focus(); };
    const cp=$('#createP'); if(cp){
      const go=()=>{ const n=$('#pname').value.trim(); if(n){ newProfile(n); render(); } };
      cp.onclick=go;
      $('#pname').addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    }
  }

  function renderCaughtUp(){
    const remaining = idsOf(mode).length - deck.introduced.length;
    const unit = MODES[mode].unit;
    let soon=null;
    deck.introduced.forEach(id=>{const d=deck.cards[id].due; if(d>now()&&(soon===null||d<soon))soon=d;});
    const soonTxt = soon? `Next review ready ${relTime(soon)}.` : '';
    main.innerHTML =
     `<div class="center">
        <h2>🎉 All caught up!</h2>
        <p>${soonTxt||'Nice work.'} ${remaining>0?`You've learned ${deck.introduced.length} of ${idsOf(mode).length} ${unit}.`:`You've unlocked every ${unit.replace(/s$/,'')}!`}</p>
        ${remaining>0?`<button class="bigbtn" id="addBtn">➕ Add 3 new ${unit}</button>`:''}
        ${soon?`<button class="bigbtn ghost" id="reviewAhead">Review ahead anyway</button>`:''}
      </div>`;
    if(remaining>0) $('#addBtn').onclick=()=>{ introduceNext(3); startSession(); };
    if(soon) $('#reviewAhead') && ($('#reviewAhead').onclick=()=>{
      session=deck.introduced.slice().sort((a,b)=>deck.cards[a].due-deck.cards[b].due).slice(0,10); render(); });
  }

  // First exposure = the card has never been taught AND never quizzed (reps 0). On the
  // very first sight we TEACH (show the answer, no quiz), then re-queue for the real quiz.
  function isFirstExposure(id){
    const c=deck && deck.cards[id];
    return !!c && !c.taught && (c.reps||0)===0;
  }
  function renderCard(id){
    if(isFirstExposure(id)){ renderTeachCard(id); return; }
    if(mode==='kana') renderKanaCard(id);
    else renderWordCard(id);
  }

  // TEACH STEP (BACKLOG #1): first time a card is shown to a profile, skip the quiz —
  // present the back side (char + animated stroke order for kana; picture + kana + audio
  // for words) with a single Continue button. No draw canvas, no grading. It registers as
  // a new→learning step (flag `taught`), NOT a review: FSRS state stays 'new' and reps stays
  // 0, so the first REAL grade still runs initS/initD and first-sight never poisons the scheduler.
  function teach(){
    const id=session[0]; if(!id) return;
    const c=deck.cards[id];
    c.taught=true;                 // FSRS state untouched (still 'new'); reps untouched
    saveDeck(pid,mode,deck);
    session.shift();
    const pos=Math.min(3,session.length); session.splice(pos,0,id); // re-queue for the real quiz
    flipped=false; curDrawn=false;
    if(session.length===0) session=dueIds();
    render();
  }
  function renderTeachCard(id){
    const c=contentOf(mode,id);
    let cardInner;
    if(mode==='kana'){
      cardInner =
       `<div class="teachintro">✨ New character — here's how it looks</div>
        <div id="answer" class="show">
          <div class="strokebox">
            <svg class="stroke" id="strokeSvg" viewBox="0 0 109 109"></svg>
            <div style="display:flex;flex-direction:column;gap:8px;align-items:center">
              <div class="kana">${esc(c.kana)}</div>
              <div class="romaji">${esc(c.romaji)}</div>
              <button class="replay" id="replayBtn">▶ Replay</button>
            </div>
          </div>
        </div>`;
    } else {
      const hasKana=!!c.kana;
      let sentHtml='';
      if(c.sentence){
        const s=c.sentence, hl=c.hl, i = hl ? s.indexOf(hl) : -1;
        const inner = i>=0
          ? esc(s.slice(0,i))+'<mark class="hl">'+esc(hl)+'</mark>'+esc(s.slice(i+hl.length))
          : esc(s);
        sentHtml = `<div class="sentence">${inner}</div>`;
      }
      const ans = hasKana
        ? `<div class="kana">${esc(c.kana)}</div>${sentHtml}
           <button class="audiobtn" id="audioBtn" ${c.audio||c.saudio?'':'disabled'}>🔊 Play</button>`
        : `<div class="kana stub">かな + 🔊 coming soon</div>`;
      cardInner =
       `<div class="teachintro">✨ New word — here's what it is</div>
        <div class="imgwrap"><img class="cardimg" src="${esc(IMG_DIR+c.file)}" alt=""></div>
        <div id="answer" class="wordanswer show">${ans}</div>`;
    }
    main.innerHTML =
     `<div class="card">${cardInner}</div>
      <div class="actions"><button class="bigbtn" id="continueBtn">Got it — continue →</button></div>`;
    if(mode==='kana'){
      animateStrokes($('#strokeSvg'), c.strokes);
      $('#replayBtn').onclick=()=>animateStrokes($('#strokeSvg'), c.strokes);
    } else {
      const ab=$('#audioBtn');
      if(ab && (c.audio||c.saudio)){ ab.onclick=()=>playSequence(c); playSequence(c); }
    }
    $('#continueBtn').onclick=teach;
  }

  // ---- KANA card: draw the sound, flip -> stroke-order + kana ----
  function renderKanaCard(id){
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
    $('#flipBtn').onclick=()=>doFlipKana(id);
    $('#grade').querySelectorAll('button').forEach(b=>b.onclick=()=>grade(+b.dataset.g));
  }
  function doFlipKana(id){
    if(flipped) return; flipped=true;
    $('#answer').classList.add('show');
    $('#flipBtn').style.display='none';
    $('#grade').classList.add('show');
    buildStrokes(id);
    $('#replayBtn').onclick=()=>buildStrokes(id);
  }
  // Animate KanjiVG stroke order into any <svg> (viewBox 0 0 109 109). Shared by the
  // study card (buildStrokes) and the reference chart's detail view.
  function animateStrokes(svg, strokes){
    if(!svg||!strokes) return;
    svg.innerHTML='';
    const NS='http://www.w3.org/2000/svg';
    strokes.forEach(d=>{ const p=document.createElementNS(NS,'path');
      p.setAttribute('d',d); p.setAttribute('class','guide'); svg.appendChild(p); });
    const live=strokes.map(d=>{ const p=document.createElementNS(NS,'path');
      p.setAttribute('d',d); p.setAttribute('class','live'); svg.appendChild(p); return p; });
    live.forEach(p=>{ const L=p.getTotalLength(); p.style.strokeDasharray=L; p.style.strokeDashoffset=L; });
    let i=0;
    (function step(){
      if(i>=live.length) return;
      const p=live[i], L=p.getTotalLength();
      const dur=Math.max(320, L*7);
      p.animate([{strokeDashoffset:L},{strokeDashoffset:0}],
                {duration:dur,fill:'forwards',easing:'ease-in-out'});
      i++; setTimeout(step, dur+180);
    })();
  }
  function buildStrokes(id){ animateStrokes($('#strokeSvg'), KANA[id].strokes); }
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
    cv._fit=fit;
  }

  // ---- WORDS card: picture on front, flip -> kana + audio (NO English) ----
  function renderWordCard(id){
    const c=W.cards[id];
    const hasKana = !!c.kana;
    // Example sentence (JP only, no English) with the target word highlighted.
    let sentHtml='';
    if(c.sentence){
      const s=c.sentence, hl=c.hl, i = hl ? s.indexOf(hl) : -1;
      const inner = i>=0
        ? esc(s.slice(0,i))+'<mark class="hl">'+esc(hl)+'</mark>'+esc(s.slice(i+hl.length))
        : esc(s);
      sentHtml = `<div class="sentence" id="sentence">${inner}</div>`;
    }
    const answerInner = hasKana
      ? `<div class="kana">${esc(c.kana)}</div>
         ${sentHtml}
         <button class="audiobtn" id="audioBtn" ${c.audio?'':'disabled'}>🔊 Play</button>`
      : `<div class="kana stub">かな + 🔊 coming soon</div>`;
    main.innerHTML =
     `<div class="card">
        <div class="imgwrap">
          <img class="cardimg" id="cardImg" src="${esc(IMG_DIR+c.file)}" alt="">
        </div>
        <div id="answer" class="wordanswer">${answerInner}</div>
      </div>
      <div class="actions">
        <button class="flipbtn" id="flipBtn">Show answer →</button>
        <div class="grade" id="grade">
          <button class="b-bad"  data-g="1">Missed<span class="sub">again</span></button>
          <button class="b-okay" data-g="2">Close<span class="sub">soon</span></button>
          <button class="b-good" data-g="3">Got it<span class="sub">later</span></button>
        </div>
      </div>`;
    $('#flipBtn').onclick=()=>doFlipWord(id);
    $('#grade').querySelectorAll('button').forEach(b=>b.onclick=()=>grade(+b.dataset.g));
  }
  let curAudio=null, seqToken=0;
  function playOne(src){
    return new Promise(res=>{
      try{ if(curAudio){ curAudio.pause(); } const a=new Audio(src); curAudio=a;
           a.onended=()=>res(); a.onerror=()=>res(); a.play().catch(()=>res()); }
      catch(e){ res(); }
    });
  }
  // Comprehensible-input playback: word → sentence → word. Falls back to word-only
  // when no sentence audio exists yet (deck is being filled in incrementally).
  async function playSequence(c){
    const seq=[];
    if(c.audio)  seq.push(AUDIO_DIR+c.audio);
    if(c.saudio) seq.push(AUDIO_DIR+c.saudio);
    if(c.audio)  seq.push(AUDIO_DIR+c.audio);
    if(!seq.length) return;
    const mine=++seqToken;                       // supersede any in-flight sequence
    for(const src of seq){ if(mine!==seqToken) return; await playOne(src); }
  }
  function playAudio(c){ if(c.audio) playOne(AUDIO_DIR+c.audio); } // word-only (kept)
  function doFlipWord(id){
    if(flipped) return; flipped=true;
    $('#answer').classList.add('show');
    $('#flipBtn').style.display='none';
    $('#grade').classList.add('show');
    const c=W.cards[id];
    const ab=$('#audioBtn');
    if(ab && (c.audio||c.saudio)){ ab.onclick=()=>playSequence(c); playSequence(c); } // auto-play once on reveal
  }

  // ================= SETTINGS SHEET =================
  $('#gearBtn').onclick=()=>openSheet();
  $('#profileBtn').onclick=()=>{ showPicker=true; render(); };
  $('#closeSheet').onclick=()=>$('#sheet').classList.remove('show');
  $('#sheet').addEventListener('click',e=>{ if(e.target.id==='sheet') e.target.classList.remove('show'); });

  function openSheet(){
    $('#s_mode').textContent = MODES[mode].label;
    $('#s_learned').textContent = (deck && readyOf(mode))? learnedCount()+' / '+idsOf(mode).length : '0';
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

  // ---- backup / restore (manual cross-device bridge; carries BOTH decks per profile) ----
  $('#backupBtn').onclick=()=>{
    const payload={v:2, meta, decks:{}};
    meta.profiles.forEach(p=>{
      payload.decks[p.id]={};
      Object.keys(MODES).forEach(m=>payload.decks[p.id][m]=loadDeck(p.id,m));
    });
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
      const inMeta=p.meta;
      inMeta.profiles.forEach(prof=>{
        if(!meta.profiles.find(x=>x.id===prof.id)) meta.profiles.push(prof);
        const incoming=p.decks[prof.id];
        if(!incoming) return;
        if(p.v>=2){ // v2: {kana:{...}, words:{...}}
          Object.keys(MODES).forEach(m=>{
            if(incoming[m]) saveDeck(prof.id, m, mergeDeck(loadDeck(prof.id,m), incoming[m], m));
          });
        } else { // v1 legacy: a single kana deck
          saveDeck(prof.id, 'kana', mergeDeck(loadDeck(prof.id,'kana'), incoming, 'kana'));
        }
      });
      meta.active=inMeta.active||meta.active; saveMeta(meta);
      pid=meta.active; deck=loadDeck(pid,mode);
      $('#sheet').classList.remove('show'); startSession();
      alert('Progress restored & merged ✓');
    }catch(e){ alert('That code didn\'t look right — recopy it from the other device.'); }
  };
  function mergeDeck(a,b,m){
    m = m||mode;
    const out={cards:{},introduced:[],reviews:Math.max(a.reviews||0,b.reviews||0)};
    const ids=new Set([...(a.introduced||[]),...(b.introduced||[])]);
    ids.forEach(id=>{
      const ca=a.cards[id], cb=b.cards[id];
      out.cards[id]= !ca?cb : !cb?ca : (cb.last>=ca.last? cb:ca); // newest review wins
      out.introduced.push(id);
    });
    out.introduced.sort((x,y)=>orderIndex(m,x)-orderIndex(m,y));
    return out;
  }

  $('#resetBtn').onclick=()=>{
    if(!confirm('Erase ALL progress for '+profileName(pid)+' in '+MODES[mode].label+' mode? This cannot be undone.')) return;
    localStorage.removeItem(deckKey(pid,mode)); deck=loadDeck(pid,mode); introduceNext(3); startSession();
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

  // ================= MODE BAR WIRING =================
  document.querySelectorAll('#modebar [data-mode]').forEach(b=>{
    b.onclick=()=>setMode(b.dataset.mode);
  });

  // ================= KANA REFERENCE CHART =================
  // Browsable "view all kana" chart in the standard gojūon grid: rows = consonant
  // families, columns = vowels a/i/u/e/o. Tap a kana → big form + animated stroke order
  // (reuses animateStrokes). Read-only reference — no FSRS, no deck, no profile needed.
  // Cells are matched to KANA entries by romaji; `null` marks a real gap in the grid
  // (yi/ye/wu/wi/we) rendered as a blank cell so the classic layout stays aligned.
  const GOJUON_BASE = [
    ['a','i','u','e','o'],
    ['ka','ki','ku','ke','ko'],
    ['sa','shi','su','se','so'],
    ['ta','chi','tsu','te','to'],
    ['na','ni','nu','ne','no'],
    ['ha','hi','fu','he','ho'],
    ['ma','mi','mu','me','mo'],
    ['ya',null,'yu',null,'yo'],
    ['ra','ri','ru','re','ro'],
    ['wa',null,null,null,'wo'],
    ['n',null,null,null,null]
  ];
  const GOJUON_DAKU = [
    ['ga','gi','gu','ge','go'],
    ['za','ji','zu','ze','zo'],
    ['da','di','du','de','do'],
    ['ba','bi','bu','be','bo'],
    ['pa','pi','pu','pe','po']
  ];
  const ROMA = {hiragana:{}, katakana:{}};   // romaji -> id, per type
  KANA_IDS.forEach(id=>{ const k=KANA[id]; if(ROMA[k.type]) ROMA[k.type][k.romaji]=id; });
  let chartType = 'hiragana';
  const chartEl = () => document.getElementById('chartSheet');

  function gridHtml(type){
    const cell = roma=>{
      const id = roma ? ROMA[type][roma] : null;
      if(!id) return `<div class="kcell empty"></div>`;
      const k = KANA[id];
      return `<div class="kcell" data-kid="${id}"><span class="kc">${esc(k.kana)}</span><span class="kr">${esc(k.romaji)}</span></div>`;
    };
    const grid = rows => `<div class="kgrid">${rows.map(r=>r.map(cell).join('')).join('')}</div>`;
    return `<div class="chartsec">Basic · gojūon</div>${grid(GOJUON_BASE)}`
         + `<div class="chartsec">Voiced · dakuten / handakuten</div>${grid(GOJUON_DAKU)}`;
  }
  function buildChartSheet(){
    let el = chartEl();
    if(el) return el;
    el = document.createElement('div');
    el.id='chartSheet'; el.className='chartsheet';
    el.innerHTML =
     `<div class="charthead"><h3>Kana chart</h3><button class="x" id="chartClose">Done</button></div>
      <div class="charttabs">
        <button data-ctype="hiragana" class="on">Hiragana あ</button>
        <button data-ctype="katakana">Katakana ア</button>
      </div>
      <div class="chartscroll" id="chartScroll"></div>
      <div class="kdetail" id="kdetail">
        <div class="kdcard">
          <div class="big" id="kdBig"></div>
          <div class="rr" id="kdRoma"></div>
          <div class="tt" id="kdType"></div>
          <svg class="stroke" id="kdSvg" viewBox="0 0 109 109"></svg>
          <div class="btns">
            <button id="kdReplay">▶ Replay</button>
            <button id="kdBack">Back</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-ctype]').forEach(b=>b.onclick=()=>{ chartType=b.dataset.ctype; renderChartGrid(); });
    document.getElementById('chartClose').onclick=closeChart;
    document.getElementById('kdBack').onclick=()=>document.getElementById('kdetail').classList.remove('show');
    document.getElementById('kdetail').addEventListener('click',e=>{ if(e.target.id==='kdetail') e.target.classList.remove('show'); });
    return el;
  }
  function renderChartGrid(){
    buildChartSheet();
    chartEl().querySelectorAll('[data-ctype]').forEach(b=>b.classList.toggle('on', b.dataset.ctype===chartType));
    const scroll=document.getElementById('chartScroll');
    scroll.innerHTML=gridHtml(chartType);
    scroll.querySelectorAll('[data-kid]').forEach(c=>c.onclick=()=>openKanaDetail(c.dataset.kid));
    scroll.scrollTop=0;
  }
  function openKanaDetail(id){
    const k=KANA[id]; if(!k) return;
    document.getElementById('kdBig').textContent=k.kana;
    document.getElementById('kdRoma').textContent=k.romaji;
    document.getElementById('kdType').textContent=k.type;
    document.getElementById('kdetail').classList.add('show');
    const svg=document.getElementById('kdSvg');
    animateStrokes(svg, k.strokes);
    document.getElementById('kdReplay').onclick=()=>animateStrokes(svg, k.strokes);
  }
  function openChart(){ buildChartSheet(); renderChartGrid(); chartEl().classList.add('show'); }
  function closeChart(){ const el=chartEl(); if(el) el.classList.remove('show'); }
  const _chartBtn=$('#chartBtn'); if(_chartBtn) _chartBtn.onclick=openChart;

  // ================= BOOT =================
  // Kana is ready immediately; start now if the active mode is kana.
  if(pid && readyOf(mode)){ if(deck.introduced.length===0) introduceNext(3); startSession(); syncPull(); }
  else render(); // shows picker (kana) or Loading… (words not yet fetched)

  // Load words content in the background; if the user is in (or switches to) Words, refresh.
  loadWords().then(()=>{
    if(mode==='words'){
      if(pid){ deck=loadDeck(pid,mode); if(deck.introduced.length===0) introduceNext(3); startSession(); syncPull(); }
      else render();
    }
  });

  // expose hook for cloud sync (mode-aware)
  window.KanaApp={ loadDeck, saveDeck, loadMeta, mergeDeck, modes:Object.keys(MODES),
                   get pid(){return pid;}, get mode(){return mode;} };
})();
