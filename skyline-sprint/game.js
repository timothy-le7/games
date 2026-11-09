// Skyline Sprint controller: menus, input, HUD, audio, saves and lifecycle.
(()=>{'use strict';
const E=window.SkylineEngine,SAVE_KEY='games:skyline-sprint:v1',BACKUP_KEY=SAVE_KEY+':backup',PREFS_KEY=SAVE_KEY+':prefs',FORMAT='skyline-sprint-save',VERSION=1;
const $=id=>document.getElementById(id);
const els={home:$('home'),hud:$('hud'),stage:$('stage'),start:$('start'),cont:$('continue'),modeTabs:$('mode-tabs'),diffTabs:$('difficulty-tabs'),districts:$('district-list'),endless:$('endless-panel'),seed:$('seed-input'),locker:$('open-locker'),settings:$('open-settings'),skip:$('skip-tutorial'),
  distance:$('hud-distance'),score:$('hud-score'),tokens:$('hud-tokens'),pause:$('pause'),progress:$('hud-progress'),progressFill:$('hud-progress-fill'),powers:$('hud-powers'),gadget:$('gadget'),gadgetPips:$('gadget-pips'),touchPad:$('touch-pad'),callout:$('callout'),prompt:$('prompt'),countdown:$('countdown'),
  modal:$('modal'),kicker:$('modal-kicker'),title:$('modal-title'),body:$('modal-body'),actions:$('modal-actions'),importFile:$('import-file'),recordLine:$('record-line')};
const DIFFS=Object.keys(E.DIFFICULTY);
const blankDistrict=()=>({best:0,bestScore:0,bestTokens:0,finished:false,stars:[false,false,false]});
const defaults=()=>({version:1,mode:'district',difficulty:'normal',selectedDistrict:0,outfit:'courier',tutorialDone:false,seed:1+Math.floor(Math.random()*99999),randomSeed:true,
  districts:E.DISTRICTS.map(blankDistrict),endless:Object.fromEntries(DIFFS.map(d=>[d,{best:0,bestScore:0}])),totals:{runs:0,tokens:0,distance:0,crashes:0,finishes:0},seenOutfits:['courier'],activeRun:null});
let prefs={sound:true,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,touchButtons:false},profile=defaults(),run=null,renderer=null,playing=false,countdown=0,lastFrame=0,loopId=null,saveDue=0,storageBlocked=false,graphicsLost=false,crashClock=0,inputKind=matchMedia('(pointer: coarse)').matches?'touch':'keys';
const seen=new WeakSet();let framesRendered=0;
// ---- Validation and persistence --------------------------------------------
const int=(v,a,b)=>Number.isInteger(v)&&v>=a&&v<=b,num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
function validProfile(p){
  try{
    if(!p||typeof p!=='object'||Array.isArray(p)||p.version!==1||!['district','endless'].includes(p.mode)||!DIFFS.includes(p.difficulty)||!int(p.selectedDistrict,0,E.DISTRICTS.length-1))return false;
    if(!E.OUTFITS.some(o=>o.id===p.outfit)||typeof p.tutorialDone!=='boolean'||!int(p.seed,1,999999999)||typeof p.randomSeed!=='boolean')return false;
    if(!Array.isArray(p.districts)||p.districts.length!==E.DISTRICTS.length||!p.districts.every(d=>d&&num(d.best,0,1e7)&&num(d.bestScore,0,1e9)&&num(d.bestTokens,0,1e6)&&typeof d.finished==='boolean'&&Array.isArray(d.stars)&&d.stars.length===3&&d.stars.every(s=>typeof s==='boolean')))return false;
    if(!p.endless||!DIFFS.every(d=>p.endless[d]&&num(p.endless[d].best,0,1e8)&&num(p.endless[d].bestScore,0,1e10)))return false;
    if(!p.totals||!['runs','tokens','distance','crashes','finishes'].every(k=>num(p.totals[k],0,1e12)))return false;
    if(!Array.isArray(p.seenOutfits)||p.seenOutfits.length>E.OUTFITS.length||!p.seenOutfits.every(id=>E.OUTFITS.some(o=>o.id===id)))return false;
    if(p.activeRun!==null&&!E.validRun(p.activeRun))return false;
    if(!unlockedOutfits(p).includes(p.outfit))return false;
    return true;
  }catch{return false;}
}
function validPrefs(p){return !!p&&typeof p.sound==='boolean'&&typeof p.reducedMotion==='boolean'&&typeof p.touchButtons==='boolean';}
function parse(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));if(localStorage.getItem(key)===null)throw new Error('unsaved');return true;}catch{storageBlocked=true;return false;}}
function candidate(){const p=JSON.parse(JSON.stringify({...profile,activeRun:null}));p.activeRun=run&&run.phase==='playing'?E.snapshot(run):null;return p;}
// save() returns true only after the profile is durably written.
function save(){
  const next=candidate();if(!validProfile(next))return false;
  const current=parse(SAVE_KEY);if(validProfile(current)){if(!write(BACKUP_KEY,current))return false;}
  if(!write(SAVE_KEY,next))return false;profile=next;saveDue=0;storageBlocked=false;return true;
}
function savePrefs(){return write(PREFS_KEY,prefs);}
function load(){
  const a=parse(SAVE_KEY),b=parse(BACKUP_KEY);profile=validProfile(a)?a:validProfile(b)?b:defaults();
  const pr=parse(PREFS_KEY);if(validPrefs(pr))prefs=pr;
  run=profile.activeRun?E.restore(profile.activeRun):null;if(!run)profile.activeRun=null;
}
function exportSave(){return{format:FORMAT,version:VERSION,payload:candidate()};}
function importSave(value){
  let text='';try{text=JSON.stringify(value);}catch{return false;}
  if(!text||text.length>1500000||!value||value.format!==FORMAT||value.version!==VERSION||!validProfile(value.payload))return false;
  const next=JSON.parse(text).payload,restored=next.activeRun?E.restore(next.activeRun):null;if(next.activeRun&&!restored)return false;
  const oldProfile=profile,oldRun=run;profile=next;run=restored;
  if(!save()){profile=oldProfile;run=oldRun;return false;}
  closeModal();showHome();return true;
}
function summary(){
  return{screen:els.home.classList.contains('hidden')?'run':'home',mode:profile.mode,difficulty:profile.difficulty,district:profile.selectedDistrict,outfit:profile.outfit,tutorialDone:profile.tutorialDone,
    districts:profile.districts.map(d=>({...d,stars:d.stars.slice()})),endless:JSON.parse(JSON.stringify(profile.endless)),totals:{...profile.totals},unlocked:unlockedOutfits(profile),
    activeRun:run?{mode:run.mode,district:run.district,difficulty:run.difficulty,phase:run.phase,distance:Math.floor(run.player.z),tokens:run.stats.tokens,score:run.stats.score,lane:run.player.lane,paused:!playing}:null};
}
// ---- Progression ------------------------------------------------------------
function unlockedOutfits(p){
  const d=p.districts,u=['courier'];
  if(d[1]?.finished)u.push('lantern');if(d[2]?.finished)u.push('dockhand');if(d[3]?.finished)u.push('spire');if(d[4]?.stars.every(Boolean))u.push('storm');
  if(Math.max(p.endless.normal.best,p.endless.hard.best)>=2000)u.push('comet');if(p.totals.tokens>=1500)u.push('brass');return u;
}
function districtUnlocked(i){return i===0||profile.districts[i-1].finished||i===1&&profile.tutorialDone;}
function endlessUnlocked(){return profile.tutorialDone||profile.districts[0].finished;}
function recordRun(){
  // Called exactly once when a run ends; returns notes for the result screen.
  const notes=[],before=unlockedOutfits(profile),s=run.stats,dist=Math.floor(run.player.z),t=profile.totals;
  t.runs++;t.tokens+=s.tokens;t.distance+=dist;if(run.phase==='crashed')t.crashes++;else t.finishes++;
  if(run.mode==='district'){
    const rec=profile.districts[run.district],stars=E.starsFor(run);
    if(dist>rec.best&&run.phase!=='finished'){rec.best=dist;notes.push('New best distance');}if(run.phase==='finished')rec.best=Math.max(rec.best,dist);
    if(s.score>rec.bestScore){if(rec.bestScore>0)notes.push('New best score');rec.bestScore=s.score;}rec.bestTokens=Math.max(rec.bestTokens,s.tokens);
    stars.forEach((v,i)=>{if(v&&!rec.stars[i]){rec.stars[i]=true;notes.push('Star earned: '+starLabel(run.district,i));}});
    if(run.phase==='finished'&&!rec.finished){rec.finished=true;if(run.district===0)profile.tutorialDone=true;if(run.district<E.DISTRICTS.length-1)notes.push(E.DISTRICTS[run.district+1].name+' unlocked');if(run.district===0)notes.push('Endless mode unlocked');}
  }else{const rec=profile.endless[run.difficulty];if(dist>rec.best){if(rec.best>0)notes.push('New endless record');rec.best=dist;}if(s.score>rec.bestScore)rec.bestScore=s.score;profile.seed=run.seed;}
  const after=unlockedOutfits(profile);for(const id of after)if(!before.includes(id))notes.push('Outfit unlocked: '+E.OUTFITS.find(o=>o.id===id).name);
  return notes;
}
function starLabel(d,i){const D=E.DISTRICTS[d];return i===0?'Reach the finish':i===1?`Collect ${D.tokensGoal} tokens`:D.challenge.label;}
// ---- Audio (original, synthesized locally after a gesture) -----------------
class Sfx{
  constructor(){this.ctx=null;this.voices=0;this.combo=0;this.comboAt=0;}
  arm(){if(!prefs.sound)return;try{this.ctx=this.ctx||new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();}catch{this.ctx=null;}}
  tone(f,d=.08,g=.03,type='triangle',slide=0){if(!prefs.sound||!this.ctx||this.ctx.state!=='running'||this.voices>12)return;const c=this.ctx,o=c.createOscillator(),v=c.createGain(),t=c.currentTime;o.type=type;o.frequency.setValueAtTime(f,t);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f*slide),t+d);v.gain.setValueAtTime(g,t);v.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(v).connect(c.destination);this.voices++;o.onended=()=>{this.voices--;o.disconnect();v.disconnect();};o.start(t);o.stop(t+d+.02);}
  token(){const now=performance.now();this.combo=now-this.comboAt<450?Math.min(this.combo+1,10):0;this.comboAt=now;this.tone(880*Math.pow(1.06,this.combo),.07,.025,'sine');}
  suspend(){try{this.ctx?.suspend();}catch{}}
}
const sfx=new Sfx();
// ---- Screens ----------------------------------------------------------------
function renderHome(){
  document.querySelectorAll('[data-mode]').forEach(b=>{const on=b.dataset.mode===profile.mode;b.setAttribute('aria-pressed',String(on));if(b.dataset.mode==='endless')b.disabled=!endlessUnlocked();});
  document.querySelectorAll('[data-difficulty]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.difficulty===profile.difficulty)));
  if(profile.mode==='endless'&&!endlessUnlocked())profile.mode='district';
  els.districts.classList.toggle('hidden',profile.mode!=='district');els.endless.classList.toggle('hidden',profile.mode!=='endless');
  els.districts.innerHTML=E.DISTRICTS.map((d,i)=>{const rec=profile.districts[i],open=districtUnlocked(i),sel=i===profile.selectedDistrict;
    return `<button type="button" class="district theme-${d.theme}${sel?' selected':''}" data-district="${i}" ${open?'':'disabled'} aria-pressed="${sel}"><span class="d-num">${open?i+1:'🔒'}</span><span class="d-copy"><b>${d.name}</b><small>${open?d.blurb:'Finish '+E.DISTRICTS[i-1].name+' to open'}</small><small class="d-record">${rec.finished?'Cleared':rec.best?'Best '+rec.best+' m':'Not run yet'}${rec.bestScore?' · '+rec.bestScore.toLocaleString()+' pts':''}</small></span><span class="stars" aria-label="${rec.stars.filter(Boolean).length} of 3 stars">${rec.stars.map(s=>s?'★':'☆').join('')}</span></button>`;}).join('');
  els.districts.querySelectorAll('[data-district]').forEach(b=>b.onclick=()=>{profile.selectedDistrict=Number(b.dataset.district);save();renderHome();});
  const e=profile.endless;els.recordLine.textContent=DIFFS.map(d=>`${E.DIFFICULTY[d].label} ${e[d].best.toLocaleString()} m`).join(' · ');
  els.seed.value=profile.randomSeed?'':String(profile.seed);
  const D=E.DISTRICTS[profile.selectedDistrict];
  els.start.textContent=profile.mode==='endless'?'Start endless run':D.tutorial?'Start the training run':'Run '+D.name;
  els.cont.classList.toggle('hidden',!(run&&run.phase==='playing'));
  if(run&&run.phase==='playing')els.cont.textContent='Continue '+(run.mode==='endless'?'endless run':E.DISTRICTS[run.district].name)+' · '+Math.floor(run.player.z)+' m';
  els.skip.classList.toggle('hidden',profile.tutorialDone||profile.districts[0].finished);
  const o=E.OUTFITS.find(x=>x.id===profile.outfit);els.locker.textContent='Locker · '+o.name+' ('+unlockedOutfits(profile).length+'/'+E.OUTFITS.length+')';
  previewFrame();
}
function previewFrame(){
  // A still backdrop of the selected district with the chosen outfit.
  if(!renderer||graphicsLost)return;const demo=E.createRun({mode:profile.mode==='endless'?'endless':'district',district:profile.selectedDistrict,difficulty:profile.difficulty,seed:profile.seed,outfit:profile.outfit});
  demo.player.z=6;renderer.render(demo,{now:performance.now()/1000,reducedMotion:prefs.reducedMotion,snap:true});
}
function ensureRenderer(){if(!renderer)renderer=new window.SkylineRenderer(els.stage,E);}
function showHome(){
  playing=false;countdown=0;releaseTouch();stopLoop();document.body.classList.remove('running');els.hud.classList.add('hidden');els.touchPad.classList.add('hidden');els.home.classList.remove('hidden');els.prompt.textContent='';els.callout.classList.remove('show');
  ensureRenderer();renderHome();
}
function showRun(){
  ensureRenderer();els.home.classList.add('hidden');els.hud.classList.remove('hidden');document.body.classList.add('running');els.touchPad.classList.toggle('hidden',!prefs.touchButtons);
  for(const e of run.events)seen.add(e);renderHud();els.stage.focus({preventScroll:true});lastFrame=performance.now();startLoop();
}
function newRun(){
  sfx.arm();const mode=profile.mode==='endless'&&endlessUnlocked()?'endless':'district',d=profile.selectedDistrict;
  if(mode==='district'&&!districtUnlocked(d))return;
  let seed=profile.seed;if(mode==='endless'){const typed=els.seed.value.trim();if(/^\d{1,9}$/.test(typed)&&Number(typed)>0){seed=Number(typed);profile.randomSeed=false;}else{seed=1+Math.floor(Math.random()*999999);profile.randomSeed=true;}profile.seed=seed;}
  run=E.createRun({mode,district:d,difficulty:profile.difficulty,seed,outfit:profile.outfit});crashClock=0;closeModal();save();showRun();beginCountdown(1.2);
  if(mode==='district'&&E.DISTRICTS[d].tutorial)callout('Training run · crashes return you to the last checkpoint',2.6);
  else callout(mode==='endless'?'Endless · seed '+seed:E.DISTRICTS[d].name+' · '+E.DIFFICULTY[profile.difficulty].label,2);
}
function continueRun(){if(!run||run.phase!=='playing')return newRun();sfx.arm();closeModal();showRun();beginCountdown(1.2);}
function beginCountdown(seconds){countdown=seconds;playing=false;}
function startLoop(){if(loopId===null)loopId=requestAnimationFrame(frame);}
function stopLoop(){if(loopId!==null){cancelAnimationFrame(loopId);loopId=null;}}
function frame(now){
  loopId=null;if(els.hud.classList.contains('hidden')||!run)return;
  const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!graphicsLost&&modalOpen()===false){
    if(countdown>0){countdown=Math.max(0,countdown-dt);els.countdown.textContent=countdown>0?(countdown>.8?'Ready':'Go'):'';els.countdown.classList.toggle('show',countdown>0);if(countdown===0)playing=run.phase==='playing';}
    if(playing&&run.phase==='playing'){E.advance(run,dt);handleEvents();saveDue+=dt;if(saveDue>3)save();if(run.phase!=='playing')endRun();}
  }
  if(run.phase==='crashed')crashClock+=dt;
  if(!graphicsLost){renderer.render(run,{now:now/1000,reducedMotion:prefs.reducedMotion,crashT:crashClock});framesRendered++;}
  renderHud();startLoop();
}
function modalOpen(){return !els.modal.classList.contains('hidden');}
// ---- HUD, prompts and feedback -----------------------------------------------
const PROMPTS={
  run:{touch:'You run automatically · stay in the open centre lane',keys:'You run automatically · stay in the open centre lane'},
  left:{touch:'Swipe ← to change lane',keys:'← or A changes lane'},right:{touch:'Swipe → to change lane',keys:'→ or D changes lane'},
  jump:{touch:'Swipe ↑ to jump the hurdle',keys:'↑, W or Space jumps'},slide:{touch:'Swipe ↓ to slide under the sign',keys:'↓ or S slides'},
  choose:{touch:'Any open move works · pick one',keys:'Any open move works · pick one'},magnet:{touch:'Grab the Coil Magnet · tokens fly to you',keys:'Grab the Coil Magnet · tokens fly to you'},
  cells:{touch:'Three Spark cells charge the Glide Wing',keys:'Three Spark cells charge the Glide Wing'},
  gadget:{touch:'Tap GLIDE to soar over everything',keys:'Press E to soar over everything'},shield:{touch:'A Bubble Shield absorbs one crash',keys:'A Bubble Shield absorbs one crash'},finish:{touch:'Finish line ahead',keys:'Finish line ahead'}
};
function callout(text,seconds=1.4){els.callout.textContent=text;els.callout.classList.add('show');clearTimeout(callout.t);callout.t=setTimeout(()=>els.callout.classList.remove('show'),seconds*1000);}
function renderHud(){
  if(!run)return;const s=run.stats,p=run.player;
  els.distance.textContent=Math.floor(p.z).toLocaleString()+' m';els.score.textContent=s.score.toLocaleString();els.tokens.textContent=s.tokens.toLocaleString();
  const district=run.mode==='district';els.progress.classList.toggle('hidden',!district);if(district&&run.track.length)els.progressFill.style.width=Math.min(100,p.z/run.track.length*100).toFixed(1)+'%';
  const chips=[];for(const k of Object.keys(E.POWER)){const left=run.power[k];if(left>0){const full=E.POWER[k].time,label=k==='shield'?'Shield':E.POWER[k].label;chips.push(`<span class="chip chip-${k}${left<3?' ending':''}"><b>${label}</b><i style="width:${Math.min(100,left/full*100).toFixed(0)}%"></i><em>${Math.ceil(left)}s</em></span>`);}}
  const html=chips.join('');if(els.powers.innerHTML!==html)els.powers.innerHTML=html;
  const pips=Math.round(run.gadget*3+1e-6);els.gadgetPips.textContent='●'.repeat(pips)+'○'.repeat(3-pips);els.gadget.classList.toggle('ready',run.gadget>=.999);els.gadget.setAttribute('aria-label',run.gadget>=.999?'Glide Wing ready (E)':`Glide Wing charging: ${pips} of 3 Spark cells`);
  // Tutorial prompt for the next authored row.
  let text='';if(run.phase==='playing'){const up=E.upcoming(run,40).prompts;if(up.length){let k=up[0].text;
    // Keep the glide prompts truthful: no "charge" or "glide" advice mid-glide.
    if(run.player.glide>0&&(k==='cells'||k==='gadget'))k='';else if(k==='cells'&&run.gadget>=.999)k='gadget';
    if(k==='gadget'&&run.gadget<.999)text=inputKind==='touch'?'Swipe ↑ to jump the hurdle':'↑, W or Space jumps';else text=(PROMPTS[k]||{})[inputKind]||'';}}
  if(els.prompt.textContent!==text)els.prompt.textContent=text;
}
function handleEvents(){
  for(const e of run.events){if(seen.has(e))continue;seen.add(e);
    switch(e.type){
      case'token':sfx.token();break;
      case'cell':sfx.tone(660,.12,.03,'sine',1.6);callout(run.gadget>=.999?(inputKind==='touch'?'Glide Wing charged · tap GLIDE':'Glide Wing charged · press E'):'Spark cell '+Math.round(run.gadget*3)+'/3');break;
      case'power':sfx.tone(523,.18,.04,'square',2);callout({magnet:'Coil Magnet · 10 s',shield:'Bubble Shield · absorbs one crash',springs:'Spring Soles · 10 s of high jumps'}[e.kind]);break;
      case'power-end':callout(E.POWER[e.kind].label+' ended',1);break;
      case'jump':sfx.tone(e.spring?300:240,.12,.03,'triangle',1.8);break;
      case'slide':sfx.tone(180,.16,.025,'sawtooth',.5);break;
      case'dive':sfx.tone(320,.1,.02,'triangle',.5);break;
      case'land':if(e.fall>1)sfx.tone(90,.08,.04,'sine');break;
      case'lane':sfx.tone(420,.04,.012,'sine');break;
      case'edge':sfx.tone(120,.06,.02,'square');break;
      case'bump':sfx.tone(110,.2,.05,'sawtooth');callout('Bump! Another one soon ends the run',1.6);if(navigator.vibrate&&inputKind==='touch')navigator.vibrate(40);break;
      case'near-miss':sfx.tone(980,.08,.02,'sine',1.3);callout('Near miss +25',.8);break;
      case'shield-break':sfx.tone(700,.25,.04,'square',.4);callout('Shield saved you',1.2);break;
      case'glide':sfx.tone(392,.5,.035,'sine',2);callout('Glide Wing',1);break;
      case'gadget-empty':callout('Glide Wing needs 3 Spark cells',1.1);break;
      case'tram':sfx.tone(150,.35,.03,'square',.8);break;
      case'respawn':callout('Try again from the checkpoint',1.6);break;
      case'crash':sfx.tone(80,.4,.06,'sawtooth',.4);break;
    }
  }
}
function endRun(){
  playing=false;releaseTouch();const finished=run.phase==='finished',notes=recordRun(),r=run.result,stars=run.mode==='district'?E.starsFor(run):null;
  const ok=save();sfx.tone(finished?660:90,finished?.4:.3,.05,finished?'triangle':'sawtooth',finished?1.5:.5);
  setTimeout(()=>showResult(notes,ok),finished?250:700);
  void r;void stars;
}
function showResult(notes,saved){
  if(!run)return;const finished=run.phase==='finished',s=run.stats,dist=Math.floor(run.player.z),district=run.mode==='district';
  const stars=district?E.starsFor(run):null,D=district?E.DISTRICTS[run.district]:null,next=district&&finished&&run.district<E.DISTRICTS.length-1;
  const rows=[['Distance',dist.toLocaleString()+' m'],['Tokens',s.tokens],['Score',s.score.toLocaleString()],['Near misses',s.nearMisses]];
  const best=district?profile.districts[run.district].best:profile.endless[run.difficulty].best;
  const body=`${finished?'':`<p class="cause">You ${run.result.cause}.</p>`}<dl class="result-grid">${rows.map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
    ${district?`<ul class="star-list">${stars.map((v,i)=>`<li class="${v?'got':''}">${v?'★':'☆'} ${starLabel(run.district,i)}</li>`).join('')}</ul>`:`<p>Record on ${E.DIFFICULTY[run.difficulty].label}: <b>${best.toLocaleString()} m</b> · seed ${run.seed}</p>`}
    ${notes.length?`<ul class="notes">${notes.map(n=>`<li>${n}</li>`).join('')}</ul>`:''}${saved?'':'<p role="alert">This browser rejected the save. Export a backup from Settings before leaving.</p>'}`;
  const actions=[{label:'Run again',primary:!next,action:()=>{const r=E.restart(run);run=r;crashClock=0;closeModal();save();showRun();beginCountdown(1);}}];
  if(next)actions.unshift({label:'Next: '+E.DISTRICTS[run.district+1].name,primary:true,action:()=>{profile.selectedDistrict=run.district+1;run=null;newRun();}});
  actions.push({label:'Menu',action:()=>{run=null;save();closeModal();showHome();}});
  openModal(finished?(D?D.name+' cleared':'Finished'):'Run over',finished?'FINISH':'CRASH',body,actions);
}
// ---- Modal --------------------------------------------------------------------
let modalBack=null;
function openModal(title,kicker,body,actions,back){
  els.title.textContent=title;els.kicker.textContent=kicker;els.body.innerHTML=body;els.actions.innerHTML='';
  for(const a of actions){const b=document.createElement('button');b.type='button';b.textContent=a.label;if(a.primary)b.className='primary';if(graphicsLost&&a.needsGraphics)b.disabled=true;b.dataset.label=a.label;b.onclick=()=>a.action();els.actions.append(b);}
  modalBack=back||null;els.modal.classList.remove('hidden');(els.actions.querySelector('.primary')||els.actions.querySelector('button'))?.focus({preventScroll:true});
}
function closeModal(){els.modal.classList.add('hidden');modalBack=null;if(!els.hud.classList.contains('hidden'))els.stage.focus({preventScroll:true});}
function pause(reason){
  if(!run||run.phase!=='playing'||els.hud.classList.contains('hidden')||modalOpen())return;
  playing=false;countdown=0;els.countdown.classList.remove('show');releaseTouch();sfx.suspend();const ok=save();
  const resume=()=>{if(graphicsLost)return;sfx.arm();closeModal();beginCountdown(.9);};
  openModal('Paused','PAUSED',`<p id="render-note">${graphicsLost?'The 3D view is recovering. Your run is frozen and kept.':reason==='hidden'?'Paused while the game was in the background. Your run is saved.':'Your run is frozen. Resume gives a short ready count.'}</p>${ok?'':'<p role="alert">This browser rejected the local save. The run stays in memory; export a backup before leaving.</p>'}<p class="small">${controlsText()}</p>`,
    [{label:'Resume',primary:true,needsGraphics:true,action:resume},{label:'Restart run',needsGraphics:true,action:()=>{run=E.restart(run);crashClock=0;closeModal();save();showRun();beginCountdown(1);}},{label:'Menu (run kept)',action:()=>{closeModal();save();showHome();}}],resume);
}
function controlsText(){return 'Keys: ←/→ or A/D change lane · ↑, W or Space jump · ↓ or S slide · E Glide Wing · Esc or P pause · R restart from this menu. Touch: swipe left, right, up or down anywhere on the scene; tap GLIDE for the gadget.';}
function settings(){
  openModal('Settings & save','SETTINGS',`<label class="row">Sound effects <input id="pref-sound" type="checkbox" ${prefs.sound?'checked':''}></label><label class="row">Reduced motion <input id="pref-motion" type="checkbox" ${prefs.reducedMotion?'checked':''}></label><label class="row">On-screen move buttons <input id="pref-touch" type="checkbox" ${prefs.touchButtons?'checked':''}></label>
    <p class="small"><b>Controls.</b> ${controlsText()}</p><p class="small">Progress, records and an unfinished run stay only in this browser. Export a backup before clearing site data or switching devices.</p><p id="settings-feedback" role="status">${storageBlocked?'Local storage was rejected; current progress is still in memory.':''}</p>`,
    [{label:'Export backup',action:download},{label:'Import backup',action:()=>els.importFile.click()},{label:'Done',primary:true,action:closeSettings}],closeSettings);
}
function closeSettings(){prefs.sound=$('pref-sound').checked;prefs.reducedMotion=$('pref-motion').checked;prefs.touchButtons=$('pref-touch').checked;savePrefs();closeModal();renderHome();}
function locker(){
  const open=unlockedOutfits(profile);
  openModal('Runner locker','OUTFITS',`<p class="small">Outfits are earned by playing; there is nothing to buy.</p><div class="outfits">${E.OUTFITS.map(o=>{const has=open.includes(o.id);return `<button type="button" class="outfit${o.id===profile.outfit?' selected':''}" data-outfit="${o.id}" ${has?'':'disabled'} aria-pressed="${o.id===profile.outfit}"><span class="swatch" style="--a:${o.jacket};--b:${o.pants};--c:${o.accent}"></span><b>${o.name}</b><small>${has?'Unlocked':o.unlock}</small></button>`;}).join('')}</div>`,
    [{label:'Done',primary:true,action:()=>{closeModal();renderHome();}}],()=>{closeModal();renderHome();});
  els.body.querySelectorAll('[data-outfit]').forEach(b=>b.onclick=()=>{profile.outfit=b.dataset.outfit;profile.seenOutfits=unlockedOutfits(profile);save();els.body.querySelectorAll('[data-outfit]').forEach(x=>{const on=x===b;x.classList.toggle('selected',on);x.setAttribute('aria-pressed',String(on));});previewFrame();});
}
function download(){const blob=new Blob([JSON.stringify(exportSave(),null,1)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='skyline-sprint-save.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),0);const f=$('settings-feedback');if(f)f.textContent='Backup exported.';}
els.importFile.onchange=async()=>{const file=els.importFile.files?.[0];els.importFile.value='';if(!file)return;let value=null;try{if(file.size>1500000)throw new Error('large');value=JSON.parse(await file.text());}catch{}const ok=importSave(value);if(!ok){const f=$('settings-feedback');if(f)f.textContent='That backup was not valid; your current progress was kept.';else callout('That backup was not valid; progress kept',2);}else callout('Backup imported',1.5);};
// ---- Input ----------------------------------------------------------------------
function act(action){if(!run||!playing||run.phase!=='playing'||modalOpen()||countdown>0)return false;sfx.arm();return E.queueAction(run,action);}
const KEYMAP={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'jump',KeyW:'jump',Space:'jump',ArrowDown:'slide',KeyS:'slide',KeyE:'gadget'};
function editable(target){return !!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}
addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.keyCode===229||e.defaultPrevented)return;
  const running=!els.hud.classList.contains('hidden');
  if(modalOpen()){
    if(e.key==='Tab'){trapTab(e);return;}
    if(editable(e.target))return;
    if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat&&modalBack){e.preventDefault();modalBack();return;}
    if(e.code==='KeyR'&&!e.repeat&&running){const b=[...els.actions.children].find(n=>/^(Run again|Restart run)$/.test(n.dataset.label||''));if(b&&!b.disabled){e.preventDefault();b.click();}}
    return;
  }
  if(!running||editable(e.target))return;
  if((e.code==='Escape'||e.code==='KeyP')){e.preventDefault();if(!e.repeat)pause();return;}
  const action=KEYMAP[e.code];if(!action)return;
  // Space/Enter on a focused button keeps its native activation.
  if((e.code==='Space')&&e.target?.closest?.('button,a[href]')&&e.target!==els.stage)return;
  e.preventDefault();if(e.repeat)return;inputKind='keys';act(action);
});
function trapTab(e){const nodes=[...els.modal.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(n=>n.getClientRects().length);if(!nodes.length)return;const i=nodes.indexOf(document.activeElement);e.preventDefault();nodes[i<0?0:(i+(e.shiftKey?-1:1)+nodes.length)%nodes.length].focus();}
// Swipes: a contact fires once its travel passes the threshold (no need to
// lift), and may re-arm for a second direction in the same gesture.
const contacts=new Map();
function threshold(){return Math.max(22,Math.min(innerWidth,innerHeight)*.045);}
function onDown(e){if(els.hud.classList.contains('hidden')||modalOpen())return;if(e.target.closest('button'))return;if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();contacts.set(e.pointerId,{x:e.clientX,y:e.clientY,t:performance.now(),fired:new Set()});if(e.pointerType!=='mouse')inputKind='touch';try{els.stage.setPointerCapture?.(e.pointerId);}catch{}}
// Each direction fires at most once per contact, however long or slow the
// stroke; a bend into a new direction (e.g. right, then up) fires that too.
function onMove(e){const c=contacts.get(e.pointerId);if(!c)return;const dx=e.clientX-c.x,dy=e.clientY-c.y,th=threshold()*(c.fired.size?1.4:1);if(Math.hypot(dx,dy)<th)return;
  const dir=Math.abs(dx)>Math.abs(dy)?(dx<0?'left':'right'):(dy<0?'jump':'slide');c.x=e.clientX;c.y=e.clientY;if(c.fired.has(dir))return;
  c.fired.add(dir);c.t=performance.now();act(dir);}
function onUp(e){contacts.delete(e.pointerId);}
function releaseTouch(){contacts.clear();}
for(const node of [els.stage,els.hud]){node.addEventListener('pointerdown',onDown);node.addEventListener('pointermove',onMove);node.addEventListener('pointerup',onUp);node.addEventListener('pointercancel',onUp);node.addEventListener('lostpointercapture',onUp);}
els.stage.addEventListener('contextmenu',e=>e.preventDefault());
document.querySelectorAll('[data-move]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();inputKind='touch';act(b.dataset.move);});b.addEventListener('click',e=>{if(e.detail===0)act(b.dataset.move);});});
els.gadget.addEventListener('pointerdown',e=>{e.preventDefault();act('gadget');});els.gadget.addEventListener('click',e=>{if(e.detail===0)act('gadget');});
els.pause.onclick=()=>pause();
// ---- Menu wiring -----------------------------------------------------------------
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(b.disabled)return;profile.mode=b.dataset.mode;save();renderHome();});
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{profile.difficulty=b.dataset.difficulty;save();renderHome();});
els.start.onclick=()=>{if(run&&run.phase==='playing'){openModal('Replace saved run?','RUN IN PROGRESS','<p>Starting now ends your unfinished run without recording it.</p>',[{label:'Start new run',primary:true,action:()=>{run=null;newRun();}},{label:'Keep it',action:closeModal}],closeModal);return;}newRun();};
els.cont.onclick=continueRun;els.settings.onclick=settings;els.locker.onclick=locker;
els.skip.onclick=()=>{profile.tutorialDone=true;save();callout('Training skipped · Lantern Market and Endless are open',2);renderHome();};
els.seed.addEventListener('change',()=>{const v=els.seed.value.trim();if(/^\d{1,9}$/.test(v)&&Number(v)>0){profile.seed=Number(v);profile.randomSeed=false;}else{profile.randomSeed=true;els.seed.value='';}save();});
// ---- Lifecycle -----------------------------------------------------------------
addEventListener('blur',()=>{releaseTouch();if(playing||countdown>0)pause('blur');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){releaseTouch();if(playing||countdown>0)pause('hidden');else if(run)save();}});
addEventListener('pagehide',()=>{if(run&&run.phase==='playing')save();});
addEventListener('resize',()=>{releaseTouch();if(els.hud.classList.contains('hidden'))previewFrame();});
els.stage.addEventListener('webglcontextlost',()=>{graphicsLost=true;releaseTouch();if(playing||countdown>0)pause('graphics');for(const b of els.actions.children)if(/^(Resume|Restart run|Run again)$/.test(b.dataset.label||''))b.disabled=true;const n=$('render-note');if(n)n.textContent='The 3D view is recovering. Your run is frozen and kept.';});
els.stage.addEventListener('webglcontextrestored',()=>{graphicsLost=false;for(const b of els.actions.children)b.disabled=false;const n=$('render-note');if(n)n.textContent='The 3D view is restored. Resume when ready.';if(els.hud.classList.contains('hidden'))previewFrame();});
load();showHome();
window.GameApp={save,exportSave,importSave,getSummary:summary};
// Read-only diagnostics for automated checks; nothing here changes state.
window.SkylineSprintDiagnostics={
  view:()=>run?{z:run.player.z,x:run.player.x,lane:run.player.lane,laneT:run.player.laneT,y:run.player.y,grounded:run.player.grounded,slide:run.player.slide,glide:run.player.glide,time:run.time,speed:E.currentSpeed(run),gadget:run.gadget,springs:run.power.springs>0,air:E.jumpProfile(run.power.springs>0).air,phase:run.phase,playing,countdown,stats:{...run.stats},power:{...run.power},up:E.upcoming(run,120)}:null,
  renderer:()=>renderer?renderer.debug():null,project:p=>renderer&&run?renderer.project(run,p):null,headScreen:()=>renderer&&run?renderer.project(run,[run.player.x,run.player.y+1.6,run.player.z]):null,feetScreen:()=>renderer&&run?renderer.project(run,[run.player.x,run.player.y,run.player.z]):null,
  pose:()=>renderer?.pose?{...renderer.pose}:null,storageBlocked:()=>storageBlocked,frames:()=>framesRendered,inputKind:()=>inputKind};
window.dispatchEvent(new Event('game-ready'));
})();
