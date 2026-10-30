(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RivetRumbleEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 3, STEP = 1 / 30, WIDTH = 32, HEIGHT = 22, MAX_EFFECTS = 96, TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const copy = value => JSON.parse(JSON.stringify(value));
  const between = (a, b, t) => a + (b - a) * t;
  function rng(state) { let x = state.rng >>> 0 || 0x9e3779b9; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state.rng = x >>> 0; return state.rng / 4294967296; }

  const fighters = [
    { id:'spark', name:'Sparkpin', role:'precise burst', hp:118, speed:6.2, damage:16, range:10.4, ammo:4, reload:1.05, cooldown:.23, projectile:18, color:'#55d9ff', trim:'#e8fbff', special:'Pinpoint pulse', specialKind:'pierce', blurb:'Tap four accurate bolts; charge a piercing pulse.' },
    { id:'anvil', name:'Anviljaw', role:'spread bruiser', hp:164, speed:4.55, damage:12, range:6.6, ammo:3, reload:1.28, cooldown:.64, projectile:15, spread:.28, pellets:4, color:'#ff9c4e', trim:'#fff0bd', special:'Magnet slam', specialKind:'slam', blurb:'Close range scatter bursts; the special pushes nearby rivals.' },
    { id:'mortar', name:'Kettlecap', role:'lobber', hp:132, speed:4.8, damage:24, range:11.5, ammo:3, reload:1.36, cooldown:.72, projectile:12, splash:2.15, color:'#b290ff', trim:'#f3eaff', special:'Arc furnace', specialKind:'blast', blurb:'Arcing splash shots reach around cover; special blooms on a target point.' },
    { id:'vector', name:'Vektor', role:'mobile skirmisher', hp:108, speed:7.2, damage:13, range:8.2, ammo:5, reload:.92, cooldown:.18, projectile:20, color:'#62e7ab', trim:'#efffd9', special:'Overdrive dash', specialKind:'dash', blurb:'Fast twin bolts and a short aimed dash that damages on contact.' },
    { id:'lumen', name:'Lumenlift', role:'support / field control', hp:124, speed:5.4, damage:11, range:8.8, ammo:4, reload:1.05, cooldown:.34, projectile:17, color:'#ffd25f', trim:'#fff8d6', special:'Repair field', specialKind:'field', blurb:'Steady support shots; special repairs allies and stings intruders.' },
    { id:'rail', name:'Girdereye', role:'deliberate ranged hitter', hp:114, speed:4.9, damage:31, range:13.8, ammo:2, reload:1.48, cooldown:.9, projectile:24, color:'#ff6d8f', trim:'#ffe9ed', special:'Rivet line', specialKind:'line', blurb:'Heavy long bolts reward a calm aim; special pierces a whole lane.' },
    {id:'knuckle',name:'Pistonpop',role:'melee / jumping tank',hp:178,speed:5.8,damage:32,range:2.9,ammo:3,reload:1,cooldown:.58,projectile:18,attackKind:'melee',color:'#ef7052',trim:'#fff1ba',special:'Comet landing',specialKind:'leap',blurb:'Aim a wide punch at close range. Special leaps over walls and slams the landing.'},
    {id:'echo',name:'Bankcoil',role:'bank-shot controller',hp:110,speed:5.8,damage:14,range:12.5,ammo:4,reload:1.1,cooldown:.32,projectile:19,bounce:2,color:'#53b9e8',trim:'#eef8ff',special:'Prism volley',specialKind:'ricochet',blurb:'Bolts rebound twice from walls. Angle your shots to control tucked-away lanes.'},
    {id:'shroud',name:'Mothbyte',role:'stealth / close assassin',hp:104,speed:7,damage:12,range:6.8,ammo:3,reload:1.18,cooldown:.52,projectile:21,pellets:3,spread:.15,color:'#9b85dd',trim:'#eadbff',special:'Violet veil',specialKind:'smoke',blurb:'A fan of three blades. Special hides your team in smoke; attacking reveals you.'},
    {id:'briar',name:'Sprigsmith',role:'thrower / area denial',hp:128,speed:5.1,damage:19,range:10.5,ammo:3,reload:1.38,cooldown:.72,projectile:11,splash:1.6,attackKind:'garden',color:'#69ba62',trim:'#fff0a9',special:'Bramble bed',specialKind:'thorns',blurb:'Lob seed bombs over cover. Every impact leaves a short-lived damaging patch.'},
    {id:'tempo',name:'Bassbell',role:'wave healer',hp:138,speed:5.3,damage:17,range:8.5,ammo:3,reload:1.18,cooldown:.55,projectile:14,attackKind:'heal',color:'#ecbd49',trim:'#fff9dc',special:'Encore repair',specialKind:'heal',blurb:'Wide sound waves hurt rivals and repair teammates. Special heals your nearby crew.'},
    {id:'gyro',name:'Yo-Yolk',role:'returning-disc duelist',hp:122,speed:6.1,damage:19,range:9,ammo:3,reload:1.25,cooldown:.62,projectile:16,attackKind:'return',color:'#ef83ba',trim:'#fff0fa',special:'Wheelburst',specialKind:'orbit',blurb:'A disc can hit once out and once coming back. Special throws a ring of returning discs.'}
  ];
  const fighterMap = Object.fromEntries(fighters.map(f => [f.id, f]));

  const difficulties = {
    rookie:{name:'Rookie',think:.62,error:.32,lead:0,dodge:0,retreat:.2,gadgets:false,description:'Slower reactions, generous aim and simple positioning.'},
    standard:{name:'Standard',think:.30,error:.14,lead:.35,dodge:.3,retreat:.3,gadgets:true,description:'Balanced crews that collect supplies, recover and contest objectives.'},
    veteran:{name:'Veteran',think:.18,error:.065,lead:.45,dodge:.7,retreat:.25,gadgets:true,description:'Predictive aim, projectile dodges and active gadget use.'},
    elite:{name:'Elite',think:.11,error:.025,lead:.55,dodge:1,retreat:.20,gadgets:true,description:'Fast tactical decisions with the same health, ammo and damage rules.'}
  };
  const gadgets = {
    spark:{name:'Overclock coil',cooldown:12,description:'Refill your ammo and move 25% faster for 3 seconds.'},
    anvil:{name:'Kinetic shell',cooldown:14,description:'Absorb 45% of incoming damage for 4 seconds.'},
    mortar:{name:'Seeker pod',cooldown:15,description:'Deploy a 5-second sentry that shoots visible rivals.'},
    vector:{name:'Phase hop',cooldown:10,description:'Hop along your aim without crossing walls, then gain a short shield.'},
    lumen:{name:'Repair beacon',cooldown:14,description:'Place a 4-second team repair field.'},
    rail:{name:'Trip mine',cooldown:12,description:'Place a proximity mine. It arms after half a second.'},
    knuckle:{name:'Emergency piston',cooldown:14,description:'Recover 30% maximum health and gain a 2-second shield.'},
    echo:{name:'Rapid bearings',cooldown:12,description:'Refill ammo and gain a brief speed boost.'},
    shroud:{name:'Pocket fog',cooldown:14,description:'Drop a 3-second concealing cloud for your team.'},
    briar:{name:'Seed sentry',cooldown:16,description:'Deploy a 5-second sentry that only targets visible rivals.'},
    tempo:{name:'First-aid chime',cooldown:13,description:'Leave a team healing beacon for 4 seconds.'},
    gyro:{name:'Gyro guard',cooldown:13,description:'Gain a 3-second shield and a brief speed boost.'}
  };
  const arenaTemplates = [
    { id:'spillway', name:'Spillway Circuit', subtitle:'Water gates & pallet bridges', floor:'#24475a', accent:'#55d9ff', hazards:'rising coolant edges', obstacles:[[-.1,5.4,8.1,2.1], [24,14.5,8.1,2.1], [12.5,8.3,2.5,1.3,true], [17,12.2,2.4,1.3,true], [5.7,15,3.1,1.4], [23.4,5.6,3.1,1.4]] },
    { id:'kiln', name:'Kilnwalk Yard', subtitle:'Warm rails & collapsible stacks', floor:'#56372a', accent:'#ff9c4e', hazards:'glowing slag gutters', obstacles:[[5.2,5.4,4.2,1.5], [22.6,15.1,4.2,1.5], [13.3,4.5,1.8,4.0,true], [16.9,13.5,1.8,4.0,true], [8.5,12,2.2,2.2], [21.3,10,2.2,2.2]] },
    { id:'rotor', name:'Rotor Annex', subtitle:'Spinning lifts & tucked bays', floor:'#26334c', accent:'#b290ff', hazards:'slow conveyor rims', obstacles:[[4.8,10,2.7,5.2], [24.5,6.8,2.7,5.2], [10.1,7.5,4,1.5,true], [17.9,13,4,1.5,true], [9.7,4.7,2.4,1.4], [20,16,2.4,1.4]] },
    {id:'garden',name:'Verdant Depot',subtitle:'Thickets, pools & broken courtyards',floor:'#638756',accent:'#bde96d',hazards:'concealing overgrowth',obstacles:[[5,6,4,1.5],[23,14.5,4,1.5],[11,11,2,2,true],[19,9,2,2,true],[2,13,5,2,'water'],[25,7,5,2,'water']]},
    {id:'quarry',name:'Ember Quarry',subtitle:'Canyon lanes & shatterable outcrops',floor:'#c59b6b',accent:'#ffb965',hazards:'exposed long sight lines',obstacles:[[6,8,3,3],[23,11,3,3],[13,5.5,6,1.5,true],[13,15,6,1.5,true],[3,13,3,2],[26,7,3,2]]},
    {id:'harbor',name:'Neon Harbor',subtitle:'Canals, crossing lanes & lit docks',floor:'#6386a4',accent:'#8cfff0',hazards:'canals split attack routes',obstacles:[[4,10,6,1.4,'water'],[22,10.6,6,1.4,'water'],[11,6,2,2,true],[19,14,2,2,true],[5,4.5,4,1.4],[23,16.1,4,1.4]]}
  ];
  const brushLayouts = [
    [[9,5.8,3,2],[20,14.2,3,2],[3,10,3,3],[26,9,3,3]],
    [[3,8,4,2],[25,12,4,2],[11,16,3,2],[18,4,3,2]],
    [[7,6,3,2],[22,14,3,2],[6,15,3,2],[23,5,3,2]],
    [[9,5,5,2],[18,15,5,2],[3,9,4,3],[25,10,4,3],[13,9,2,2],[17,11,2,2]],
    [[9.5,4,3,3],[19.5,15,3,3],[3,6,2,3],[27,13,2,3]],
    [[10,15,4,2],[18,5,4,2],[2,5,3,3],[27,14,3,3]]
  ];
  const legacyArenas = arenaTemplates.map((a,index) => Object.assign({}, a, {
    pads:[{id:'launch-blue',x:9,z:18.2,toX:11,toZ:10},{id:'launch-red',x:23,z:3.8,toX:index===1?20:21,toZ:index===1?13.2:12}],
    brush:brushLayouts[index].map((b,i)=>({id:'brush'+i,x:b[0],z:b[1],w:b[2],h:b[3]})),
    obstacles:a.obstacles.map((o,i)=>({id:'wall'+i,x:o[0],z:o[1],w:o[2],h:o[3],kind:o[4]==='water'?'water':'cover',destructible:o[4]===true,hp:o[4]===true?96:1000000000}))
  }));
  // Keep released geometry immutable: a resumed battle must not acquire new walls.
  // These original paired cover clusters add flanks without sealing the central well.
  const coverExtensions = [
    [[12,2,2,1.2],[18,18.8,2,1.2],[3,8.8,2,1.4],[27,11.8,2,1.4],[13,14.8,3,1.2],[16,6,3,1.2],[9.5,11.8,1.2,2.2],[21.3,8,1.2,2.2]],
    [[3,13.5,3,1.3],[26,7.2,3,1.3],[9,9.8,1.2,2],[21.8,10.2,1.2,2],[4,2.2,2,1.2],[26,18.6,2,1.2],[10,16,2,1.2],[20,4.8,2,1.2]],
    [[3,5,2,1.2],[27,15.8,2,1.2],[12,2.4,3,1.2],[17,18.4,3,1.2],[9,13,1.4,2],[21.6,7,1.4,2],[14.6,9,2.8,1,true],[14.6,12,2.8,1,true]],
    [[4,3.8,2,1.2],[26,17,2,1.2],[10,15.8,3,1.2],[19,5,3,1.2],[7,10.5,1.5,2],[23.5,9,1.5,2],[14.5,6.5,3,1.2],[14.5,14.3,3,1.2]],
    [[2,4,3,1.3],[27,16.7,3,1.3],[2,18,2,1.1],[28,2.9,2,1.1],[11,18.8,2,1.2],[19,2,2,1.2],[15,8,2,1.2],[15,12.8,2,1.2]],
    [[2,7,2,1.3],[28,13.7,2,1.3],[12,2.4,2,1.3],[18,18.3,2,1.3],[7,13.8,2,1.2],[23,7,2,1.2],[14,7.7,1.4,2],[16.6,12.3,1.4,2]]
  ];
  const arenas = legacyArenas.map((a,index)=>{
    const arena=copy(a);
    for(const o of coverExtensions[index])arena.obstacles.push({id:'wall'+arena.obstacles.length,x:o[0],z:o[1],w:o[2],h:o[3],kind:'cover',destructible:o[4]===true,hp:o[4]===true?96:1000000000});
    for(const b of [[2,17,3,2],[27,3,3,2],[12,3.5,3,1.6],[17,16.9,3,1.6]])arena.brush.push({id:'brush'+arena.brush.length,x:b[0],z:b[1],w:b[2],h:b[3]});
    return arena;
  });
  const modes = {
    foundry:{name:'Foundry Hold',description:'Three robots hold the central energy well. First to 70, or lead when the clock stops.',limit:78},
    last:{name:'Last Rivet',description:'Eight independent robots outlast a tightening coolant ring. Collect power cells and fight for survival.',limit:96},
    rush:{name:'Core Rush',description:'Collect 8 reactor cores, then protect your team’s haul for 10 seconds. Defeated carriers drop their cores.',limit:96}
  };

  function entity(state,id,team,fighterId,x,z,cpu,label) {
    const f=Object.hasOwn(fighterMap,fighterId)?fighterMap[fighterId]:fighters[0];
    return {id,label:label||f.name,team,fighter:f.id,x,z,prevX:x,prevZ:z,vx:0,vz:0,heading:team==='blue'?-Math.PI/2:Math.PI/2,radius:.62,hp:f.hp,maxHp:f.hp,ammo:f.ammo,reload:0,shot:0,special:0,alive:true,death:0,spawn:.9,cpu:!!cpu,walk:0,recoil:0,hit:0,dash:0,dashAngle:0,dashHits:[],jump:null,jumpLock:0,airY:0,prevAirY:0,score:0,power:0,cores:0,gadget:0,shield:0,haste:0,reveal:0,lastCombat:0,ai:{think:0,path:[],at:0,target:null,goal:null,stuck:0,lastX:x,lastZ:z,fire:false,reloading:false,recover:false},intent:{x:0,z:0,heading:0,range:f.range,fire:false,special:false,gadget:false}};
  }
  function arenaForLayout(index,layoutVersion=4) {
    if(![1,2,3,4].includes(layoutVersion)||!Number.isInteger(index)||index<0||index>=arenas.length||layoutVersion===1&&index>2)throw Error('Unknown arena layout.');
    const arena=copy((layoutVersion===4?arenas:legacyArenas)[index]);
    if(layoutVersion<3)arena.pads=[];
    if(layoutVersion===1&&index===2){Object.assign(arena.obstacles[2],{x:13.1,z:9.8,w:5.8,h:1.8});Object.assign(arena.obstacles[3],{x:13.1,z:13,w:5.8,h:1.8});}
    return arena;
  }
  function createMatch(options) {
    options=options||{};const mode=Object.hasOwn(modes,options.mode)?options.mode:'foundry';
    const state={version:VERSION,layoutVersion:4,mode,difficulty:Object.hasOwn(difficulties,options.difficulty)?options.difficulty:'standard',arena:clamp(options.arena|0,0,arenas.length-1),rng:(options.seed>>>0)||0x6d2b79f5,phase:'playing',result:null,endReason:'',tick:0,elapsed:0,accumulator:0,nextId:1,arenaData:null,entities:[],projectiles:[],effects:[],fields:[],events:[],pickups:[],supplyAt:8,coreAt:1.6,holdTeam:null,holdLeft:10,score:{blue:0,red:0},zoneTick:0,ring:17.3,matchLimit:modes[mode].limit,resultCount:0,stats:{shots:0,hits:0,wallHits:0,deaths:0,cpuShots:0,stuck:0,gadgets:0,pickups:0}};
    state.arenaData=arenaForLayout(state.arena);
    state.entities.push(entity(state,'player',mode==='last'?'solo-0':'blue',Object.hasOwn(fighterMap,options.fighter)?options.fighter:'spark',16,18.2,false,'You'));
    const pool=fighters.filter(f=>f.id!==state.entities[0].fighter).map(f=>f.id);
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng(state)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    if(mode!=='last'){
      pool.slice(0,2).forEach((f,i)=>state.entities.push(entity(state,'blue-'+i,'blue',f,10+i*10,18.5,true)));
      pool.slice(2,5).forEach((f,i)=>state.entities.push(entity(state,'red-'+i,'red',f,8+i*8,3.5,true)));
    }else pool.slice(0,7).forEach((f,i)=>state.entities.push(entity(state,'solo-'+(i+1),'solo-'+(i+1),f,16,11,true,'CPU '+(i+1))));
    relocateAll(state);
    // Supplies are symmetrical and available to every participant.
    for(const point of [[7,16],[25,6]])dropPickup(state,'cell',point[0],point[1]);
    return state;
  }
  const playerOf = state => state.entities.find(e => e.id==='player');
  function emit(state,type,data) {state.events.push(Object.assign({type,at:state.elapsed},data||{},{id:state.nextId++}));if(state.events.length>60)state.events.shift();}
  function recordEffect(state, effect) { state.effects.push(Object.assign({life:.5,maxLife:.5},effect)); if(state.effects.length>MAX_EFFECTS)state.effects.splice(0,state.effects.length-MAX_EFFECTS); }
  function solidAt(state,x,z,r) {
    if(x-r<.45||z-r<.45||x+r>WIDTH-.45||z+r>HEIGHT-.45) return true;
    return state.arenaData.obstacles.some(o=>o.hp>0 && x+r>o.x && x-r<o.x+o.w && z+r>o.z && z-r<o.z+o.h);
  }
  function resolveMove(state,e,dx,dz){
    const r=e.radius,min=.45+r,maxX=WIDTH-.45-r,maxZ=HEIGHT-.45-r,overlap=(x,z,o)=>x+r>o.x&&x-r<o.x+o.w&&z+r>o.z&&z-r<o.z+o.h;
    let nx=clamp(e.x+dx,min,maxX),nz=e.z;
    for(const o of state.arenaData.obstacles)if(o.hp>0&&overlap(nx,nz,o)){if(dx>0)nx=Math.min(nx,o.x-r);else if(dx<0)nx=Math.max(nx,o.x+o.w+r);}
    nx=clamp(nx,min,maxX);nz=clamp(e.z+dz,min,maxZ);
    for(const o of state.arenaData.obstacles)if(o.hp>0&&overlap(nx,nz,o)){if(dz>0)nz=Math.min(nz,o.z-r);else if(dz<0)nz=Math.max(nz,o.z+o.h+r);}
    nz=clamp(nz,min,maxZ);
    for(const other of state.entities)if(other!==e&&other.alive&&!other.jump){const px=nx-other.x,pz=nz-other.z,d=Math.hypot(px,pz),spacing=r+other.radius;if(d>0.0001&&d<spacing){const x=other.x+px/d*spacing,z=other.z+pz/d*spacing;if(!solidAt(state,x,z,r)){nx=x;nz=z;}}}
    if(!solidAt(state,nx,nz,r-.00001)){e.x=nx;e.z=nz;}
  }
  function safeSpot(state,team,index) { const base=state.mode==='last'?{x:16+Math.cos(index/8*TAU)*13.2,z:11+Math.sin(index/8*TAU)*8.4}:{x:7+index*9,z:team==='blue'?18.2:3.8}; for(let r=0;r<20;r++){ const a=r*2.4, x=clamp(base.x+Math.cos(a)*r*.17,1,31),z=clamp(base.z+Math.sin(a)*r*.17,1,21);if(!solidAt(state,x,z,.65))return{x,z};}return base; }
  function relocateAll(state){state.entities.forEach((e,i)=>{const p=safeSpot(state,e.team,state.mode==='last'?i:i%3);e.x=p.x;e.z=p.z;e.prevX=e.x;e.prevZ=e.z;});}
  function teamEnemy(a,b){return a.team!==b.team;}
  function clearLine(state,a,b){ for(const o of state.arenaData.obstacles) if(o.hp>0&&o.kind!=='water'&&segmentBox(a.x,a.z,b.x,b.z,o))return false;return true; }
  function segmentBox(x1,z1,x2,z2,o){ const dx=x2-x1,dz=z2-z1;let lo=0,hi=1; for(const [p,q] of [[-dx,x1-o.x],[dx,o.x+o.w-x1],[-dz,z1-o.z],[dz,o.z+o.h-z1]]){if(Math.abs(p)<1e-8){if(q<0)return false;}else{const t=q/p;if(p<0){if(t>hi)return false;lo=Math.max(lo,t);}else{if(t<lo)return false;hi=Math.min(hi,t);}}}return lo<=hi; }
  function inBrush(state,e){return state.arenaData.brush.some(b=>e.x>=b.x&&e.x<=b.x+b.w&&e.z>=b.z&&e.z<=b.z+b.h);}
  function inSmoke(state,e){return state.fields.some(f=>f.kind==='smoke'&&f.life>0&&f.team===e.team&&dist(e,f)<f.radius);}
  function visibleTo(state,observer,target){return observer.team===target.team||clearLine(state,observer,target)&&(!(inBrush(state,target)||inSmoke(state,target))||target.reveal>0||dist(observer,target)<3.2);}
  function landingPoint(state,x,z,radius){
    for(let i=0;i<145;i++){const radiusStep=i===0?0:.2+Math.floor((i-1)/12)*.22,a=i*2.4,point={x:clamp(x+Math.cos(a)*radiusStep,1.1,30.9),z:clamp(z+Math.sin(a)*radiusStep,1.1,20.9)};if(!solidAt(state,point.x,point.z,radius))return point;}return null;
  }
  function launch(state,e,x,z,slam=0,pad=''){
    if(e.jump||!e.alive)return false;const point=landingPoint(state,x,z,e.radius);if(!point)return false;
    e.jump={fromX:e.x,fromZ:e.z,toX:point.x,toZ:point.z,time:0,duration:.9,slam,pad};e.jumpLock=1.4;e.spawn=0;e.dash=0;e.vx=e.vz=0;e.intent.fire=e.intent.special=e.intent.gadget=false;emit(state,'jump',{actor:e.id,pad});return true;
  }
  function fly(state,e,dt){
    const j=e.jump;j.time=Math.min(j.duration,j.time+dt);const t=j.time/j.duration;e.x=between(j.fromX,j.toX,t);e.z=between(j.fromZ,j.toZ,t);e.airY=Math.sin(t*Math.PI)*3.8;e.vx=e.vz=0;e.intent.fire=e.intent.special=e.intent.gadget=false;
    if(t>=1){e.jump=null;e.airY=0;e.prevAirY=0;e.jumpLock=.6;e.ai.think=0;
      const safe=landingPoint(state,e.x,e.z,e.radius);if(safe){e.x=safe.x;e.z=safe.z;}e.prevX=e.x;e.prevZ=e.z;
      if(j.slam)for(const q of state.entities)if(q.alive&&!q.jump&&teamEnemy(e,q)&&dist(e,q)<3&&clearLine(state,e,q))damage(state,q,j.slam,e);
      recordEffect(state,{kind:'blast',x:e.x,z:e.z,color:fighterMap[e.fighter].color,life:.45,maxLife:.45,radius:j.slam?3:1.2});emit(state,'land',{actor:e.id});
    }
  }
  function nearestEnemy(state,e){let best=null,score=Infinity;for(const q of state.entities)if(q.alive&&q!==e&&teamEnemy(e,q)&&visibleTo(state,e,q)){const value=dist(e,q)-q.cores*.5+(q.hp/q.maxHp)*1.2;if(value<score){score=value;best=q;}}return best;}
  function walkableLine(state,a,b,radius){return !state.arenaData.obstacles.some(o=>o.hp>0&&segmentBox(a.x,a.z,b.x,b.z,{x:o.x-radius,z:o.z-radius,w:o.w+radius*2,h:o.h+radius*2}));}
  function gridPath(state, from, to) {
    const cell=2, cols=16,rows=11, key=(x,z)=>z*cols+x, point=(x,z)=>({x:(x+.5)*cell,z:(z+.5)*cell});
    const clampCell=p=>({x:clamp(Math.floor(p.x/cell),0,cols-1),z:clamp(Math.floor(p.z/cell),0,rows-1)}), a=clampCell(from),b=clampCell(to); let open=[a], came={}, g={[key(a.x,a.z)]:0};
    const blocked=(x,z)=>solidAt(state,point(x,z).x,point(x,z).z,.65);
    while(open.length){open.sort((m,n)=>(g[key(m.x,m.z)]+Math.hypot(m.x-b.x,m.z-b.z))-(g[key(n.x,n.z)]+Math.hypot(n.x-b.x,n.z-b.z)));const c=open.shift();if(c.x===b.x&&c.z===b.z){let out=[];let k=key(c.x,c.z);while(came[k]){out.push(point(c.x,c.z));const p=came[k];c.x=p.x;c.z=p.z;k=key(c.x,c.z);}return out.reverse();}for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const x=c.x+d[0],z=c.z+d[1],k=key(x,z);if(x<0||z<0||x>=cols||z>=rows||blocked(x,z))continue;const ng=g[key(c.x,c.z)]+1;if(g[k]===undefined||ng<g[k]){g[k]=ng;came[k]={x:c.x,z:c.z};if(!open.some(p=>p.x===x&&p.z===z))open.push({x,z});}}}
    return [];
  }
  function setIntent(state,intent){const p=playerOf(state);if(!p||state.phase!=='playing'||!intent)return false;p.intent.x=clamp(+intent.x||0,-1,1);p.intent.z=clamp(+intent.z||0,-1,1);if(Number.isFinite(intent.heading))p.intent.heading=intent.heading;if(Number.isFinite(intent.range))p.intent.range=clamp(intent.range,.8,fighterMap[p.fighter].specialKind==='leap'?8:fighterMap[p.fighter].range);for(const key of ['fire','special','gadget'])if(Object.hasOwn(intent,key))p.intent[key]=!!intent[key];return true;}
  function requestFire(state){const p=playerOf(state);if(p&&p.alive&&state.phase==='playing'){p.intent.fire=true;return true;}return false;}
  function quickFire(state){const p=playerOf(state),f=p&&fighterMap[p.fighter];if(!p||!f||!p.alive||state.phase!=='playing')return false;const target=state.entities.filter(e=>e.alive&&!e.jump&&teamEnemy(p,e)&&dist(p,e)<=f.range&&visibleTo(state,p,e)).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(!target)return false;p.intent.heading=Math.atan2(target.z-p.z,target.x-p.x);p.intent.range=dist(p,target);p.intent.fire=true;return{x:target.x,z:target.z};}
  function requestSpecial(state){const p=playerOf(state);if(p&&p.alive&&state.phase==='playing'){p.intent.special=true;return true;}return false;}
  function requestGadget(state){const p=playerOf(state);if(!p||!p.alive||p.gadget>0||state.phase!=='playing')return false;p.intent.gadget=true;return true;}
  function attack(state,e,angle,kind){
    const f=fighterMap[e.fighter];if(!e.alive||e.jump||kind==='basic'&&e.shot>0)return false;
    if(kind==='basic'){
      if(e.ammo<=0)return false;e.ammo--;e.reload=f.reload;e.shot=f.cooldown;
      if(f.attackKind==='melee'){
        for(const q of state.entities)if(q.alive&&!q.jump&&teamEnemy(e,q)&&dist(e,q)<f.range&&clearLine(state,e,q)&&Math.cos(Math.atan2(q.z-e.z,q.x-e.x)-angle)>.35)damage(state,q,f.damage*(1+e.power*.10),e);
        for(const o of state.arenaData.obstacles)if(o.destructible&&o.hp>0){const point={x:clamp(e.x,o.x,o.x+o.w),z:clamp(e.z,o.z,o.z+o.h)};if(dist(e,point)<f.range&&Math.cos(Math.atan2(point.z-e.z,point.x-e.x)-angle)>.35)damageCover(state,o,f.damage*(1+e.power*.10));}
        recordEffect(state,{kind:'punch',x:e.x+Math.cos(angle)*1.6,z:e.z+Math.sin(angle)*1.6,color:f.color,life:.22,maxLife:.22,radius:1.5});
      }else{const count=f.pellets||1;for(let i=0;i<count;i++){const a=angle+(count===1?0:(i-(count-1)/2)*f.spread);spawnShot(state,e,a,f.damage*(1+e.power*.10),f.splash?e.intent.range:f.range,f.projectile,{splash:f.splash||0,arc:!!f.splash,bounce:f.bounce||0,heal:f.attackKind==='heal'?13:0,returning:f.attackKind==='return',patch:f.attackKind==='garden'});}}
    }else{const charge=e.special;e.special=0;if(special(state,e,angle,f)===false){e.special=charge;return false;}e.shot=.54;}
    e.lastCombat=state.elapsed;e.reveal=kind==='special'&&f.specialKind==='smoke'?0:1.3;e.recoil=.22;state.stats.shots++;if(e.cpu)state.stats.cpuShots++;return true;
  }
  function spawnShot(state,e,angle,damageValue,range,speed,extra){const duration=Math.max(.05,range/speed)*(extra.returning?2:1);state.projectiles.push({id:'p'+state.nextId++,owner:e.id,team:e.team,x:e.x+Math.cos(angle)*.7,z:e.z+Math.sin(angle)*.7,prevX:e.x+Math.cos(angle)*.7,prevZ:e.z+Math.sin(angle)*.7,vx:Math.cos(angle)*speed,vz:Math.sin(angle)*speed,damage:damageValue,life:duration,duration,radius:extra.heal>0?.5:.16,splash:extra.splash||0,arc:!!extra.arc,pierce:extra.pierce||0,color:fighterMap[e.fighter].color,hit:[],bounce:extra.bounce||0,heal:extra.heal||0,returning:!!extra.returning,back:false,patch:!!extra.patch});}
  function special(state,e,a,f){
    if(f.specialKind==='leap')return launch(state,e,e.x+Math.cos(a)*clamp(e.intent.range,.8,8),e.z+Math.sin(a)*clamp(e.intent.range,.8,8),42);
    if(f.specialKind==='ricochet'){for(let i=-2;i<=2;i++)spawnShot(state,e,a+i*.12,22,17,22,{bounce:4});return;}
    if(f.specialKind==='smoke'){cloud(state,e,5,6);return;}
    if(f.specialKind==='thorns'){const point={x:clamp(e.x+Math.cos(a)*Math.min(6,e.intent.range),1,31),z:clamp(e.z+Math.sin(a)*Math.min(6,e.intent.range),1,21)};state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,...point,kind:'thorns',radius:3.3,life:5,maxLife:5,damage:19,color:f.color});return;}
    if(f.specialKind==='heal'){for(const q of state.entities)if(q.alive&&q.team===e.team&&dist(e,q)<6&&clearLine(state,e,q))q.hp=Math.min(q.maxHp,q.hp+q.maxHp*.45);recordEffect(state,{kind:'repair',x:e.x,z:e.z,color:'#abffba',radius:6,life:.7,maxLife:.7});return;}
    if(f.specialKind==='orbit'){for(let i=0;i<8;i++)spawnShot(state,e,a+i*TAU/8,21,7,17,{returning:true});return;}
    emit(state,'special',{actor:e.id,kind:f.specialKind});recordEffect(state,{kind:'special',x:e.x,z:e.z,color:f.color,life:.72,maxLife:.72,radius:1});if(f.specialKind==='pierce'||f.specialKind==='line'){spawnShot(state,e,a,f.specialKind==='line'?48:34,17,28,{pierce:f.specialKind==='line'?6:2});return;}if(f.specialKind==='dash'){e.dash=.28;e.dashAngle=a;e.dashHits=[];return;}if(f.specialKind==='slam'){for(const q of state.entities)if(q.alive&&teamEnemy(e,q)&&dist(e,q)<3.25){damage(state,q,30,e);const d=Math.max(.1,dist(e,q));resolveMove(state,q,(q.x-e.x)/d*1.25,(q.z-e.z)/d*1.25);}return;}if(f.specialKind==='blast'){state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,x:clamp(e.x+Math.cos(a)*5,.5,31.5),z:clamp(e.z+Math.sin(a)*5,.5,21.5),radius:3,life:.18,maxLife:.18,damage:40,once:true,color:f.color});return;}if(f.specialKind==='field')state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,x:e.x,z:e.z,radius:3.2,life:4,maxLife:4,heal:9,damage:7,color:f.color});}
  function damage(state,target,amount,source){
    if(!target.alive||target.spawn>0||target.jump&&source!==target||amount<=0)return false;
    amount*=target.shield>0?.55:1;target.hp-=amount;target.hit=.2;target.lastCombat=state.elapsed;target.reveal=1.3;state.stats.hits++;
    if(source&&source!==target)source.special=clamp(source.special+amount/(target.maxHp*2.3),0,1);target.special=clamp(target.special+amount/(target.maxHp*6),0,1);
    recordEffect(state,{kind:'hit',x:target.x,z:target.z,color:'#fff3b0',life:.55,maxLife:.55,radius:.34,amount:Math.round(amount),team:target.team,source:source?.id||'',target:target.id});
    if(target.hp<=0){target.hp=0;kill(state,target,source);}return true;
  }
  function kill(state,target,source){
    if(!target.alive)return;target.alive=false;target.death=state.mode!=='last'?3.1:0;target.intent.fire=false;target.intent.gadget=false;target.dash=0;target.jump=null;target.airY=target.prevAirY=0;state.stats.deaths++;
    for(let i=0;i<target.cores;i++)dropPickup(state,'core',target.x+Math.cos(i*2.4)*.7,target.z+Math.sin(i*2.4)*.7);
    if(target.power>0)dropPickup(state,'cell',target.x,target.z);target.cores=0;target.power=0;target.maxHp=fighterMap[target.fighter].hp;
    recordEffect(state,{kind:'burst',x:target.x,z:target.z,color:fighterMap[target.fighter].color,life:.68,maxLife:.68,radius:1.65});emit(state,'defeat',{target:target.id,source:source&&source.id||''});if(source&&source!==target)source.score++;
  }
  function blastShot(state,p){const owner=state.entities.find(e=>e.id===p.owner);if(!owner)return;if(p.patch)state.fields.push({id:'f'+state.nextId++,owner:owner.id,team:owner.team,x:clamp(p.x,0,WIDTH),z:clamp(p.z,0,HEIGHT),kind:'thorns',radius:1.6,life:2,maxLife:2,damage:9,color:p.color});for(const q of state.entities)if(q.alive&&!q.jump&&q.team!==p.team&&dist(q,p)<p.splash+q.radius)damage(state,q,p.damage,owner);for(const o of state.arenaData.obstacles)if(o.destructible&&o.hp>0&&p.x>o.x-p.splash&&p.x<o.x+o.w+p.splash&&p.z>o.z-p.splash&&p.z<o.z+o.h+p.splash)damageCover(state,o,p.damage);recordEffect(state,{kind:'blast',x:p.x,z:p.z,color:p.color,life:.45,maxLife:.45,radius:p.splash});}
  function damageCover(state,o,amount){o.hp=Math.max(0,o.hp-amount*.72);if(o.hp===0){recordEffect(state,{kind:'rubble',x:o.x+o.w/2,z:o.z+o.h/2,color:state.arenaData.accent,life:.72,maxLife:.72,radius:1.5});dropPickup(state,'cell',o.x+o.w/2,o.z+o.h/2);emit(state,'coverDown',{cover:o.id});}}
  function segmentDistance(a,b,q){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(q.x-a.x-dx*t,q.z-a.z-dz*t);}
  function updateProjectiles(state,dt){for(let i=state.projectiles.length-1;i>=0;i--){
    const p=state.projectiles[i],old={x:p.x,z:p.z};p.prevX=p.x;p.prevZ=p.z;p.x+=p.vx*dt;p.z+=p.vz*dt;p.life=Math.max(0,p.life-dt);
    if(p.returning&&!p.back&&p.life<=p.duration*.5){p.back=true;p.hit=[];}
    if(p.back){const owner=state.entities.find(e=>e.id===p.owner);if(owner){const a=Math.atan2(owner.z-p.z,owner.x-p.x),speed=Math.hypot(p.vx,p.vz);p.vx=Math.cos(a)*speed;p.vz=Math.sin(a)*speed;if(dist(p,owner)<.7){state.projectiles.splice(i,1);continue;}}}
    let wall=null;if(!p.arc)wall=state.arenaData.obstacles.find(o=>o.hp>0&&o.kind!=='water'&&segmentBox(old.x,old.z,p.x,p.z,o));
    if(wall){if(wall.destructible)damageCover(state,wall,p.damage);state.stats.wallHits++;
      if(p.bounce>0&&wall.hp>0){const xOnly=segmentBox(old.x,old.z,p.x,old.z,wall),zOnly=segmentBox(old.x,old.z,old.x,p.z,wall);if(xOnly||!zOnly)p.vx=-p.vx;if(zOnly)p.vz=-p.vz;p.x=old.x;p.z=old.z;p.bounce--;wall=null;recordEffect(state,{kind:'spark',x:p.x,z:p.z,color:p.color,life:.2,maxLife:.2,radius:.4});}
    }
    if(!wall&&p.bounce>0&&(p.x<.45||p.x>WIDTH-.45||p.z<.45||p.z>HEIGHT-.45)){if(p.x<.45||p.x>WIDTH-.45)p.vx=-p.vx;if(p.z<.45||p.z>HEIGHT-.45)p.vz=-p.vz;p.x=old.x;p.z=old.z;p.bounce--;state.stats.wallHits++;}
    if(wall||p.life<=0||p.x<0||p.z<0||p.x>WIDTH||p.z>HEIGHT){if(p.arc&&p.life<=0)blastShot(state,p);state.projectiles.splice(i,1);continue;}
    if(p.arc)continue;let consumed=false;
    for(const e of state.entities)if(e.alive&&!e.jump&&e.id!==p.owner&&(e.team!==p.team||p.heal>0&&e.hp<e.maxHp)&&!p.hit.includes(e.id)&&segmentDistance(old,p,e)<e.radius+p.radius){const owner=state.entities.find(q=>q.id===p.owner);p.hit.push(e.id);if(owner){if(e.team===p.team)e.hp=Math.min(e.maxHp,e.hp+p.heal);else damage(state,e,p.damage,owner);}recordEffect(state,{kind:'spark',x:p.x,z:p.z,color:p.color,life:.26,maxLife:.26,radius:.52});if(p.heal>0){}else if(p.pierce>0)p.pierce--;else if(!p.returning)consumed=true;break;}
    if(consumed)state.projectiles.splice(i,1);
  }}
  function cloud(state,e,radius,life){state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,x:e.x,z:e.z,kind:'smoke',radius,life,maxLife:life,color:'#bda6f4'});e.reveal=0;emit(state,'smoke',{actor:e.id});}
  function useGadget(state,e){
    if(e.gadget>0||!e.alive||e.jump)return false;const f=fighterMap[e.fighter];e.gadget=gadgets[e.fighter].cooldown;e.reveal=1.3;
    if(f.id==='spark'){e.ammo=f.ammo;e.reload=0;e.haste=3;}
    if(f.id==='anvil')e.shield=4;
    if(f.id==='knuckle'){e.hp=Math.min(e.maxHp,e.hp+e.maxHp*.3);e.shield=2;}
    if(f.id==='echo'){e.ammo=f.ammo;e.reload=0;e.haste=2.5;}
    if(f.id==='shroud')cloud(state,e,3.5,3);
    if(f.id==='gyro'){e.shield=3;e.haste=2;}
    if(f.id==='briar'||f.id==='tempo')state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,x:e.x,z:e.z,kind:f.id==='briar'?'turret':'repair',radius:3,life:f.id==='briar'?5:4,maxLife:f.id==='briar'?5:4,heal:f.id==='tempo'?14:0,shot:0,color:f.color});
    if(f.id==='vector'){for(let i=0;i<10;i++)resolveMove(state,e,Math.cos(e.heading)*.35,Math.sin(e.heading)*.35);e.shield=1.5;}
    if(['mortar','lumen','rail'].includes(f.id))state.fields.push({id:'f'+state.nextId++,owner:e.id,team:e.team,x:e.x,z:e.z,kind:f.id==='mortar'?'turret':f.id==='rail'?'mine':'repair',radius:f.id==='rail'?2.2:3,life:f.id==='mortar'?5:4,maxLife:f.id==='mortar'?5:4,damage:f.id==='rail'?38:0,heal:f.id==='lumen'?14:0,arm:f.id==='rail'?.5:0,shot:0,color:f.color});
    state.stats.gadgets++;recordEffect(state,{kind:'gadget',x:e.x,z:e.z,color:'#a9ffb4',life:.6,maxLife:.6,radius:1.4});emit(state,'gadget',{actor:e.id,name:gadgets[e.fighter].name});return true;
  }
  function updateFields(state,dt){for(let i=state.fields.length-1;i>=0;i--){
    const f=state.fields[i],owner=state.entities.find(e=>e.id===f.owner)||state.entities.find(e=>e.team===f.team);f.life-=dt;if(!owner){state.fields.splice(i,1);continue;}
    if(f.kind==='smoke'){if(f.life<=0)state.fields.splice(i,1);continue;}
    if(f.kind==='turret'){f.shot=Math.max(0,f.shot-dt);const target=state.entities.filter(e=>e.alive&&e.team!==f.team&&dist(e,f)<8&&visibleTo(state,{...f,reveal:0},e)).sort((a,b)=>dist(f,a)-dist(f,b))[0];if(target&&f.shot===0){const angle=Math.atan2(target.z-f.z,target.x-f.x);spawnShot(state,{...owner,x:f.x,z:f.z},angle,10,8,18,{});f.shot=.7;}}
    else if(f.kind==='mine'){f.arm=Math.max(0,f.arm-dt);if(f.arm===0&&state.entities.some(e=>e.alive&&e.team!==f.team&&dist(e,f)<f.radius&&clearLine(state,f,e))){for(const e of state.entities)if(e.alive&&e.team!==f.team&&dist(e,f)<f.radius&&clearLine(state,f,e))damage(state,e,f.damage,owner);f.life=0;recordEffect(state,{kind:'blast',x:f.x,z:f.z,radius:f.radius,color:f.color,life:.4,maxLife:.4});}}
    else for(const e of state.entities)if(e.alive&&!e.jump&&dist(e,f)<f.radius&&clearLine(state,f,e)){const friendly=e.team===f.team;if(f.once){if(!friendly)damage(state,e,f.damage,owner);}else if(friendly)e.hp=clamp(e.hp+(f.heal||0)*dt,0,e.maxHp);else damage(state,e,(f.damage||0)*dt,owner);}
    if(f.once)f.damage=0;
    if(f.life<=0)state.fields.splice(i,1);
  }}
  function dropPickup(state,kind,x,z){
    if(state.pickups.length>=48)return;let point=null;
    for(let i=0;i<24;i++){const radius=i===0?0:.2+Math.floor(i/6)*.4,px=clamp(x+Math.cos(i*2.4)*radius,1,31),pz=clamp(z+Math.sin(i*2.4)*radius,1,21);if(!solidAt(state,px,pz,.3)){point={x:px,z:pz};break;}}
    if(point)state.pickups.push({id:'drop'+state.nextId++,kind,...point,life:kind==='core'?120:24});
  }
  function updatePickups(state,dt){
    for(let i=state.pickups.length-1;i>=0;i--){const item=state.pickups[i];item.life-=dt;let taken=false;
      for(const e of state.entities)if(e.alive&&!e.jump&&dist(e,item)<e.radius+.45&&clearLine(state,e,item)){
        if(item.kind==='core'){if(e.cores>=20)continue;e.cores++;}
        else if(item.kind==='cell'){if(e.power>=6)continue;e.power++;e.maxHp=fighterMap[e.fighter].hp*(1+e.power*.08);e.hp=clamp(e.hp+fighterMap[e.fighter].hp*.08,0,e.maxHp);}
        else if(item.kind==='repair'){if(e.hp>=e.maxHp)continue;e.hp=clamp(e.hp+e.maxHp*.35,0,e.maxHp);}
        else if(item.kind==='haste')e.haste=6;
        else if(item.kind==='charge')e.special=clamp(e.special+.4,0,1);
        state.stats.pickups++;taken=true;recordEffect(state,{kind:'pickup',x:e.x,z:e.z,radius:1,color:item.kind==='core'?'#d4a9ff':'#c9ffa3',life:.4,maxLife:.4});emit(state,'pickup',{actor:e.id,kind:item.kind});break;
      }
      if(taken||item.life<=0)state.pickups.splice(i,1);
    }
    if(state.elapsed>=state.supplyAt){const types=['repair','haste','charge','cell'],type=types[Math.floor(state.supplyAt/8)%types.length];for(const [x,z]of [[8,12],[24,10]])dropPickup(state,type,x,z);state.supplyAt+=8;}
    if(state.mode==='rush'&&state.elapsed>=state.coreAt){dropPickup(state,'core',16+Math.sin(state.coreAt)*1.4,11+Math.cos(state.coreAt)*1.1);state.coreAt+=2.1;}
  }
  function think(state,e){
    const f=fighterMap[e.fighter],skill=difficulties[e.team==='blue'?'standard':state.difficulty],target=nearestEnemy(state,e),well={x:16,z:11};let goal=well;
    const supplies=state.pickups.filter(p=>dist(e,p)<9&&(p.kind==='core'&&state.mode==='rush'||p.kind==='repair'&&e.hp<e.maxHp*.7||p.kind==='cell'&&e.power<6||p.kind==='charge'&&e.special<.7)).sort((a,b)=>dist(e,a)-dist(e,b));
    if(supplies.length)goal=supplies[0];else if(target)goal=target;
    if(state.mode==='foundry'&&(e.hp>e.maxHp*skill.retreat||!target)){const slot=state.entities.filter(q=>q.team===e.team).indexOf(e);goal={x:16+(slot-1)*1.35,z:e.team==='blue'?12:10};if(solidAt(state,goal.x,goal.z,e.radius)){for(let i=0;i<12;i++){const a=(i+slot*4)/12*TAU,candidate={x:16+Math.cos(a)*2.1,z:11+Math.sin(a)*2.1};if(!solidAt(state,candidate.x,candidate.z,e.radius)){goal=candidate;break;}}}}
    if(state.mode==='rush'&&e.cores>=4&&state.holdTeam===e.team)goal={x:16+(Number(e.id.slice(-1))||0)*3,z:e.team==='blue'?17:5};
    if(e.ammo===0)e.ai.reloading=true;if(e.ammo>=Math.min(2,f.ammo))e.ai.reloading=false;
    if(e.hp/e.maxHp<skill.retreat)e.ai.recover=true;if(e.hp/e.maxHp>.76)e.ai.recover=false;
    if(target&&e.ai.recover){const covers=[];for(const o of state.arenaData.obstacles)if(o.hp>0&&o.kind!=='water')for(const point of [{x:o.x-.9,z:o.z+o.h/2},{x:o.x+o.w+.9,z:o.z+o.h/2},{x:o.x+o.w/2,z:o.z-.9},{x:o.x+o.w/2,z:o.z+o.h+.9}])if(!solidAt(state,point.x,point.z,e.radius)&&!clearLine(state,target,point)&&dist(e,point)<10)covers.push(point);covers.sort((a,b)=>dist(e,a)-dist(e,b));goal=covers[0]||{x:clamp(e.x+(e.x-target.x)*.45,1,31),z:clamp(e.z+(e.z-target.z)*.45,1,21)};}
    if(state.difficulty==='rookie'&&e.team!=='blue'&&target&&!e.ai.recover)goal=target;
    e.ai.target=target?.id||null;e.ai.goal={x:goal.x,z:goal.z};e.ai.path=walkableLine(state,e,goal,e.radius)?[]:gridPath(state,e,goal);e.ai.at=0;
    let point=e.ai.path.find(p=>dist(e,p)>.8)||goal,dx=point.x-e.x,dz=point.z-e.z;
    if(target){const d=dist(e,target),flight=d/f.projectile;
      e.intent.heading=Math.atan2(target.z+target.vz*flight*skill.lead-e.z,target.x+target.vx*flight*skill.lead-e.x)+(rng(state)-.5)*skill.error;
      e.intent.range=clamp(d,.8,f.specialKind==='leap'?8:f.range);e.ai.fire=d<f.range&&e.ammo>0&&!e.ai.reloading&&!e.ai.recover;e.intent.special=e.special>=1&&d<Math.min(f.specialKind==='leap'?8:f.range,f.specialKind==='dash'?5.5:8);
      if(goal===target&&d<f.range*.7){const side=Math.sin(state.elapsed*1.4+state.entities.indexOf(e))>0?1:-1;dx=-(target.z-e.z)*side;dz=(target.x-e.x)*side;if(d<2.4){dx-=target.x-e.x;dz-=target.z-e.z;}}
      if(skill.gadgets&&e.gadget===0&&(e.hp<e.maxHp*.65||d<f.range*.7))e.intent.gadget=true;
    }else e.ai.fire=false;
    if(skill.dodge&&(state.mode!=='foundry'||dist(e,well)>3.2)){const incoming=state.projectiles.find(p=>p.team!==e.team&&!p.arc&&segmentDistance(p,{x:p.x+p.vx*.4,z:p.z+p.vz*.4},e)<1&&Math.hypot(p.x-e.x,p.z-e.z)<7);if(incoming){const side=(e.x-incoming.x)*incoming.vz-(e.z-incoming.z)*incoming.vx>0?1:-1;dx+=incoming.vz*.12*side*skill.dodge;dz-=incoming.vx*.12*side*skill.dodge;}}
    if(state.mode==='last'&&Math.hypot(e.x-16,(e.z-11)*1.23)>state.ring-1.5){dx=16-e.x;dz=11-e.z;}
    if(!e.ai.recover&&e.jumpLock===0){const goalDistance=dist(e,goal);const pad=state.arenaData.pads.find(p=>dist(e,p)<8&&dist(e,p)+Math.hypot(p.toX-goal.x,p.toZ-goal.z)+1.5<goalDistance&&walkableLine(state,e,p,e.radius));if(pad){dx=pad.x-e.x;dz=pad.z-e.z;}}
    const length=Math.hypot(dx,dz)||1,magnitude=Math.min(1,length*1.7);e.intent.x=dx/length*magnitude;e.intent.z=dz/length*magnitude;
  }
  function updateEntity(state,e,dt){
    e.prevX=e.x;e.prevZ=e.z;e.prevAirY=e.airY;const f=fighterMap[e.fighter];for(const key of ['shot','recoil','hit','spawn','gadget','shield','haste','reveal','jumpLock'])e[key]=Math.max(0,e[key]-dt);
    if(!e.alive){if(state.mode!=='last'){e.death-=dt;if(e.death<=0){const slot=state.entities.filter(q=>q.team===e.team).indexOf(e),point=safeSpot(state,e.team,slot);e.x=point.x;e.z=point.z;e.prevX=e.x;e.prevZ=e.z;e.vx=e.vz=0;e.hp=e.maxHp;e.ammo=f.ammo;e.reload=0;e.alive=true;e.spawn=1.1;e.death=0;e.lastCombat=state.elapsed;e.shield=0;e.haste=0;emit(state,'respawn',{actor:e.id});}}return;}
    if(e.jump){fly(state,e,dt);return;}
    if(e.ammo<f.ammo){e.reload=Math.max(0,e.reload-dt);if(e.reload===0){e.ammo++;e.reload=e.ammo<f.ammo?f.reload:0;}}else e.reload=0;
    if(state.elapsed-e.lastCombat>3)e.hp=clamp(e.hp+e.maxHp*.10*dt,0,e.maxHp);
    if(e.cpu){const skill=difficulties[e.team==='blue'?'standard':state.difficulty];e.ai.think-=dt;if(e.ai.think<=0){think(state,e);e.ai.think=skill.think*(.9+rng(state)*.2);}const target=state.entities.find(q=>q.id===e.ai.target);e.intent.fire=!!(e.ai.fire&&target?.alive&&visibleTo(state,e,target)&&dist(e,target)<f.range);
      if(Math.hypot(e.x-e.ai.lastX,e.z-e.ai.lastZ)<.03)e.ai.stuck+=dt;else e.ai.stuck=0;e.ai.lastX=e.x;e.ai.lastZ=e.z;if(e.ai.stuck>2&&!e.intent.fire){e.ai.path=[];e.ai.think=0;e.ai.stuck=0;state.stats.stuck++;}
    }
    const input=e.intent;if(Number.isFinite(input.heading))e.heading=input.heading;const length=Math.max(1,Math.hypot(input.x,input.z)),speed=f.speed*(e.haste>0?1.25:1),dash=e.dash>0;
    e.vx=between(e.vx,dash?Math.cos(e.dashAngle)*18:input.x/length*speed,Math.min(1,dt*18));e.vz=between(e.vz,dash?Math.sin(e.dashAngle)*18:input.z/length*speed,Math.min(1,dt*18));e.dash=Math.max(0,e.dash-dt);
    resolveMove(state,e,e.vx*dt,e.vz*dt);if(dash)for(const q of state.entities)if(q.alive&&!q.jump&&q.team!==e.team&&!e.dashHits.includes(q.id)&&dist(e,q)<e.radius+q.radius+.25){e.dashHits.push(q.id);damage(state,q,30,e);}e.walk+=Math.hypot(e.vx,e.vz)*dt*1.5;
    const pad=e.jumpLock===0&&state.arenaData.pads.find(p=>dist(e,p)<.8);if(pad&&launch(state,e,pad.toX,pad.toZ,0,pad.id))return;
    if(input.gadget)useGadget(state,e);if(input.special&&e.special>=1)attack(state,e,e.heading,'special');else if(input.fire)attack(state,e,e.heading,'basic');input.fire=false;input.special=false;input.gadget=false;
  }
  function controlZone(state,dt){
    if(state.mode==='rush'){
      state.score.blue=state.entities.filter(e=>e.team==='blue').reduce((n,e)=>n+e.cores,0);state.score.red=state.entities.filter(e=>e.team==='red').reduce((n,e)=>n+e.cores,0);
      const team=state.score.blue>=8&&state.score.blue>state.score.red?'blue':state.score.red>=8&&state.score.red>state.score.blue?'red':null;
      if(team!==state.holdTeam){state.holdTeam=team;state.holdLeft=10;}if(team){state.holdLeft=Math.max(0,state.holdLeft-dt);if(state.holdLeft===0)end(state,team==='blue'?'win':'loss','core hold');}return;
    }
    if(state.mode!=='foundry')return;state.zoneTick+=dt;if(state.zoneTick<.5)return;state.zoneTick=0;
    let blue=false,red=false;for(const e of state.entities)if(e.alive&&!e.jump&&dist(e,{x:16,z:11})<3.25){if(e.team==='blue')blue=true;if(e.team==='red')red=true;}
    if(blue&&!red)state.score.blue++;if(red&&!blue)state.score.red++;if(state.score.blue>=70||state.score.red>=70)end(state,state.score.blue>state.score.red?'win':'loss','energy target');
  }
  function soloRing(state,dt){if(state.mode!=='last')return;state.ring=clamp(17.3-state.elapsed*.132,2.7,17.3);for(const e of state.entities)if(e.alive){const d=Math.hypot(e.x-16,(e.z-11)*1.23);if(d>state.ring){const owner=e;damage(state,e,(8+state.elapsed*.18)*dt,owner);recordEffect(state,{kind:'hazard',x:e.x,z:e.z,color:'#71e5ff',life:.12,maxLife:.12,radius:.5});}}const alive=state.entities.filter(e=>e.alive);if(!playerOf(state).alive){end(state,'loss','eliminated');return;}if(alive.length<=1)end(state,alive[0]?.id==='player'?'win':'loss','last rivet');}
  function end(state,result,reason){if(state.phase==='ended')return;state.phase='ended';state.result=result;state.endReason=reason;state.resultCount++;emit(state,'result',{result,reason});}
  function step(state){if(!state||state.phase!=='playing')return;state.tick++;state.elapsed+=STEP;for(const e of state.entities)updateEntity(state,e,STEP);updateProjectiles(state,STEP);updateFields(state,STEP);updatePickups(state,STEP);controlZone(state,STEP);soloRing(state,STEP);for(let i=state.effects.length-1;i>=0;i--){state.effects[i].life-=STEP;if(state.effects[i].life<=0)state.effects.splice(i,1);}if(state.elapsed>=state.matchLimit&&state.phase==='playing'){if(state.mode!=='last'){const result=state.score.blue===state.score.red?'draw':state.score.blue>state.score.red?'win':'loss';end(state,result,'clock');}else{const top=state.entities.filter(e=>e.alive).sort((a,b)=>b.hp-a.hp)[0];end(state,top?.id==='player'?'win':'loss','ring close');}}
  }
  function tick(state,dt){state.accumulator=Math.min(.5,(state.accumulator||0)+Math.max(0,Number(dt)||0));while(state.accumulator>=STEP&&state.phase==='playing'){step(state);state.accumulator-=STEP;}return state;}
  function snapshot(state){return copy(state);}
  function isFiniteNumber(n,min,max){return typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;}
  function validateLegacySnapshot(value){if(!value||typeof value!=='object'||value.version!==1||!['foundry','last'].includes(value.mode)||!['playing','ended'].includes(value.phase)||!Number.isInteger(value.arena)||value.arena<0||value.arena>=3||!Array.isArray(value.entities)||value.entities.length<6||value.entities.length>8||!Array.isArray(value.projectiles)||value.projectiles.length>180||!Array.isArray(value.fields)||value.fields.length>20||!Array.isArray(value.effects)||value.effects.length>MAX_EFFECTS||!Array.isArray(value.events)||value.events.length>60||!value.arenaData||typeof value.arenaData.id!=='string'||!Array.isArray(value.arenaData.obstacles)||value.arenaData.obstacles.length>20)return false;if(!isFiniteNumber(value.rng,0,4294967295)||!Number.isInteger(value.tick)||value.tick<0||!isFiniteNumber(value.elapsed,0,500)||!isFiniteNumber(value.ring,0,30)||!isFiniteNumber(value.accumulator,0,.5)||!isFiniteNumber(value.matchLimit,1,120)||!Number.isInteger(value.nextId)||value.nextId<1||value.nextId>100000||!value.score||!isFiniteNumber(value.score.blue,0,100)||!isFiniteNumber(value.score.red,0,100))return false;for(const o of value.arenaData.obstacles){if(!o||typeof o.id!=='string'||typeof o.destructible!=='boolean'||!isFiniteNumber(o.x,-1,WIDTH)||!isFiniteNumber(o.z,-1,HEIGHT)||!isFiniteNumber(o.w,.1,WIDTH)||!isFiniteNumber(o.h,.1,HEIGHT)||!isFiniteNumber(o.hp,0,1000000000))return false;}for(const e of value.entities){if(!e||typeof e.id!=='string'||!fighterMap[e.fighter]||typeof e.team!=='string'||typeof e.alive!=='boolean'||!isFiniteNumber(e.x,0,WIDTH)||!isFiniteNumber(e.z,0,HEIGHT)||!isFiniteNumber(e.vx,-40,40)||!isFiniteNumber(e.vz,-40,40)||!isFiniteNumber(e.heading,-20,20)||!isFiniteNumber(e.hp,0,300)||!isFiniteNumber(e.maxHp,1,300)||!isFiniteNumber(e.ammo,0,8)||!isFiniteNumber(e.reload,0,5)||!isFiniteNumber(e.special,0,1)||!isFiniteNumber(e.death,0,5)||!isFiniteNumber(e.spawn,0,5)||!e.intent||!isFiniteNumber(e.intent.x,-1,1)||!isFiniteNumber(e.intent.z,-1,1)||!isFiniteNumber(e.intent.heading,-20,20)||typeof e.intent.fire!=='boolean'||typeof e.intent.special!=='boolean')return false;}for(const p of value.projectiles){if(!p||typeof p.id!=='string'||typeof p.owner!=='string'||typeof p.team!=='string'||!isFiniteNumber(p.x,-2,WIDTH+2)||!isFiniteNumber(p.z,-2,HEIGHT+2)||!isFiniteNumber(p.vx,-40,40)||!isFiniteNumber(p.vz,-40,40)||!isFiniteNumber(p.damage,0,100)||!isFiniteNumber(p.life,0,20)||!Array.isArray(p.hit)||p.hit.length>8)return false;}for(const f of value.fields){if(!f||typeof f.id!=='string'||typeof f.team!=='string'||!isFiniteNumber(f.x,0,WIDTH)||!isFiniteNumber(f.z,0,HEIGHT)||!isFiniteNumber(f.radius,.1,8)||!isFiniteNumber(f.life,0,8)||!isFiniteNumber(f.maxLife,.1,8))return false;}return true;}
  function migrateLegacy(value){
    const state=copy(value);state.version=VERSION;state.layoutVersion=1;state.difficulty='standard';state.pickups=[];state.supplyAt=state.elapsed+4;state.coreAt=state.elapsed+1.6;state.holdTeam=null;state.holdLeft=10;state.stats.gadgets=0;state.stats.pickups=0;state.arenaData.brush=copy(legacyArenas[state.arena].brush);state.arenaData.pads=[];
    state.arenaData.obstacles.forEach(o=>o.kind='cover');state.events=[];
    for(const e of state.entities){Object.assign(e,{power:0,cores:0,gadget:0,shield:0,haste:0,reveal:0,lastCombat:state.elapsed,dashAngle:e.heading,dashHits:[],jump:null,jumpLock:0,airY:0,prevAirY:0,prevX:e.x,prevZ:e.z});e.intent.range=fighterMap[e.fighter].range;e.intent.gadget=false;e.ai.fire=false;e.ai.reloading=false;e.ai.recover=false;
      if(solidAt(state,e.x,e.z,e.radius)){const old={x:e.x,z:e.z};let repaired=false;for(let i=1;i<121;i++){const radius=.2+Math.floor(i/12)*.35,a=i/12*TAU,x=clamp(old.x+Math.cos(a)*radius,1.1,30.9),z=clamp(old.z+Math.sin(a)*radius,1.1,20.9);if(!solidAt(state,x,z,e.radius)){e.x=e.prevX=x;e.z=e.prevZ=z;e.vx=e.vz=0;repaired=true;break;}}if(!repaired){const p=safeSpot(state,e.team,state.entities.indexOf(e)%3);e.x=e.prevX=p.x;e.z=e.prevZ=p.z;e.vx=e.vz=0;}}
    }
    for(const p of state.projectiles){p.duration=p.life;p.arc=false;p.prevX=p.x;p.prevZ=p.z;Object.assign(p,{bounce:0,heal:0,returning:false,back:false,patch:false});}
    return state;
  }
  function migrateV2(value){const state=copy(value);state.version=VERSION;state.arenaData.pads=[];for(const e of state.entities)Object.assign(e,{jump:null,jumpLock:0,airY:0,prevAirY:0});for(const p of state.projectiles)Object.assign(p,{bounce:0,heal:0,returning:false,back:false,patch:false});return state;}
  function validateCurrentSnapshot(v){
    if(v?.version===2){try{return validateCurrentSnapshot(migrateV2(v))}catch{return false;}}
    if(v?.version===1){if(!validateLegacySnapshot(v))return false;try{return validateSnapshot(migrateLegacy(v))}catch{return false;}}
    if(!v||v.version!==VERSION||!Object.hasOwn(modes,v.mode)||!Object.hasOwn(difficulties,v.difficulty)||!['playing','ended'].includes(v.phase)||!Number.isInteger(v.arena)||v.arena<0||v.arena>=arenas.length)return false;
    const number=(n,min,max)=>isFiniteNumber(n,min,max),list=(a,max)=>Array.isArray(a)&&a.length<=max,integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
    if(!integer(v.rng,0,4294967295)||!integer(v.tick,0,20000)||!number(v.elapsed,0,125)||!number(v.accumulator,0,.5)||!integer(v.nextId,1,1000000)||!number(v.ring,0,30)||v.matchLimit!==modes[v.mode].limit||!integer(v.resultCount,0,1)||!['win','loss','draw',null].includes(v.result)||typeof v.endReason!=='string'||v.endReason.length>50)return false;
    if(v.phase==='playing'&&(v.result!==null||v.resultCount!==0)||v.phase==='ended'&&(v.result===null||v.resultCount!==1))return false;
    if(!v.score||!number(v.score.blue,0,100)||!number(v.score.red,0,100)||!number(v.supplyAt,0,140)||!number(v.coreAt,0,140)||!number(v.holdLeft,0,10)||![null,'blue','red'].includes(v.holdTeam)||!number(v.zoneTick,0,.6))return false;
    if(!list(v.entities,8)||v.entities.length!==(v.mode==='last'?8:6)||!list(v.projectiles,180)||!list(v.fields,30)||!list(v.effects,MAX_EFFECTS)||!list(v.events,60)||!list(v.pickups,48)||!v.stats||!['shots','hits','wallHits','deaths','cpuShots','stuck','gadgets','pickups'].every(k=>number(v.stats[k],0,1000000)))return false;
    if(![1,2,3,4].includes(v.layoutVersion))return false;const arena=arenaForLayout(v.arena,v.layoutVersion);if(!v.arenaData||JSON.stringify(v.arenaData.pads)!==JSON.stringify(arena.pads)||!['id','name','subtitle','floor','accent','hazards'].every(k=>v.arenaData[k]===arena[k])||!list(v.arenaData.obstacles,20)||v.arenaData.obstacles.length!==arena.obstacles.length||JSON.stringify(v.arenaData.brush)!==JSON.stringify(arena.brush))return false;
    for(let i=0;i<arena.obstacles.length;i++){const a=arena.obstacles[i],b=v.arenaData.obstacles[i];if(!b||!['id','x','z','w','h','kind','destructible'].every(k=>a[k]===b[k])||!number(b.hp,0,a.hp))return false;}
    const ids=new Set(v.entities.map(e=>e?.id));if(ids.size!==v.entities.length||!ids.has('player'))return false;
    for(const e of v.entities){const f=fighterMap[e?.fighter];if(!f||typeof e.id!=='string'||e.id.length>24||typeof e.team!=='string'||e.team.length>24||typeof e.label!=='string'||e.label.length>60||typeof e.cpu!=='boolean'||typeof e.alive!=='boolean'||!integer(e.power,0,6)||!integer(e.cores,0,20)||!number(e.maxHp,1,300)||!number(e.hp,0,e.maxHp)||Math.abs(e.maxHp-f.hp*(1+e.power*.08))>.001)return false;
      if(!number(e.prevX,0,WIDTH)||!number(e.prevZ,0,HEIGHT)||!number(e.x,0,WIDTH)||!number(e.z,0,HEIGHT)||!number(e.vx,-40,40)||!number(e.vz,-40,40)||!number(e.heading,-20,20)||e.radius!==.62||!integer(e.ammo,0,f.ammo)||!number(e.reload,0,2)||!number(e.shot,0,2)||!number(e.special,0,1)||!number(e.walk,0,10000)||!integer(e.score,0,1000)||!number(e.dashAngle,-20,20)||!number(e.lastCombat,0,v.elapsed+.01))return false;
      if(!number(e.jumpLock,0,2)||!number(e.airY,0,4)||!number(e.prevAirY,0,4))return false;
      if(e.jump!==null){const j=e.jump;if(!j||!e.alive||!number(j.fromX,0,WIDTH)||!number(j.fromZ,0,HEIGHT)||!number(j.toX,0,WIDTH)||!number(j.toZ,0,HEIGHT)||j.duration!==.9||!number(j.time,0,.9)||!number(j.slam,0,50)||!['','launch-blue','launch-red'].includes(j.pad)||solidAt(v,j.toX,j.toZ,e.radius)||Math.hypot(e.x-between(j.fromX,j.toX,j.time/j.duration),e.z-between(j.fromZ,j.toZ,j.time/j.duration))>.001||Math.abs(e.airY-Math.sin(j.time/j.duration*Math.PI)*3.8)>.001)return false;}else if(e.airY!==0)return false;
      if(!list(e.dashHits,8)||!e.dashHits.every(id=>ids.has(id)))return false;
      if(!['recoil','hit','dash','spawn','death','shield','haste','reveal','gadget'].every(k=>number(e[k],0,k==='gadget'?30:8)))return false;
      if(!e.intent||!number(e.intent.x,-1,1)||!number(e.intent.z,-1,1)||!number(e.intent.heading,-20,20)||!number(e.intent.range,.8,14)||!['fire','special','gadget'].every(k=>typeof e.intent[k]==='boolean'))return false;
      if(!e.ai||!list(e.ai.path,180)||!number(e.ai.think,-1,2)||!number(e.ai.stuck,0,4)||!number(e.ai.lastX,0,WIDTH)||!number(e.ai.lastZ,0,HEIGHT)||!['fire','reloading','recover'].every(k=>typeof e.ai[k]==='boolean')||!e.ai.path.every(p=>p&&number(p.x,0,WIDTH)&&number(p.z,0,HEIGHT)))return false;
    }
    const colorSafe=c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c);
    for(const p of v.projectiles)if(!p||!ids.has(p.owner)||typeof p.id!=='string'||typeof p.team!=='string'||!number(p.prevX,-2,WIDTH+2)||!number(p.prevZ,-2,HEIGHT+2)||!number(p.x,-2,WIDTH+2)||!number(p.z,-2,HEIGHT+2)||!number(p.vx,-40,40)||!number(p.vz,-40,40)||!number(p.damage,0,100)||!number(p.life,0,20)||!number(p.duration,.00001,20)||p.life>p.duration||!number(p.radius,.01,2)||!number(p.splash,0,4)||!integer(p.bounce,0,4)||!number(p.heal,0,30)||!['returning','back','patch'].every(k=>typeof p[k]==='boolean')||!integer(p.pierce,0,8)||typeof p.arc!=='boolean'||!colorSafe(p.color)||!list(p.hit,8)||!p.hit.every(id=>ids.has(id)))return false;
    for(const f of v.fields)if(!f||typeof f.id!=='string'||typeof f.team!=='string'||!number(f.x,0,WIDTH)||!number(f.z,0,HEIGHT)||!number(f.radius,.1,8)||!number(f.life,0,8)||!number(f.maxLife,.1,8)||!colorSafe(f.color)||f.kind&&!['turret','mine','repair','smoke','thorns'].includes(f.kind)||f.owner&&!ids.has(f.owner)||f.damage!==undefined&&!number(f.damage,0,100)||f.heal!==undefined&&!number(f.heal,0,30)||f.arm!==undefined&&!number(f.arm,0,1)||f.shot!==undefined&&!number(f.shot,0,2))return false;
    for(const p of v.pickups)if(!p||typeof p.id!=='string'||!['cell','core','repair','haste','charge'].includes(p.kind)||!number(p.x,0,WIDTH)||!number(p.z,0,HEIGHT)||!number(p.life,0,120))return false;
    for(const effect of v.effects)if(!effect||!number(effect.x,-2,WIDTH+2)||!number(effect.z,-2,HEIGHT+2)||!number(effect.life,0,2)||!number(effect.maxLife,.01,2)||!number(effect.radius,0,8)||effect.amount!==undefined&&!number(effect.amount,0,1000)||!colorSafe(effect.color))return false;
    for(const event of v.events)if(!event||!integer(event.id,1,v.nextId)||!number(event.at,0,v.elapsed)||typeof event.type!=='string')return false;
    return true;
  }
  function validateSnapshot(value){try{return validateCurrentSnapshot(value)}catch{return false;}}
  function restore(value){if(!validateSnapshot(value))throw Error('That match backup is incomplete or unsafe.');const state=value.version===1?migrateLegacy(value):value.version===2?migrateV2(value):copy(value);if(!validateSnapshot(state))throw Error('That older match could not be migrated safely.');return state;}
  function runCpuMatch(options){const state=createMatch(Object.assign({},options,{fighter:'spark'}));playerOf(state).cpu=true;for(let i=0;i<4200&&state.phase==='playing';i++)step(state);return state;}
  return { VERSION, STEP, WIDTH, HEIGHT, fighters, fighterMap, arenas, modes, difficulties, gadgets, visibleTo, inBrush, inSmoke, arenaForLayout, createMatch, setIntent, requestFire, quickFire, requestSpecial, requestGadget, tick, step, snapshot, restore, validateSnapshot, runCpuMatch, gridPath, walkableLine, clearLine, solidAt };
});
