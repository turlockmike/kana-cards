/* Minimal faithful FSRS-5 scheduler.
 * Grades used by this app: 1=Bad(Again), 2=Okay(Hard), 3=Good.  (Easy=4 unused.)
 * Reference: open-spaced-repetition / FSRS-5 default weights. */
(function(){
  const w = [0.40255,1.18385,3.173,15.69105,7.1949,0.5345,1.4604,0.0046,
             1.54575,0.1192,1.01925,1.9395,0.11,0.29605,2.2698,0.2315,
             2.9898,0.51655,0.6621];
  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1/DECAY) - 1;   // ≈ 0.2345
  const REQUEST_RETENTION = 0.9;
  const MIN_S = 0.01, MAX_S = 36500;
  const clampD = d => Math.min(Math.max(d,1),10);
  const clampS = s => Math.min(Math.max(s,MIN_S),MAX_S);

  // retrievability after t days at stability S
  function R(t,S){ return Math.pow(1 + FACTOR*t/S, DECAY); }

  function initD(G){ return clampD(w[4] - Math.exp(w[5]*(G-1)) + 1); }
  function initS(G){ return clampS(w[G-1]); }   // w[0..3] but G max 3 here

  function nextD(D,G){
    const dp = D - w[6]*(G-3);                          // linear delta
    const damped = D + (dp - D)*(10 - D)/9;             // FSRS-5 linear damping
    const meanRev = w[7]*initD(4) + (1-w[7])*damped;    // revert toward easy-init
    return clampD(meanRev);
  }
  function nextS_recall(D,S,r,G){
    const hard = G===2 ? w[15] : 1;
    const easy = G===4 ? w[16] : 1;
    const inc = Math.exp(w[8])*(11-D)*Math.pow(S,-w[9])*
                (Math.exp(w[10]*(1-r))-1)*hard*easy;
    return clampS(S*(1+inc));
  }
  function nextS_forget(D,S,r){
    return clampS(w[11]*Math.pow(D,-w[12])*(Math.pow(S+1,w[13])-1)*Math.exp(w[14]*(1-r)));
  }
  function intervalDays(S){
    const i = (S/FACTOR)*(Math.pow(REQUEST_RETENTION,1/DECAY) - 1);
    return Math.max(i,0);
  }

  // card: {S,D,reps,lapses,last(ms),state}. now = ms. G in {1,2,3}
  // returns updated card fields + intervalMs
  function schedule(card, G, now){
    let S,D,reps=(card.reps||0)+1, lapses=card.lapses||0;
    if(!card.state || card.state==='new'){
      S = initS(G); D = initD(G);
      if(G===1) lapses++;
    } else {
      const elapsedDays = Math.max((now - card.last)/86400000, 0);
      const r = R(elapsedDays, card.S);
      D = nextD(card.D, G);
      if(G===1){ S = nextS_forget(card.D, card.S, r); lapses++; }
      else     { S = nextS_recall(card.D, card.S, r, G); }
    }
    let iDays = intervalDays(S);
    // Bad → relearn very soon (same session); Okay new-ish → at least a bit.
    if(G===1) iDays = 0;                       // re-show this session
    else if(iDays < 1) iDays = 1;              // floor 1 day once passed
    else iDays = Math.round(iDays);
    const intervalMs = iDays*86400000;
    return { S:clampS(S), D:clampD(D), reps, lapses,
             last:now, state:'review', due: now + intervalMs, iDays };
  }

  window.FSRS = { schedule, R, intervalDays };
})();
