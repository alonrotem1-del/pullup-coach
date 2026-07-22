/*
 * Skill Progression Coach — UI orchestration (standalone app).
 * STRICTLY ADDITIVE: reads puc_* read-only via CoachStore; writes only spc_c_*;
 * registers NO service worker. Renders entirely from CoachData.
 */
(function () {
  'use strict';
  var Data = window.CoachData, Engine = window.CoachEngine, Progress = window.CoachProgress;
  var Duration = window.CoachDuration, Adapt = window.CoachAdapt;
  var Store = window.CoachStore.makeStore();

  var app = document.getElementById('app');
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function h(html){var d=document.createElement('div');d.innerHTML=html;return d.firstElementChild;}
  function on(sel,ev,fn,root){(root||document).querySelectorAll(sel).forEach(function(n){n.addEventListener(ev,fn);});}
  function clone(o){return JSON.parse(JSON.stringify(o));}
  function durationText(t){var d=Duration.calcDuration(t);return d!=null?d+' min':'—';}

  var ICON = {
    muscleup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><circle cx="12" cy="10.5" r="2.2" fill="currentColor" stroke="none"/><path d="M8 6v3M16 6v3M12 12.5v5M9 17.5h6"/></svg>',
    boulder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 20 L9 8 L13 15 L17 5 L21 20 Z"/><circle cx="9" cy="8" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="5" r="1" fill="currentColor" stroke="none"/></svg>',
    check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
    lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    star:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17.8 5.9 21.2l1.4-6.8L2.2 9.7l6.9-.7z"/></svg>',
    today:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>',
    map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="7" r="2.4"/><circle cx="12" cy="17" r="2.4"/><path d="M8 7l3 8M16 8l-3 7"/></svg>',
    chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    person:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>',
    center:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>'
  };

  // ---- audio ----------------------------------------------------------------
  var audioCtx = null;
  function unlockAudio(){
    if(audioCtx) return;
    try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){}
  }
  function playBeep(){
    try{
      if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==='suspended') audioCtx.resume();
      var beeps=[{freq:660,start:0,dur:.14},{freq:770,start:.18,dur:.14},{freq:880,start:.36,dur:.24}];
      var t0=audioCtx.currentTime;
      beeps.forEach(function(b){
        var osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
        osc.connect(gain);gain.connect(audioCtx.destination);
        osc.frequency.value=b.freq;osc.type='triangle';
        gain.gain.setValueAtTime(0.45,t0+b.start);
        gain.gain.exponentialRampToValueAtTime(0.001,t0+b.start+b.dur);
        osc.start(t0+b.start);osc.stop(t0+b.start+b.dur);
      });
    }catch(e){}
  }
  function playCountdownTick(){
    try{
      if(!audioCtx) return;
      if(audioCtx.state==='suspended') audioCtx.resume();
      var osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.connect(gain);gain.connect(audioCtx.destination);
      osc.frequency.value=440;osc.type='sine';
      var t=audioCtx.currentTime;
      gain.gain.setValueAtTime(0.25,t);gain.gain.exponentialRampToValueAtTime(0.001,t+0.1);
      osc.start(t);osc.stop(t+0.1);
    }catch(e){}
  }
  function vibrate(ms){try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}}
  document.addEventListener('touchstart',unlockAudio,{once:true});
  document.addEventListener('click',unlockAudio,{once:true});

  // ---- app/session state ----------------------------------------------------
  var UI = { screen:'today', worldId:null, sheet:null, workout:null, climb:null, timer:null, timerPaused:false, timerLeft:0, readiness:null, readinessOpen:false };

  function worldsById(id){return Data.worldsById[id];}
  function activeWorld(){return worldsById(UI.worldId);}
  function contentMap(world){var c={};world.nodes.forEach(function(n){c[n.id]=n;});return c;}

  function WS(worldId){
    var st=Store.getState();
    if(!st[worldId]){ st[worldId]={nodes:{},focus:null}; Store.setState(st); }
    return Store.getState()[worldId];
  }
  function saveWS(worldId,ws){ var st=Store.getState(); st[worldId]=ws; Store.setState(st); }

  function statusOf(world,node,ws){ return Engine.statusOf(node,ws.nodes,contentMap(world),ws.focus); }
  function recomputeFocus(world,ws){ if(!ws.focus||!ws.focus.manual){ var f=Engine.autoFocus(world,ws.nodes); ws.focus={primary:f.primary,supporting:f.supporting,manual:false}; } return ws; }

  // ---- workout state persistence --------------------------------------------
  var WK_KEY = 'spc_c_workout';
  function saveWorkoutState(){
    if(UI.workout) Store.set(WK_KEY, {type:'strength',data:UI.workout});
    else if(UI.climb) Store.set(WK_KEY, {type:'climbing',data:UI.climb});
    else Store.del(WK_KEY);
  }
  function restoreWorkoutState(){
    var saved = Store.get(WK_KEY);
    if(!saved) return false;
    if(saved.type==='strength'){UI.workout=saved.data;renderStrength();return true;}
    if(saved.type==='climbing'){UI.climb=saved.data;renderClimbing();return true;}
    return false;
  }

  // ---- boot -----------------------------------------------------------------
  function boot(){
    var p=Store.getProfile();
    if(!p||!p.onboarded){ return renderOnboarding(); }
    UI.worldId=p.activeWorld||Data.worlds[0].id;
    if(restoreWorkoutState()) return;
    setScreen('today');
  }

  // ---- shell / nav ----------------------------------------------------------
  function shell(inner,active){
    app.innerHTML='';
    var wrap=h('<div></div>');
    wrap.appendChild(h('<div class="scr">'+inner+'</div>'));
    var nav=h('<div class="nav">'+
      navBtn('today','Today',ICON.today,active)+
      navBtn('map','Map',ICON.map,active)+
      navBtn('progress','Progress',ICON.chart,active)+
      navBtn('profile','Profile',ICON.person,active)+'</div>');
    wrap.appendChild(nav);
    app.appendChild(wrap);
    on('.nav button','click',function(e){ setScreen(e.currentTarget.getAttribute('data-s')); },nav);
    return wrap;
  }
  function navBtn(id,label,ic,active){return '<button data-s="'+id+'" class="'+(active===id?'on':'')+'"><span class="ic">'+ic+'</span>'+label+'</button>';}

  function setScreen(name){
    UI.screen=name;
    if(name==='today') renderToday();
    else if(name==='map') renderMap();
    else if(name==='progress') renderProgress();
    else if(name==='profile') renderProfile();
  }

  // ---- onboarding -----------------------------------------------------------
  var OB=null;
  function renderOnboarding(step){
    if(!OB){ OB={step:0, worldId:null, ans:{}, days:[], climbDays:[], duration:'normal'}; }
    if(step!=null) OB.step=step;
    var s=OB.step;
    app.innerHTML='';
    var html;
    if(s===0){
      html='<div class="scr"><div class="hero" style="text-align:center;padding-top:30px">'+
        '<div class="badge" style="background:rgba(56,189,248,.15);color:var(--accent);margin-bottom:10px">First Usable Version</div>'+
        '<h1>Skill Progression Coach</h1>'+
        '<p class="muted">Choose the goal you want to work toward. We\'ll build a progression map and a workout recommendation for today.</p></div>'+
        '<div class="section">Choose a Goal World</div>'+
        Data.worlds.map(function(w){return worldChoice(w);}).join('')+'</div>';
      app.appendChild(h(html));
      on('[data-world]','click',function(e){ OB.worldId=e.currentTarget.getAttribute('data-world'); renderOnboarding(1); });
    } else if(s===1){
      html=stepLevel();
      app.appendChild(h('<div class="scr">'+html+'</div>'));
      wireLevel();
    } else if(s===2){
      var dayLabels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
      html='<div class="scr"><button class="link" data-back>&lsaquo; Back</button><h2 class="sp">Training Availability</h2>'+
        '<div class="section">Training Days per Week</div><div class="opts" id="days">'+dayLabels.map(function(d,i){return '<button class="pill '+(OB.days.indexOf(i)>=0?'on':'')+'" data-d="'+i+'">'+d+'</button>';}).join('')+'</div>'+
        (OB.worldId==='boulder'?'<div class="section">Climbing Days</div><div class="opts" id="cdays">'+dayLabels.map(function(d,i){return '<button class="pill '+(OB.climbDays.indexOf(i)>=0?'on':'')+'" data-d="'+i+'">'+d+'</button>';}).join('')+'</div>':'')+
        '<div class="section">Preferred Session Length</div><div class="opts" id="dur">'+
        durPill('short','Short (25-35 min)')+durPill('normal','Normal (40-55 min)')+durPill('long','Long (60+ min)')+'</div>'+
        '<button class="btn primary sp" data-next>Continue</button></div>';
      app.appendChild(h(html));
      on('#days .pill','click',function(e){toggleArr(OB.days,+e.currentTarget.dataset.d);e.currentTarget.classList.toggle('on');});
      on('#cdays .pill','click',function(e){toggleArr(OB.climbDays,+e.currentTarget.dataset.d);e.currentTarget.classList.toggle('on');});
      on('#dur .pill','click',function(e){OB.duration=e.currentTarget.dataset.v;document.querySelectorAll('#dur .pill').forEach(function(p){p.classList.remove('on');});e.currentTarget.classList.add('on');});
      on('[data-back]','click',function(){renderOnboarding(1);});
      on('[data-next]','click',function(){ finishOnboarding(); });
    }
  }
  function worldChoice(w){
    return '<div class="card" data-world="'+w.id+'" style="cursor:pointer;display:flex;gap:14px;align-items:center">'+
      '<div class="world-ic" style="--world-accent:'+w.theme.accent+'">'+ICON[w.icon]+'</div>'+
      '<div><div style="font-weight:800;font-size:17px">'+esc(w.name)+'</div>'+
      '<div class="muted small" style="margin-top:2px">'+esc(w.goal)+'</div></div></div>';
  }
  function stepLevel(){
    var back='<button class="link" data-back>&lsaquo; Back</button>';
    if(OB.worldId==='muscleup'){
      return back+'<h2 class="sp">Starting Level — Bar Muscle-Up</h2><p class="muted small">Just what we need to place you on the map.</p>'+
        numQ('pmax','How many strict pull-ups in a row?','0','e.g. 9')+
        yesnoQ('c2b','Can you do Chest-to-Bar?')+
        numQ('dips','How many straight-bar dips in a row?','0','e.g. 8')+
        yesnoQ('sbdip','Dips on a straight bar?')+
        yesnoQ('banded','Tried a banded muscle-up?')+
        painQ()+
        '<button class="btn primary sp" data-next>Continue</button>';
    }
    return back+'<h2 class="sp">Starting Level — Bouldering</h2><p class="muted small">Indoor gym grades are rough estimates.</p>'+
      gradeQ('comfort','Current comfortable grade')+
      gradeQ('highest','Highest grade recently sent')+
      numQ('perweek','Climbing sessions per week','2','e.g. 2')+
      numQ('expmonths','Climbing experience (months)','0','e.g. 6')+
      painQ()+
      '<button class="btn primary sp" data-next>Continue</button>';
  }
  function numQ(k,label,def,ph){return '<div class="section">'+esc(label)+'</div><input class="input" type="number" inputmode="numeric" id="q_'+k+'" placeholder="'+ph+'" value="">';}
  function yesnoQ(k,label){return '<div class="section">'+esc(label)+'</div><div class="opts" data-yn="'+k+'"><button class="pill" data-v="yes">Yes</button><button class="pill" data-v="no">Not yet</button></div>';}
  function gradeQ(k,label){var g=['V0','V1','V2','V3','V4','V5'];return '<div class="section">'+esc(label)+'</div><div class="opts" data-grade="'+k+'">'+g.map(function(v){return '<button class="pill" data-v="'+v+'">'+v+'</button>';}).join('')+'</div>';}
  function painQ(){var a=[['none','None'],['elbow','Elbow'],['shoulder','Shoulder'],['wrist','Wrist'],['finger','Finger']];return '<div class="section">Current pain / discomfort?</div><div class="opts" data-pain="1">'+a.map(function(p){return '<button class="pill" data-v="'+p[0]+'">'+p[1]+'</button>';}).join('')+'</div>';}
  function wireLevel(){
    on('[data-yn] .pill','click',function(e){var g=e.currentTarget.closest('[data-yn]');g.querySelectorAll('.pill').forEach(function(p){p.classList.remove('on');});e.currentTarget.classList.add('on');OB.ans[g.dataset.yn]=e.currentTarget.dataset.v;});
    on('[data-grade] .pill','click',function(e){var g=e.currentTarget.closest('[data-grade]');g.querySelectorAll('.pill').forEach(function(p){p.classList.remove('on');});e.currentTarget.classList.add('on');OB.ans[g.dataset.grade]=e.currentTarget.dataset.v;});
    on('[data-pain] .pill','click',function(e){var g=e.currentTarget.closest('[data-pain]');g.querySelectorAll('.pill').forEach(function(p){p.classList.remove('on');});e.currentTarget.classList.add('on');OB.ans.pain=e.currentTarget.dataset.v;});
    on('[data-back]','click',function(){renderOnboarding(0);});
    on('[data-next]','click',function(){
      ['pmax','dips','perweek','expmonths','comfort','highest'].forEach(function(k){var el=document.getElementById('q_'+k);if(el&&el.value!=='')OB.ans[k]=el.value;});
      renderOnboarding(2);
    });
  }
  function durPill(v,label){return '<button class="pill '+(OB.duration===v?'on':'')+'" data-v="'+v+'">'+esc(label)+'</button>';}
  function toggleArr(a,v){var i=a.indexOf(v);if(i>=0)a.splice(i,1);else a.push(v);}

  function finishOnboarding(){
    var worldId=OB.worldId, world=worldsById(worldId), a=OB.ans;
    var bench=Store.getBench();
    var legacy=Store.readLegacy(); var derived=window.CoachStore.deriveBench(legacy);
    Object.keys(derived).forEach(function(k){bench[k]=Math.max(bench[k]||0,derived[k]);});
    if(a.pmax) bench.pullup_max=Math.max(bench.pullup_max||0,+a.pmax);
    if(a.dips) bench.dips_max=Math.max(bench.dips_max||0,+a.dips);
    Store.setBench(bench);
    var seeded=window.CoachStore.seedStates(world,bench);
    function setCrit(nodeId,token,val){var n=world.nodes.filter(function(x){return x.id===nodeId;})[0];if(!n)return;var c=n.criteria.filter(function(c){return c.unit.indexOf(token)>=0;})[0]||n.criteria[0];if(!seeded[nodeId])seeded[nodeId]={criteria:{}};seeded[nodeId].criteria[c.id]=val;}
    function complete(nodeId){var n=world.nodes.filter(function(x){return x.id===nodeId;})[0];if(!n)return;if(!seeded[nodeId])seeded[nodeId]={criteria:{}};n.criteria.forEach(function(c){seeded[nodeId].criteria[c.id]=c.target;});}
    if(worldId==='muscleup'){
      if(a.c2b==='yes'){complete('mu_fastpull');complete('mu_c2b');}
      if(a.banded==='yes'){complete('mu_bandmu');}
    } else {
      var order=['V0','V1','V2','V3','V4','V5']; var ci=order.indexOf(a.comfort||'V0');
      for(var i=0;i<ci;i++){complete('b_v'+i);}
      if(ci>=0){
        var gn='b_v'+ci; var node=world.nodes.filter(function(x){return x.id===gn;})[0];
        if(node){ setCrit(gn,'problem',1); }
      }
    }
    var ws={nodes:seeded,focus:null}; recomputeFocus(world,ws); saveWS(worldId,ws);
    Data.worlds.forEach(function(w){ if(w.id!==worldId){ var other={nodes:window.CoachStore.seedStates(w,bench),focus:null}; recomputeFocus(w,other); saveWS(w.id,other); }});
    Store.setProfile({onboarded:true, activeWorld:worldId, worlds:{}, ans:a, days:OB.days, climbDays:OB.climbDays, duration:OB.duration, painArea:(a.pain&&a.pain!=='none')?a.pain:null});
    OB=null; UI.worldId=worldId; setScreen('today');
  }

  // ---- readiness defaults ---------------------------------------------------
  function readiness(){
    if(!UI.readiness){
      var p=Store.getProfile()||{};
      UI.readiness={energy:2, upperFatigue:2, fingerSkin:2, pain:!!p.painArea, time:p.duration||'normal'};
    }
    return UI.readiness;
  }

  // ---- Today ----------------------------------------------------------------
  function renderToday(){
    var world=activeWorld(), ws=recomputeFocus(world,WS(UI.worldId)); saveWS(UI.worldId,ws);
    var r=readiness();
    var rec=Engine.recommend({world:world,states:ws.nodes,focus:ws.focus,templates:Data.templates,readiness:r,recent:recentForRec()});
    var t=Data.templates[rec.sessionTemplateId], alt=Data.templates[rec.alternativeTemplateId];
    var primary=ws.focus.primary?contentMap(world)[ws.focus.primary]:null;
    var supporting=ws.focus.supporting?contentMap(world)[ws.focus.supporting]:null;
    var greet=greeting();

    // Path summary
    var pathSummary='';
    if(primary){
      var cm=contentMap(world);
      var ews=Engine._withContent(ws.nodes,cm);
      var completed=world.nodes.filter(function(n){return Engine.isComplete(n,ews);}).length;
      pathSummary='<div class="path-summary">'+
        '<span>'+completed+'/'+world.nodes.length+' skills</span>'+
        (primary?' &middot; <b>Focus:</b> '+esc(primary.name)+' ('+esc(Engine.progressText(primary,ws.nodes))+')'  :'')+
        '</div>';
    }

    var html=''+
      '<div class="hero"><div class="between"><div><div class="goal">'+esc(world.name)+'</div>'+
      '<h1>'+greet+'</h1></div></div>'+
      pathSummary+'</div>'+
      recCard(t,world,rec,primary,supporting,false)+
      (alt&&alt.id!==t.id?'<div class="section">Alternative</div>'+recCard(alt,world,{why:'Lighter option if today is heavy',reasons:[]},primary,supporting,true):'')+
      readinessCard(r,world)+
      upcomingCard();
    var wrap=shell(html,'today');
    on('[data-rk]','click',function(e){var k=e.currentTarget.dataset.rk,v=e.currentTarget.dataset.rv;if(k==='pain'){r.pain=!r.pain;}else if(k==='time'){r.time=v;}else{r[k]=+v;}renderToday();},wrap);
    on('[data-start]','click',function(e){ startSession(e.currentTarget.dataset.start); },wrap);
    on('[data-goto]','click',function(){ setScreen('map'); },wrap);
    on('[data-toggle-readiness]','click',function(){ UI.readinessOpen=!UI.readinessOpen; renderToday(); },wrap);
  }
  function greeting(){var hh=new Date().getHours();return hh<12?'Good Morning':hh<18?'Good Afternoon':'Good Evening';}
  function readinessCard(r,world){
    var isClimb=world.id==='boulder';
    var open=UI.readinessOpen;
    return '<div class="card tight"><div class="between" style="cursor:pointer" data-toggle-readiness>'+
      '<div class="section" style="margin:0">Readiness Check</div>'+
      '<span class="muted small">'+(open?'collapse':'expand')+'</span></div>'+
      (open?
        seg('energy','Energy',r.energy,['Low','Medium','High'])+
        seg('upperFatigue','Upper Body Fatigue',r.upperFatigue,['Low','Medium','High'])+
        (isClimb?seg('fingerSkin','Fingers / Skin',r.fingerSkin,['Sensitive','OK','Good']):'')+
        '<div class="rdy-row"><span class="lbl">Pain / Discomfort</span><div class="seg warn"><button data-rk="pain" class="'+(r.pain?'on':'')+'">'+(r.pain?'Yes':'No')+'</button></div></div>'+
        '<div class="rdy-row"><span class="lbl">Available Time</span><div class="seg">'+
          timeBtn('short','Short',r)+timeBtn('normal','Normal',r)+timeBtn('long','Long',r)+'</div></div>'
      :'')+'</div>';
  }
  function seg(k,label,val,opts){return '<div class="rdy-row"><span class="lbl">'+esc(label)+'</span><div class="seg">'+opts.map(function(o,i){return '<button data-rk="'+k+'" data-rv="'+(i+1)+'" class="'+(val===i+1?'on':'')+'">'+esc(o)+'</button>';}).join('')+'</div></div>';}
  function timeBtn(v,label,r){return '<button data-rk="time" data-rv="'+v+'" class="'+(r.time===v?'on':'')+'">'+esc(label)+'</button>';}

  function recCard(t,world,rec,primary,supporting,isAlt){
    if(!t) return '';
    var foci='';
    if(!isAlt){
      if(primary) foci+='<span class="tag gold">'+ICON.star+' '+esc(primary.name)+'</span>';
      if(supporting) foci+='<span class="tag">'+esc(supporting.name)+'</span>';
    }
    var preview = workoutPreview(t);
    return '<div class="rec">'+
      '<div class="kick">'+(isAlt?'Alternative':'Recommended for Today')+' &middot; '+esc(world.name)+'</div>'+
      '<div class="name">'+esc(t.name)+'</div>'+
      '<div class="meta"><span>'+durationText(t)+'</span><span>Intensity: '+esc(t.difficulty||'—')+'</span>'+(t.targetGrade?'<span>Target: '+esc(t.targetGrade)+'</span>':'')+'</div>'+
      (foci?'<div class="foci">'+foci+'</div>':'')+
      (preview?'<div class="preview">'+preview+'</div>':'')+
      (rec.why?'<div class="why">'+esc(rec.why)+'</div>':'')+
      (rec.caution?'<div class="caution">'+esc(rec.caution)+'</div>':'')+
      '<button class="btn primary" data-start="'+t.id+'">Start Workout</button>'+
      '</div>';
  }

  function workoutPreview(t){
    if(!t.blocks||!t.blocks.length){
      return t.focus?'<div class="prev-line"><b>Focus:</b> '+esc(t.focus)+'</div>':'';
    }
    var rest=Duration.restForType(t.type);
    var lines=t.blocks.map(function(b){
      var sets=Duration.genSets(b);
      var desc;
      if(b.scheme==='ladder') desc=sets.length+' rounds, ladder';
      else if(b.scheme==='pyramid') desc='Pyramid '+sets.map(function(s){return s.target;}).join('-');
      else if(b.scheme==='amrap') desc='1 set, max reps';
      else if(b.scheme==='hold') desc=sets.length+' sets &times; '+b.seconds+' sec hold';
      else desc=sets.length+' sets &times; '+b.reps+' reps';
      return '<div class="prev-line"><span class="prev-ex">'+esc(b.label)+'</span><span class="muted small">'+desc+'</span></div>';
    });
    lines.push('<div class="prev-line muted small">Rest between sets: '+fmt(rest)+'</div>');
    return lines.join('');
  }

  function upcomingCard(){
    return '<div class="card tight between"><div><div class="section" style="margin:0">Skill Map</div><div class="muted small">View the full path and switch worlds</div></div><button class="btn sm primary" data-goto>View Map</button></div>';
  }
  function recentForRec(){
    return (Store.getSessions()||[]).slice(-3).reverse().map(function(s){return {kind:s.kind,date:s.date,hardPull:!!s.hardPull};});
  }

  // ---- Map ------------------------------------------------------------------
  var COLW=150,ROWH=112,PADX=72,PADY=60,NODEW=118;
  function renderMap(){
    var world=activeWorld(), ws=recomputeFocus(world,WS(UI.worldId)); saveWS(UI.worldId,ws);
    var cm=contentMap(world);
    var maxCol=0,maxRow=0; world.nodes.forEach(function(n){maxCol=Math.max(maxCol,n.col);maxRow=Math.max(maxRow,n.row);});
    var W=PADX*2+maxCol*COLW, H=PADY*2+maxRow*ROWH;
    var primary=ws.focus.primary?cm[ws.focus.primary]:null;
    var ews2=Engine._withContent(ws.nodes,cm);
    var completed=world.nodes.filter(function(n){return Engine.isComplete(n,ews2);}).length;

    var edges='';
    world.nodes.forEach(function(n){
      var reqs=[]; if(n.prereq){(n.prereq.all||[]).forEach(function(id){reqs.push([id,false]);});(n.prereq.any||[]).forEach(function(id){reqs.push([id,true]);});}
      reqs.forEach(function(pr){ edges+=edgePath(cm[pr[0]],n,ws,world,false); });
    });
    (world.supports||[]).forEach(function(e){ if(cm[e[0]]&&cm[e[1]]) edges+=edgePath(cm[e[0]],cm[e[1]],ws,world,true); });

    var nodes=world.nodes.map(function(n){return nodeCard(world,n,ws);}).join('');

    var rail=Data.worlds.slice().sort(function(a,b){return a.order-b.order;}).map(function(w){
      return '<div class="world-ic '+(w.id===UI.worldId?'active':'')+'" data-world="'+w.id+'" style="--world-accent:'+w.theme.accent+'" role="button" aria-label="'+esc(w.name)+'" aria-pressed="'+(w.id===UI.worldId)+'">'+ICON[w.icon]+'</div>';
    }).join('');

    var pathSummary='<div class="path-summary">'+completed+'/'+world.nodes.length+' skills'+
      (primary?' &middot; Focus: <b>'+esc(primary.name)+'</b>':'')+
      (world.note?' &middot; '+esc(world.note):'')+'</div>';

    var html=''+
      '<div class="map-head"><div><div class="map-title">'+esc(world.name)+'</div>'+
      pathSummary+'</div>'+
      '<button class="btn sm" data-center title="Center on Focus">'+ICON.center+'</button></div>'+
      '<div class="map-frame"><div class="rail" id="rail">'+rail+'</div>'+
      '<div class="canvas-wrap"><div class="canvas-scroll" id="cscroll"><div class="canvas" style="width:'+W+'px;height:'+H+'px">'+
      '<svg class="edges" width="'+W+'" height="'+H+'">'+edges+'</svg>'+nodes+'</div></div></div></div>'+
      legend();
    var wrap=shell(html,'map');
    on('#rail .world-ic','click',function(e){ switchWorld(e.currentTarget.dataset.world); },wrap);
    on('.node','click',function(e){ if(wrap.__dragged)return; openSheet(e.currentTarget.dataset.node); },wrap);
    on('[data-center]','click',function(){ centerOnFocus(wrap); },wrap);
    setupPan(wrap.querySelector('#cscroll'),wrap);
    centerOnFocus(wrap);
  }
  function centerOnFocus(wrap){
    var world=activeWorld(), ws=WS(UI.worldId), cm=contentMap(world);
    var primary=ws.focus.primary?cm[ws.focus.primary]:null;
    var sc=wrap.querySelector('#cscroll');
    if(primary&&sc){
      sc.scrollLeft = Math.max(0, (PADX+primary.col*COLW) - sc.clientWidth*0.5);
      sc.scrollTop = Math.max(0, (PADY+primary.row*ROWH) - sc.clientHeight*0.5);
    }
  }
  function nodeXY(n){return {x:PADX+n.col*COLW, y:PADY+n.row*ROWH};}
  function edgePath(src,tgt,ws,world,isSupport){
    if(!src||!tgt) return '';
    var a=nodeXY(src),b=nodeXY(tgt);
    var srcDone=Engine.isComplete(src,ews(ws,world)), tgtStatus=statusOf(world,tgt,ws);
    var lit = srcDone && (tgtStatus==='completed'||tgtStatus==='current'||tgtStatus==='maintenance');
    var toCurrent = srcDone && tgtStatus==='current';
    var locked = tgtStatus==='locked';
    var color, w, dash, opacity, glow='';
    if(isSupport){ color='#22d3a6'; w=2; dash='2,7'; opacity=locked?.25:.5; }
    else if(toCurrent){ color='#f4b740'; w=4.5; dash=''; opacity=1; glow=' filter="url(#glow)"'; }
    else if(lit){ color='#38bdf8'; w=4; dash=''; opacity=.95; }
    else if(locked){ color='#3a5674'; w=2.5; dash='4,7'; opacity=.5; }
    else { color='#4b7aa6'; w=3; dash=''; opacity=.8; }
    var midx=(a.x+b.x)/2;
    var d='M '+a.x+' '+a.y+' C '+midx+' '+a.y+' '+midx+' '+b.y+' '+b.x+' '+b.y;
    return '<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="'+w+'" '+(dash?'stroke-dasharray="'+dash+'"':'')+' stroke-linecap="round" opacity="'+opacity+'"'+glow+'/>';
  }
  function ews(ws,world){ return Engine._withContent(ws.nodes,contentMap(world)); }
  function nodeCard(world,n,ws){
    var st=statusOf(world,n,ws);
    var xy=nodeXY(n);
    var pr=Engine.progressText(n,ws.nodes);
    var dot='';
    if(st==='completed'||st==='maintenance') dot='<div class="dot" style="background:var(--accent);color:#04121f">'+ICON.check+'</div>';
    else if(st==='locked') dot='<div class="dot" style="background:#22364f;color:#8fa5c2">'+ICON.lock+'</div>';
    var focLbl = st==='current'?'<div class="foc-lbl">Current Focus</div>':'';
    var isSupportBranch = (n.type==='support'||n.type==='skill');
    var cls='node '+st+(isSupportBranch&&st==='available'?' spt-mark':'');
    return '<div class="'+cls+'" data-node="'+n.id+'" style="left:'+xy.x+'px;top:'+xy.y+'px" role="button" aria-label="'+esc(n.name)+' — '+esc(statusLabel(st))+'" tabindex="0">'+
      focLbl+dot+
      '<div class="nm">'+esc(n.name)+'</div>'+
      '<div class="sub">'+esc(n.subtitle||'')+'</div>'+
      (pr?'<div class="pr">'+esc(pr)+'</div>':'')+
      '</div>';
  }
  function legend(){
    var items=[['current','Focus','var(--focus)'],['completed','Done','var(--accent)'],['available','Available','#2f5b82'],['supporting','Supporting','var(--accent2)'],['locked','Locked','#3a5674']];
    return '<div class="legend">'+items.map(function(i){return '<span class="lg"><span class="sw" style="border-color:'+i[2]+'"></span>'+i[1]+'</span>';}).join('')+'</div>';
  }
  var STATUS_LABEL={completed:'Completed',current:'Current Focus',available:'Available',supporting:'Supporting Skill',locked:'Locked',maintenance:'Maintenance'};
  function statusLabel(s){return STATUS_LABEL[s]||s;}

  function setupPan(sc,wrap){
    var down=false,sx,sl,st,moved;
    sc.addEventListener('pointerdown',function(e){ if(e.target.closest('.node'))return; down=true;moved=false;sx=e.clientX;sl=sc.scrollLeft;st=sc.scrollTop;sc.classList.add('drag'); e.preventDefault(); });
    sc.addEventListener('pointermove',function(e){ if(!down)return; var dx=e.clientX-sx; if(Math.abs(dx)>4){moved=true;wrap.__dragged=true;} sc.scrollLeft=sl-dx; });
    function up(){ down=false;sc.classList.remove('drag'); setTimeout(function(){wrap.__dragged=false;},30); }
    sc.addEventListener('pointerup',up); sc.addEventListener('pointerleave',up); sc.addEventListener('pointercancel',up);
  }
  function switchWorld(worldId){ if(worldId===UI.worldId)return; UI.worldId=worldId; var p=Store.getProfile()||{}; p.activeWorld=worldId; Store.setProfile(p); UI.readiness=null; renderMap(); }

  // ---- node detail sheet ----------------------------------------------------
  function openSheet(nodeId){
    var world=activeWorld(), ws=WS(UI.worldId), cm=contentMap(world), n=cm[nodeId];
    if(!n) return;
    var st=statusOf(world,n,ws);
    var crits=(n.criteria||[]).map(function(c){var cur=(ws.nodes[nodeId]&&ws.nodes[nodeId].criteria&&ws.nodes[nodeId].criteria[c.id])||0;var done=cur>=c.target;return '<div class="crit '+(done?'done':'')+'"><span class="ck">'+(done?ICON.check:'')+'</span><span>'+esc(c.label)+' — <b>'+cur+'/'+c.target+' '+esc(c.unit)+'</b></span></div>';}).join('');
    var missP=Engine.missingPrereqs(n,ews(ws,world),cm);
    var supports=(world.supports||[]).filter(function(e){return e[1]===nodeId;}).map(function(e){return cm[e[0]];}).filter(Boolean);
    var tmpls=(n.templates||[]).map(function(id){var t=Data.templates[id];if(!t)return '';return '<button class="btn" data-start="'+t.id+'">'+esc(t.name)+' &middot; '+durationText(t)+'</button>';}).join('');
    var canFocus = (st==='available'||st==='supporting') && n.type!=='maintenance';

    var lockNote='';
    if(st==='locked'){
      var lockReasons=missP.map(function(p){return esc(p.name);}).join(', ');
      lockNote='<div class="needs"><b>Locked</b> — complete first: '+lockReasons;
      if(n.prereq&&n.prereq.any){
        var anyNames=n.prereq.any.map(function(id){return esc(cm[id]?cm[id].name:id);}).join(', ');
        lockNote+=' &middot; At least one of: '+anyNames;
      }
      lockNote+='</div>';
    }
    if(n.prereq&&n.prereq.noPain){ lockNote+='<div class="needs small">Requires no active pain.</div>'; }

    var body='<div class="grip"></div>'+
      '<div class="between"><h2>'+esc(n.name)+'</h2><span class="badge" style="background:rgba(56,189,248,.15);color:var(--accent)">'+esc(statusLabel(st))+'</span></div>'+
      '<div class="muted small" style="margin-bottom:8px">'+esc(n.subtitle||'')+'</div>'+
      '<p class="muted">'+esc(n.why||'')+'</p>'+
      '<div class="section">Mastery Criteria</div>'+(crits||'<p class="muted small">&mdash;</p>')+
      lockNote+
      (supports.length?'<div class="section">Supporting Skills</div><p class="muted small">'+supports.map(function(s){return esc(s.name);}).join(' &middot; ')+'</p>':'')+
      '<div class="section">Recommended Workouts</div>'+(tmpls||'<p class="muted small">&mdash;</p>')+
      (canFocus?'<button class="btn ghost" data-focus="'+n.id+'">Set as Current Focus</button>':'')+
      '<button class="btn ghost" data-close>Close</button>';
    showSheet(body,function(sheet){
      on('[data-start]','click',function(e){ closeSheet(); startSession(e.currentTarget.dataset.start); },sheet);
      on('[data-focus]','click',function(e){ setFocus(e.currentTarget.dataset.focus); },sheet);
      on('[data-close]','click',closeSheet,sheet);
    });
  }
  function setFocus(nodeId){
    var world=activeWorld(), ws=WS(UI.worldId);
    var auto=Engine.autoFocus(world,ws.nodes);
    ws.focus={primary:nodeId, supporting:(auto.supporting!==nodeId?auto.supporting:null), manual:true};
    saveWS(UI.worldId,ws); closeSheet();
    toast('Focus updated — recommendation will adjust. You can change it anytime.');
    if(UI.screen==='map') renderMap(); else renderToday();
  }
  function showSheet(body,wire){
    closeSheet();
    var back=h('<div class="sheet-back"><div class="sheet">'+body+'</div></div>');
    back.addEventListener('click',function(e){ if(e.target===back) closeSheet(); });
    document.body.appendChild(back); UI.sheet=back; if(wire) wire(back);
  }
  function closeSheet(){ if(UI.sheet){UI.sheet.remove();UI.sheet=null;} }
  function toast(msg){ var t=h('<div style="position:fixed;bottom:calc(var(--nav-h) + 14px);left:50%;transform:translateX(-50%);background:var(--card2);border:1px solid var(--border);color:var(--text);padding:10px 16px;border-radius:12px;font-size:13px;z-index:95;max-width:90%;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.4)">'+esc(msg)+'</div>'); document.body.appendChild(t); setTimeout(function(){t.style.transition='opacity .3s';t.style.opacity='0';setTimeout(function(){t.remove();},300);},2600); }

  // ---- session start --------------------------------------------------------
  function startSession(templateId){
    var t=Data.templates[templateId]; if(!t) return;
    if(t.kind==='climbing') startClimbing(t); else startStrength(t);
  }

  // ---- strength runner ------------------------------------------------------
  function startStrength(t){
    var rest=Duration.restForType(t.type);
    var blocks=t.blocks.map(function(b){return {block:b,sets:Duration.genSets(b),restSecs:rest};});
    UI.workout={templateId:t.id,worldId:UI.worldId,blocks:blocks,bi:0,si:0,pain:false,started:Date.now(),adaptations:[]};
    saveWorkoutState();
    renderStrength();
  }
  function renderStrength(){
    var w=UI.workout, t=Data.templates[w.templateId];
    var total=0,done=0; w.blocks.forEach(function(bl){bl.sets.forEach(function(s){total++;if(s.doneFlag)done++;});});
    var pct=Math.round(done/total*100);

    // Find the current (next undone) set
    var curBi=-1,curSi=-1;
    for(var bi=0;bi<w.blocks.length&&curBi<0;bi++){for(var si=0;si<w.blocks[bi].sets.length;si++){if(!w.blocks[bi].sets[si].doneFlag){curBi=bi;curSi=si;break;}}}

    var body='';
    w.blocks.forEach(function(bl,bi){
      var ex=Data.exercises[bl.block.exId]||{};
      var isCurrentBlock=bi===curBi;
      body+='<div class="section">'+esc(bl.block.label)+(bl.block.note?' <span class="muted tiny">&middot; '+esc(bl.block.note)+'</span>':'')+'</div>';
      if(ex.cues&&isCurrentBlock) body+='<p class="muted small" style="margin:-4px 2px 4px">'+esc(ex.cues)+'</p>';
      bl.sets.forEach(function(s,si){
        var isCurrent=bi===curBi&&si===curSi;
        var unit=s.unit==='sec'?'sec':'reps';
        var adapted=s.adapted?'<div class="adapt-note muted small">'+esc(s.adapted)+'</div>':'';
        body+='<div class="set '+(s.doneFlag?'done':'')+(isCurrent?' current-set':'')+'" data-bi="'+bi+'" data-si="'+si+'">'+
          '<span class="n">'+(s.label?'':(si+1))+'</span>'+
          '<span class="val">'+(s.amrap?'Max reps':((s.label?s.label+' &middot; ':'')+'Target '+(s.target==null?'—':s.target)+' '+unit))+'</span>'+
          '<div class="stepper"><button data-step="-1">&minus;</button><span class="num">'+s.actual+'</span><button data-step="1">+</button></div>'+
          '<button class="link" data-done>'+(s.doneFlag?'&#10003;':'Done')+'</button>'+
          '</div>'+adapted;
      });
    });

    // Adaptation feedback buttons (show after a set is just completed)
    var lastDone=w.lastDone;
    var adaptHtml='';
    if(lastDone&&!lastDone.rated){
      adaptHtml='<div class="adapt-card"><div class="section" style="margin-top:0">How did that feel?</div>'+
        '<div class="opts adapt-opts">'+
        '<button class="pill" data-diff="easy">Easy</button>'+
        '<button class="pill" data-diff="appropriate">Right</button>'+
        '<button class="pill" data-diff="hard">Hard</button>'+
        '<button class="pill" data-diff="failed">Failed</button></div></div>';
    }

    var html=''+
      '<div class="wk-top"><div class="between"><button class="link" data-cancel>&lsaquo; Cancel</button><b>'+esc(t.name)+'</b><span class="muted small">'+done+'/'+total+'</span></div>'+
      '<div class="prog"><i style="width:'+pct+'%"></i></div></div>'+
      '<div id="rest"></div>'+
      adaptHtml+body+
      '<div class="flag"><label class="pill '+(w.pain?'on warnbtn':'')+'" data-painflag><input type="checkbox" style="display:none" '+(w.pain?'checked':'')+'>Pain / Discomfort</label></div>'+
      (done===total&&total>0?'<button class="btn primary sp" data-finish>Finish &amp; Save Workout</button>':'');
    app.innerHTML=''; app.appendChild(h('<div class="scr">'+html+'</div>'));
    on('[data-cancel]','click',function(){ if(confirm('Cancel workout? Progress won\'t be saved.')){stopTimer();UI.workout=null;saveWorkoutState();setScreen('today');} });
    on('.set [data-step]','click',function(e){var set=e.currentTarget.closest('.set');var bi=+set.dataset.bi,si=+set.dataset.si;var s=w.blocks[bi].sets[si];s.actual=Math.max(0,s.actual+(+e.currentTarget.dataset.step));saveWorkoutState();renderStrengthKeepScroll();});
    on('.set [data-done]','click',function(e){
      var set=e.currentTarget.closest('.set');var bi=+set.dataset.bi,si=+set.dataset.si;var s=w.blocks[bi].sets[si];
      s.doneFlag=!s.doneFlag;
      if(s.doneFlag){
        w.lastDone={bi:bi,si:si,rated:false};
        startRest(w.blocks[bi].restSecs);
      }
      saveWorkoutState();renderStrengthKeepScroll();
    });
    on('[data-diff]','click',function(e){
      var diff=e.currentTarget.dataset.diff;
      if(!w.lastDone) return;
      w.lastDone.rated=true;
      var lastSet=w.blocks[w.lastDone.bi].sets[w.lastDone.si];
      var result=Adapt.adaptNext(diff,lastSet);
      w.adaptations.push({bi:w.lastDone.bi,si:w.lastDone.si,difficulty:diff,result:result});
      // Apply to next undone set
      var nextSet=findNextUndone(w,w.lastDone.bi,w.lastDone.si);
      if(nextSet){
        var ns=w.blocks[nextSet.bi].sets[nextSet.si];
        if(result.targetDelta!==0){ns.target=Adapt.applyTargetDelta(ns.target,result.targetDelta,ns.unit);ns.actual=ns.target||ns.actual;}
        ns.adapted=result.explanation;
      }
      if(result.restDelta!==0){
        var bl=w.blocks[w.lastDone.bi];
        bl.restSecs=Adapt.applyRestDelta(bl.restSecs,result.restDelta);
      }
      saveWorkoutState();renderStrengthKeepScroll();
    });
    on('[data-painflag]','click',function(){w.pain=!w.pain;saveWorkoutState();renderStrengthKeepScroll();});
    on('[data-finish]','click',finishStrength);
  }
  function findNextUndone(w,fromBi,fromSi){
    for(var bi=fromBi;bi<w.blocks.length;bi++){
      var startSi=(bi===fromBi)?fromSi+1:0;
      for(var si=startSi;si<w.blocks[bi].sets.length;si++){
        if(!w.blocks[bi].sets[si].doneFlag) return {bi:bi,si:si};
      }
    }
    return null;
  }
  function renderStrengthKeepScroll(){var y=window.scrollY;renderStrength();window.scrollTo(0,y);}

  // ---- rest timer with audio, countdown, pause, +30s ------------------------
  function startRest(secs){
    stopTimer();
    var el=document.getElementById('rest'); if(!el)return;
    UI.timerPaused=false; UI.timerLeft=secs;
    render();
    UI.timer=setInterval(function(){
      if(UI.timerPaused) return;
      UI.timerLeft--;
      if(UI.timerLeft<=3&&UI.timerLeft>0) playCountdownTick();
      if(UI.timerLeft<=0){
        stopTimer();
        playBeep();vibrate([100,50,100,50,200]);
        el.innerHTML='<div class="timer"><div class="muted small">Rest complete!</div><div class="t ready-pulse">GO</div></div>';
        return;
      }
      render();
    },1000);
    function render(){
      el.innerHTML='<div class="timer"><div class="muted small">Rest</div><div class="t">'+fmt(UI.timerLeft)+'</div>'+
        '<div class="timer-btns">'+
        '<button class="link" data-tpause>'+(UI.timerPaused?'Resume':'Pause')+'</button>'+
        '<button class="link" data-t30>+30s</button>'+
        '<button class="link" data-tskip>Skip</button></div></div>';
      wireTimerBtns(el);
    }
  }
  function wireTimerBtns(el){
    var pauseBtn=el.querySelector('[data-tpause]');
    var addBtn=el.querySelector('[data-t30]');
    var skipBtn=el.querySelector('[data-tskip]');
    if(pauseBtn) pauseBtn.onclick=function(){UI.timerPaused=!UI.timerPaused;startRest(UI.timerLeft);};
    if(addBtn) addBtn.onclick=function(){UI.timerLeft+=30;};
    if(skipBtn) skipBtn.onclick=function(){stopTimer();el.innerHTML='';};
  }
  function stopTimer(){ if(UI.timer){clearInterval(UI.timer);UI.timer=null;} }
  function fmt(s){if(s<0)s=0;var m=Math.floor(s/60),ss=s%60;return m+':'+(ss<10?'0':'')+ss;}

  function finishStrength(){
    stopTimer(); var w=UI.workout, world=worldsById(w.worldId), t=Data.templates[w.templateId];
    var exRes={};
    w.blocks.forEach(function(bl){ var id=bl.block.exId; bl.sets.forEach(function(s){ if(!s.doneFlag&&!s.actual)return; if(!exRes[id])exRes[id]={}; if(s.unit==='sec') exRes[id].bestSeconds=Math.max(exRes[id].bestSeconds||0,s.actual); else exRes[id].bestReps=Math.max(exRes[id].bestReps||0,s.actual); }); });
    var ws=WS(w.worldId);
    var session={id:'cs_'+Date.now(),kind:'strength',templateId:t.id,worldId:w.worldId,date:new Date().toISOString(),
      exResults:exRes,targetNodeIds:[ws.focus.primary,ws.focus.supporting].filter(Boolean),pain:w.pain,
      hardPull:(t.type==='strength'||t.type==='power'),difficulty:t.difficulty,adaptations:w.adaptations};
    var res=Progress.applyStrength(world,ws.nodes,session,Data.exercises);
    ws.nodes=res.states; recomputeFocus(world,ws); saveWS(w.worldId,ws);
    var bench=Store.getBench(); Object.keys(res.bench||{}).forEach(function(k){bench[k]=Math.max(bench[k]||0,res.bench[k]);}); Store.setBench(bench);
    var sessions=Store.getSessions(); sessions.push(session); Store.setSessions(sessions);
    UI.workout=null; saveWorkoutState();
    showSummary(world,res,session);
  }

  // ---- climbing logger ------------------------------------------------------
  function startClimbing(t){
    var world=activeWorld(), ws=WS(UI.worldId), cm=contentMap(world);
    var techFocus=[ws.focus.primary,ws.focus.supporting].filter(Boolean).filter(function(id){var n=cm[id];return n&&(n.type==='skill'||n.type==='foundation'||n.type==='strength');});
    UI.climb={templateId:t.id,worldId:UI.worldId,warm:false,problems:[],rpe:3,finger:2,skin:2,techFocus:techFocus,cur:{grade:'V2',style:null,result:null}};
    saveWorkoutState();
    renderClimbing();
  }
  function renderClimbing(){
    var c=UI.climb, t=Data.templates[c.templateId], world=worldsById(c.worldId), cm=contentMap(world);
    var grades=['V0','V1','V2','V3','V4','V5','V6'];
    var probList=c.problems.map(function(p,i){return '<div class="prob"><div class="ph"><b>'+esc(p.grade)+' &middot; '+esc(styleLabel(p.style))+'</b><span class="badge" style="background:rgba(56,189,248,.15);color:var(--accent)">'+esc(resultLabel(p.result))+'</span></div>'+(p.note?'<div class="muted small">'+esc(p.note)+'</div>':'')+'<div><button class="link" data-del="'+i+'">Delete</button></div></div>';}).join('');
    var focusNames=c.techFocus.map(function(id){return cm[id]?cm[id].name:id;});
    var html=''+
      '<div class="wk-top"><div class="between"><button class="link" data-cancel>&lsaquo; Cancel</button><b>'+esc(t.name)+'</b><span class="muted small">'+c.problems.length+' problems</span></div></div>'+
      '<div class="rec"><div class="kick">Session Goal</div><div class="name" style="font-size:17px">'+esc(t.focus||'')+'</div>'+
      '<div class="meta"><span>Target: '+esc(t.targetGrade||'—')+'</span><span>'+durationText(t)+'</span></div>'+
      (focusNames.length?'<div class="foci"><span class="tag gold">'+ICON.star+' '+esc(focusNames.join(' &middot; '))+'</span></div>':'')+'</div>'+
      '<label class="pill '+(c.warm?'on':'')+'" data-warm style="margin:6px 0">'+(c.warm?'&#10003; ':'')+'Gradual warmup completed</label>'+
      '<div id="rest"></div>'+
      '<div class="section">Add Problem</div><div class="card tight">'+
      '<div class="muted small">Grade</div><div class="grade-pick" data-grades>'+grades.map(function(g){return '<button class="pill '+(c.cur.grade===g?'on':'')+'" data-g="'+g+'">'+g+'</button>';}).join('')+'</div>'+
      '<div class="muted small sp">Style</div><div class="opts" data-styles>'+Data.climbStyles.map(function(s){return '<button class="pill '+(c.cur.style===s.v?'on':'')+'" data-s="'+s.v+'">'+esc(s.label)+'</button>';}).join('')+'</div>'+
      '<div class="muted small sp">Result</div><div class="opts" data-results>'+Data.climbResults.map(function(r){return '<button class="pill '+(c.cur.result===r.v?'on':'')+'" data-r="'+r.v+'">'+esc(r.label)+'</button>';}).join('')+'</div>'+
      '<button class="btn primary sp" data-add '+(c.cur.result?'':'disabled')+'>Add Problem to Log</button></div>'+
      (probList?'<div class="section">Logged Problems</div>'+probList:'')+
      '<div class="section">Session Summary</div><div class="card tight">'+
      seg2('rpe','Overall Effort (RPE)',c.rpe,['1','2','3','4','5'])+
      seg2('finger','Fingers',c.finger,['Sensitive','OK','Good'])+
      seg2('skin','Skin',c.skin,['Sensitive','OK','Good'])+'</div>'+
      '<button class="btn primary" data-finish '+(c.problems.length?'':'disabled')+'>Finish &amp; Save Session</button>';
    app.innerHTML=''; app.appendChild(h('<div class="scr">'+html+'</div>'));
    on('[data-cancel]','click',function(){ if(confirm('Cancel session? Progress won\'t be saved.')){UI.climb=null;saveWorkoutState();setScreen('today');} });
    on('[data-warm]','click',function(){c.warm=!c.warm;saveWorkoutState();renderClimbing();});
    on('[data-grades] .pill','click',function(e){c.cur.grade=e.currentTarget.dataset.g;renderClimbing();});
    on('[data-styles] .pill','click',function(e){c.cur.style=e.currentTarget.dataset.s;renderClimbing();});
    on('[data-results] .pill','click',function(e){c.cur.result=e.currentTarget.dataset.r;renderClimbing();});
    on('[data-add]','click',function(){ if(!c.cur.result)return; c.problems.push({grade:c.cur.grade,style:c.cur.style||'vertical',result:c.cur.result}); c.cur={grade:c.cur.grade,style:null,result:null}; saveWorkoutState();renderClimbing(); });
    on('[data-del]','click',function(e){ c.problems.splice(+e.currentTarget.dataset.del,1); saveWorkoutState();renderClimbing(); });
    on('[data-seg]','click',function(e){c[e.currentTarget.dataset.seg]=+e.currentTarget.dataset.v;saveWorkoutState();renderClimbing();});
    on('[data-finish]','click',finishClimbing);
  }
  function seg2(k,label,val,opts){return '<div class="rdy-row"><span class="lbl">'+esc(label)+'</span><div class="seg">'+opts.map(function(o,i){return '<button data-seg="'+k+'" data-v="'+(i+1)+'" class="'+(val===i+1?'on':'')+'">'+esc(o)+'</button>';}).join('')+'</div></div>';}
  function styleLabel(v){var s=Data.climbStyles.filter(function(x){return x.v===v;})[0];return s?s.label:v;}
  function resultLabel(v){var r=Data.climbResults.filter(function(x){return x.v===v;})[0];return r?r.label:v;}
  function finishClimbing(){
    stopTimer(); var c=UI.climb, world=worldsById(c.worldId), t=Data.templates[c.templateId], ws=WS(c.worldId);
    var hardPull=c.problems.some(function(p){return ['V3','V4','V5','V6'].indexOf(p.grade)>=0;})||t.type==='project'||t.type==='power';
    var session={id:'cc_'+Date.now(),kind:'climbing',templateId:t.id,worldId:c.worldId,date:new Date().toISOString(),
      problems:c.problems,techniqueFocus:c.techFocus,targetNodeIds:[ws.focus.primary,ws.focus.supporting].filter(Boolean),
      rpe:c.rpe,finger:c.finger,skin:c.skin,hardPull:hardPull,difficulty:t.difficulty};
    var res=Progress.applyClimbing(world,ws.nodes,session);
    ws.nodes=res.states; recomputeFocus(world,ws); saveWS(c.worldId,ws);
    var sessions=Store.getSessions(); sessions.push(session); Store.setSessions(sessions);
    UI.climb=null; saveWorkoutState();
    showSummary(world,res,session);
  }

  // ---- post-session summary + unlock ----------------------------------------
  function showSummary(world,res,session){
    var cm=contentMap(world);
    var unlocked=(res.unlocked||[]).map(function(id){return cm[id];}).filter(Boolean);
    function proceed(){
      var ws=WS(UI.worldId);
      var rec=Engine.recommend({world:world,states:ws.nodes,focus:ws.focus,templates:Data.templates,readiness:readiness(),recent:recentForRec()});
      var nt=Data.templates[rec.sessionTemplateId];
      var affected=(session.targetNodeIds||[]).map(function(id){return cm[id];}).filter(Boolean);
      var html='<div class="hero" style="text-align:center;padding-top:20px"><div class="badge" style="background:rgba(61,220,151,.15);color:var(--good);margin-bottom:8px">Workout Saved</div><h1>Nice Work!</h1></div>'+
        '<div class="card"><div class="section" style="margin-top:0">Progress</div>'+
        (affected.length?affected.map(function(n){return '<div class="crit"><span>'+esc(n.name)+' — '+esc(Engine.progressText(n,ws.nodes))+'</span></div>';}).join(''):'<p class="muted small">Data updated.</p>')+'</div>'+
        (unlocked.length?'<div class="card ok" style="border-color:var(--focus)"><div class="section" style="margin-top:0">New Skills Unlocked</div>'+unlocked.map(function(n){return '<div class="crit done"><span class="ck">'+ICON.check+'</span><span>'+esc(n.name)+'</span></div>';}).join('')+'</div>':'')+
        (nt?'<div class="section">Recommended Next</div><div class="rec"><div class="name" style="font-size:18px">'+esc(nt.name)+'</div><div class="why">'+esc(rec.why||'')+'</div></div>':'')+
        '<button class="btn primary" data-map>View Map</button><button class="btn ghost" data-today>Back to Today</button>';
      app.innerHTML=''; app.appendChild(h('<div class="scr">'+html+'</div>'));
      on('[data-map]','click',function(){setScreen('map');});
      on('[data-today]','click',function(){setScreen('today');});
    }
    if(unlocked.length){
      var box=h('<div class="unlock"><div class="box"><div class="ring">'+ICON.star+'</div><h2>New Skill Unlocked!</h2><p class="muted">'+esc(unlocked[0].name)+(unlocked.length>1?' and '+(unlocked.length-1)+' more':'')+'</p><button class="btn primary" data-ok>Continue</button></div></div>');
      document.body.appendChild(box); box.querySelector('[data-ok]').onclick=function(){box.remove();proceed();};
    } else proceed();
  }

  // ---- Progress -------------------------------------------------------------
  function renderProgress(){
    var world=activeWorld(), ws=WS(UI.worldId), cm=contentMap(world);
    var sessions=(Store.getSessions()||[]).filter(function(s){return s.worldId===UI.worldId;});
    var completed=world.nodes.filter(function(n){return Engine.isComplete(n,ews(ws,world));});
    var primary=ws.focus.primary?cm[ws.focus.primary]:null;
    var weekAgo=Date.now()-7*864e5; var thisWeek=sessions.filter(function(s){return new Date(s.date).getTime()>=weekAgo;}).length;
    var chart='';
    if(world.id==='muscleup'){
      var pts=sessions.filter(function(s){return s.exResults&&s.exResults.pullup&&s.exResults.pullup.bestReps;}).map(function(s){return {v:s.exResults.pullup.bestReps,d:s.date};});
      if(pts.length){var mx=Math.max.apply(null,pts.map(function(p){return p.v;}));chart='<div class="section">Pull-Up Max Over Time</div><div class="chart">'+pts.slice(-8).map(function(p){return '<div class="bar" style="height:'+Math.round(p.v/mx*80)+'px"><span>'+p.v+'</span><em>'+new Date(p.d).toLocaleDateString('en-US',{day:'numeric',month:'numeric'})+'</em></div>';}).join('')+'</div>';}
    } else {
      var byGrade={}; sessions.forEach(function(s){(s.problems||[]).forEach(function(p){if(p.result==='send'||p.result==='flash'){byGrade[p.grade]=(byGrade[p.grade]||0)+1;}});});
      var gs=Object.keys(byGrade).sort(); if(gs.length){var gm=Math.max.apply(null,gs.map(function(g){return byGrade[g];}));chart='<div class="section">Sends by Grade</div><div class="chart">'+gs.map(function(g){return '<div class="bar" style="height:'+Math.round(byGrade[g]/gm*80)+'px"><span>'+byGrade[g]+'</span><em>'+g+'</em></div>';}).join('')+'</div>';}
    }
    var bench=Store.getBench();
    var html=''+
      '<h1>Progress</h1><p class="muted small">'+esc(world.name)+(primary?' &middot; Focus: '+esc(primary.name):'')+'</p>'+
      '<div class="card tight" style="margin-top:12px"><div class="between"><div><div style="font-size:26px;font-weight:900;color:var(--accent)">'+completed.length+'</div><div class="muted small">Skills Completed</div></div>'+
      '<div><div style="font-size:26px;font-weight:900">'+sessions.length+'</div><div class="muted small">Sessions in World</div></div>'+
      '<div><div style="font-size:26px;font-weight:900">'+thisWeek+'</div><div class="muted small">This Week</div></div></div></div>'+
      chart+
      '<div class="section">Recently Completed</div>'+
      (completed.length?completed.slice(-6).reverse().map(function(n){return '<div class="crit done"><span class="ck">'+ICON.check+'</span><span>'+esc(n.name)+'</span></div>';}).join(''):'<p class="muted small">None yet — finish a workout to progress.</p>')+
      (world.id==='muscleup'&&bench.pullup_max?'<div class="section">Personal Records</div><table class="kv"><tr><td>Pull-Up Max</td><td>'+bench.pullup_max+'</td></tr>'+(bench.dips_max?'<tr><td>Dip Max</td><td>'+bench.dips_max+'</td></tr>':'')+'</table>':'')+
      '<p class="footnote muted tiny sp">Data is based on completed workouts and Pull-Up Coach history (read-only).</p>';
    shell(html,'progress');
  }

  // ---- Profile --------------------------------------------------------------
  function renderProfile(){
    var p=Store.getProfile()||{};
    var html=''+
      '<h1>Profile &amp; Settings</h1>'+
      '<div class="section">Active World</div><div class="opts">'+Data.worlds.map(function(w){return '<button class="pill '+(w.id===UI.worldId?'on':'')+'" data-world="'+w.id+'">'+esc(w.name)+'</button>';}).join('')+'</div>'+
      '<div class="section">Preferred Session Length</div><div class="opts" id="dur">'+['short','normal','long'].map(function(v){return '<button class="pill '+(p.duration===v?'on':'')+'" data-v="'+v+'">'+({short:'Short',normal:'Normal',long:'Long'}[v])+'</button>';}).join('')+'</div>'+
      '<div class="section">Data</div>'+
      '<div class="card tight"><p class="small">This app reads <b>Pull-Up Coach</b> history read-only and writes only its own keys. It does not modify the original app and does not register a Service Worker.</p></div>'+
      '<button class="btn ghost" data-redo>Re-run Onboarding</button>'+
      '<button class="btn danger" data-reset>Reset Coach Data (spc_c_*)</button>'+
      '<p class="footnote muted tiny">Reset only deletes coach data. Your Pull-Up Coach data is untouched.</p>';
    var wrap=shell(html,'profile');
    on('[data-world]','click',function(e){switchWorldProfile(e.currentTarget.dataset.world);},wrap);
    on('#dur .pill','click',function(e){p.duration=e.currentTarget.dataset.v;Store.setProfile(p);UI.readiness=null;renderProfile();},wrap);
    on('[data-redo]','click',function(){OB=null;renderOnboarding(0);},wrap);
    on('[data-reset]','click',function(){if(confirm('Reset all coach data? Pull-Up Coach data is untouched.')){Store.reset();UI.readiness=null;UI.worldId=null;boot();}},wrap);
  }
  function switchWorldProfile(worldId){UI.worldId=worldId;var p=Store.getProfile()||{};p.activeWorld=worldId;Store.setProfile(p);UI.readiness=null;renderProfile();}

  // ---- go -------------------------------------------------------------------
  window.CoachApp={boot:boot,_UI:UI};
  boot();
})();
