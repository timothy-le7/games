(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RivetRumbleRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU=Math.PI*2, C={black:'#0a1020',blue:'#4ec9ff',red:'#ff647d',solo:'#ffcf62'};
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function color(hex,a){let h=(hex||'#ffffff').replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');return [parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255,a===undefined?1:a];}
  function id(){return [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];}
  function multiply(a,b){let r=new Array(16).fill(0);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
  function translate(m,x,y,z){let t=id();t[12]=x;t[13]=y;t[14]=z;return multiply(m,t);}
  function scale(m,x,y,z){let t=id();t[0]=x;t[5]=y;t[10]=z;return multiply(m,t);}
  function rotateY(m,a){let t=id(),c=Math.cos(a),s=Math.sin(a);t[0]=c;t[2]=-s;t[8]=s;t[10]=c;return multiply(m,t);}
  function rotateX(m,a){let t=id(),c=Math.cos(a),s=Math.sin(a);t[5]=c;t[6]=s;t[9]=-s;t[10]=c;return multiply(m,t);}
  function perspective(fov,aspect,near,far){let f=1/Math.tan(fov/2),nf=1/(near-far);return[f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0];}
  function norm(v){let l=Math.hypot(...v)||1;return v.map(n=>n/l);}
  function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function lookAt(eye,target,up){let z=norm([eye[0]-target[0],eye[1]-target[1],eye[2]-target[2]]),x=norm(cross(up,z)),y=cross(z,x);return[x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1];}
  const HD=typeof GameHD!=='undefined'?GameHD:typeof require==='function'?require('./hd-scene.js'):null;
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  const turn=(a,b,t)=>a+wrap(b-a)*(1-Math.exp(-t));
  const MODEL=.82;
  function joint(from,to,a,b,bend){
    const delta=to.map((v,i)=>v-from[i]),distance=Math.hypot(...delta),axis=distance>.00001?norm(delta):[0,-1,0],
      reach=clamp(distance,Math.abs(a-b)+.0001,a+b-.0001),along=(a*a-b*b+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,a*a-along*along));
    let plane=bend.map((v,i)=>v-axis[i]*dot(bend,axis));
    if(Math.hypot(...plane)<.00001)plane=cross(axis,Math.abs(axis[0])<.9?[1,0,0]:[0,1,0]);
    const side=norm(plane);
    return {knee:from.map((v,i)=>v+axis[i]*along+side[i]*height),end:from.map((v,i)=>v+axis[i]*reach),clamped:distance>reach+.001};
  }
  // Feet stay at world-space contacts during stance. Only the swinging foot
  // follows an eased arc; knees/elbows are solved with fixed segment lengths.
  // This cache belongs to the view, never to the match or save.
  class FighterMotion {
    constructor(){this.actors=new Map();}
    reset(){this.actors.clear();}
    sample(e,time,width=1.1,reduced=false){
      const aim=Math.PI/2-e.heading,old=this.actors.get(e.id),distance=old?Math.hypot(e.x-old.x,e.z-old.z):0;
      let a=old;
      if(!a||a.fighter!==e.fighter||time<a.time||time-a.time>.3||distance>2||!e.alive||a.air>1&&(e.airY||0)<.01){
        a={fighter:e.fighter,x:e.x,z:e.z,time,body:aim,hips:aim,weight:0,vx:0,vz:0,active:-1,next:0,feet:[-1,1].map(sign=>({x:e.x+Math.cos(aim)*sign*width*.28*MODEL,z:e.z-Math.sin(aim)*sign*width*.28*MODEL,y:.18*MODEL})),air:e.airY||0};
        this.actors.set(e.id,a);
      }
      const dt=clamp(time-a.time,0,.1),speed=Math.hypot(e.vx||0,e.vz||0),blend=1-Math.exp(-dt*14),moving=clamp(speed/4,0,1),direction=speed>.05?Math.atan2(e.vx,e.vz):aim;
      a.weight+=(moving-a.weight)*blend;a.vx+=((e.vx||0)-a.vx)*blend;a.vz+=((e.vz||0)-a.vz)*blend;
      a.body=turn(a.body,aim,dt*15);a.body=aim+clamp(wrap(a.body-aim),-.38,.38);
      a.hips=turn(a.hips,aim+clamp(wrap(direction-aim),-.85,.85)*a.weight,dt*10);
      const forward=[Math.sin(a.hips),0,Math.cos(a.hips)],right=[Math.cos(a.hips),0,-Math.sin(a.hips)],air=e.airY||0;
      if(reduced||air>.02||e.dash>0||speed>10){
        a.active=-1;
        a.feet.forEach((f,i)=>{const side=i?1:-1;f.x=e.x+right[0]*side*width*.28*MODEL;f.z=e.z+right[2]*side*width*.28*MODEL;f.y=.18*MODEL+(air>.02?.13:0);});
      }else if(dt>0){
        if(a.active>=0){
          const f=a.feet[a.active],t=clamp((time-f.began)/f.duration,0,1),q=t*t*t*(t*(t*6-15)+10);
          f.x=f.from.x+(f.to.x-f.from.x)*q;f.z=f.from.z+(f.to.z-f.from.z)*q;f.y=.18*MODEL+Math.sin(t*Math.PI)*(.14+.08*a.weight);
          if(t===1){a.next=1-a.active;a.active=-1;}
        }
        if(a.active<0){
          const i=a.next,side=i?1:-1,f=a.feet[i],home={x:e.x+right[0]*side*width*.28*MODEL,z:e.z+right[2]*side*width*.28*MODEL},error=Math.hypot(home.x-f.x,home.z-f.z);
          if(error>(speed>.15?.22:.14)){
            const duration=clamp(.95/Math.max(.1,speed),.11,.26),lead=speed>.15?.30:0;
            f.from={x:f.x,z:f.z};f.to={x:home.x+(e.vx||0)*duration+Math.sin(direction)*lead,z:home.z+(e.vz||0)*duration+Math.cos(direction)*lead};f.began=time;f.duration=duration;a.active=i;
          }
        }
      }
      const bob=reduced?0:Math.sin(time*2.1+e.id.length)*.009-a.weight*.13,
        lean=reduced?[0,0]:[clamp((a.vx*Math.sin(a.body)+a.vz*Math.cos(a.body))*.012,-.075,.075),clamp((a.vx*Math.cos(a.body)-a.vz*Math.sin(a.body))*.014,-.075,.075)];
      a.x=e.x;a.z=e.z;a.time=time;a.air=air;
      return {bodyYaw:reduced?aim:a.body,hipYaw:reduced?aim:a.hips,aimYaw:aim,bob,lean,weight:a.weight,feet:a.feet.map((f,i)=>({x:f.x,z:f.z,y:f.y+air,swing:a.active===i})),forward,right};
    }
  }
  function fighterMeshes(){
    return {
      cuirass:HD.loft([[-.5,0,0],[-.46,.59,.7],[-.28,.77,.83],[.08,1,1],[.31,.96,.93],[.44,.67,.72],[.5,0,0]],32,3.1),
      helmet:HD.loft([[-.5,0,0],[-.45,.65,.66],[-.2,.92,.91],[.18,1,1],[.37,.81,.85],[.48,.42,.51],[.5,0,0]],32,3),
      bracer:HD.loft([[-.5,0,0],[-.46,.66,.73],[-.18,.9,.95],[.25,1,1],[.46,.72,.79],[.5,0,0]],24,3.5)
    };
  }
  const PALETTES=[
    {floor:'#7dac65',tile:'#bdb780',edge:'#68854c',stone:'#738b9e',top:'#bdced3',accent:'#72e3df',water:'#48b9ce',wood:'#c48a46',back:'#708e55',grass:'#4c9e59',tip:'#9ed15c',soil:'#8e9c5a'},
    {floor:'#d99b65',tile:'#dfb57f',edge:'#aa7051',stone:'#c6815d',top:'#f5c78b',accent:'#ffcb69',water:'#54b5c3',wood:'#b87844',back:'#b87e58',grass:'#b99543',tip:'#e7c859',soil:'#d49e64'},
    {floor:'#7c74a5',tile:'#918ab0',edge:'#615478',stone:'#7d729f',top:'#c3b8d7',accent:'#b7a5ff',water:'#6d9dce',wood:'#a38379',back:'#635877',grass:'#548e94',tip:'#83c0b0',soil:'#79749e'},
    {floor:'#6ca556',tile:'#b9aa78',edge:'#527a46',stone:'#779c8a',top:'#c3d3ac',accent:'#e8db83',water:'#4bb9c3',wood:'#b78148',back:'#537e56',grass:'#44945b',tip:'#a6d16a',soil:'#7eaa5b'},
    {floor:'#db995f',tile:'#e6b97e',edge:'#a56349',stone:'#cb7854',top:'#f3bb80',accent:'#ffd777',water:'#55b9c4',wood:'#bc814b',back:'#b67a53',grass:'#aa9a49',tip:'#e4cb67',soil:'#d79660'},
    {floor:'#7098ad',tile:'#91b1bd',edge:'#4c6c82',stone:'#697f9c',top:'#bacfdf',accent:'#72eee5',water:'#409fcd',wood:'#bb8d68',back:'#4f768e',grass:'#4c9390',tip:'#96c9ab',soil:'#7496a8'}
  ];
  // Stable detail positions: rendering never consumes the match's gameplay RNG.
  const noise=(x,z)=>{const v=Math.sin(x*127.1+z*311.7)*43758.5453;return v-Math.floor(v);};
  function Renderer(canvas,options){
    this.canvas=canvas;this.options=options||{};this.ready=false;this.lost=false;this.time=0;
    this.motion=new FighterMotion();this.unitPoses=new Map();this.eye=[16,23.5,28.5];this.target=[16,0,11];this.fov=.82;this.view='follow';this.camera={};this.init();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.options.onContextLost?.();});
    canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();this.options.onContextRestored?.();});
  }
  Renderer.prototype.init=function(){try{this.scene=new HD.Scene(this.canvas,{shadowSize:1536,bloomStrength:.17,meshes:fighterMeshes()});this.gl=this.scene.gl;this.ready=true;this.resize();}catch(e){this.ready=false;this.options.onError?.(e);}};
  Renderer.prototype.resize=function(){
    const r=this.canvas.getBoundingClientRect();if(this.scene&&!this.lost)this.scene.resize(r.width,r.height,window.devicePixelRatio||1,6500000);else if(!this.scene){this.canvas.width=Math.max(1,Math.round(r.width));this.canvas.height=Math.max(1,Math.round(r.height));}
    this.camera.aspect=this.canvas.width/this.canvas.height;this.camera.p=perspective(this.fov,this.camera.aspect,5,100);this.camera.v=lookAt(this.eye,this.target,[0,1,0]);
    this.camera.forward=norm(this.target.map((v,i)=>v-this.eye[i]));this.camera.right=norm(cross(this.camera.forward,[0,1,0]));this.camera.up=cross(this.camera.right,this.camera.forward);
  };
  Renderer.prototype.worldToScreen=function(x,y,z){const rel=[x-this.eye[0],y-this.eye[1],z-this.eye[2]],vx=dot(rel,this.camera.right),vy=dot(rel,this.camera.up),vz=dot(rel,this.camera.forward),t=Math.tan(this.fov/2);return{x:(.5+vx/(vz*t*this.camera.aspect)*.5)*this.canvas.clientWidth,y:(.5-vy/(vz*t)*.5)*this.canvas.clientHeight,visible:vz>0};};
  Renderer.prototype.screenToWorld=function(clientX,clientY){const r=this.canvas.getBoundingClientRect(),nx=(clientX-r.left)/r.width*2-1,ny=1-(clientY-r.top)/r.height*2,t=Math.tan(this.fov/2),d=norm(this.camera.forward.map((v,i)=>v+this.camera.right[i]*nx*t*this.camera.aspect+this.camera.up[i]*ny*t)),k=-this.eye[1]/d[1];return{x:clamp(this.eye[0]+d[0]*k,0,32),z:clamp(this.eye[2]+d[2]*k,0,22)};};
  Renderer.prototype.setView=function(view){this.view=view==='overview'?'overview':'follow';};
  Renderer.prototype.part=function(name,x,y,z,sx,sy,sz,c,ry=0,rx=0,rz=0,glow=0,cast=true,rough=.52,metal=.25,kind=0){this.scene.draw(name,HD.matrix(x,y,z,sx,sy,sz,ry,rx,rz),c,[rough,metal,glow,kind],cast);};
  Renderer.prototype.floor=function(state,p){
    const d=this.part.bind(this);
    // A continuous landscape replaces the elevated board and its gameplay-like grid.
    d('box',16,-.36,11,48,.6,38,p.back,0,0,0,0,false,1,0);
    d('cube',16,-.09,11,32,.16,22,p.floor,0,0,0,0,false,1,0,5);
    // Quiet, continuous worn paths leave combat silhouettes and cover in focus.
    for(let z=1;z<22;z+=1.7)d('disc',16+Math.sin(z*.32)*2,.003,z,4.3,1,3.4,p.tile,0,0,0,0,false,1,0);
    for(let x=1.5;x<32;x+=2)d('disc',x,.004,11+Math.sin(x*.26)*1.6,4.4,1,2.6,p.tile,0,0,0,0,false,1,0);
    for(let i=0;i<7;i++)d('disc',1+noise(i,7)*30,.005,1+noise(i,19)*20,1.2+noise(i,11),1,.8,p.soil,noise(i,2)*TAU,0,0,0,false,1,0);
    // Small stones and short tufts are ground decoration, never apparent cover.
    for(let i=0;i<65;i++){
      const x=1+noise(i,31)*30,z=1+noise(i,41)*20;
      if(state.arenaData.obstacles.some(o=>x>o.x-.2&&x<o.x+o.w+.2&&z>o.z-.2&&z<o.z+o.h+.2)||state.arenaData.brush.some(b=>x>b.x&&x<b.x+b.w&&z>b.z&&z<b.z+b.h))continue;
      if(i%3===0)d('box',x,.03,z,.12,.055,.19,p.tile,noise(i,17)*TAU,0,0,0,false,1,0);
      else for(const side of [-1,1])d('cone',x+side*.045,.08,z,.06,.16,.035,p.soil,0,0,side*.35,0,false,1,0);
    }
    // Team entry marks stay flat and do not resemble colliders.
    for(const [z,c]of [[2.2,'#d87d83'],[19.8,'#68b9c7']])for(const x of [7,16,25])d('disc',x,.015,z,1.45,1,.55,color(c,.5),0,0,0,0,false,1,0);
    if(state.mode==='foundry'||state.mode==='rush'){
      d('disc',16,.018,11,6.5,1,6.5,color(p.tile,.45),0,0,0,0,false,1,0);
      // Thin segmented paint keeps the exact 3.25-unit scoring boundary readable.
      for(let i=0;i<48;i++){const a=i/48*TAU;d('box',16+Math.cos(a)*3.25,.035,11+Math.sin(a)*3.25,.32,.025,.075,p.accent,-a-Math.PI/2,0,0,.10,false);}
      if(state.mode==='rush'){
        d('cylinder',16,.14,11,1.6,.28,1.6,p.stone);d('cylinder',16,.30,11,1.2,.08,1.2,p.top);
        d('cone',16,.90,11,.7,.7,.7,'#d5a8ff',this.time*.5,0,0,.4);d('cone',16,.55,11,.7,.7,.7,'#af72eb',this.time*.5,Math.PI,0,.3);
      }else{d('disc',16,.027,11,1.2,1,1.2,color(p.accent,.35),0,0,0,.06,false);}
    }else{const radius=state.ring||17;for(let i=0;i<96;i++){const a=i/96*TAU,tx=-Math.sin(a),tz=Math.cos(a)/1.23;d('box',16+Math.cos(a)*radius,.07,11+Math.sin(a)*radius/1.23,radius*TAU/96,.045,.10,'#c5e98a',-Math.atan2(tz,tx),0,0,.15,false);}}
  };
  Renderer.prototype.tree=function(x,z,p,palm){
    const d=this.part.bind(this);
    d('disc',x,.006,z,2.5,1,1.8,color('#243f38',.20),0,0,0,0,false);
    d('cylinder',x,1.15,z,.4,2.3,.4,'#90704d',.2,0,.07,0,true,1,0);
    if(palm){for(let i=0;i<6;i++){const a=i*TAU/6;d('wedge',x+Math.sin(a)*.65,2.65,z+Math.cos(a)*.65,.55,.35,2.1,i%2?p.grass:p.tip,a,.12,0,0,true,.9,0);}}
    else{for(const [dx,y,dz,r]of [[0,2.6,0,2.6],[-.6,2.3,.3,1.6],[.6,2.7,-.3,1.8]])d('sphere',x+dx,y,z+dz,r,r*.8,r,dx<0?p.grass:p.tip,.25,0,0,0,true,1,0);}
  };
  Renderer.prototype.scenery=function(state,p){
    const d=this.part.bind(this),time=this.options.reducedMotion?.()?0:this.time;
    // Solid boundary follows the movement bounds; all scenery remains outside it.
    for(const x of [0,32]){d('box',x,.35,11,.8,.7,23,p.edge,0,0,0,0,true,1,0);d('box',x,.72,11,.82,.10,23,p.soil,0,0,0,0,true,1,0);}
    for(const z of [0,22]){d('box',16,.35,z,32,.7,.8,p.edge,0,0,0,0,true,1,0);d('box',16,.72,z,32,.10,.82,p.soil,0,0,0,0,true,1,0);}
    for(const o of state.arenaData.obstacles){
      const x=o.x+o.w/2,z=o.z+o.h/2;
      if(o.hp<=0){
        d('disc',x,.018,z,o.w,1,o.h,color(p.soil,.5),0,0,0,0,false);
        for(let i=0;i<4;i++)d('box',x+(noise(i,o.x)-.5)*o.w*.7,.09,z+(noise(i,o.z)-.5)*o.h*.7,.32,.16,.20,p.wood,noise(i,9)*TAU,0,0,0,false,1,0);
        continue;
      }
      if(o.kind==='water'){
        d('box',x,.023,z,o.w,.04,o.h,p.water,0,0,0,.08,false,.32,.04);
        // Banks stay inside the same impassable rectangle, with no false extra wall.
        for(const side of [-1,1]){d('box',x,.05,z+side*(o.h/2-.07),o.w,.07,.14,p.tile,0,0,0,0,false,1,0);d('box',x+side*(o.w/2-.07),.05,z,.14,.07,o.h,p.tile,0,0,0,0,false,1,0);}
        for(let i=0;i<5;i++)d('box',o.x+o.w*(i+.5)/5,.055,z+Math.sin(time*.8+i)*Math.min(.2,o.h*.2),Math.min(.5,o.w/7),.015,.045,color('#c3f4ef',.55),0,0,0,.05,false);
        continue;
      }
      if(o.destructible){
        // Separately modeled timber stacks clearly signal breakable, resource-bearing cover.
        d('box',x,.56,z,o.w,1.12,o.h,p.wood,0,0,0,0,true,.95,0);
        for(const h of [.26,.62,.98])d('box',x,h,z+o.h/2-.018,o.w-.06,.035,.045,'#946239',0,0,0,0,true,1,0);
        for(const u of [-.31,.31])d('box',x+o.w*u,.58,z,.13,1.18,o.h+.015,'#e4bc73',0,0,0,0,true,.9,0);
        d('box',x,1.15,z,o.w,.07,o.h,'#dfb478',0,0,0,0,true,1,0);
        if(o.hp<65)d('box',x,.66,z+o.h*.5+.02,.05,.8,.02,'#614737',0,0,-.35);
      }else{
        // Masonry seams are visual subdivisions of the exact single collider.
        d('box',x,.55,z,o.w,1.1,o.h,p.stone,0,0,0,0,true,.95,0);
        const cols=Math.max(1,Math.round(o.w/1.15)),rows=Math.max(1,Math.round(o.h/1.15));
        for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){
          const bx=o.x+(i+.5)*o.w/cols,bz=o.z+(j+.5)*o.h/rows;
          d('box',bx,1.13,bz,o.w/cols-.045,.18,o.h/rows-.045,p.top,0,0,0,0,true,1,0);
        }
        d('box',x,.13,z,o.w,.16,o.h,p.edge,0,0,0,0,true,1,0);
        for(let i=1;i<cols;i++)d('box',o.x+i*o.w/cols,.61,z+o.h/2+.004,.027,.85,.012,p.edge,0,0,0,0,false,1,0);
        if(state.arena===3)for(const side of [-1,1])d('box',x+side*o.w*.28,1.235,z,.38,.03,Math.min(o.h,.65),p.grass,.2,0,0,0,false,1,0);
      }
    }
    const player=state.entities.find(e=>e.id==='player');
    for(const b of state.arenaData.brush||[]){
      // Flat bed has the exact concealment footprint. Grass never grows through cover.
      d('cube',b.x+b.w/2,.022,b.z+b.h/2,b.w,.035,b.h,p.grass,0,0,0,0,false,1,0);
      for(let x=b.x+.24;x<b.x+b.w-.05;x+=.58)for(let z=b.z+.24;z<b.z+b.h-.05;z+=.58){
        if(state.arenaData.obstacles.some(o=>o.hp>0&&x>o.x-.2&&x<o.x+o.w+.2&&z>o.z-.2&&z<o.z+o.h+.2))continue;
        const n=noise(x,z),wave=Math.sin(time*1.7+x+z)*.045,h=.65+n*.27,near=player&&Math.hypot(player.x-x,player.z-z)<1.7,a=near?.60:1;
        d('sphere',x+(n-.5)*.16,.27,z+(noise(z,x)-.5)*.16,.82,.45,.77,color(p.grass,a),n*TAU,0,0,0,true,1,0);
        d('cone',x+(n-.5)*.12,.35,z,.56,h,.38,color(p.grass,a),n*TAU,wave,.12,0,true,1,0);
        d('cone',x+.12,.39,z+.05,.32,h+.12,.25,color(p.tip,a),n*TAU+.9,-wave,-.17,0,true,1,0);
      }
    }
    // Each district has its own small world rather than repeated industrial fans.
    for(const [x,z]of [[-2,4],[-2,14],[34,8],[34,19],[5,-2],[26,-2],[3,24],[28,24]]){
      if(state.arena===1||state.arena===4){
        d('box',x,.70,z,2.3,1.5,1.8,p.stone,.15,0,.05,0,true,1,0);d('box',x-.2,1.55,z,1.7,.55,1.4,p.top,-.1,0,0,0,true,1,0);
        d('cylinder',x+1,.6,z+.7,.34,1.2,.34,p.grass,0,0,.1,0,true,1,0);d('sphere',x+1,1.2,z+.7,.36,.36,.36,p.tip,0,0,0,0,true,1,0);
      }else if(state.arena===5){
        d('box',x,.06,z,2.5,.15,2.5,p.wood,0,0,0,0,true,1,0,7);for(const off of [-.9,.9])d('cylinder',x+off,.6,z,.2,1.2,.2,p.edge,0,0,0,0,true,1,0);
        d('box',x,1.3,z,1.5,2.6,.18,p.edge);d('box',x,2.7,z,1.8,.2,.65,p.top);d('box',x,2.55,z+.15,1.3,.08,.2,p.accent,0,0,0,.35);
      }else this.tree(x,z,p,state.arena===3);
    }
    for(const [x,z,angle]of [[-3.2,10,Math.PI/2],[35.2,13,-Math.PI/2],[11,-3.3,0],[23,25.3,Math.PI]]){
      d('box',x,1,z,3.2,2,2.2,p.stone,angle,0,0,0,true,1,0);
      d('box',x,2.16,z,3.7,.35,2.7,state.arena===5?p.edge:p.wood,angle,0,0,0,true,.9,0);
      const fx=x+Math.sin(angle)*1.13,fz=z+Math.cos(angle)*1.13;
      d('box',fx,1.05,fz,.9,1.5,.08,p.edge,angle);d('box',fx,1.8,fz,1.2,.2,.15,p.top,angle);
    }
  };
  function teamColor(e){return e.team==='blue'?C.blue:e.team==='red'?C.red:e.id==='player'?C.solo:'#c18bff';}
  Renderer.prototype.robot=function(state,e){
    if(!e.alive)return;
    const observer=state.entities.find(q=>q.id==='player');if(observer&&!RivetRumbleEngine.visibleTo(state,observer,e))return;
    const f=RivetRumbleEngine.fighterMap[e.fighter],shape=f.model||f.id,heavy=['anvil','knuckle'].includes(shape),slim=['vector','shroud'].includes(shape),
      tint=color(f.color).map((v,i)=>i===3?v:v*.76+[.012,.022,.028][i]),trim=color(f.trim).map((v,i)=>i===3?v:v*.84),team=teamColor(e),dark='#1d2c39',metal='#70858b',x=e.x,z=e.z,r=Math.PI/2-e.heading,
      width=heavy?1.40:slim?1.03:shape==='tempo'?1.26:1.17,reduced=!!this.options.reducedMotion?.(),poseTime=state.elapsed+(state.accumulator||0),unitTime=reduced?0:poseTime,pose=this.motion.sample(e,poseTime,width,reduced),
      model=MODEL,bob=pose.bob,air=e.airY||0,root=HD.matrix(x,bob+air,z,model,model,model,pose.bodyYaw,pose.lean[0],pose.lean[1]),
      hips=HD.matrix(x,bob+air,z,model,model,model,pose.hipYaw),kick=reduced?0:(e.recoil||0)/.22,
      weaponRoot=HD.matrix(x,bob+air,z,model,model,model,r,-kick*.045,0),
      point=(m,a)=>[m[0]*a[0]+m[4]*a[1]+m[8]*a[2]+m[12],m[1]*a[0]+m[5]*a[1]+m[9]*a[2]+m[13],m[2]*a[0]+m[6]*a[1]+m[10]*a[2]+m[14]],
      draw=(matrix,yOffset=0)=>(name,lx,y,lz,sx,sy,sz,col,rx=0,ry=0,rz=0,glow=0,cast=true,rough=.46,metallic=.4,kind=0)=>this.scene.draw(name,HD.multiply(matrix,HD.matrix(lx,y+yOffset,lz,sx,sy,sz,ry,rx,rz)),col,[rough,metallic,glow,kind||(['cuirass','helmet','bracer'].includes(name)?10:0)],cast),
      body=draw(root),leg=draw(hips),gunBase=draw(weaponRoot,.48),gun=(name,lx,...args)=>gunBase(name,lx-(shape==='rail'?.35:0),...args),bone=(a,b,w,depth,col,mesh='capsule',rough=.53,metallic=.28)=>{const delta=b.map((v,i)=>v-a[i]),len=Math.hypot(...delta);this.part(mesh,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w*model,len,depth*model,col,Math.atan2(delta[0],delta[2]),Math.acos(clamp(delta[1]/Math.max(.0001,len),-1,1)),0,0,true,rough,metallic);};
    let d=body;
    this.unitPoses.set(e.id,{bodyYaw:pose.bodyYaw,hipYaw:pose.hipYaw,aimYaw:r,feet:pose.feet.map(v=>({...v})),moving:pose.weight});
    this.part('disc',x,.014,z,1.7,1,1.38,color('#102c40',.22),0,0,0,0,false);
    this.part('torus',x,.04,z,1.65,1.65,.23,team,0,-Math.PI/2,0,.15,false);
    const pilot=['spark','rail','vector','shroud','lumen','briar'].includes(shape),variant=f.variant||0,skin=['#b98666','#d9aa89','#8c583f','#c39a81'][variant%4];
    // Segmented armored legs, real bent knees and articulated ankle contacts.
    for(const sign of [-1,1]){
      const i=sign<0?0:1,foot=pose.feet[i],hip=point(hips,[sign*width*.27,1.70,0]),solved=joint(hip,[foot.x,foot.y,foot.z],.80*model,.80*model,pose.forward),knee=solved.knee,ankle=solved.end;
      bone(hip,knee,.38,.42,tint,'bracer');bone(knee,ankle,.34,.37,dark,'bracer');
      this.part('helmet',knee[0]+pose.forward[0]*.055,knee[1],knee[2]+pose.forward[2]*.055,.40*model,.39*model,.31*model,trim,pose.hipYaw,0,0,0,true,.42,.5);
      const yaw=pose.hipYaw,fx=ankle[0]+Math.sin(yaw)*.09,fz=ankle[2]+Math.cos(yaw)*.09;
      this.part('box',fx,ankle[1]-.045*model,fz,.44*model,.25*model,.69*model,dark,yaw,0,0,0,true,.8,.1);
      this.part('helmet',fx+Math.sin(yaw)*.1,ankle[1]-.02*model,fz+Math.cos(yaw)*.1,.41*model,.22*model,.48*model,tint,yaw);
      this.part('box',fx,ankle[1]-.14*model,fz,.46*model,.065*model,.72*model,'#121f29',yaw,0,0,0,true,.95,0);
    }
    leg('cuirass',0,1.65,0,width*.85,.38,.65,dark);
    body('torso',0,2.04,-.025,width*1.01,1.00,.76,dark,0,0,0,0,true,.82,.05,8);
    body('cuirass',0,2.14,.045,width,.91,.77,tint);
    body('cuirass',0,2.20,.29,width*.84,.57,.23,trim,0,0,0,0,true,.43,.56);
    for(const side of [-1,1]){
      body('box',side*width*.26,2.23,.416,.26,.05,.045,team,0,0,0,.12);
      body('box',side*width*.25,1.69,.30,.26,.24,.16,dark);
      body('box',side*width*.25,1.69,.39,.22,.08,.035,metal);
      body('sphere',side*width*.48,2.35,.19,.08,.08,.055,metal);
    }
    for(const side of [-1,1]){body('box',side*.23,2.36,.368,.36,.055,.035,dark,0,0,side*.11);body('box',side*width*.46,1.85,.23,.13,.19,.17,trim);}
    for(let k=0;k<3;k++)body('capsule',0,1.84+k*.10,.32,width*.66,.09,.17,dark,0,0,0,0,true,.7,.1);
    body('box',0,1.59,.32,width*.88,.13,.13,dark);body('box',0,1.59,.41,.21,.14,.055,trim);
    body('cylinder',0,2.61,0,.34,.22,.34,dark);
    // A smaller helmet/face over a broad chest gives adult combat proportions.
    const head=draw(HD.matrix(x,bob+air,z,model,model,model,pose.bodyYaw+wrap(r-pose.bodyYaw)*.8,pose.lean[0]*.3,0));
    if(pilot){
      head('helmet',0,2.93,.12,.61,.62,.58,skin,0,0,0,0,true,.84,0,9);
      head('helmet',0,3.10,-.035,.78,.57,.72,tint);
      head('capsule',0,3.00,.414,.61,.18,.12,dark,0,0,0,0,true,.2,.7);
      head('capsule',0,3.015,.475,.49,.105,.045,'#6fbbbf',0,0,0,.08,true,.18,.7);
      head('capsule',0,2.87,.443,.13,.15,.12,skin,0,0,0,0,true,.84,0,9);
      head('capsule',0,2.77,.405,.23,.045,.035,'#66483d');
      for(const side of [-1,1]){head('helmet',side*.32,2.89,.08,.16,.35,.4,tint);head('cylinder',side*.39,3.01,-.01,.17,.12,.17,trim,0,0,Math.PI/2);}
      head('capsule',0,2.64,0,.55,.17,.51,dark);
      if(shape==='rail'){head('helmet',0,3.31,-.04,.72,.19,.66,trim);head('box',0,3.19,.36,.89,.06,.35,tint);}
      if(shape==='shroud'){head('helmet',0,3.20,-.11,.87,.43,.82,tint);head('box',0,2.78,.42,.59,.21,.14,trim);body('cuirass',0,1.95,-.43,.89,1.08,.17,tint,.12);}
      if(shape==='briar')for(let k=0;k<3;k++)head('bracer',-.21+k*.21,3.39,-.06,.16,.30,.20,trim,0,0,(k-1)*.24);
      if(shape==='lumen')head('torus',0,3.41,0,.78,.78,.12,trim,-Math.PI/2,0,0,.15);
    }else{
      head('helmet',0,3.00,0,heavy?.98:.83,.74,.78,tint);
      head('helmet',0,3.00,.30,heavy?.78:.66,.39,.25,dark);
      if(shape==='echo')head('torus',0,3.02,.44,.48,.48,.12,trim,0,0,0,.15);
      for(const side of [-1,1])head('capsule',side*.18,3.045,.437,.18,.08,.04,team,0,0,0,.4);
      head('box',0,2.84,.421,.29,.045,.03,metal);
      if(shape==='mortar'){head('helmet',0,3.30,-.03,.92,.20,.81,trim);head('cylinder',0,3.46,-.12,.28,.17,.28,dark);}
      if(shape==='gyro'){head('torus',0,3.37,0,.96,.96,.17,trim,-Math.PI/2);head('cylinder',0,3.45,0,.26,.14,.26,team);}
      if(shape==='knuckle')for(const side of [-1,1])head('helmet',side*.43,3.19,0,.29,.42,.47,trim,0,0,side*.25);
    }
    // Arms bend to the actual weapon grips while the chest settles into turns.
    const dual=['anvil','knuckle','vector','shroud','tempo'].includes(shape);
    for(const sign of [-1,1]){
      const shoulder=point(root,[sign*width*.59,2.34,.015]),punch=shape==='knuckle'&&sign>0?kick*.44:0,
        grip=dual?[sign*(shape==='knuckle'?.82:shape==='anvil'?.67:.59),1.80,.65+punch-kick*.055]:sign>0?[shape==='rail'?.15:.50,1.79,.63-kick*.055]:shape==='rail'?[.08,1.82,1.0-kick*.055]:[-width*.62,1.72,.18+Math.sin(unitTime*9)*pose.weight*.10],
        handTarget=point(weaponRoot,grip),reach=(shape==='rail'?.78:.68)*model,arm=joint(shoulder,handTarget,reach,reach,[Math.cos(r)*sign,-.5,-Math.sin(r)*sign]);const elbow=arm.knee,hand=arm.end;
      bone(shoulder,elbow,.32,.34,dark);bone(elbow,hand,heavy?.43:.36,.38,tint,'bracer');
      body('helmet',sign*width*.61,2.34,.015,heavy?.65:.53,.43,.55,tint,0,0,sign*.14);
      body('box',sign*width*.61,2.39,.28,.29,.08,.055,team,0,0,0,.12);
      this.part('sphere',elbow[0],elbow[1],elbow[2],.27*model,.27*model,.27*model,metal,r);
      this.part('helmet',hand[0],hand[1],hand[2],.30*model,.27*model,.34*model,dark,r);
    }
    body('cuirass',0,2.15,-.46,.71,.78,.35,dark);
    for(const sign of [-1,1]){body('cylinder',sign*.23,2.09,-.65,.22,.62,.22,metal);body('box',sign*.23,2.25,-.77,.12,.21,.035,team,0,0,0,.10);}
    d=gun;
    const recoil=reduced?0:e.recoil||0;
    if(shape==='anvil'){
      for(const sign of [-1,1]){d('box',sign*.67,1.33,.53,.52,.48,.65,tint);d('box',sign*.67,1.34,.87,.43,.28,.08,trim);for(const u of [-1,1])d('cylinder',sign*.67+u*.105,1.34,.94,.14,.2,.14,dark,Math.PI/2);}
      d('box',0,1.08,.38,.91,.25,.16,trim);
    }else if(shape==='mortar'){
      d('cylinder',.55,1.49,.74,.55,1,.55,dark,Math.PI/2-.2);d('cylinder',.55,1.6,1.18,.65,.16,.65,tint,Math.PI/2-.2);d('cylinder',.55,1.63,1.26,.4,.05,.4,'#142638',Math.PI/2-.2);d('sphere',.55,1.67,1.27,.19,.19,.08,team,0,0,0,.65);
    }else if(shape==='vector'){
      for(const sign of [-1,1]){d('box',sign*.58,1.26,.69,.24,.23,.88,dark);d('box',sign*.58,1.3,.83,.12,.08,.72,team,0,0,0,.5);d('cylinder',sign*.58,1.26,1.17,.27,.13,.27,trim,Math.PI/2);d('box',sign*.83,1.61,-.3,.60,.08,.4,trim,0,0,sign*.3);}
    }else if(shape==='lumen'){
      d('box',.51,1.32,.8,.33,.28,.96,dark);for(const sign of [-1,1])d('cylinder',.51+sign*.2,1.37,1.04,.13,.63,.13,trim,Math.PI/2);d('sphere',.51,1.37,1.35,.31,.31,.31,team,0,0,0,.8);d('torus',0,2.73,0,.47,.47,.13,team,-Math.PI/2,0,0,.5);
    }else if(shape==='knuckle'){
      for(const sign of [-1,1]){const punch=sign>0?recoil*2:0;d('box',sign*.82,1.36,.55+punch,.69,.65,.84,tint);d('box',sign*.82,1.38,1+punch,.6,.5,.14,trim);for(let k=0;k<3;k++)d('cylinder',sign*.82-.19+k*.19,1.42,1.11+punch,.12,.12,.12,dark,Math.PI/2);}
      d('cylinder',0,1.4,-.65,.52,.8,.52,trim);d('cone',0,.92,-.65,.36,.6,.36,'#ffae64',Math.PI,0,0,.7);
    }else if(shape==='shroud'){
      for(const sign of [-1,1]){d('box',sign*.6,1.22,.7,.17,.22,.55,dark);d('cone',sign*.6,1.25,1.13,.25,.7,.1,trim,Math.PI/2);d('box',sign*.42,2.29,-.42,.3,.08,.9,tint,.2,sign*.2);}
    }else if(shape==='briar'){
      d('sphere',0,1.45,-.55,.8,1,.65,'#754e39');for(const sign of [-1,1])d('cone',sign*.27,1.9,-.65,.3,.7,.2,tint,0,0,sign*.5);d('cylinder',.55,1.37,.8,.5,.9,.5,'#77594b',Math.PI/2-.3);d('sphere',.55,1.55,1.25,.45,.4,.4,tint);
    }else if(shape==='tempo'){
      for(const sign of [-1,1]){d('box',sign*.63,1.36,.58,.47,.8,.43,dark);d('torus',sign*.63,1.41,.82,.4,.4,.12,trim,0,0,0,.1);d('sphere',sign*.63,1.41,.83,.2,.2,.05,tint,0,0,0,.3);}d('torus',0,2.8,0,.9,.9,.15,'#91ffce',-Math.PI/2,0,0,.45);
    }else if(shape==='gyro'){
      d('torus',.65,1.35,.8,.9,.9,.24,trim,0,unitTime*3,0,.3);d('sphere',.65,1.35,.8,.35,.35,.35,tint);d('box',-.6,1.35,.5,.3,.3,.55,dark);
    }else if(shape==='echo'){
      d('cylinder',.55,1.33,.8,.55,1.1,.55,dark,Math.PI/2);for(let i=0;i<3;i++)d('torus',.55,1.33,.5+i*.31,.64,.64,.14,tint,0,0,0,.4);d('sphere',.55,1.33,1.42,.3,.3,.3,trim,0,0,0,.6);
    }else{
      const rail=shape==='rail',length=rail?1.62:.95;d('box',.5,1.32,.83-recoil*.12,.30,.28,length,dark);d('box',.5,1.49,.96,.19,.07,length*.87,trim);d('cylinder',.5,1.32,.83+length*.5,.34,.16,.34,tint,Math.PI/2);d('cylinder',.5,1.32,.94+length*.5,.19,.07,.19,team,Math.PI/2,0,0,.65);
      if(rail){d('cylinder',.5,1.64,.61,.21,.43,.21,metal,Math.PI/2);d('sphere',.5,1.64,.86,.17,.17,.07,team,0,0,0,.7);}else for(let i=0;i<3;i++)d('box',.68,1.35,.58+i*.16,.04,.18,.06,trim);
    }
    if(!reduced&&e.recoil>.015&&f.attackKind!=='melee'){const mz=shape==='rail'?1.75:shape==='mortar'?1.3:shape==='vector'?1.2:1.38;d('sphere',shape==='anvil'?.67:.51,1.32,mz,.16,.16,.32,'#fff6b3',0,0,0,1.1,false);}
    d=draw(root,.53);
    if(f.variant!==undefined){
      const v=f.variant;
      if(v===0){for(const sign of [-1,1])d('cone',sign*.37,2.62,-.04,.24,.46,.22,trim,0,0,sign*.3);}
      if(v===1){d('torus',0,2.62,0,1.08,1.08,.15,tint,-Math.PI/2);for(const sign of [-1,1])d('box',sign*.52,2.4,-.08,.43,.15,.4,trim,0,0,sign*.18);}
      if(v===2){for(const sign of [-1,1]){d('box',sign*.63,1.72,-.3,.38,.6,.42,dark);d('cylinder',sign*.63,1.78,-.53,.19,.4,.19,trim);}}
      if(v===3){for(let i=0;i<3;i++)d('cone',-.24+i*.24,2.64,0,.22,.5+(i%2)*.12,.22,'#a9edff',0,0,(i-1)*.2);}
      if(v===4){for(const sign of [-1,1]){d('cylinder',sign*.44,1.3,-.66,.29,.75,.29,'#c6ed8b');d('box',sign*.44,1.4,-.82,.17,.28,.03,dark);}}
      if(v===5){d('torus',0,2.65,0,.94,.94,.16,'#ffc2dd',-Math.PI/2);d('sphere',0,2.71,0,.35,.22,.35,'#ffdeeb',0,0,0,.3);}
    }
    if(e.chill>0)this.part('torus',x,.11,z,2.15,2.15,.12,'#a4e6ff',0,-Math.PI/2,0,.3,false);
    if(e.venom>0)for(let i=0;i<3;i++){const a=unitTime*2+i*TAU/3;this.part('sphere',x+Math.cos(a)*.65,1.7+Math.sin(a)*.3,z+Math.sin(a)*.65,.13,.18,.13,'#caec84',0,0,0,.25,false);}
    // Elevated health plate is attached to a body already visible in the scene.
    const player=state.entities.find(a=>a.id==='player');if(e.id==='player'||player&&(e.team===player.team||RivetRumbleEngine.visibleTo(state,player,e))){const ratio=clamp(e.hp/e.maxHp,0,1);this.part('box',x,(e.airY||0)+3.05,z,1.55,.17,.22,'#183242',0,0,0,0,false);this.part('box',x-(1-ratio)*.69,(e.airY||0)+3.15,z+.015,Math.max(.015,1.38*ratio),.10,.24,team,0,0,0,.25,false);if(e.id==='player')this.part('cone',x,(e.airY||0)+3.46+Math.sin(unitTime*3)*.04,z,.29,.34,.29,'#fdf7d4',0,Math.PI,0,.18,false);}
    for(let i=0;i<f.ammo;i++)this.part('box',x+(i-(f.ammo-1)/2)*.28,2.88+(e.airY||0),z+.03,.22,.08,.18,i<e.ammo?'#ffd875':'#3e5263',0,0,0,i<e.ammo?.2:0,false);
    if(e.power>0)for(let i=0;i<Math.min(6,e.power);i++)d('box',-.38+i*.15,1.65,-.78,.09,.35,.09,'#c4ff79',0,0,0,.6);
    if(e.shield>0)this.part('sphere',x,(e.airY||0)+1.45,z,2.5,3.2,2.5,color('#a6e8ff',.18),0,0,0,.35,false);
    if(e.haste>0)for(let i=0;i<3;i++)this.part('box',x-e.vx*.03*i,.08,z-e.vz*.03*i,.15,.04,.6,color('#b6ff8d',.5-i*.12),Math.PI/2-e.heading,0,0,.4,false);
    if(e.hp<e.maxHp&&state.elapsed-e.lastCombat>3)this.part('torus',x,.12,z,2.1,2.1,.15,color('#b8ffad',.7),0,-Math.PI/2,0,.5,false);
    if(e.spawn>0)this.part('sphere',x,(e.airY||0)+1.45,z,2.3,3,2.3,color('#99eeff',.12),0,0,0,.4,false);
    if(e.special>=.97)this.part('torus',x,.1,z,2.2,2.2,.24,'#ffe99b',0,-Math.PI/2,0,.7,false);
  };
  Renderer.prototype.launchPads=function(state){
    const d=this.part.bind(this);
    for(const p of state.arenaData.pads){const a=Math.atan2(p.toZ-p.z,p.toX-p.x),r=Math.PI/2-a,c='#ffd65c';
      d('cylinder',p.x,.12,p.z,1.9,.24,1.9,'#3e5065');d('cylinder',p.x,.28,p.z,1.55,.12,1.55,c);d('torus',p.x,.37,p.z,1.7,1.7,.18,'#fff6d2',0,-Math.PI/2,0,.4);
      for(const side of [-1,1])d('box',p.x+Math.cos(a)*.1+Math.sin(a)*side*.18,.39,p.z+Math.sin(a)*.1-Math.cos(a)*side*.18,.16,.04,.68,'#6c4e2b',r+side*.55);
      d('torus',p.toX,.045,p.toZ,1.65,1.65,.12,color(c,.7),0,-Math.PI/2,0,.2,false);
      for(let i=1;i<5;i++){const t=i/5;d('sphere',p.x+(p.toX-p.x)*t,.1,p.z+(p.toZ-p.z)*t,.10,.04,.10,color(c,.7),0,0,0,.1,false);}
    }
  };
  Renderer.prototype.smoke=function(state){
    if(state.mode!=='last')return;const d=this.part.bind(this),r=state.ring;
    // Ground tiles use the same elliptical distance as damage. Wisps stay outside it.
    for(let x=1;x<32;x+=2)for(let z=1;z<22;z+=2){const distance=Math.hypot(x-16,(z-11)*1.23);if(distance<r)continue;
      d('cube',x,.05,z,1.98,.04,1.98,color('#739c49',.40),0,0,0,0,false);
      const edge=distance-r;if(edge<3.5){const a=Math.sin(x*4+z*2+this.time*.6);d('sphere',x,.65+a*.15,z,2.3,1.7,2.3,color('#b5da76',.30),0,0,0,0,false);d('sphere',x+.25,1.3+a*.2,z-.2,1.7,1.5,1.7,color('#d2e79a',.19),0,0,0,0,false);}
    }
  };
  Renderer.prototype.action=function(state){
    const d=this.part.bind(this),alpha=clamp(state.accumulator/RivetRumbleEngine.STEP,0,1);
    for(const item of state.pickups||[]){const bob=.3+Math.sin(this.time*3+item.x)*.1,x=item.x,z=item.z,c={cell:'#bdff73',repair:'#8effcc',haste:'#ffdb75',charge:'#77dfff',core:'#d5a3ff'}[item.kind];
      d('torus',x,.04,z,.75,.75,.10,color(c,.7),0,-Math.PI/2,0,.4,false);
      if(item.kind==='core'){d('cone',x,.72+bob,z,.58,.6,.58,c,this.time,0,0,.55);d('cone',x,.22+bob,z,.58,.5,.58,'#a968e5',this.time,Math.PI,0,.45);}
      else if(item.kind==='cell'){d('box',x,.5+bob,z,.72,.72,.72,'#9be35c');d('box',x,.5+bob,z+.37,.48,.48,.03,'#2d603b');d('sphere',x,.5+bob,z+.40,.19,.19,.035,'#f9ffd9');for(let i=0;i<5;i++){const a=Math.PI/2+i*TAU/5;d('cone',x+Math.cos(a)*.10,.5+bob+Math.sin(a)*.10,z+.41,.17,.27,.035,'#f9ffd9',0,0,a-Math.PI/2);}}
      else{d('box',x,.38+bob,z,.55,.52,.43,'#2d4c58',this.time*.35);d('box',x,.4+bob,z+.23,.36,.32,.035,c,0,0,0,.8,false);
        if(item.kind==='repair'){d('box',x,.42+bob,z+.26,.08,.28,.03,'#efffea');d('box',x,.42+bob,z+.27,.28,.08,.03,'#efffea');}
        else d('gear',x,.69+bob,z,.43,.12,.43,c,this.time*.7,0,0,.45);
      }
    }
    for(const p of state.projectiles){if(p.delay>0)continue;const x=(p.prevX??p.x)+(p.x-(p.prevX??p.x))*alpha,z=(p.prevZ??p.z)+(p.z-(p.prevZ??p.z))*alpha,r=Math.PI/2-Math.atan2(p.vz,p.vx),phase=1-clamp((p.life+(1-alpha)*RivetRumbleEngine.STEP)/p.duration,0,1),y=p.arc?1.1+Math.sin(phase*Math.PI)*3.5:1.32;
      if(p.chill>0)d('cone',x,y,z,.42,.65,.35,'#c4f4ff',r,Math.PI/2);if(p.venom>0)d('sphere',x,y,z,.4,.4,.4,'#cbe58a',0,0,0,.3,false);if(p.explosive>0)d('box',x,y,z,.32,.32,.65,p.color,r);
      if(p.heal>0)d('torus',x,y,z,1,1,.15,color('#a7ffd3',.8),r,0,0,.6,false);if(p.returning)d('torus',x,y,z,.72,.72,.2,p.color,this.time*8,0,0,.4,false);
      d('sphere',x,y,z,p.arc?.48:.27,p.arc?.48:.27,p.arc?.48:.27,'#fff8e1',0,0,0,1,false);d('box',x-p.vx*.018,y-.02,z-p.vz*.018,.16,.12,.75,color(p.color,.75),r,0,0,.9,false);
    }
    for(const f of state.fields){const q=f.life/f.maxLife,owner=state.entities.find(e=>e.id===f.owner),observer=state.entities.find(e=>e.id==='player');if(f.hp!==undefined&&observer&&!RivetRumbleEngine.visibleTo(state,observer,f))continue;if(f.kind==='mine'&&observer&&f.team!==observer.team&&!RivetRumbleEngine.clearLine(state,observer,f))continue;
      d('disc',f.x,.03,f.z,f.radius*2,1,f.radius*2,color(f.color,.13+.13*q),0,0,0,.2,false);d('torus',f.x,.08,f.z,f.radius*2,f.radius*2,.2,color(f.color,.8*q),0,-Math.PI/2,0,.5,false);
      if(f.kind==='vortex'){for(let i=0;i<4;i++){const a=this.time*2+i*TAU/4;d('box',f.x+Math.cos(a)*f.radius*.6,.2+i*.12,f.z+Math.sin(a)*f.radius*.6,.16,.12,1.1,f.color,-a,0,0,.3,false);}continue;}
      if(f.kind==='smoke'){for(let i=0;i<13;i++){const a=i*2.4+this.time*.12,r=Math.sqrt((i+.5)/13)*f.radius;d('sphere',f.x+Math.cos(a)*r,.8+Math.sin(i*3)*.3,f.z+Math.sin(a)*r,1.7,1.5,1.7,color(f.color,.22),0,0,0,0,false);}continue;}
      if(f.kind==='thorns')for(let i=0;i<9;i++){const a=i*2.4,r=Math.sqrt(i/9)*f.radius;d('cone',f.x+Math.cos(a)*r,.4,f.z+Math.sin(a)*r,.38,.8,.38,'#a6dc72',0,0,.1);}
      if(f.kind==='turret'){const target=state.entities.filter(e=>e.alive&&e.team!==f.team&&Math.hypot(e.x-f.x,e.z-f.z)<8&&RivetRumbleEngine.visibleTo(state,f,e)).sort((a,b)=>Math.hypot(a.x-f.x,a.z-f.z)-Math.hypot(b.x-f.x,b.z-f.z))[0],angle=target?Math.PI/2-Math.atan2(target.z-f.z,target.x-f.x):this.time;
        d('cylinder',f.x,.3,f.z,.85,.55,.85,'#394f68');d('sphere',f.x,.95,f.z,.75,.65,.75,f.color);d('box',f.x+Math.sin(angle)*.4,1,f.z+Math.cos(angle)*.4,.19,.2,.85,'#e5e5f5',angle);d('sphere',f.x,1.35,f.z,.18,.18,.18,'#a5ffdf',0,0,0,.7);if(f.hp!==undefined){d('box',f.x,1.7,f.z,1,.12,.16,'#183242',0,0,0,0,false);d('box',f.x-(1-f.hp/f.maxHp)*.43,1.78,f.z,.86*f.hp/f.maxHp,.06,.17,f.team===observer?.team?C.blue:C.red,0,0,0,.15,false);}}
      else if(f.kind==='mine'){d('cylinder',f.x,.18,f.z,.8,.25,.8,'#3b4b61');d('sphere',f.x,.38,f.z,.24,.16,.24,f.arm>0?'#fff6aa':'#ffa0a8',0,0,0,.8);}
      else if(f.kind==='repair'){d('cylinder',f.x,.4,f.z,.6,.7,.6,'#3c795c');d('box',f.x,.9,f.z,.5,.13,.18,'#b4ffbe',0,0,0,.6);d('box',f.x,.9,f.z,.13,.5,.18,'#b4ffbe',0,0,0,.6);}
    }
    for(const e of state.effects){const q=clamp(e.life/e.maxLife,0,1),r=(e.radius||.4)*(1.2-q*.25),burst=['blast','burst','special'].includes(e.kind);
      if(e.kind==='chain'){const dx=e.x-e.fromX,dz=e.z-e.fromZ,a=Math.atan2(dx,dz);d('box',(e.x+e.fromX)/2,1.4,(e.z+e.fromZ)/2,.10,.10,Math.hypot(dx,dz),color('#c8f9ff',q),a,0,0,.8,false);}
      d('torus',e.x,.12,e.z,r*2,r*2,.15,color(e.color||'#fff',q*.7),0,-Math.PI/2,0,.7,false);
      if(burst){d('sphere',e.x,.8,e.z,r*q,r*q,r*q,color('#fff5c4',q*.7),0,0,0,.8,false);for(let i=0;i<3;i++){const a=i*2.1;d('sphere',e.x+Math.cos(a)*r*.4*(1-q),.7+(1-q)*.6,e.z+Math.sin(a)*r*.4*(1-q),r*.75*q,r*.8*q,r*.75*q,color(e.color,q*.5),0,0,0,.3,false);}}
      for(let i=0;i<6;i++){const a=i/6*TAU;d('box',e.x+Math.cos(a)*r*(1-q),.3+(1-q)*1.1,e.z+Math.sin(a)*r*(1-q),.07*q,.25*q,.07*q,e.color||'#fff',a,0,this.time,.6,false);}
    }
  };
  Renderer.prototype.aim=function(state,aim,options){const p=state.entities.find(e=>e.id==='player');if(!p?.alive||!aim)return;
    // Keyboard aim assist marks the rival it is tracking with a pulsing bracket.
    const lock=options?.lock&&state.entities.find(e=>e.id===options.lock&&e.alive);if(lock){const pulse=1+.08*Math.sin(this.time*9);this.part('torus',lock.x,.07,lock.z,1.5*pulse,1.5*pulse,.1,color('#ffe066',.85),0,-Math.PI/2,0,.45,false);}
    const f=RivetRumbleEngine.fighterMap[p.fighter],a=Math.atan2(aim.z-p.z,aim.x-p.x),range=f.splash?clamp(Math.hypot(aim.x-p.x,aim.z-p.z),.8,f.range):f.range;
    if(options?.special){const spec=RivetRumbleEngine.specialAim(state,f),r=clamp(Math.hypot(aim.x-p.x,aim.z-p.z),.8,Math.max(.8,spec.range));let x=spec.type==='point'?clamp(p.x+Math.cos(a)*r,.5,31.5):p.x,z=spec.type==='point'?clamp(p.z+Math.sin(a)*r,.5,21.5):p.z;
      if(['leap','turret','vortex'].includes(f.specialKind)){const spot=RivetRumbleEngine.landingPoint(state,x,z,f.specialKind==='leap'?p.radius:f.specialKind==='turret'?.55:.2);if(spot){x=spot.x;z=spot.z;}}
      if(f.specialKind==='thorns'){x=clamp(x,1,31);z=clamp(z,1,21);}
      if(spec.type!=='direction'){this.part('torus',x,.09,z,spec.radius*2,spec.radius*2,.14,'#ffd36f',0,-Math.PI/2,0,.35,false);if(spec.type==='point')for(let i=1;i<=12;i++){const q=i/12;this.part('sphere',p.x+(x-p.x)*q,.14+Math.sin(q*Math.PI)*2,p.z+(z-p.z)*q,.08,.08,.08,'#ffdf8a',0,0,0,.3,false);}return;}
      for(let i=.8;i<spec.range;i+=.45){const x=p.x+Math.cos(a)*i,z=p.z+Math.sin(a)*i;if(x<0||z<0||x>32||z>22)break;this.part('box',x,.08,z,.13,.02,.33,'#ffdc7e',Math.PI/2-a,0,0,.3,false);}return;
    }
    if(f.attackKind==='melee'){for(let i=-4;i<=4;i++){const angle=a+i*.28;for(let r=.8;r<f.range;r+=.45){const x=p.x+Math.cos(angle)*r,z=p.z+Math.sin(angle)*r;if(!RivetRumbleEngine.clearLine(state,p,{x,z}))break;this.part('disc',x,.05,z,.12,.02,.12,color('#fff4ce',i===0?.85:.35),0,0,0,.2,false);}}return;}
    if(f.splash){const x=p.x+Math.cos(a)*range,z=p.z+Math.sin(a)*range;this.part('disc',x,.03,z,f.splash*2,1,f.splash*2,color('#fff3d0',.12),0,0,0,0,false);this.part('torus',x,.08,z,f.splash*2,f.splash*2,.12,'#fff4ce',0,-Math.PI/2,0,.3,false);return;}
    for(const offset of f.pellets?[-.34,0,.34]:[0]){let mx=p.x,mz=p.z;for(let r=.9;r<range;r+=.65){const x=p.x+Math.cos(a+offset)*r,z=p.z+Math.sin(a+offset)*r;if(!RivetRumbleEngine.clearLine(state,p,{x,z}))break;mx=x;mz=z;this.part('box',x,.07,z,.07,.02,.28,color('#fff9dd',offset===0?.7:.35),Math.PI/2-a-offset,0,0,.2,false);}this.part('torus',mx,.085,mz,.45,.45,.08,color('#fff9dd',.65),0,-Math.PI/2,0,.3,false);}
  };
  Renderer.prototype.render=function(state,aim,now,options){
    if(!this.ready||this.lost)return;
    const raw=state.entities.find(e=>e.id==='player'),alpha=clamp(state.accumulator/RivetRumbleEngine.STEP,0,1),player=raw?{...raw,x:(raw.prevX??raw.x)+(raw.x-(raw.prevX??raw.x))*alpha,z:(raw.prevZ??raw.z)+(raw.z-(raw.prevZ??raw.z))*alpha}:null,portrait=this.canvas.clientWidth/this.canvas.clientHeight<.8,edge=portrait?clamp((this.viewHalf||6)-1.5,5,16):10,focus=player?clamp(player.x,edge,32-edge):16,focusZ=player?clamp(player.z-1,5.5,16):11,dt=clamp((now-(this.previousTime??now))/1000,0,.1),fresh=this.previousState!==state;
    if(fresh)this.motion.reset();this.unitPoses.clear();const overview=this.view==='overview',desiredX=overview?16:focus,desiredZ=overview?11:focusZ,follow=1-Math.exp(-dt*(overview?6:9));this.focusX=fresh?desiredX:(this.focusX??desiredX)+(desiredX-(this.focusX??desiredX))*follow;this.focusZ=fresh?desiredZ:(this.focusZ??desiredZ)+(desiredZ-(this.focusZ??desiredZ))*follow;
    this.previousState=state;this.previousTime=now;this.eye=[this.focusX,overview?(portrait?33:30):(portrait?28:25),this.focusZ+(overview?(portrait?13:12):(portrait?10:9))];this.target=[this.focusX,0,this.focusZ];this.fov=overview?.88:.70;
    // A narrow portrait screen used to show only about ±5 units sideways while
    // rivals engage from 9–10 units. Widen the vertical field just enough that
    // the horizontal half-view covers most of the fighter's own attack reach
    // (and the whole arena width in overview); landscape framing is unchanged.
    if(portrait){const aspect=Math.max(.3,this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight)),reach=raw?RivetRumbleEngine.fighterMap[raw.fighter]?.range||9:9,half=overview?15:clamp(reach*.7+1,6.8,9),distance=Math.hypot(this.eye[1],this.eye[2]-this.focusZ);this.fov=clamp(Math.max(this.fov,2*Math.atan(half/(distance*aspect))),this.fov,overview?1.5:1.18);if(!overview)this.viewHalf=Math.tan(this.fov/2)*distance*aspect;}
    this.resize();this.time=this.options.reducedMotion?.()?0:now*.001;const p=PALETTES[state.arena]||PALETTES[0],lightVP=HD.multiply(HD.ortho(-25,25,-23,23,1,90),HD.lookAt([-6,36,30],[16,0,11],[0,1,0]));
    this.scene.begin(multiply(this.camera.p,this.camera.v),this.eye,this.time,{lightVP,clear:color(p.back).slice(0,3),fog:color(p.back).slice(0,3)});this.floor(state,p);this.scenery(state,p);this.launchPads(state);for(const e of state.entities)this.robot(state,{...e,x:(e.prevX??e.x)+(e.x-(e.prevX??e.x))*alpha,z:(e.prevZ??e.z)+(e.z-(e.prevZ??e.z))*alpha,airY:(e.prevAirY||0)+((e.airY||0)-(e.prevAirY||0))*alpha});this.action(state);this.smoke(state);this.aim(state,aim,options);this.scene.flush();
  };
  Renderer.prototype.debug=function(){return{...this.scene?.debug(),lost:this.lost,webgl:!!this.gl,camera:{eye:this.eye.slice(),target:this.target.slice(),aspect:this.camera.aspect,fov:this.fov,view:this.view},playerScreen:this.previousState?(()=>{const p=this.previousState.entities.find(e=>e.id==='player');return p?this.worldToScreen(p.x,1.5,p.z):null})():null,units:[...this.unitPoses.entries()].map(([id,pose])=>({id,...pose})),unitStyle:'articulated-armor',renderer:'hd-landscape-arena',worldStyle:'continuous-terrain',layoutVersion:this.previousState?.layoutVersion};};
  Renderer.prototype.destroy=function(){this.scene?.destroy();this.ready=false;};
  return {Renderer,color,FighterMotion,joint,fighterMeshes};
});
