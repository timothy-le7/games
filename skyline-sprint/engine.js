// Skyline Sprint deterministic rules: lanes, fixed-step physics, swept
// collisions, validated pattern generation, pickups and run snapshots.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SkylineEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const RULES_VERSION=1,STEP=1/120,LANE_W=2.6,LANE_TIME=.15,MAX_SUBSTEP=.15;
const PLAYER={halfW:.38,halfD:.32,stand:1.75,slide:.78};
// Spring Soles jump over twice as high (3.06 m) in the same 0.6 s airtime, so
// the power-up never lands a runner later than the spacing rules assume.
const JUMP_V=9.6,GRAVITY=32,SPRING_V=20.4,SPRING_G=68,FAST_FALL=-24,SLIDE_TIME=.62,COYOTE=.1,BUFFER=.16,STEP_TOL=.16;
const GLIDE_TIME=4,GLIDE_Y=4.3,GRACE=.55,BUMP_WINDOW=3.5;
const OBSTACLE_HALF_W=1.0,MAX_SUPPORTED_SPEED=34;
const POWER={magnet:{label:'Coil Magnet',time:10},shield:{label:'Bubble Shield',time:25},springs:{label:'Spring Soles',time:10}};
const KIND={hurdle:{top:1.0,len:.45},block:{top:2.2,len:1.4},gate:{under:1.15,top:2.5,len:.5},crate:{top:2.6},tram:{top:2.5,len:9}};
const DIFFICULTY={
  easy:{label:'Easy',v0:11,vmax:19,ramp:900,reaction:1.05,density:.8,powerEvery:210,scoreMul:1},
  normal:{label:'Normal',v0:13,vmax:25,ramp:1100,reaction:.85,density:1,powerEvery:270,scoreMul:1.25},
  hard:{label:'Hard',v0:15,vmax:30,ramp:1300,reaction:.7,density:1.2,powerEvery:330,scoreMul:1.5}
};
// Authored districts. Each list is the hand-ordered challenge sequence; the
// district seed only varies lanes. Difficulty changes speed and spacing.
const DISTRICTS=[
  {id:'dawnline',name:'Dawnline Rooftops',blurb:'Learn every move on quiet morning roofs.',theme:0,speed:[0,.08],tutorial:true,tokensGoal:45,
    challenge:{stat:'gadgetUses',value:1,label:'Use the Glide Wing once'},seed:101,sequence:[]},
  {id:'lantern',name:'Lantern Market',blurb:'Awnings, string lights and stacked market crates.',theme:1,speed:[.12,.36],tokensGoal:120,
    challenge:{stat:'bumps',value:0,max:true,label:'Finish without a side bump'},seed:202,
    sequence:['single','single','pair','single','jumpAll','pair','slideAll','single','mixed3','pair','slalom','gateBlock','pair','mixed3','jumpAll','single','pair','slideAll','mixed3','gateBlock','slalom','pair','mixed3','doubleJump','pair']},
  {id:'cargo',name:'Cargo Pier',blurb:'Run container roofs while freight trams roll in.',theme:2,speed:[.25,.5],tokensGoal:150,
    challenge:{stat:'roofDistance',value:80,label:'Run 80 m on container roofs'},seed:303,
    sequence:['single','cargo','pair','cargo','jumpAll','tram','single','cargo','pair','tram','mixed3','cargo','gateBlock','tram','cargo','pair','slideAll','tram','cargo','mixed3','tram','cargo','pair','tram','cargo']},
  {id:'spires',name:'Glass Spires',blurb:'Leap open gaps between bright tower roofs.',theme:3,speed:[.38,.66],tokensGoal:160,
    challenge:{stat:'gapsCleared',value:8,label:'Clear 8 rooftop gaps'},seed:404,
    sequence:['single','gapAll','pair','gapAll','mixed3','single','gapAll','slalom','pair','gapAll','gateBlock','cargo','gapAll','mixed3','pair','gapAll','doubleJump','slideAll','gapAll','mixed3','pair','gapAll','slalom','gapAll','mixed3','pair']},
  {id:'storm',name:'Storm Signal Heights',blurb:'Night antennas, rain and every hazard at speed.',theme:4,speed:[.52,.88],tokensGoal:190,
    challenge:{stat:'shieldBreaks',value:0,max:true,label:'Finish without breaking a shield'},seed:505,
    sequence:['pair','mixed3','gapAll','tram','slalom','cargo','gateBlock','gapAll','mixed3','tram','doubleJump','pair','cargo','gapAll','slideAll','mixed3','tram','slalom','gapAll','cargo','pair','mixed3','gateBlock','tram','gapAll','mixed3','pair','slalom']}
];
// Tutorial rows are fully authored: each teaches one action, then mixes them.
const TUTORIAL=[
  {gap:30,lanes:['block','free','block'],prompt:'run'},
  {gap:30,lanes:['free','block','block'],prompt:'left'},
  {gap:30,lanes:['block','block','free'],prompt:'right'},
  {gap:30,lanes:['hurdle','hurdle','hurdle'],prompt:'jump'},
  {gap:30,lanes:['gate','gate','gate'],prompt:'slide'},
  {gap:30,lanes:['hurdle','block','gate'],prompt:'choose'},
  {gap:30,power:'magnet',lanes:['free','free','free'],prompt:'magnet'},
  {gap:30,lanes:['block','hurdle','block'],prompt:'jump'},
  {gap:32,cells:true,lanes:['free','free','free'],prompt:'cells'},
  {gap:30,lanes:['block','gate','block'],prompt:'slide'},
  {gap:30,lanes:['hurdle','block','hurdle'],prompt:'gadget'},
  {gap:44,lanes:['gate','block','hurdle'],prompt:'choose'},
  {gap:30,power:'shield',lanes:['free','free','free'],prompt:'shield'},
  {gap:30,lanes:['block','free','block'],prompt:'finish'}
];
const ENDLESS_TIERS=[['single','pair','jumpAll','slideAll'],['mixed3','slalom','gateBlock','cargo'],['gapAll','tram','doubleJump'],['mixed3','tram','gapAll','cargo','slalom']];
const OUTFITS=[
  {id:'courier',name:'Courier',unlock:'Ready from the start',jacket:'#e2583e',pants:'#283a55',shoes:'#f2efe6',accent:'#ffd166',hair:'#2b1d16',skin:'#c98d62',gear:'satchel'},
  {id:'lantern',name:'Lantern Runner',unlock:'Finish Lantern Market',jacket:'#f2a541',pants:'#5b2a4b',shoes:'#ffe1a8',accent:'#ff6f59',hair:'#16121a',skin:'#8d5a3b',gear:'scarf'},
  {id:'dockhand',name:'Dockhand',unlock:'Finish Cargo Pier',jacket:'#2f8f83',pants:'#30343f',shoes:'#e9c46a',accent:'#f4a261',hair:'#6b4226',skin:'#e0ac82',gear:'cap'},
  {id:'spire',name:'Spire Scout',unlock:'Finish Glass Spires',jacket:'#4d8fd6',pants:'#e6eef7',shoes:'#1d2b44',accent:'#9ff3ff',hair:'#f2d16b',skin:'#f1c7a1',gear:'visor'},
  {id:'storm',name:'Storm Signal',unlock:'Earn 3 stars in Storm Signal Heights',jacket:'#2b2d42',pants:'#14151f',shoes:'#ef476f',accent:'#06d6a0',hair:'#d9d9e3',skin:'#a86b4c',gear:'antenna'},
  {id:'comet',name:'Comet',unlock:'Run 2,000 m in Endless on Normal or Hard',jacket:'#f4f1ff',pants:'#3a0ca3',shoes:'#f72585',accent:'#4cc9f0',hair:'#f72585',skin:'#d6a47c',gear:'scarf'},
  {id:'brass',name:'Brass Collector',unlock:'Collect 1,500 tokens in total',jacket:'#b5832b',pants:'#3d2b1f',shoes:'#f0e3c0',accent:'#fff3b0',hair:'#3d2b1f',skin:'#c48a5e',gear:'satchel'}
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
const laneX=lane=>(lane-1)*LANE_W;
const laneOf=x=>clamp(Math.round(x/LANE_W)+1,0,2);
function rngNext(state){let t=(state.s=(state.s+0x6D2B79F5)>>>0);t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
const pick=(g,list)=>list[Math.floor(rngNext(g.rng)*list.length)%list.length];
const shuffle=(g,list)=>{const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rngNext(g.rng)*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}return a;};
function jumpProfile(springs){const v=springs?SPRING_V:JUMP_V,g=springs?SPRING_G:GRAVITY;return{v,g,air:2*v/g,apex:v*v/(2*g)};}
function speedFraction(run,z){
  if(run.mode==='endless')return 1-Math.exp(-Math.max(0,z)/DIFFICULTY[run.difficulty].ramp);
  const d=DISTRICTS[run.district],f=clamp(z/Math.max(1,run.track.speedLength),0,1);return d.speed[0]+(d.speed[1]-d.speed[0])*f;
}
function speedAt(run,z){const d=DIFFICULTY[run.difficulty];return d.v0+(d.vmax-d.v0)*speedFraction(run,z);}
// Minimum spacing between decision rows: the guaranteed reaction space,
// which also leaves a whole jump arc before another action is required.
// Endless runs trim the reaction window by up to 15% over the first 3 km.
function minSpacing(run,z){const v=speedAt(run,z),d=DIFFICULTY[run.difficulty],react=d.reaction*(run.mode==='endless'?1-.15*clamp(z/3000,0,1):1);return Math.max(react*v,jumpProfile(false).air*v+3,12);}

// ---- Fairness validator ---------------------------------------------------
// A row is a decision line. req per lane: free, jump, slide or wall. Walls are
// lane intervals that cannot be entered or left from the ground (container
// sides, a freight tram's possible sweep). Reachability uses that stretch's
// fastest speed and a lane-change reaction margin; roof routes are optional
// extras and are never required.
function laneMoves(run,dz,z){const t=dz/Math.max(1,speedAt(run,z));return clamp(Math.floor((t-.3)/(LANE_TIME+.08)),0,2);}
// A lane change may only begin after every wall on the lanes it crosses has
// ended, and must still fit before the row (time-aware, per move).
function advanceReach(run,reach,prevZ,row,walls){
  const out=[false,false,false],from=prevZ===null?row.z-40:prevZ,end=row.z-.5;
  for(let s=0;s<3;s++){if(!reach[s])continue;for(let t=0;t<3;t++){
    if(row.req[t]==='wall')continue;
    if(t===s){out[t]=true;continue;}
    const lo=Math.min(s,t),hi=Math.max(s,t);let start=from;
    for(const w of walls)if(w.lane>=lo&&w.lane<=hi&&w.z1>from&&w.z0<end)start=Math.max(start,w.z1);
    if(start>=end||walls.some(w=>w.lane>=lo&&w.lane<=hi&&w.z0<end&&w.z1>start))continue;
    const k=prevZ===null&&start===from?2:laneMoves(run,row.z-start,row.z);
    if(Math.abs(t-s)<=k)out[t]=true;
  }}
  return out;
}
function validateRows(run,rows,walls,start=[true,true,true],{skipSpacing=false}={}){
  let reach=start.slice(),prev=null;const problems=[];
  for(const row of rows.slice().sort((a,b)=>a.z-b.z)){
    if(!skipSpacing&&prev!==null&&row.z-prev<minSpacing(run,row.z)-1e-6)problems.push({z:row.z,problem:'spacing'});
    reach=advanceReach(run,reach,prev,row,walls);if(!reach.some(Boolean)){problems.push({z:row.z,problem:'unreachable'});return{ok:false,problems,reach};}
    prev=row.z;
  }
  return{ok:problems.length===0,problems,reach};
}

// ---- Generator ------------------------------------------------------------
function isTutorial(run){return run.mode==='district'&&!!DISTRICTS[run.district].tutorial;}
function makeTrack(run,seed){
  let speedLength=1;
  if(run.mode==='district'){const d=DISTRICTS[run.district];speedLength=d.tutorial?TUTORIAL.reduce((s,r)=>s+r.gap,0)+60:Math.round(d.sequence.length*58+140);}
  return{seed,length:0,speedLength,rng:{s:seed>>>0},genZ:40,lastRowZ:null,reach:[true,true,true],patternIndex:0,nextPowerZ:isTutorial(run)?1e9:150,nextCellZ:90,nextId:1,
    obstacles:[],pickups:[],gaps:[],rows:[],walls:[],prompts:[],checkpoints:[0],tutorialIndex:0,complete:false};
}
function emptyCand(){return{rows:[],walls:[],obstacles:[],pickups:[],gaps:[],prompts:[]};}
function commit(g,c){
  for(const row of c.rows)g.rows.push(row);for(const w of c.walls)g.walls.push(w);
  for(const o of c.obstacles){o.id=g.nextId++;g.obstacles.push(o);}
  for(const p of c.pickups){p.id=g.nextId++;g.pickups.push(p);}
  for(const q of c.gaps)g.gaps.push(q);for(const q of c.prompts)g.prompts.push(q);
}
function addCandidate(run,c){
  const g=run.track,rows=c.rows.slice().sort((a,b)=>a.z-b.z),walls=g.walls.concat(c.walls);
  let reach=g.reach.slice(),prev=g.lastRowZ;
  for(const row of rows){if(prev!==null&&row.z-prev<minSpacing(run,row.z)-1e-6)return false;reach=advanceReach(run,reach,prev,row,walls);if(!reach.some(Boolean))return false;prev=row.z;}
  g.reach=reach;g.lastRowZ=prev;commit(g,c);return true;
}
function obstacle(kind,lane,z,extra={}){const k=KIND[kind]||{};return Object.assign({id:0,kind,lane,z,len:k.len||1,top:k.top||0,under:k.under||0,vz:0,ramp:0,trigger:0,active:false,broken:false,grazed:false},extra);}
function token(x,y,z,kind='token'){return{id:0,kind,x,y,z,taken:false,pull:false};}
function tokenLine(c,lane,z0,z1,y=.95,step=3){for(let z=z0;z<=z1+1e-6;z+=step)c.pickups.push(token(laneX(lane),y,z));}
function tokenArc(c,lane,zc,run,springs){const j=jumpProfile(springs),v=speedAt(run,zc),half=j.air*v*.5;for(let i=-3;i<=3;i++){const f=i/3;c.pickups.push(token(laneX(lane),.95+j.apex*(1-f*f)*.92,zc+f*half*.85));}}
function reqFor(kind){return kind==='hurdle'?'jump':kind==='gate'?'slide':kind==='free'?'free':'wall';}
function rowCand(z,lanes){const c=emptyCand();c.rows.push({z,req:lanes.map(reqFor)});lanes.forEach((k,l)=>{if(k!=='free')c.obstacles.push(obstacle(k,l,z));});return c;}
function merge(a,b){for(const k of Object.keys(a))a[k].push(...b[k]);return a;}
const PATTERNS={
  single(run,g,z){const lane=Math.floor(rngNext(g.rng)*3),kind=pick(g,['hurdle','gate','block']),lanes=['free','free','free'];lanes[lane]=kind;const c=rowCand(z,lanes),free=(lane+1+Math.floor(rngNext(g.rng)*2))%3;tokenLine(c,free,z-14,z+7);if(kind==='hurdle')tokenArc(c,lane,z+.2,run,false);return{c,len:0};},
  pair(run,g,z){const open=Math.floor(rngNext(g.rng)*3),lanes=[0,1,2].map(l=>l===open?pick(g,['free','free','hurdle','gate']):pick(g,['block','block','hurdle','gate']));if(!lanes.includes('block'))lanes[(open+1)%3]='block';const c=rowCand(z,lanes);tokenLine(c,open,z-12,z+9);return{c,len:0};},
  mixed3(run,g,z){const lanes=shuffle(g,['hurdle','gate','block']),c=rowCand(z,lanes);tokenArc(c,lanes.indexOf('hurdle'),z+.2,run,false);return{c,len:0};},
  jumpAll(run,g,z){const lanes=['hurdle','hurdle','hurdle'];if(rngNext(g.rng)<.4)lanes[Math.floor(rngNext(g.rng)*3)]='block';const c=rowCand(z,lanes);tokenArc(c,lanes.indexOf('hurdle'),z+.2,run,false);return{c,len:0};},
  slideAll(run,g,z){const lanes=['gate','gate','gate'];if(rngNext(g.rng)<.4)lanes[Math.floor(rngNext(g.rng)*3)]='block';const c=rowCand(z,lanes);tokenLine(c,lanes.indexOf('gate'),z-6,z+6,.45,2);return{c,len:0};},
  gateBlock(run,g,z){const b=Math.floor(rngNext(g.rng)*3),c=rowCand(z,[0,1,2].map(l=>l===b?'block':'gate'));tokenLine(c,(b+1)%3,z-4,z+4,.45,2);return{c,len:0};},
  doubleJump(run,g,z){const lane=Math.floor(rngNext(g.rng)*3),z2=z+minSpacing(run,z+40)+1,c=merge(rowCand(z,['hurdle','hurdle','hurdle']),rowCand(z2,['hurdle','hurdle','hurdle']));tokenArc(c,lane,z+.2,run,false);tokenArc(c,lane,z2+.2,run,false);return{c,len:z2-z};},
  slalom(run,g,z){const c=emptyCand();let lane=Math.floor(rngNext(g.rng)*3),zz=z;for(let i=0;i<3;i++){const lanes=['free','free','free'];lanes[lane]='block';if(rngNext(g.rng)<.5)lanes[(lane+1+(rngNext(g.rng)<.5?0:1))%3]='block';merge(c,rowCand(zz,lanes));const free=lanes.indexOf('free');tokenLine(c,free,zz-6,zz+3);lane=free;if(i<2)zz+=minSpacing(run,zz+40)+1;}return{c,len:zz-z};},
  cargo(run,g,z){
    // One or two long containers. The ramped one is an optional roof route
    // with tokens; the validator only relies on ground lanes.
    const c=emptyCand(),len=12+Math.floor(rngNext(g.rng)*9),lanes=shuffle(g,[0,1,2]),count=rngNext(g.rng)<.55?2:1,req=['free','free','free'];
    for(let i=0;i<count;i++){const l=lanes[i],ramp=i===0?5:0;c.obstacles.push(obstacle('crate',l,z,{len,top:KIND.crate.top,ramp}));req[l]=ramp?'free':'wall';c.walls.push({lane:l,z0:z+.01,z1:z+len});
      if(ramp){tokenLine(c,l,z+ramp+1,z+len-1,KIND.crate.top+.95,2.5);if(rngNext(g.rng)<.7)c.pickups.push(token(laneX(l),KIND.crate.top+1.1,z+len-1.5,'cell'));}}
    const open=lanes[count];if(rngNext(g.rng)<.5){c.obstacles.push(obstacle('hurdle',open,z));req[open]='jump';}else tokenLine(c,open,z-6,z+len,.95,3);
    c.rows.push({z,req});return{c,len};
  },
  tram(run,g,z){
    // A freight tram waits, then rolls toward the runner once in sight. Its
    // whole possible sweep is walled so the generator never relies on it.
    const c=emptyCand(),lane=Math.floor(rngNext(g.rng)*3),u=6,trigger=85,vSlow=speedAt(run,z)*.6,zStart=z+trigger*u/(vSlow+u),len=KIND.tram.len;
    c.obstacles.push(obstacle('tram',lane,zStart,{len,top:KIND.tram.top,vz:-u,trigger}));c.walls.push({lane,z0:z-2,z1:zStart+len});
    const req=['free','free','free'];req[lane]='wall';const other=(lane+1+(rngNext(g.rng)<.5?0:1))%3,k=pick(g,['hurdle','gate','free']);if(k!=='free'){c.obstacles.push(obstacle(k,other,z));req[other]=reqFor(k);}
    tokenLine(c,3-lane-other,z-10,z+10);if(rngNext(g.rng)<.5)c.pickups.push(token(laneX(other),1.0,z+6,'cell'));
    c.rows.push({z,req});return{c,len:zStart+len-z};
  },
  gapAll(run,g,z){
    // A rooftop break across the lanes. Its width leaves a jump margin at a
    // reduced local speed; an optional plank keeps one ground lane open.
    const v=speedAt(run,z)*.85,air=jumpProfile(false).air*v,len=clamp(air-3.6,2.4,4.6),plank=rngNext(g.rng)<.35?Math.floor(rngNext(g.rng)*3):-1;
    const lanes=[0,1,2].map(l=>l!==plank),c=emptyCand();c.gaps.push({z,len,lanes,plank,cleared:false});c.rows.push({z,req:lanes.map(x=>x?'jump':'free')});
    // Open gap lanes cannot be entered from the ground until the far roof.
    lanes.forEach((open,l)=>{if(open)c.walls.push({lane:l,z0:z+.01,z1:z+len});});
    tokenArc(c,plank>=0?(plank+1)%3:Math.floor(rngNext(g.rng)*3),z+len*.5,run,false);if(plank>=0)tokenLine(c,plank,z-2,z+len+2,.95,1.5);return{c,len};
  }
};
function placePower(run,g,z,kind){const lanes=[0,1,2].filter(l=>g.reach[l]),lane=lanes.length?lanes[Math.floor(rngNext(g.rng)*lanes.length)]:1;const p=token(laneX(lane),1.1,z,kind);p.id=g.nextId++;g.pickups.push(p);}
function generateTutorial(run,g){
  while(g.tutorialIndex<TUTORIAL.length){
    const t=TUTORIAL[g.tutorialIndex],z=g.genZ+t.gap,c=rowCand(z,t.lanes);
    c.prompts.push({z,text:t.prompt,startZ:g.genZ+3});g.checkpoints.push(g.genZ+2);
    if(t.power)c.pickups.push(token(laneX(1),1.1,z-12,t.power));
    if(t.cells)for(let i=0;i<3;i++)c.pickups.push(token(laneX(1),1.1,z-16+i*4,'cell'));
    const open=t.lanes.indexOf('free');if(open>=0)tokenLine(c,open,z-14,z+6);const h=t.lanes.indexOf('hurdle');if(h>=0)tokenArc(c,h,z+.2,run,false);
    // Tutorial spacing is authored; it is checked for reachability only.
    commit(g,c);g.lastRowZ=z;g.genZ=z;g.tutorialIndex++;
  }
  g.length=g.genZ+50;g.complete=true;
}
function generateUntil(run,limit){
  const g=run.track,d=DIFFICULTY[run.difficulty];if(g.complete)return;
  if(isTutorial(run)){generateTutorial(run,g);return;}
  let guard=0;
  while((run.mode==='district'||g.genZ<limit)&&guard++<400){
    if(run.mode==='district'&&g.patternIndex>=DISTRICTS[run.district].sequence.length){g.length=Math.ceil(Math.max(g.genZ,g.lastRowZ||0)+70);g.complete=true;break;}
    const tier=run.mode==='endless'?Math.min(ENDLESS_TIERS.length-1,Math.floor(g.genZ/450)):0;
    // Breathing room between patterns shrinks as an endless run continues.
    const breathe=run.mode==='endless'?Math.max(.15,1.1-g.genZ/2600)/d.density:.45/d.density;
    const base=g.lastRowZ===null?g.genZ+30:Math.max(g.genZ,g.lastRowZ)+minSpacing(run,g.genZ+60)+1;
    const z=base+breathe*speedAt(run,base)*.9*rngNext(g.rng);
    let names;
    if(run.mode==='district')names=[DISTRICTS[run.district].sequence[g.patternIndex]];
    else{const pool=[];for(let t=0;t<=tier;t++)pool.push(...ENDLESS_TIERS[t]);names=[pick(g,pool)];}
    names.push('single','single');let placed=false;
    for(let attempt=0;attempt<names.length*3&&!placed;attempt++){
      const name=names[Math.min(names.length-1,Math.floor(attempt/3))],r=PATTERNS[name](run,g,z);
      if(addCandidate(run,r.c)){g.genZ=z+r.len+2;placed=true;}
    }
    if(!placed)g.genZ=z+10;
    g.patternIndex++;
    if(g.genZ>=g.nextPowerZ){placePower(run,g,g.genZ+6,pick(g,['magnet','shield','springs']));g.nextPowerZ=g.genZ+d.powerEvery*(.8+.4*rngNext(g.rng));}
    if(g.genZ>=g.nextCellZ){const c=token(laneX(Math.floor(rngNext(g.rng)*3)),1.1,g.genZ+3,'cell');c.id=g.nextId++;g.pickups.push(c);g.nextCellZ=g.genZ+110+90*rngNext(g.rng);}
  }
}

// ---- Run lifecycle --------------------------------------------------------
function createRun({mode='district',district=0,difficulty='normal',seed=1,outfit='courier'}={}){
  if(!DIFFICULTY[difficulty])difficulty='normal';district=clamp(district|0,0,DISTRICTS.length-1);mode=mode==='endless'?'endless':'district';
  const s=(mode==='district'?DISTRICTS[district].seed*7919+Object.keys(DIFFICULTY).indexOf(difficulty):Number(seed)||1)>>>0;
  const run={rulesVersion:RULES_VERSION,mode,district,difficulty,seed:s,outfit:String(outfit).slice(0,32),phase:'playing',time:0,acc:0,
    player:{lane:1,fromLane:1,x:0,fromX:0,laneT:1,y:0,vy:0,z:0,grounded:true,jumpG:GRAVITY,coyote:0,jumpBuffer:0,slide:0,slideBuffer:0,fastFall:false,glide:0,grace:0,slow:0,lastBump:-99,bumpId:0,stumble:0,airTime:0,landT:9,crashT:0},
    power:{magnet:0,shield:0,springs:0},gadget:0,
    stats:{tokens:0,cells:0,distance:0,score:0,bumps:0,shieldBreaks:0,gadgetUses:0,roofDistance:0,gapsCleared:0,nearMisses:0,jumps:0,slides:0,laneChanges:0,powerups:0,respawns:0},
    queue:[],events:[],result:null,track:null};
  run.track=makeTrack(run,s);generateUntil(run,240);
  // Districts are finite: a second pass ramps speed across the real length.
  if(mode==='district'&&!DISTRICTS[district].tutorial){const length=run.track.length;run.track=makeTrack(run,s);run.track.speedLength=length;generateUntil(run,240);}
  return run;
}
function event(run,type,data={}){run.events.push(Object.assign({type,t:run.time,z:run.player.z,x:run.player.x},data));if(run.events.length>48)run.events.splice(0,run.events.length-48);}
const ACTIONS=['left','right','jump','slide','gadget'];
function queueAction(run,action){if(!run||run.phase!=='playing'||!ACTIONS.includes(action))return false;if(run.queue.length<6)run.queue.push(action);return true;}
function currentSpeed(run){const p=run.player;let v=speedAt(run,p.z);if(p.slow>0)v*=.8;return Math.min(v,MAX_SUPPORTED_SPEED);}
function obstacleBox(o){return{x0:laneX(o.lane)-OBSTACLE_HALF_W,x1:laneX(o.lane)+OBSTACLE_HALF_W,z0:o.z,z1:o.z+o.len};}
function surfaceAt(o,z){if(!o.ramp)return o.top;return o.top*clamp((z-o.z)/o.ramp,0,1);}
function overGap(run,x,z){const lane=laneOf(x);for(const q of run.track.gaps)if(q.lanes[lane]&&z>q.z+.25&&z<q.z+q.len-.25)return q;return null;}
function supportHeight(run,p,yPrev){
  let ground=overGap(run,p.x,p.z)&&p.grace<=0?-Infinity:0;
  for(const o of run.track.obstacles){if(o.broken||o.kind==='gate')continue;const b=obstacleBox(o);if(p.x+PLAYER.halfW<=b.x0||p.x-PLAYER.halfW>=b.x1||p.z+PLAYER.halfD<=b.z0||p.z-PLAYER.halfD>=b.z1)continue;
    const s=surfaceAt(o,clamp(p.z+PLAYER.halfD,b.z0,b.z1));if(yPrev>=s-STEP_TOL&&s>ground)ground=s;}
  return ground;
}
function invulnerable(run){const p=run.player;return p.glide>0||p.grace>0;}
function startJump(run){const p=run.player,j=jumpProfile(run.power.springs>0);p.vy=j.v;p.jumpG=j.g;p.grounded=false;p.coyote=0;p.jumpBuffer=0;p.slide=0;p.fastFall=false;p.airTime=0;run.stats.jumps++;event(run,'jump',{spring:run.power.springs>0});}
function startSlide(run){const p=run.player;p.slide=SLIDE_TIME;p.slideBuffer=0;run.stats.slides++;event(run,'slide');}
function changeLane(run,dir){const p=run.player,target=p.lane+dir;if(target<0||target>2){event(run,'edge',{dir});return;}p.fromLane=p.lane;p.fromX=p.x;p.lane=target;p.laneT=0;run.stats.laneChanges++;event(run,'lane',{dir});}
function startGlide(run){
  const p=run.player,g=run.track;run.gadget=0;p.glide=GLIDE_TIME;p.slide=0;p.vy=0;p.grounded=false;p.fastFall=false;run.stats.gadgetUses++;event(run,'glide');
  const v=speedAt(run,p.z);for(let z=p.z+10;z<p.z+v*(GLIDE_TIME-.6);z+=3){const t=token(laneX(p.lane),GLIDE_Y+.9,z);t.id=g.nextId++;g.pickups.push(t);}
}
function consume(run){
  const p=run.player;
  while(run.queue.length){
    const a=run.queue.shift();
    if(a==='left')changeLane(run,-1);
    else if(a==='right')changeLane(run,1);
    else if(a==='jump'){if(p.glide>0)continue;if(p.grounded||p.coyote>0)startJump(run);else p.jumpBuffer=BUFFER;}
    else if(a==='slide'){if(p.glide>0)continue;if(p.grounded)startSlide(run);else{p.vy=Math.min(p.vy,FAST_FALL);p.fastFall=true;p.slideBuffer=.5;p.jumpBuffer=0;event(run,'dive');}}
    else if(a==='gadget'){if(run.gadget>=1-1e-9&&p.glide<=0)startGlide(run);else event(run,'gadget-empty');}
  }
}
function label(kind){return{hurdle:'a hurdle',block:'a vent stack',gate:'a sign gate',crate:'a cargo container',tram:'a freight tram',gap:'a rooftop gap'}[kind]||kind;}
function score(run){const s=run.stats;return(Math.floor(run.player.z)+s.tokens*10+s.cells*50+s.nearMisses*25)*DIFFICULTY[run.difficulty].scoreMul;}
function crash(run,cause,obstacleId=null){
  const p=run.player;event(run,'crash',{cause,obstacle:obstacleId});
  if(isTutorial(run)){
    // Learn by doing: return to the checkpoint just before the missed row.
    const cp=run.track.checkpoints.filter(z=>z<p.z-1).pop()||0;run.stats.respawns++;
    Object.assign(p,{z:cp,y:0,vy:0,grounded:true,slide:0,glide:0,grace:.6,laneT:1,fromLane:1,lane:1,x:0,fromX:0,fastFall:false,slow:0,crashT:0,coyote:0,jumpBuffer:0,slideBuffer:0});
    for(const o of run.track.obstacles)if(o.z>cp)o.grazed=false;run.queue.length=0;event(run,'respawn',{cause});return;
  }
  run.phase='crashed';run.result={outcome:'crashed',cause,distance:Math.floor(p.z),tokens:run.stats.tokens,score:Math.floor(score(run))};
}
function hit(run,o,side){
  const p=run.player;
  if(invulnerable(run))return;
  if(run.power.shield>0){run.power.shield=0;o.broken=true;p.grace=.9;run.stats.shieldBreaks++;event(run,'shield-break',{kind:o.kind,obstacle:o.id});return;}
  if(side&&run.time-p.lastBump>BUMP_WINDOW){
    // The runner glances off and eases back; that obstacle is ignored while
    // the two still overlap so one bump can never become a front crash.
    p.lastBump=run.time;p.bumpId=o.id;p.slow=1;p.stumble=.6;run.stats.bumps++;const back=p.fromLane;p.fromX=p.x;p.fromLane=p.lane;p.lane=back;p.laneT=0;event(run,'bump',{kind:o.kind,obstacle:o.id});return;
  }
  crash(run,side?'a second side bump into '+label(o.kind):'ran into '+label(o.kind),o.id);
}
function substep(run,h,v){
  const p=run.player,g=run.track,prevZ=p.z,prevX=p.x,prevY=p.y;
  p.z+=v*h;
  for(const o of g.obstacles){if(o.kind!=='tram'||o.broken)continue;if(!o.active&&o.z-p.z<o.trigger){o.active=true;event(run,'tram',{obstacle:o.id});}if(o.active)o.z+=o.vz*h;}
  if(p.laneT<1){p.laneT=Math.min(1,p.laneT+h/LANE_TIME);p.x=p.fromX+(laneX(p.lane)-p.fromX)*smooth(p.laneT);}else p.x=laneX(p.lane);
  if(p.glide>0){p.y+=(GLIDE_Y-p.y)*Math.min(1,h*9);p.vy=0;p.glide=Math.max(0,p.glide-h);if(p.glide===0)p.grace=GRACE+.6;}
  else{p.vy-=(p.jumpG||GRAVITY)*h;p.y+=p.vy*h;}
  const ground=p.glide>0?-Infinity:supportHeight(run,p,prevY);
  if(p.glide<=0&&p.y<=ground){
    const wasAir=!p.grounded;p.y=ground;p.vy=0;p.grounded=true;p.fastFall=false;p.jumpG=GRAVITY;
    if(wasAir){p.landT=0;event(run,'land',{fall:Math.max(0,prevY-ground)});if(p.slideBuffer>0)startSlide(run);else if(p.jumpBuffer>0)startJump(run);}
  }else if(p.grounded&&p.y>ground+.02){p.grounded=false;p.coyote=COYOTE;}
  for(const q of g.gaps)if(!q.cleared&&p.z>q.z+q.len&&p.y>-.2){q.cleared=true;if(q.lanes[laneOf(p.x)])run.stats.gapsCleared++;}
  if(p.y<-.7){
    if(run.power.shield>0&&!invulnerable(run)){run.power.shield=0;run.stats.shieldBreaks++;p.grace=.9;p.y=0;p.vy=JUMP_V;p.grounded=false;event(run,'shield-break',{kind:'gap'});}
    else if(!invulnerable(run)){crash(run,'fell through '+label('gap'));return;}
    else p.y=0;
  }
  if(p.grounded&&p.y>1.2)run.stats.roofDistance+=p.z-prevZ;
  // Swept collision: substeps never exceed MAX_SUBSTEP and every collider is
  // deeper than that; each substep also tests the swept z interval.
  const height=p.slide>0?PLAYER.slide:PLAYER.stand;
  if(p.bumpId){const o=g.obstacles.find(q=>q.id===p.bumpId);if(!o||p.x+PLAYER.halfW<=laneX(o.lane)-OBSTACLE_HALF_W||p.x-PLAYER.halfW>=laneX(o.lane)+OBSTACLE_HALF_W||p.z-PLAYER.halfD>o.z+o.len)p.bumpId=0;}
  for(const o of g.obstacles){
    if(o.broken||o.id===p.bumpId||o.z>p.z+4||o.z+o.len<p.z-4)continue;
    const b=obstacleBox(o),xo=p.x+PLAYER.halfW>b.x0&&p.x-PLAYER.halfW<b.x1;if(!xo)continue;
    const zo=Math.min(prevZ,p.z)-PLAYER.halfD<b.z1-.04&&Math.max(prevZ,p.z)+PLAYER.halfD>b.z0+.04;if(!zo)continue;
    let blocked;
    if(o.kind==='gate')blocked=p.y+height>o.under+.05&&p.y<o.top;
    else blocked=Math.max(p.y,prevY)<surfaceAt(o,clamp(p.z+PLAYER.halfD,b.z0,b.z1))-STEP_TOL;
    if(!blocked)continue;
    const prevXo=prevX+PLAYER.halfW>b.x0&&prevX-PLAYER.halfW<b.x1,prevZo=prevZ+PLAYER.halfD>b.z0+.04&&prevZ-PLAYER.halfD<b.z1-.04,side=!prevXo&&prevZo;
    // Forgiveness: a lane change already well under way clears a front edge.
    if(!side&&p.laneT<1&&p.lane!==o.lane&&p.laneT>.32){if(!o.grazed){o.grazed=true;run.stats.nearMisses++;event(run,'near-miss',{obstacle:o.id});}continue;}
    const before=p.z;hit(run,o,side);if(run.phase!=='playing'||p.z!==before)return;
  }
  // Pickups; the magnet pulls tokens and cells from every lane ahead.
  for(const pu of g.pickups){
    if(pu.taken||pu.z<p.z-3||pu.z>p.z+18)continue;
    if(run.power.magnet>0&&(pu.kind==='token'||pu.kind==='cell')&&pu.z<p.z+16)pu.pull=true;
    if(pu.pull){const k=Math.min(1,h*14);pu.x+=(p.x-pu.x)*k;pu.y+=(p.y+1-pu.y)*k;pu.z+=(p.z+.4-pu.z)*k;}
    const cy=p.y+(p.slide>0?.5:.95);
    if(Math.abs(pu.x-p.x)<.95&&Math.abs(pu.z-p.z)<.9&&Math.abs(pu.y-cy)<1.25)collect(run,pu);
  }
}
function collect(run,pu){
  pu.taken=true;
  if(pu.kind==='token'){run.stats.tokens++;event(run,'token');}
  else if(pu.kind==='cell'){run.stats.cells++;run.gadget=Math.min(1,run.gadget+1/3+1e-9);event(run,'cell',{charge:run.gadget});}
  else if(POWER[pu.kind]){run.power[pu.kind]=POWER[pu.kind].time;run.stats.powerups++;event(run,'power',{kind:pu.kind});}
}
function prune(run){
  const g=run.track,p=run.player,behind=p.z-30;
  if(g.obstacles.length>60)g.obstacles=g.obstacles.filter(o=>o.z+o.len>behind);
  if(g.pickups.length>200)g.pickups=g.pickups.filter(q=>q.z>behind);
  if(g.rows.length>60)g.rows=g.rows.filter(r=>r.z>behind-120);
  if(g.walls.length>40)g.walls=g.walls.filter(w=>w.z1>behind-120);
  if(g.gaps.length>16)g.gaps=g.gaps.filter(q=>q.z+q.len>behind);
}
function tick(run,dt){
  const p=run.player;run.time+=dt;
  for(const k of Object.keys(run.power))if(run.power[k]>0){run.power[k]=Math.max(0,run.power[k]-dt);if(run.power[k]===0)event(run,'power-end',{kind:k});}
  p.coyote=Math.max(0,p.coyote-dt);p.jumpBuffer=Math.max(0,p.jumpBuffer-dt);p.slideBuffer=Math.max(0,p.slideBuffer-dt);p.slow=Math.max(0,p.slow-dt);p.stumble=Math.max(0,p.stumble-dt);p.landT=Math.min(99,p.landT+dt);
  if(p.grace>0&&p.glide<=0&&p.grounded)p.grace=Math.max(0,p.grace-dt);
  if(p.slide>0)p.slide=Math.max(0,p.slide-dt);
  if(!p.grounded)p.airTime=Math.min(99,p.airTime+dt);
  consume(run);
  const v=currentSpeed(run);let moving=v;
  for(const o of run.track.obstacles)if(o.active&&!o.broken)moving=Math.max(moving,v-o.vz);
  const n=Math.max(1,Math.ceil(moving*dt/MAX_SUBSTEP)),h=dt/n;
  for(let i=0;i<n&&run.phase==='playing';i++)substep(run,h,v);
  if(run.phase!=='playing')return;
  run.stats.distance=Math.floor(p.z);run.stats.score=Math.floor(score(run));
  if(run.mode==='district'&&run.track.complete&&p.z>=run.track.length){run.phase='finished';run.result={outcome:'finished',distance:Math.floor(p.z),tokens:run.stats.tokens,score:Math.floor(score(run))};event(run,'finish');return;}
  generateUntil(run,p.z+200);prune(run);
}
function advance(run,dt){
  if(!run||run.phase!=='playing')return 0;
  run.acc=Math.min(run.acc+Math.max(0,dt),.25);let steps=0;
  while(run.acc>=STEP&&run.phase==='playing'){run.acc-=STEP;tick(run,STEP);steps++;}
  return steps;
}
// Read-only view of what lies ahead, used by HUD prompts and test players.
function upcoming(run,range=80){const p=run.player,g=run.track;return{
  rows:g.rows.filter(r=>r.z>p.z-1&&r.z<p.z+range).map(r=>({z:r.z,req:r.req.slice()})),
  walls:g.walls.filter(w=>w.z1>p.z&&w.z0<p.z+range).map(w=>({lane:w.lane,z0:w.z0,z1:w.z1})),
  gaps:g.gaps.filter(q=>q.z+q.len>p.z&&q.z<p.z+range).map(q=>({z:q.z,len:q.len,lanes:q.lanes.slice()})),
  obstacles:g.obstacles.filter(o=>!o.broken&&o.z+o.len>p.z-1&&o.z<p.z+range).map(o=>({id:o.id,kind:o.kind,lane:o.lane,z:o.z,len:o.len,top:o.top,ramp:o.ramp,active:o.active,vz:o.vz})),
  pickups:g.pickups.filter(q=>!q.taken&&q.z>p.z&&q.z<p.z+range&&q.kind!=='token').map(q=>({kind:q.kind,lane:laneOf(q.x),z:q.z,y:q.y})),
  prompts:g.prompts.filter(q=>q.z>p.z-2&&q.startZ<=p.z+2).map(q=>({...q}))};}

// ---- Snapshots --------------------------------------------------------------
const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
const bool=v=>typeof v==='boolean';
function validRun(r){
  try{
    if(!r||typeof r!=='object'||Array.isArray(r)||r.rulesVersion!==RULES_VERSION||!['district','endless'].includes(r.mode)||!Number.isInteger(r.district)||r.district<0||r.district>=DISTRICTS.length||!Object.prototype.hasOwnProperty.call(DIFFICULTY,r.difficulty)||!['playing','crashed','finished'].includes(r.phase))return false;
    if(!num(r.seed,0,4294967295)||!num(r.time,0,1e6)||!num(r.acc,0,1)||typeof r.outfit!=='string'||r.outfit.length>32)return false;
    const p=r.player;if(!p||!Number.isInteger(p.lane)||!num(p.lane,0,2)||!Number.isInteger(p.fromLane)||!num(p.fromLane,0,2)||!num(p.x,-4,4)||!num(p.fromX,-4,4)||!num(p.laneT,0,1)||!num(p.y,-5,20)||!num(p.vy,-100,100)||!num(p.z,-1,1e7)||!bool(p.grounded)||!bool(p.fastFall))return false;
    for(const k of ['coyote','jumpBuffer','slide','slideBuffer','glide','grace','slow','stumble','airTime','landT','crashT'])if(!num(p[k],0,1e6))return false;
    if(!(p.jumpG===GRAVITY||p.jumpG===SPRING_G)||!num(p.lastBump,-100,1e6)||!Number.isInteger(p.bumpId)||!num(p.bumpId,0,1e9))return false;
    if(!r.power||Object.keys(POWER).some(k=>!num(r.power[k],0,60))||!num(r.gadget,0,1))return false;
    if(!r.stats||typeof r.stats!=='object'||Object.keys(r.stats).length>30||Object.values(r.stats).some(v=>!num(v,0,1e9)))return false;
    if(!Array.isArray(r.queue)||r.queue.length>6||r.queue.some(a=>!ACTIONS.includes(a))||!Array.isArray(r.events))return false;
    const g=r.track;if(!g||!num(g.seed,0,4294967295)||!num(g.length,0,1e7)||!num(g.speedLength,1,1e7)||!g.rng||!num(g.rng.s,0,4294967295)||!num(g.genZ,0,1e7)||!(g.lastRowZ===null||num(g.lastRowZ,0,1e7))||!Array.isArray(g.reach)||g.reach.length!==3||!g.reach.every(bool)||!bool(g.complete))return false;
    if(!num(g.patternIndex,0,1e6)||!num(g.nextPowerZ,0,1e10)||!num(g.nextCellZ,0,1e10)||!num(g.nextId,1,1e9)||!num(g.tutorialIndex,0,100))return false;
    for(const [k,max]of [['obstacles',600],['pickups',3000],['gaps',200],['rows',600],['walls',400],['prompts',200],['checkpoints',400]])if(!Array.isArray(g[k])||g[k].length>max)return false;
    if(!g.obstacles.every(o=>o&&Object.prototype.hasOwnProperty.call(KIND,o.kind)&&Number.isInteger(o.lane)&&o.lane>=0&&o.lane<3&&num(o.z,-1e4,1e7)&&num(o.len,.1,40)&&num(o.top,0,6)&&num(o.under,0,6)&&num(o.vz,-20,0)&&num(o.ramp,0,10)&&num(o.trigger,0,500)&&bool(o.active)&&bool(o.broken)&&bool(o.grazed)))return false;
    if(!g.pickups.every(q=>q&&['token','cell','magnet','shield','springs'].includes(q.kind)&&num(q.x,-6,6)&&num(q.y,-2,12)&&num(q.z,-1e4,1e7)&&bool(q.taken)&&bool(q.pull)))return false;
    if(!g.gaps.every(q=>q&&num(q.z,0,1e7)&&num(q.len,.5,10)&&Array.isArray(q.lanes)&&q.lanes.length===3&&q.lanes.every(bool)&&bool(q.cleared)))return false;
    if(!g.rows.every(q=>q&&num(q.z,0,1e7)&&Array.isArray(q.req)&&q.req.length===3&&q.req.every(x=>['free','jump','slide','wall'].includes(x))))return false;
    if(!g.walls.every(w=>w&&Number.isInteger(w.lane)&&w.lane>=0&&w.lane<3&&num(w.z0,-1e4,1e7)&&num(w.z1,-1e4,1e7)))return false;
    if(!g.prompts.every(q=>q&&num(q.z,0,1e7)&&num(q.startZ,0,1e7)&&typeof q.text==='string'&&q.text.length<40)||!g.checkpoints.every(z=>num(z,0,1e7)))return false;
    if(r.phase!=='playing'&&!(r.result&&['crashed','finished'].includes(r.result.outcome)))return false;
    return true;
  }catch{return false;}
}
function snapshot(run){const copy=JSON.parse(JSON.stringify(run));copy.events=[];copy.queue=[];return copy;}
function restore(data){if(!validRun(data))return null;const run=JSON.parse(JSON.stringify(data));run.events=[];run.queue=[];return run;}
function restart(run){return createRun({mode:run.mode,district:run.district,difficulty:run.difficulty,seed:run.seed,outfit:run.outfit});}
// District stars: finish, token goal, district challenge.
function starsFor(run){
  if(run.mode!=='district')return[false,false,false];const d=DISTRICTS[run.district],done=run.phase==='finished',c=d.challenge,v=run.stats[c.stat];
  return[done,done&&run.stats.tokens>=d.tokensGoal,c.max?done&&v<=c.value:v>=c.value];
}
return{RULES_VERSION,STEP,LANE_W,LANE_TIME,PLAYER,KIND,POWER,DIFFICULTY,DISTRICTS,TUTORIAL,OUTFITS,GLIDE_TIME,GLIDE_Y,MAX_SUPPORTED_SPEED,JUMP_V,SPRING_V,SPRING_G,GRAVITY,
  laneX,laneOf,speedAt,minSpacing,jumpProfile,createRun,queueAction,advance,tick,upcoming,validateRows,generateUntil,snapshot,restore,validRun,restart,starsFor,score,currentSpeed,surfaceAt,label,isTutorial};
});
