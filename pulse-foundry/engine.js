(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseFoundryEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STEP=1/120,MAX_BACKLOG=.25,FLOOR=0,CEILING=6;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const copy=v=>JSON.parse(JSON.stringify(v));
  function rngNext(state){let x=state.rng>>>0||0x9e3779b9;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x>>>0;return state.rng/4294967296;}
  const themes=[
    {name:'Ignition Walk',bpm:112,sky:'#132441',floor:'#415b6d',accent:'#56f0d0',hot:'#ffb85c',blurb:'Learn the jump pulse.'},
    {name:'Copper Cadence',bpm:120,sky:'#25213d',floor:'#745242',accent:'#68d8ff',hot:'#ff8b62',blurb:'Hold a little longer.'},
    {name:'Aerial Press',bpm:126,sky:'#122f3b',floor:'#3d6970',accent:'#ffe56d',hot:'#fb6d8d',blurb:'Hold to lift the glider.'},
    {name:'Polarity Hall',bpm:132,sky:'#251a45',floor:'#5b4b79',accent:'#83f5c9',hot:'#f6a6ff',blurb:'Run the ceiling line.'},
    {name:'Prism Kiln',bpm:140,sky:'#30213a',floor:'#765250',accent:'#7cf1ff',hot:'#ffcc63',blurb:'Switch forms on the beat.'},
    {name:'Crown Dynamo',bpm:148,sky:'#15233d',floor:'#4a607a',accent:'#ffdf73',hot:'#ff718f',blurb:'Master the whole foundry.'}
  ];
  function spikes(list,start,count,gap,side){for(let i=0;i<count;i++)list.push({type:'spike',x:start+i*gap,w:.72,h:.72,side:side||'floor'});}
  function block(list,x,w,h,side){list.push({type:'block',x,w:w||.85,h:h||1.1,side:side||'floor'});}
  function gate(list,x,center,gap){list.push({type:'gate',x,w:.72,center,gap});}
  function buildLevel(index){
    const t=themes[index],o=[],sections=[{x:0,mode:'run',gravity:1,label:'RUN'}],checkpoints=[];let length=92;
    if(index===0){spikes(o,12,2,3.5);block(o,22,1,1);spikes(o,33,3,2.2);block(o,45,1.15,1.35);spikes(o,53,2,2.5);block(o,65,.9,1.05);spikes(o,77,4,1.45);checkpoints.push(40,72);length=98;}
    if(index===1){spikes(o,10,3,2.2);block(o,21,1.25,1.45);spikes(o,32,2,2.4);block(o,43,1.4,1.8);spikes(o,53,4,1.55);block(o,66,1.2,1.5);spikes(o,79,5,1.1);checkpoints.push(39,75);length=105;}
    if(index===2){spikes(o,9,2,3);sections.push({x:25,mode:'flight',gravity:1,label:'GLIDE'});for(const g of [[31,2.0,2.35],[38,3.8,2.15],[45,2.6,1.95],[52,4.0,1.9],[59,2.1,1.85],[66,3.4,1.8]])gate(o,...g);sections.push({x:72,mode:'run',gravity:1,label:'LAND'});spikes(o,79,4,2.35);checkpoints.push(24,72);length=94;}
    if(index===3){spikes(o,9,3,2.2);sections.push({x:27,mode:'run',gravity:-1,label:'FLIP'});spikes(o,34,4,1.3,'ceiling');block(o,46,1.1,1.35,'ceiling');spikes(o,54,4,1.3,'ceiling');sections.push({x:68,mode:'run',gravity:1,label:'DOWN'});spikes(o,75,5,1.25);checkpoints.push(26,68);length=96;}
    if(index===4){spikes(o,8,3,2.45);sections.push({x:24,mode:'flight',gravity:1,label:'GLIDE'});for(const g of [[30,1.9,2],[36,4.1,1.85],[42,2.4,1.75],[48,3.8,1.7]])gate(o,...g);sections.push({x:55,mode:'run',gravity:-1,label:'FLIP'});spikes(o,61,4,2.1,'ceiling');block(o,72,1.1,1.45,'ceiling');sections.push({x:79,mode:'run',gravity:1,label:'DROP'});spikes(o,84,4,1.75);checkpoints.push(23,54,79);length=98;}
    if(index===5){spikes(o,7,4,1.65);block(o,18,1.2,1.55);sections.push({x:27,mode:'flight',gravity:1,label:'GLIDE'});for(const g of [[33,2,1.9],[39,4,1.75],[45,2.25,1.65],[51,3.7,1.6]])gate(o,...g);sections.push({x:58,mode:'run',gravity:-1,label:'FLIP'});spikes(o,63,5,1.2,'ceiling');block(o,75,1,1.4,'ceiling');sections.push({x:82,mode:'run',gravity:1,label:'DROP'});spikes(o,87,5,1.2);block(o,98,1,1.5);spikes(o,104,3,1.35);checkpoints.push(26,57,82);length=114;}
    return{id:index,name:t.name,bpm:t.bpm,theme:t,obstacles:o.sort((a,b)=>a.x-b.x),sections,length,checkpoints};
  }
  const levels=themes.map((_,i)=>buildLevel(i));
  function sectionAt(level,x){let out=level.sections[0];for(const s of level.sections){if(s.x<=x+.0001)out=s;else break;}return out;}
  function makeActor(id,kind,difficulty,palette){return{id,kind,difficulty:difficulty||'human',palette,x:0,y:.44,vy:0,w:.55,h:.72,held:false,press:false,buffer:0,holdTime:0,grounded:true,mode:'run',gravity:1,alive:true,finished:false,finishTime:null,deaths:0,retryTimer:0,sectionIndex:0,trail:[]};}
  function makeMatch(options){options=options||{};const level=levels[clamp(options.level|0,0,levels.length-1)],practice=!!options.practice,rivals=options.rivals===false?0:clamp(options.rivalCount==null?2:options.rivalCount|0,0,3),difficulties=['steady','sharp','ace'];const actors=[makeActor('player','player','human','#5ef2d1')];for(let i=0;i<rivals;i++)actors.push(makeActor('cpu-'+(i+1),'cpu',options.difficulty||difficulties[i]||'sharp',['#ffb55c','#8eb6ff','#f58de0'][i]));return{version:1,level:level.id,practice,phase:'playing',elapsed:0,attempt:1,checkpoint:0,checkpointState:null,actors,rng:(options.seed>>>0)||((level.id+1)*2654435761>>>0),events:[],accumulator:0,result:null,bestPercent:0};}
  function emit(m,type,data){m.events.push(Object.assign({type,time:m.elapsed},data||{}));if(m.events.length>48)m.events.shift();}
  function setSection(actor,level){const current=sectionAt(level,actor.x);if(actor.mode===current.mode&&actor.gravity===current.gravity)return;actor.mode=current.mode;actor.gravity=current.gravity;if(current.mode==='flight'){actor.y=clamp(actor.y,1,5);actor.vy=0;actor.grounded=false;}else{actor.y=current.gravity===1?.44:CEILING-.44;actor.vy=0;actor.grounded=true;}emit;
  }
  function supportY(actor){return actor.gravity===1?.44:CEILING-.44;}
  function inputActor(actor,input){actor.held=!!input.held;if(input.pressed){actor.press=true;actor.buffer=.115;}}
  function recommendedInput(match,actor){
    const level=levels[match.level],baseReaction={steady:3.9,sharp:4.25,ace:4.55}[actor.difficulty]||4.55,reaction=baseReaction+Math.min(.72,actor.deaths*.14),section=sectionAt(level,actor.x+.15);
    if(section.mode==='flight'){
      const next=level.obstacles.find(o=>o.type==='gate'&&o.x>actor.x+1),target=next?next.center:3,predicted=actor.y+actor.vy*(actor.difficulty==='steady'?.16:.24);
      return{held:predicted<target,pressed:false};
    }
    if(!actor.grounded)return{held:actor.holdTime<.24,pressed:false};
    const side=section.gravity===1?'floor':'ceiling',next=level.obstacles.find(o=>o.type!=='gate'&&o.side===side&&o.x+o.w*.5>actor.x);
    const distance=next?next.x-next.w*.5-(actor.x+actor.w*.5):99,need=distance<reaction&&distance>-.4;
    return{held:need,pressed:need};
  }
  function obstacleHit(actor,o){
    const ax0=actor.x-actor.w*.46,ax1=actor.x+actor.w*.46,ox0=o.x-o.w*.5,ox1=o.x+o.w*.5;if(ax1<ox0||ax0>ox1)return false;
    if(o.type==='gate')return actor.y-actor.h*.42<o.center-o.gap*.5||actor.y+actor.h*.42>o.center+o.gap*.5;
    const height=o.type==='spike'?o.h*(1-clamp(Math.abs(actor.x-o.x)/(o.w*.72),0,1)):o.h;
    if(o.side==='ceiling')return actor.y+actor.h*.43>CEILING-height;
    return actor.y-actor.h*.43<height;
  }
  function kill(match,actor,cause){if(!actor.alive||actor.finished)return;actor.alive=false;actor.held=false;actor.press=false;actor.retryTimer=.52;actor.deaths++;emit(match,'crash',{actor:actor.id,cause,x:actor.x});if(actor.kind==='player'){match.bestPercent=Math.max(match.bestPercent,Math.min(99,Math.floor(actor.x/levels[match.level].length*100)));match.phase='dead';match.result={kind:'failure',cause,percent:match.bestPercent};}}
  function resetActor(actor,x,level){const section=sectionAt(level,x);actor.x=x;actor.mode=section.mode;actor.gravity=section.gravity;actor.y=section.mode==='flight'?3:supportY(actor);actor.vy=0;actor.alive=true;actor.finished=false;actor.finishTime=null;actor.held=false;actor.press=false;actor.buffer=0;actor.holdTime=0;actor.grounded=section.mode==='run';actor.trail=[];}
  function updateActor(match,actor,input,dt){
    const level=levels[match.level];if(actor.finished)return;if(!actor.alive){if(actor.kind==='cpu'){actor.retryTimer-=dt;if(actor.retryTimer<=0)resetActor(actor,0,level);}return;}
    setSection(actor,level);inputActor(actor,input||{held:false,pressed:false});actor.buffer=Math.max(0,actor.buffer-dt);actor.x+=8*dt;
    if(actor.mode==='flight'){
      actor.vy+=(actor.held?13.5:-13.5)*dt;actor.vy*=Math.pow(.985,dt*120);actor.vy=clamp(actor.vy,-5.8,5.8);actor.y+=actor.vy*dt;
      if(actor.y<.42||actor.y>CEILING-.42)return kill(match,actor,'foundry wall');
    }else{
      if(actor.buffer>0&&actor.grounded){actor.vy=actor.gravity===1?10.2:-10.2;actor.grounded=false;actor.buffer=0;actor.holdTime=0;emit(match,'jump',{actor:actor.id,x:actor.x});}
      actor.holdTime+=dt;const rising=Math.sign(actor.vy)===(actor.gravity===1?1:-1),soften=(actor.held&&actor.holdTime<.24&&rising)?0.52:1;
      actor.vy+=-actor.gravity*18*soften*dt;actor.y+=actor.vy*dt;const support=supportY(actor);
      if(actor.gravity===1&&actor.y<=support){actor.y=support;actor.vy=0;actor.grounded=true;}else if(actor.gravity===-1&&actor.y>=support){actor.y=support;actor.vy=0;actor.grounded=true;}
    }
    for(const o of level.obstacles){if(o.x<actor.x-1.2)continue;if(o.x>actor.x+1.2)break;if(obstacleHit(actor,o))return kill(match,actor,o.type==='spike'?'spark spike':o.type==='gate'?'press gate':'machine block');}
    actor.trail.push({x:actor.x,y:actor.y});if(actor.trail.length>80)actor.trail.shift();
    if(actor.x>=level.length){actor.x=level.length;actor.finished=true;actor.finishTime=match.elapsed;emit(match,'finish',{actor:actor.id,time:match.elapsed});if(actor.kind==='player'){match.bestPercent=100;match.phase='finished';match.result={kind:'completion',time:match.elapsed,practice:match.practice,place:1+match.actors.filter(a=>a.kind==='cpu'&&a.finished&&a.finishTime<=match.elapsed).length};}}
  }
  function step(match,humanInput,dt){if(!match||match.phase!=='playing')return match;dt=dt==null?STEP:dt;match.elapsed+=dt;for(const actor of match.actors){const input=actor.kind==='cpu'?recommendedInput(match,actor):humanInput||{held:false,pressed:false};updateActor(match,actor,input,dt);}const player=match.actors[0],level=levels[match.level];if(match.practice&&player.alive){for(const cp of level.checkpoints){if(cp>match.checkpoint&&player.x>=cp){match.checkpoint=cp;match.checkpointState={x:cp};emit(match,'checkpoint',{x:cp});}}}return match;}
  function advance(match,input,delta){if(!match||match.phase!=='playing')return match;match.accumulator=Math.min(MAX_BACKLOG,match.accumulator+Math.max(0,Number(delta)||0));let first=!!input?.pressed;while(match.accumulator>=STEP){step(match,{held:!!input?.held,pressed:first},STEP);first=false;match.accumulator-=STEP;if(match.phase!=='playing')break;}return match;}
  function restart(match){const level=levels[match.level],player=match.actors[0],start=match.practice&&match.checkpointState?match.checkpointState.x:0;match.phase='playing';match.result=null;match.attempt++;resetActor(player,start,level);for(const cpu of match.actors.slice(1))resetActor(cpu,0,level);match.accumulator=0;emit(match,'restart',{x:start,practice:match.practice});return match;}
  function pauseSnapshot(match){return copy(match);}
  function validateMatch(m){
    if(!m||m.version!==1||!Number.isInteger(m.level)||m.level<0||m.level>=levels.length||!['playing','dead','finished'].includes(m.phase)||typeof m.practice!=='boolean'||!Number.isFinite(m.elapsed)||m.elapsed<0||m.elapsed>3600||!Number.isInteger(m.attempt)||m.attempt<1||m.attempt>100000||!Number.isFinite(m.checkpoint)||m.checkpoint<0||m.checkpoint>levels[m.level].length||!Number.isInteger(m.rng)||m.rng<0||m.rng>4294967295||!Number.isFinite(m.accumulator)||m.accumulator<0||m.accumulator>MAX_BACKLOG+.001||!Number.isInteger(m.bestPercent)||m.bestPercent<0||m.bestPercent>100||!Array.isArray(m.actors)||m.actors.length<1||m.actors.length>4||!Array.isArray(m.events)||m.events.length>48)return false;
    if(m.checkpointState!==null&&(!m.checkpointState||!Number.isFinite(m.checkpointState.x)||m.checkpointState.x<0||m.checkpointState.x>levels[m.level].length||Math.abs(m.checkpointState.x-m.checkpoint)>.01))return false;
    if(m.result!==null&&(!m.result||!['failure','completion'].includes(m.result.kind)||(m.result.cause!==undefined&&(typeof m.result.cause!=='string'||m.result.cause.length>64))||(m.result.percent!==undefined&&(!Number.isInteger(m.result.percent)||m.result.percent<0||m.result.percent>100))||(m.result.time!==undefined&&(!Number.isFinite(m.result.time)||m.result.time<0||m.result.time>3600))||(m.result.practice!==undefined&&typeof m.result.practice!=='boolean')||(m.result.place!==undefined&&(!Number.isInteger(m.result.place)||m.result.place<1||m.result.place>4))))return false;
    if(!m.events.every(e=>e&&typeof e.type==='string'&&e.type.length>0&&e.type.length<32&&Number.isFinite(e.time)&&e.time>=0&&e.time<=m.elapsed+.01))return false;
    const ids=new Set();
    return m.actors.every((a,index)=>{const valid=a&&typeof a.id==='string'&&a.id.length>0&&a.id.length<32&&!ids.has(a.id)&&a.kind===(index===0?'player':'cpu')&&['human','steady','sharp','ace'].includes(a.difficulty)&&typeof a.palette==='string'&&/^#[0-9a-f]{6}$/i.test(a.palette)&&Number.isFinite(a.x)&&a.x>=0&&a.x<=levels[m.level].length+.1&&Number.isFinite(a.y)&&a.y>=-.1&&a.y<=CEILING+.1&&Number.isFinite(a.vy)&&Math.abs(a.vy)<50&&Number.isFinite(a.w)&&a.w>.1&&a.w<2&&Number.isFinite(a.h)&&a.h>.1&&a.h<2&&typeof a.held==='boolean'&&typeof a.press==='boolean'&&Number.isFinite(a.buffer)&&a.buffer>=0&&a.buffer<1&&Number.isFinite(a.holdTime)&&a.holdTime>=0&&a.holdTime<3600&&typeof a.grounded==='boolean'&&['run','flight'].includes(a.mode)&&[1,-1].includes(a.gravity)&&typeof a.alive==='boolean'&&typeof a.finished==='boolean'&&(a.finishTime===null||Number.isFinite(a.finishTime)&&a.finishTime>=0&&a.finishTime<=3600)&&Number.isInteger(a.deaths)&&a.deaths>=0&&a.deaths<100000&&Number.isFinite(a.retryTimer)&&a.retryTimer>=-.1&&a.retryTimer<10&&Number.isInteger(a.sectionIndex)&&a.sectionIndex>=0&&a.sectionIndex<levels[m.level].sections.length&&Array.isArray(a.trail)&&a.trail.length<=80&&a.trail.every(q=>q&&Number.isFinite(q.x)&&q.x>=0&&q.x<=levels[m.level].length+.1&&Number.isFinite(q.y)&&q.y>=-.1&&q.y<=CEILING+.1);if(valid)ids.add(a.id);return valid;});
  }
  function restoreMatch(value){if(!validateMatch(value))return null;const m=copy(value);m.accumulator=0;m.events=Array.isArray(m.events)?m.events.slice(-48):[];for(const a of m.actors){a.held=false;a.press=false;}return m;}
  return{STEP,MAX_BACKLOG,FLOOR,CEILING,levels,makeMatch,step,advance,restart,recommendedInput,pauseSnapshot,validateMatch,restoreMatch,sectionAt,obstacleHit};
});
