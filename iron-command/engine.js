(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.IronEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const VERSION=1,STEP=1/20,LIMIT=36,BOUNDS={x:54,z:42};
const TYPES={
  command:{name:'Command center',hp:2400,r:4.1,cost:0,time:0,power:10,building:true,role:'Headquarters',description:'Your headquarters. Builds utility vehicles.'},
  power:{name:'Fusion reactor',hp:850,r:2.6,cost:400,time:7,power:20,building:true,role:'20 power',description:'Provides 20 power for production and defenses.'},
  refinery:{name:'Supply refinery',hp:1050,r:3,cost:600,time:10,power:-6,building:true,role:'Supply income',description:'Harvesters unload supplies here. Includes one harvester.'},
  factory:{name:'War factory',hp:1300,r:3.8,cost:900,time:12,power:-8,building:true,role:'Vehicle production',description:'Produces Scouts, Lancers, Javelins and Siege crawlers.'},
  barracks:{name:'Field barracks',hp:900,r:2.8,cost:450,time:8,power:-4,building:true,role:'Infantry production',description:'Trains ground troops: riflemen, anti-armor specialists and field medics. Supports a rally point.'},
  rifle:{name:'Vanguard rifleman',hp:145,r:.46,cost:120,time:3,speed:5.7,range:10,damage:14,reload:.5,infantry:true,role:'Anti-infantry',description:'Affordable ground infantry. Automatic rifle excels against foot soldiers; weak against armor. Use in groups to capture the uplink.'},
  lancer:{name:'Pike anti-armor trooper',hp:125,r:.48,cost:220,time:5,speed:4.8,range:17,damage:48,reload:2.4,infantry:true,role:'Anti-armor',description:'Shoulder-fired missiles punish vehicles from range. Vulnerable to riflemen and artillery; screen with infantry.'},
  medic:{name:'Field medic',hp:135,r:.46,cost:180,time:4,speed:5.7,heal:12,range:6,infantry:true,role:'Infantry support',description:'Unarmed support. Restores 12 health per second to nearby wounded infantry, one ally at a time. Escorts allies during attack-move. Cannot repair vehicles or heal itself.'},
  sentry:{name:'Guardian turret',hp:700,r:1.7,cost:500,time:9,power:-4,building:true,range:15,damage:27,reload:.9,role:'Base defense',description:'Automatic base defense. Requires power.'},
  builder:{name:'Constructor',hp:330,r:1,cost:350,time:6,speed:5.4,role:'Base construction',description:'Select, choose a structure, then place it near your base.'},
  harvester:{name:'Harvester',hp:440,r:1.2,cost:450,time:8,speed:4.3,role:'Supply collector',description:'Automatically collects supplies and returns them to a refinery.'},
  scout:{name:'Kestrel scout',hp:240,r:.85,cost:250,time:5,speed:8.3,range:12,damage:13,reload:.45,role:'Fast anti-infantry',description:'Fast wheeled scout. Reaches the uplink quickly and counters exposed infantry.'},
  tank:{name:'Lancer tank',hp:650,r:1.15,cost:450,time:9,speed:5.1,range:15,damage:58,reload:1.6,role:'Frontline armor',description:'Durable frontline armor. Strong against vehicles.'},
  rocket:{name:'Javelin carrier',hp:360,r:1,cost:600,time:10,speed:5.6,range:20,damage:88,reload:2.5,role:'Long-range rockets',description:'Long range guided rockets. Keep behind your tanks.'},
  artillery:{name:'Siege crawler',hp:390,r:1.25,cost:750,time:12,speed:3.8,range:28,damage:130,reload:4.1,splash:3.6,role:'Area siege',description:'Arcing shells with area damage. Excellent against bases.'}
};
const OBSTACLES=[{x:-9,z:-11,r:6},{x:10,z:12,r:6},{x:-25,z:-30,r:5},{x:27,z:30,r:5},{x:47,z:30,r:8}];
const MISSIONS={
  redstone:{name:'Redstone Basin',operation:'First Light',style:'Desert · combined arms',brief:'Open flanks and balanced forces. Build production, contest the central uplink and break the rival headquarters.',biome:'desert',relay:{x:0,z:0},obstacles:OBSTACLES,supply:[[-43,5],[43,-5],[-18,8],[18,-8]]},
  evergreen:{name:'Evergreen Divide',operation:'Timber Spear',style:'Woodland · infantry warfare',brief:'A barracks is ready at deployment. Wooded ridges divide the approaches; lead riflemen through the passes and protect anti-armor teams.',biome:'forest',relay:{x:-4,z:2},obstacles:[{x:-10,z:-12,r:7},{x:12,z:13,r:7},{x:-27,z:-26,r:6},{x:29,z:28,r:6},{x:45,z:20,r:6},{x:1,z:-28,r:5}],supply:[[-45,3],[45,-3],[-22,-3],[22,3]]},
  frostline:{name:'Frostline Bastion',operation:'Cold Hammer',style:'Alpine · armored siege',brief:'A war factory and Siege crawler are ready. Frozen rock fields funnel the assault toward fortified enemy defenses. Escort artillery and flank the turret line.',biome:'snow',relay:{x:6,z:-2},obstacles:[{x:-10,z:-5,r:5},{x:11,z:15,r:6},{x:-31,z:-23,r:6},{x:28,z:29,r:6},{x:44,z:27,r:7},{x:10,z:-31,r:4}],supply:[[-43,4],[43,-4],[-18,11],[20,-9]]}
};
const mission=s=>MISSIONS[s?.mission]||MISSIONS.redstone,obstacles=s=>mission(s).obstacles;
const production=type=>type==='command'?['builder','harvester']:type==='factory'?['scout','tank','rocket','artillery']:type==='barracks'?['rifle','lancer','medic']:[];
const DIFFICULTIES={relaxed:{name:'Relaxed',wave:78,damage:.72},standard:{name:'Standard',wave:55,damage:1},veteran:{name:'Veteran',wave:38,damage:1.15}};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),finite=(n,a,b)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function emit(s,type,data={}){s.events.push({...data,id:++s.eventId,type,time:s.time});if(s.events.length>80)s.events.shift();}
function spawn(s,type,team,x,z,progress=1){const d=TYPES[type],angle=team===0?-Math.PI/4:Math.PI*.75,u={id:s.nextId++,type,team,x,z,hp:d.hp,progress,angle,turret:angle,cooldown:0,order:null,path:[],repath:0,cargo:0,work:0,queue:[],rally:null};s.entities.push(u);if(!d.building)releaseEmbedded(s,u);return u;}
function create(difficulty='standard',missionId='redstone'){
  if(!own(DIFFICULTIES,difficulty))difficulty='standard';
  if(typeof missionId!=='string'||!own(MISSIONS,missionId))missionId='redstone';const level=MISSIONS[missionId];
  const s={version:VERSION,mission:missionId,difficulty,time:0,accumulator:0,phase:'playing',nextId:1,eventId:0,events:[],entities:[],projectiles:[],funds:[2600,1800],gathered:[0,0],kills:[0,0],losses:[0,0],aiClock:0,waveClock:DIFFICULTIES[difficulty].wave,relay:{x:0,z:0,owner:-1,team:-1,progress:0,tick:0},supplies:[{x:-43,z:5,amount:18000},{x:43,z:-5,amount:18000},{x:-18,z:8,amount:12000},{x:18,z:-8,amount:12000}],builtFactory:false};
  for(const [t,k]of [[0,1],[1,-1]]){
    spawn(s,'command',t,-34*k,25*k);spawn(s,'power',t,-44*k,26*k);spawn(s,'refinery',t,-39*k,14*k);
    if(t===1){spawn(s,'factory',t,27,-22);spawn(s,'sentry',t,23,-13);}
    spawn(s,'builder',t,-28*k,24*k);spawn(s,'harvester',t,-43*k,10*k);
    spawn(s,'tank',t,-29*k,13*k);spawn(s,'tank',t,-24*k,17*k);spawn(s,'scout',t,-25*k,7*k);
  }
  s.relay={...s.relay,...level.relay};s.supplies=level.supply.map(([x,z],i)=>({x,z,amount:i<2?18000:12000}));
  for(const [t,k]of [[0,1],[1,-1]]){
    spawn(s,'rifle',t,-21*k,12*k);spawn(s,'rifle',t,-22*k,9*k);spawn(s,'lancer',t,-26*k,3*k);spawn(s,'medic',t,-25*k,12*k);
    if(missionId==='evergreen')spawn(s,'barracks',t,-22*k,28*k);
    if(missionId==='frostline'){
      if(t===0){spawn(s,'factory',t,-22,28);s.builtFactory=true;}spawn(s,'artillery',t,-31*k,5*k);
      spawn(s,'sentry',t,-16*k,28*k);
    }
  }
  return s;
}
const alive=u=>u.hp>0;
const spacing=u=>({scout:1.25,tank:1.7,rocket:1.6,artillery:1.8,builder:1.65,harvester:1.65}[u.type]||TYPES[u.type].r);
function turn(from,to,amount){const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));return from+clamp(delta,-amount,amount);}
function power(s,team){return s.entities.filter(u=>u.team===team&&alive(u)&&u.progress===1).reduce((p,u)=>p+(TYPES[u.type].power||0),0);}
function count(s,team){return s.entities.filter(u=>u.team===team&&alive(u)&&!TYPES[u.type].building).length+s.entities.filter(u=>u.team===team).reduce((n,u)=>n+u.queue.length,0);}
function occupied(s,x,z,r,ignore=0){return Math.abs(x)>BOUNDS.x-r||Math.abs(z)>BOUNDS.z-r||obstacles(s).some(o=>Math.hypot(x-o.x,z-o.z)<r+o.r)||s.entities.some(u=>u.id!==ignore&&alive(u)&&TYPES[u.type].building&&Math.hypot(x-u.x,z-u.z)<r+TYPES[u.type].r+.25);}
// Released saves could contain a vehicle under a building. Recover only those
// embedded actors; preserve their HP, cargo, orders and the rest of the world.
function releaseEmbedded(s,u){
  const radius=TYPES[u.type].r*.65;if(!occupied(s,u.x,u.z,radius,u.id))return;
  for(let r=1;r<=24;r++)for(let k=0;k<32;k++){const a=k/32*Math.PI*2,x=u.x+Math.sin(a)*r,z=u.z+Math.cos(a)*r;
    if(!occupied(s,x,z,radius,u.id)&&!s.entities.some(v=>v.id!==u.id&&!TYPES[v.type].building&&alive(v)&&Math.hypot(v.x-x,v.z-z)<spacing(u)+spacing(v))){u.x=x;u.z=z;u.path=[];u.repath=0;return;}}
}
function placement(s,team,type,x,z){
  if(!own(TYPES,type)||!TYPES[type].building||type==='command'||!finite(x,-54,54)||!finite(z,-42,42))return 'Choose a construction site.';
  if(!s.entities.some(u=>u.team===team&&u.type==='builder'&&alive(u)))return 'A Constructor is required.';
  if(s.entities.filter(u=>u.team===team&&TYPES[u.type].building).length>=30)return 'Base limit reached (30 structures).';
  if(!s.entities.some(u=>u.team===team&&TYPES[u.type].building&&alive(u)&&u.progress===1&&Math.hypot(u.x-x,u.z-z)<19))return 'Build within 19 meters of a completed structure.';
  if(occupied(s,x,z,TYPES[type].r+1))return 'This footprint is blocked. Choose open ground.';
  if(s.entities.some(u=>u.hp>0&&!TYPES[u.type].building&&dist(u,{x,z})<TYPES[type].r+spacing(u)+.4))return 'Move vehicles out of this footprint.';
  if(s.funds[team]<TYPES[type].cost)return 'Insufficient supplies.';
  return '';
}
function build(s,team,type,x,z){if(s.phase!=='playing')return false;const reason=placement(s,team,type,x,z);if(reason)return false;s.funds[team]-=TYPES[type].cost;const u=spawn(s,type,team,x,z,.01);emit(s,'construction',{id:u.id,team,x,z});return u.id;}
function train(s,id,type){
  const b=s.entities.find(u=>u.id===id&&alive(u)),d=own(TYPES,type)&&TYPES[type];
  if(s.phase!=='playing'||!b||!d||b.progress!==1||b.queue.length>=5||count(s,b.team)>=LIMIT||s.funds[b.team]<d.cost)return false;
  if(!production(b.type).includes(type))return false;
  s.funds[b.team]-=d.cost;b.queue.push({type,remaining:d.time});emit(s,'queued',{team:b.team,type});return true;
}
function cancelQueue(s,id){const b=s.entities.find(u=>u.id===id);if(!b||!b.queue.length)return false;const q=b.queue.pop();s.funds[b.team]+=TYPES[q.type].cost;return true;}
function setRally(s,id,x,z){const f=s.entities.find(u=>u.id===id&&alive(u)&&['factory','barracks'].includes(u.type)&&u.progress===1);if(s.phase!=='playing'||!f||!finite(x,-51,51)||!finite(z,-39,39)||occupied(s,x,z,1.25))return false;f.rally={x,z};return true;}
// Grid A* routes around terrain and structure footprints. The endpoint is
// snapped to reachable open ground, including when an attack targets a base.
function path(s,u,target){
  const cell=2,w=55,h=43,toCell=p=>({x:clamp(Math.round((p.x+54)/cell),0,w-1),z:clamp(Math.round((p.z+42)/cell),0,h-1)}),world=(x,z)=>({x:x*cell-54,z:z*cell-42});
  const start=toCell(u),goal=toCell(target),key=(x,z)=>z*w+x,blocked=(x,z)=>occupied(s,x*cell-54,z*cell-42,TYPES[u.type].r*.8,u.id);
  let end=null;
  for(let r=0;r<12&&!end;r++){let best=Infinity;for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){if(r&&Math.abs(dx)!==r&&Math.abs(dz)!==r)continue;const x=goal.x+dx,z=goal.z+dz;if(x<0||z<0||x>=w||z>=h||blocked(x,z))continue;const d=(x-start.x)**2+(z-start.z)**2;if(d<best){best=d;end={x,z};}}}
  if(!end)return [];
  const startKey=key(start.x,start.z),goalKey=key(end.x,end.z),open=[startKey],came=new Int32Array(w*h).fill(-1),cost=new Float64Array(w*h).fill(Infinity),closed=new Uint8Array(w*h);cost[startKey]=0;
  let iterations=0;
  while(open.length&&iterations++<w*h){let at=0,score=Infinity;for(let i=0;i<open.length;i++){const k=open[i],v=cost[k]+Math.hypot(k%w-end.x,Math.floor(k/w)-end.z);if(v<score){at=i;score=v;}}const cur=open.splice(at,1)[0];if(cur===goalKey){const out=[];let k=cur;while(k!==startKey&&k>=0){out.push(world(k%w,Math.floor(k/w)));k=came[k];}return out.reverse();}closed[cur]=1;const cx=cur%w,cz=Math.floor(cur/w);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const x=cx+dx,z=cz+dz;if(x<0||z<0||x>=w||z>=h)continue;const k=key(x,z);if(closed[k]||blocked(x,z)||dx&&dz&&(blocked(cx+dx,cz)||blocked(cx,cz+dz)))continue;const g=cost[cur]+(dx&&dz?Math.SQRT2:1);if(g<cost[k]){cost[k]=g;came[k]=cur;if(!open.includes(k))open.push(k);}}}
  return [];
}
function issue(s,team,ids,x,z,mode='move',target=0){
  if(s.phase!=='playing'||!finite(x,-54,54)||!finite(z,-42,42)||!['move','attack','attackMove','stop'].includes(mode))return false;
  const units=s.entities.filter(u=>u.team===team&&alive(u)&&ids.includes(u.id)&&!TYPES[u.type].building),enemy=s.entities.find(u=>u.id===target&&u.team!==team&&alive(u));
  units.forEach((u,i)=>{if(mode==='stop'){u.order={mode:'hold',x:u.x,z:u.z,target:0};u.path=[];return;}const offset=units.length>1&&mode!=='attack'?{x:(i%5-Math.min(4,units.length-1)/2)*2.6,z:Math.floor(i/5)*2.6}: {x:0,z:0};u.order={mode,x:clamp(x+offset.x,-51,51),z:clamp(z+offset.z,-39,39),target:enemy?.id||0};u.path=[];u.repath=0;});return units.length>0;
}
function move(s,u,goal,dt){
  if(dist(u,goal)<1.2)return true;
  u.repath-=dt;if(u.repath<=0||!u.path.length){u.path=path(s,u,goal);u.repath=2;}
  if(!u.path.length)return false;const p=u.path[0],d=dist(u,p),speed=TYPES[u.type].speed*dt;
  if(d>.05)u.angle=turn(u.angle,Math.atan2(p.x-u.x,p.z-u.z),dt*5);
  if(d<=speed){u.x=p.x;u.z=p.z;u.path.shift();}else{const nx=u.x+(p.x-u.x)/d*speed,nz=u.z+(p.z-u.z)/d*speed;if(!occupied(s,nx,nz,TYPES[u.type].r*.65,u.id)){u.x=nx;u.z=nz;}else{u.path=[];u.repath=0;}}
  return dist(u,goal)<1.5;
}
function hit(s,target,damage,team){if(!target||!alive(target))return;target.hp-=damage;emit(s,'damage',{entityId:target.id,unitType:target.type,team:target.team,x:target.x,z:target.z});if(target.hp<=0){target.hp=0;s.kills[team]++;s.losses[target.team]++;emit(s,'destroy',{x:target.x,z:target.z,unitType:target.type,team:target.team});}}
function damageAgainst(kind,target){const d=TYPES[target];return kind==='rifle'?(d.infantry?1.6:d.building?.4:.3):kind==='lancer'?(d.infantry?.35:d.building?1:1.7):kind==='tank'&&d.infantry?.65:kind==='scout'&&d.infantry?1.35:1;}
function shoot(s,u,target){const d=TYPES[u.type];u.cooldown=d.reload;u.turret=Math.atan2(target.x-u.x,target.z-u.z);s.projectiles.push({x:u.x,z:u.z,fromX:u.x,fromZ:u.z,toX:target.x,toZ:target.z,target:target.id,team:u.team,damage:d.damage*(u.team===1?DIFFICULTIES[s.difficulty].damage:1),splash:d.splash||0,kind:u.type,elapsed:0,duration:Math.max(.15,dist(u,target)/(u.type==='artillery'?24:u.type==='rocket'?34:65))});emit(s,'shot',{entityId:u.id,x:u.x,z:u.z,angle:u.turret,kind:u.type,team:u.team});}
function harvest(s,u,dt){
  const bases=s.entities.filter(b=>b.team===u.team&&b.type==='refinery'&&b.progress===1&&alive(b));if(!bases.length)return;
  const home=bases.reduce((a,b)=>dist(u,a)<dist(u,b)?a:b);
  if(u.cargo>=180||u.cargo>0&&!s.supplies.some(n=>n.amount>0)){
    const goal={x:home.x,z:home.z+(u.team===0?-5:5)};if(dist(u,goal)<2){s.funds[u.team]+=u.cargo;s.gathered[u.team]+=u.cargo;emit(s,'income',{team:u.team,amount:u.cargo,x:u.x,z:u.z});u.cargo=0;u.work=0;}else move(s,u,goal,dt);
  }else{
    const nodes=s.supplies.filter(n=>n.amount>0);if(!nodes.length)return;const node=nodes.reduce((a,b)=>dist(home,a)<dist(home,b)?a:b),goal={x:node.x,z:node.z};if(dist(u,goal)<2.5){const amount=Math.min(node.amount,36*dt,180-u.cargo);node.amount-=amount;u.cargo+=amount;u.work+=dt;}else move(s,u,goal,dt);
  }
}
function ai(s,dt){
  s.aiClock-=dt;s.waveClock-=dt;if(s.aiClock<=0){s.aiClock=2;const base=s.entities.find(u=>u.team===1&&u.type==='command');if(!base)return;const factories=s.entities.filter(u=>u.team===1&&u.type==='factory'&&u.progress===1);if(!factories.length&&!s.entities.some(u=>u.team===1&&u.type==='factory'))build(s,1,'factory',27,-22);
    if(power(s,1)<0&&!s.entities.some(u=>u.team===1&&u.progress<1))for(const p of [[44,-26],[43,-34],[19,-30]])if(build(s,1,'power',...p))break;
    if(!s.entities.some(u=>u.team===1&&u.type==='harvester')&&base.queue.length<1)train(s,base.id,'harvester');
    if(s.mission&&!s.entities.some(u=>u.team===1&&u.type==='barracks'))build(s,1,'barracks',36,-35);
    for(const b of s.entities.filter(u=>u.team===1&&u.type==='barracks'&&u.progress===1))if(b.queue.length<2)train(s,b.id,s.time%30>22?'medic':s.time%20>12?'lancer':'rifle');
    for(const f of factories)if(f.queue.length<2)train(s,f.id,s.time%70>48?'rocket':s.time%40>30?'scout':'tank');
  }
  if(s.waveClock<=0){s.waveClock=DIFFICULTIES[s.difficulty].wave;const units=s.entities.filter(u=>u.team===1&&(TYPES[u.type].damage||TYPES[u.type].heal)&&!TYPES[u.type].building);const hq=s.entities.find(u=>u.team===0&&u.type==='command');if(hq)issue(s,1,units.map(u=>u.id),hq.x,hq.z,'attackMove');emit(s,'wave',{team:1});}
}
function tick(s,dt){
  s.time+=dt;s.events=s.events.filter(e=>e.id>s.eventId-60);ai(s,dt);
  for(const u of s.entities){if(!alive(u))continue;const d=TYPES[u.type];
    if(u.progress<1){if(s.entities.some(b=>b.team===u.team&&b.type==='builder'&&alive(b))){u.progress=Math.min(1,u.progress+dt/d.time);if(u.progress===1){if(u.type==='refinery'&&count(s,u.team)<LIMIT)spawn(s,'harvester',u.team,u.x+(u.team===0?-5:5),u.z);if(u.type==='factory'&&u.team===0)s.builtFactory=true;emit(s,'complete',{type:u.type,team:u.team,x:u.x,z:u.z});}}continue;}
    const powered=power(s,u.team)>=0;
    if(u.queue.length&&(powered||u.type==='command')){const q=u.queue[0];q.remaining=Math.max(0,q.remaining-dt);if(q.remaining<=0){let spot=null;for(let r=d.r+2;r<d.r+9&&!spot;r+=2)for(let k=0;k<12;k++){const a=k/12*Math.PI*2,x=u.x+Math.sin(a)*r,z=u.z+Math.cos(a)*r;if(!occupied(s,x,z,TYPES[q.type].r)&&!s.entities.some(v=>!TYPES[v.type].building&&Math.hypot(v.x-x,v.z-z)<spacing(v)+spacing({type:q.type}))){spot={x,z};break;}}if(spot){const unit=spawn(s,q.type,u.team,spot.x,spot.z);u.queue.shift();if(u.rally)issue(s,u.team,[unit.id],u.rally.x,u.rally.z,'attackMove');emit(s,'complete',{unitType:q.type,team:u.team,x:unit.x,z:unit.z});}}}
    if(d.building&&!d.damage)continue;
    if(u.type==='harvester'&&!u.order){harvest(s,u,dt);continue;}
    u.cooldown=Math.max(0,u.cooldown-dt);
    if(d.heal){const allies=s.entities.filter(v=>v.id!==u.id&&v.team===u.team&&alive(v)&&TYPES[v.type].infantry&&v.hp<TYPES[v.type].hp&&dist(u,v)<=d.range);if(allies.length){const ally=allies.reduce((a,b)=>a.hp/TYPES[a.type].hp<b.hp/TYPES[b.type].hp?a:b);ally.hp=Math.min(TYPES[ally.type].hp,ally.hp+d.heal*dt);u.turret=Math.atan2(ally.x-u.x,ally.z-u.z);}}

    const ordered=u.order?.target?s.entities.find(v=>v.id===u.order.target&&alive(v)):null;
    if(u.order?.target&&!ordered){u.order=null;u.path=[];}
    let enemy=null;
    if(d.damage&&(powered||!d.building)){
      const enemies=s.entities.filter(v=>v.team!==u.team&&alive(v)&&dist(u,v)<=d.range+TYPES[v.type].r*.65);
      if(ordered&&enemies.includes(ordered))enemy=ordered;else if(enemies.length&&(u.order?.mode!=='move'))enemy=enemies.reduce((a,b)=>(dist(u,a)+(TYPES[a.type].building?3:0))<(dist(u,b)+(TYPES[b.type].building?3:0))?a:b);
      if(enemy){u.turret=Math.atan2(enemy.x-u.x,enemy.z-u.z);if(u.cooldown===0)shoot(s,u,enemy);}
    }
    // On an assault, unarmed medics escort the advancing line instead of
    // running into hostile headquarters. Direct Move still obeys the player.
    if(d.heal&&u.order?.mode==='attackMove'){
      const line=s.entities.filter(v=>v.team===u.team&&alive(v)&&TYPES[v.type].damage&&!TYPES[v.type].building&&dist(u,v)<18);
      if(line.length){const wounded=line.filter(v=>TYPES[v.type].infantry&&v.hp<TYPES[v.type].hp),escort=(wounded.length?wounded:line).reduce((a,b)=>dist(a,u.order)<dist(b,u.order)?a:b);if(dist(u,escort)>4)move(s,u,escort,dt);u.turret=Math.atan2(escort.x-u.x,escort.z-u.z);continue;}
    }
    if(!d.building&&!enemy&&u.order&&u.order.mode!=='hold'){const goal=ordered||u.order;if(move(s,u,goal,dt)&&!ordered){u.order=null;u.path=[];}u.turret=u.angle;}
  }
  // Soft collision keeps vehicles readable and prevents whole armies occupying
  // a single firing point. Corrections respect the same terrain footprints.
  const mobile=s.entities.filter(u=>alive(u)&&!TYPES[u.type].building);
  for(let i=0;i<mobile.length;i++)for(let j=i+1;j<mobile.length;j++){
    const a=mobile[i],b=mobile[j],r=spacing(a)+spacing(b),d=dist(a,b);if(d>=r)continue;
    const theta=(a.id*3.1+b.id*1.7),nx=d>.001?(a.x-b.x)/d:Math.cos(theta),nz=d>.001?(a.z-b.z)/d:Math.sin(theta),push=Math.min(.25,(r-d)*.5+.01);
    for(const [u,sign]of [[a,1],[b,-1]]){const x=u.x+nx*push*sign,z=u.z+nz*push*sign;if(!occupied(s,x,z,TYPES[u.type].r*.65,u.id)){u.x=x;u.z=z;}}
  }
  for(const p of s.projectiles){p.elapsed+=dt;const target=s.entities.find(u=>u.id===p.target&&alive(u));if(target&&['rocket','lancer'].includes(p.kind)){p.toX=target.x;p.toZ=target.z;}const f=clamp(p.elapsed/p.duration,0,1);p.x=p.fromX+(p.toX-p.fromX)*f;p.z=p.fromZ+(p.toZ-p.fromZ)*f;if(f>=1){if(p.splash){for(const u of s.entities)if(u.team!==p.team&&dist(u,{x:p.toX,z:p.toZ})<p.splash+TYPES[u.type].r)hit(s,u,p.damage*damageAgainst(p.kind,u.type)*(1-clamp(dist(u,{x:p.toX,z:p.toZ})/(p.splash+TYPES[u.type].r),0,.7)),p.team);}else if(target)hit(s,target,p.damage*damageAgainst(p.kind,target.type),p.team);emit(s,'impact',{x:p.toX,z:p.toZ,kind:p.kind});}}
  s.projectiles=s.projectiles.filter(p=>p.elapsed<p.duration);s.entities=s.entities.filter(alive);
  const r=s.relay,near=[0,1].map(team=>s.entities.some(u=>u.team===team&&!TYPES[u.type].building&&TYPES[u.type].damage&&dist(u,r)<6));
  if(near[0]!==near[1]){const t=near[0]?0:1;if(r.owner!==t){if(r.team!==t){r.team=t;r.progress=0;}r.progress=Math.min(1,r.progress+dt/6);if(r.progress===1){r.owner=t;emit(s,'capture',{team:t,x:r.x,z:r.z});}}}else if(!near[0]&&!near[1])r.progress=Math.max(0,r.progress-dt/12);
  if(r.owner>=0){r.tick+=dt;if(r.tick>=2){r.tick-=2;s.funds[r.owner]+=35;s.gathered[r.owner]+=35;}}
  for(const team of [0,1])if(!s.entities.some(u=>u.team===team&&u.type==='command')){s.phase=team===0?'defeat':'victory';emit(s,'result',{phase:s.phase});break;}
}
function advance(s,seconds){if(s.phase!=='playing'||!finite(seconds,0,10))return;s.accumulator+=seconds;let n=0;while(s.accumulator+1e-9>=STEP&&n++<200&&s.phase==='playing'){s.accumulator=Math.max(0,s.accumulator-STEP);tick(s,STEP);}}
function snapshot(s){return JSON.parse(JSON.stringify({...s,events:[],entities:s.entities.map(u=>({...u,path:[],repath:0}))}));}
function valid(s){
  try{
    if(!s||(s.mission!==undefined&&(typeof s.mission!=='string'||!own(MISSIONS,s.mission)))||s.version!==VERSION||!own(DIFFICULTIES,s.difficulty)||!['playing','victory','defeat'].includes(s.phase)||!finite(s.time,0,1e8)||!finite(s.accumulator,0,10)||!Number.isSafeInteger(s.nextId)||s.nextId<1||s.nextId>1e9||!Number.isSafeInteger(s.eventId)||s.eventId<0||!finite(s.aiClock,-1,5)||!finite(s.waveClock,-1,100)||typeof s.builtFactory!=='boolean')return false;
    for(const key of ['funds','gathered','kills','losses'])if(!Array.isArray(s[key])||s[key].length!==2||!s[key].every(n=>finite(n,0,1e10)))return false;
    if(!Array.isArray(s.entities)||s.entities.length>180||!Array.isArray(s.projectiles)||s.projectiles.length>200||!Array.isArray(s.events)||s.events.length>80)return false;
    const ids=new Set();const point=p=>p&&finite(p.x,-54,54)&&finite(p.z,-42,42);
    for(const u of s.entities){if(!u||!own(TYPES,u.type)||![0,1].includes(u.team)||!Number.isInteger(u.id)||u.id<1||u.id>=s.nextId||ids.has(u.id)||!point(u)||!finite(u.hp,.001,TYPES[u.type].hp)||!finite(u.progress,.001,1)||!finite(u.angle,-1e6,1e6)||!finite(u.turret,-1e6,1e6)||!finite(u.cooldown,0,10)||!finite(u.repath,-1,5)||!finite(u.cargo,0,180.01)||!finite(u.work,0,1e8)||!Array.isArray(u.path)||u.path.length>2400||!u.path.every(point)||!Array.isArray(u.queue)||u.queue.length>5)return false;ids.add(u.id);
      const allowed=production(u.type);
      if(!u.queue.every(q=>q&&allowed.includes(q.type)&&finite(q.remaining,-1,TYPES[q.type].time)))return false;
      if(u.rally!==null&&!point(u.rally))return false;
      if(u.order!==null&&(!point(u.order)||!['move','attack','attackMove','hold'].includes(u.order.mode)||!Number.isInteger(u.order.target)||u.order.target<0||u.order.target>=s.nextId))return false;
    }
    for(const p of s.projectiles)if(!p||!own(TYPES,p.kind)||!TYPES[p.kind].damage||![0,1].includes(p.team)||!point(p)||!finite(p.fromX,-54,54)||!finite(p.fromZ,-42,42)||!finite(p.toX,-54,54)||!finite(p.toZ,-42,42)||!Number.isInteger(p.target)||p.target<1||p.target>=s.nextId||!finite(p.damage,0,200)||!finite(p.splash,0,4)||!finite(p.duration,.1,10)||!finite(p.elapsed,0,p.duration))return false;
    if(!Array.isArray(s.supplies)||s.supplies.length!==4||!s.supplies.every((n,i)=>point(n)&&finite(n.amount,0,i<2?18000:12000)&&n.x===mission(s).supply[i][0]&&n.z===mission(s).supply[i][1]))return false;
    if(!s.relay||s.relay.x!==mission(s).relay.x||s.relay.z!==mission(s).relay.z||![-1,0,1].includes(s.relay.owner)||![-1,0,1].includes(s.relay.team)||!finite(s.relay.progress,0,1)||!finite(s.relay.tick,0,2.1))return false;
    if(s.phase==='playing'&&![0,1].every(t=>s.entities.some(u=>u.type==='command'&&u.team===t)))return false;
    return true;
  }catch{return false;}
}
function restore(value){if(!valid(value))return null;const s=JSON.parse(JSON.stringify(value));s.events=[];for(const u of s.entities)if(!TYPES[u.type].building)releaseEmbedded(s,u);return s;}
return {VERSION,STEP,LIMIT,BOUNDS,TYPES,OBSTACLES,MISSIONS,mission,obstacles,production,damageAgainst,DIFFICULTIES,create,advance,build,placement,train,cancelQueue,setRally,issue,power,count,occupied,path,snapshot,restore,valid,dist,spacing};
});
