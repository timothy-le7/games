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
    this.eye=[16,23.5,28.5];this.target=[16,0,11];this.fov=.82;this.camera={};this.init();
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;this.options.onContextLost?.();});
    canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();this.options.onContextRestored?.();});
  }
  Renderer.prototype.init=function(){try{this.scene=new HD.Scene(this.canvas,{shadowSize:1536,bloomStrength:.17});this.gl=this.scene.gl;this.ready=true;this.resize();}catch(e){this.ready=false;this.options.onError?.(e);}};
  Renderer.prototype.resize=function(){
    const r=this.canvas.getBoundingClientRect();if(this.scene&&!this.lost)this.scene.resize(r.width,r.height,window.devicePixelRatio||1,6500000);else if(!this.scene){this.canvas.width=Math.max(1,Math.round(r.width));this.canvas.height=Math.max(1,Math.round(r.height));}
    this.camera.aspect=this.canvas.width/this.canvas.height;this.camera.p=perspective(this.fov,this.camera.aspect,5,100);this.camera.v=lookAt(this.eye,this.target,[0,1,0]);
    this.camera.forward=norm(this.target.map((v,i)=>v-this.eye[i]));this.camera.right=norm(cross(this.camera.forward,[0,1,0]));this.camera.up=cross(this.camera.right,this.camera.forward);
  };
  Renderer.prototype.worldToScreen=function(x,y,z){const rel=[x-this.eye[0],y-this.eye[1],z-this.eye[2]],vx=dot(rel,this.camera.right),vy=dot(rel,this.camera.up),vz=dot(rel,this.camera.forward),t=Math.tan(this.fov/2);return{x:(.5+vx/(vz*t*this.camera.aspect)*.5)*this.canvas.clientWidth,y:(.5-vy/(vz*t)*.5)*this.canvas.clientHeight,visible:vz>0};};
  Renderer.prototype.screenToWorld=function(clientX,clientY){const r=this.canvas.getBoundingClientRect(),nx=(clientX-r.left)/r.width*2-1,ny=1-(clientY-r.top)/r.height*2,t=Math.tan(this.fov/2),d=norm(this.camera.forward.map((v,i)=>v+this.camera.right[i]*nx*t*this.camera.aspect+this.camera.up[i]*ny*t)),k=-this.eye[1]/d[1];return{x:clamp(this.eye[0]+d[0]*k,0,32),z:clamp(this.eye[2]+d[2]*k,0,22)};};
  Renderer.prototype.part=function(name,x,y,z,sx,sy,sz,c,ry=0,rx=0,rz=0,glow=0,cast=true,rough=.52,metal=.25,kind=0){this.scene.draw(name,HD.matrix(x,y,z,sx,sy,sz,ry,rx,rz),c,[rough,metal,glow,kind],cast);};
  Renderer.prototype.floor=function(state,p){
    const d=this.part.bind(this);
    // A continuous landscape replaces the elevated board and its gameplay-like grid.
    d('box',16,-.36,11,48,.6,38,p.back,0,0,0,0,false,1,0);
    d('cube',16,-.09,11,32,.16,22,p.floor,0,0,0,0,false,1,0);
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
        d('box',x,.06,z,2.5,.15,2.5,p.wood,0,0,0,0,true,1,0);for(const off of [-.9,.9])d('cylinder',x+off,.6,z,.2,1.2,.2,p.edge,0,0,0,0,true,1,0);
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
    if(!e.alive)return;const observer=state.entities.find(q=>q.id==='player');if(observer&&!RivetRumbleEngine.visibleTo(state,observer,e))return;const f=RivetRumbleEngine.fighterMap[e.fighter],heavy=['anvil','knuckle'].includes(f.id),slim=['vector','shroud'].includes(f.id),tint=e.hit>0?'#fff3db':f.color,trim=f.trim,team=teamColor(e),dark='#203747',metal='#607b8b',x=e.x,z=e.z,r=Math.PI/2-e.heading,c=Math.cos(r),s=Math.sin(r),walk=Math.sin(e.walk),moving=Math.min(1,Math.hypot(e.vx,e.vz)/2),bob=Math.abs(walk)*.035*moving,width=heavy?1.15:slim?.72:f.id==='tempo'?1.08:f.id==='briar'?.93:.86;
    const d=(name,lx,y,lz,sx,sy,sz,col,rx=0,ry=0,rz=0,glow=0,cast=true)=>this.part(name,x+lx*c+lz*s,y+bob+(e.airY||0),z-lx*s+lz*c,sx,sy,sz,col,r+ry,rx,rz,glow,cast);
    this.part('disc',x,.014,z,1.7,1,1.38,color('#102c40',.22),0,0,0,0,false);
    this.part('torus',x,.04,z,1.65,1.65,.23,team,0,-Math.PI/2,0,.25,false);
    // Separate ankle pivots, boots, knee plates and hip cylinders create a readable gait.
    for(const sign of [-1,1]){const step=walk*sign*.14*moving;d('box',sign*width*.3,.21,.08+step,.36,.28,.6,dark);d('box',sign*width*.3,.33,.23+step,.31,.13,.24,trim);d('cylinder',sign*width*.3,.52,step,.19,.45,.19,metal);d('box',sign*width*.3,.67,.12+step,.30,.33,.28,tint,step);d('sphere',sign*width*.3,.85,0,.26,.26,.26,dark);}
    d('box',0,.98,0,width*.92,.26,.61,dark);if(['briar','gyro','echo'].includes(f.id))d('cylinder',0,1.38,0,width,.85,.78,f.id==='briar'?'#9d6948':tint);else d('box',0,1.38,0,width,.72,.72,tint);if(f.id==='tempo'){d('cylinder',0,1.4,.45,.6,.2,.6,dark,Math.PI/2);d('torus',0,1.4,.57,.5,.5,.15,trim,0,0,0,.2);}else d('box',0,1.48,.39,width*.76,.33,.12,trim);d('box',0,1.45,.46,width*.5,.15,.025,team,0,0,0,.55);
    for(const sign of [-1,1]){d('sphere',sign*(width*.64),1.58,0,.36,.38,.38,metal);d('box',sign*(width*.67),1.63,.02,heavy?.53:.35,.33,.48,tint);d('cylinder',sign*(width*.65),1.28,.03,.2,.4,.2,dark);d('box',sign*(width*.64),1.12,.19,.29,.29,.37,trim);d('sphere',sign*width*.37,1.7,.39,.075,.075,.045,metal);}
    d('cylinder',0,1.85,0,.29,.22,.29,metal);
    if(f.id==='mortar'){d('sphere',0,2.17,0,.86,.65,.8,tint);d('cylinder',0,2.47,0,.95,.12,.85,trim);d('cylinder',0,2.59,-.04,.38,.17,.38,dark);}
    else if(['lumen','tempo'].includes(f.id)){d('sphere',0,2.18,0,.79,.64,.74,tint);d('torus',0,2.6,0,.98,.98,.16,trim,-Math.PI/2,0,0,.18);}
    else if(f.id==='shroud'){d('cone',0,2.3,-.05,1.2,.9,1.1,tint);d('box',0,2.12,.28,.69,.34,.3,dark);d('box',0,1.1,-.44,1.15,1.35,.13,tint,.2);}
    else if(f.id==='briar'){d('sphere',0,2.15,0,.8,.7,.8,trim);for(let i=0;i<5;i++)d('cone',Math.sin(i*1.4)*.28,2.66,Math.cos(i*1.4)*.28,.3,.7,.24,tint,0,i*1.4,.4);}
    else if(f.id==='echo'){d('sphere',0,2.17,0,.87,.8,.79,tint);d('torus',0,2.17,.37,.59,.59,.15,trim,0,0,0,.2);}
    else if(f.id==='gyro'){d('cylinder',0,2.2,0,.88,.7,.88,tint);d('torus',0,2.56,0,1.04,1.04,.2,trim,-Math.PI/2,0,0,.2);}
    else{d('box',0,2.16,0,heavy?.94:.76,heavy?.61:.55,.71,trim);d('box',0,2.48,-.03,.57,.12,.53,tint);}
    d('box',0,2.17,.37,heavy?.75:.61,.27,.09,dark);
    if(f.id==='rail')d('sphere',0,2.18,.44,.25,.22,.12,team,0,0,0,.8);
    else for(const sign of [-1,1])d('box',sign*.16,2.19,.428,.12,.075,.035,team,0,0,0,.9);
    d('box',0,2.02,.422,.21,.035,.025,metal);d('cylinder',-.25,2.64,-.14,.065,.24,.065,dark);d('sphere',-.25,2.79,-.14,.115,.115,.115,team,0,0,0,.65);
    // Back-mounted power pack, fins and a role-specific weapon all face engine heading.
    d('box',0,1.52,-.46,.59,.68,.32,dark);for(const sign of [-1,1]){d('cylinder',sign*.2,1.5,-.64,.17,.50,.17,tint);d('box',sign*.2,1.6,-.74,.1,.29,.035,team,0,0,0,.3);}
    const recoil=e.recoil||0;
    if(f.id==='anvil'){
      for(const sign of [-1,1]){d('box',sign*.67,1.33,.53,.52,.48,.65,tint);d('box',sign*.67,1.34,.87,.43,.28,.08,trim);for(const u of [-1,1])d('cylinder',sign*.67+u*.105,1.34,.94,.14,.2,.14,dark,Math.PI/2);}
      d('box',0,1.08,.38,.91,.25,.16,trim);
    }else if(f.id==='mortar'){
      d('cylinder',.55,1.49,.74,.55,1,.55,dark,Math.PI/2-.2);d('cylinder',.55,1.6,1.18,.65,.16,.65,tint,Math.PI/2-.2);d('cylinder',.55,1.63,1.26,.4,.05,.4,'#142638',Math.PI/2-.2);d('sphere',.55,1.67,1.27,.19,.19,.08,team,0,0,0,.65);
    }else if(f.id==='vector'){
      for(const sign of [-1,1]){d('box',sign*.58,1.26,.69,.24,.23,.88,dark);d('box',sign*.58,1.3,.83,.12,.08,.72,team,0,0,0,.5);d('cylinder',sign*.58,1.26,1.17,.27,.13,.27,trim,Math.PI/2);d('box',sign*.83,1.61,-.3,.60,.08,.4,trim,0,0,sign*.3);}
    }else if(f.id==='lumen'){
      d('box',.51,1.32,.8,.33,.28,.96,dark);for(const sign of [-1,1])d('cylinder',.51+sign*.2,1.37,1.04,.13,.63,.13,trim,Math.PI/2);d('sphere',.51,1.37,1.35,.31,.31,.31,team,0,0,0,.8);d('torus',0,2.73,0,.47,.47,.13,team,-Math.PI/2,0,0,.5);
    }else if(f.id==='knuckle'){
      for(const sign of [-1,1]){const punch=sign>0?recoil*2:0;d('box',sign*.82,1.36,.55+punch,.69,.65,.84,tint);d('box',sign*.82,1.38,1+punch,.6,.5,.14,trim);for(let k=0;k<3;k++)d('cylinder',sign*.82-.19+k*.19,1.42,1.11+punch,.12,.12,.12,dark,Math.PI/2);}
      d('cylinder',0,1.4,-.65,.52,.8,.52,trim);d('cone',0,.92,-.65,.36,.6,.36,'#ffae64',Math.PI,0,0,.7);
    }else if(f.id==='shroud'){
      for(const sign of [-1,1]){d('box',sign*.6,1.22,.7,.17,.22,.55,dark);d('cone',sign*.6,1.25,1.13,.25,.7,.1,trim,Math.PI/2);d('box',sign*.42,2.29,-.42,.3,.08,.9,tint,.2,sign*.2);}
    }else if(f.id==='briar'){
      d('sphere',0,1.45,-.55,.8,1,.65,'#754e39');for(const sign of [-1,1])d('cone',sign*.27,1.9,-.65,.3,.7,.2,tint,0,0,sign*.5);d('cylinder',.55,1.37,.8,.5,.9,.5,'#77594b',Math.PI/2-.3);d('sphere',.55,1.55,1.25,.45,.4,.4,tint);
    }else if(f.id==='tempo'){
      for(const sign of [-1,1]){d('box',sign*.63,1.36,.58,.47,.8,.43,dark);d('torus',sign*.63,1.41,.82,.4,.4,.12,trim,0,0,0,.1);d('sphere',sign*.63,1.41,.83,.2,.2,.05,tint,0,0,0,.3);}d('torus',0,2.8,0,.9,.9,.15,'#91ffce',-Math.PI/2,0,0,.45);
    }else if(f.id==='gyro'){
      d('torus',.65,1.35,.8,.9,.9,.24,trim,0,this.time*3,0,.3);d('sphere',.65,1.35,.8,.35,.35,.35,tint);d('box',-.6,1.35,.5,.3,.3,.55,dark);
    }else if(f.id==='echo'){
      d('cylinder',.55,1.33,.8,.55,1.1,.55,dark,Math.PI/2);for(let i=0;i<3;i++)d('torus',.55,1.33,.5+i*.31,.64,.64,.14,tint,0,0,0,.4);d('sphere',.55,1.33,1.42,.3,.3,.3,trim,0,0,0,.6);
    }else{
      const rail=f.id==='rail',length=rail?1.62:.95;d('box',.5,1.32,.83-recoil*.12,.30,.28,length,dark);d('box',.5,1.49,.96,.19,.07,length*.87,trim);d('cylinder',.5,1.32,.83+length*.5,.34,.16,.34,tint,Math.PI/2);d('cylinder',.5,1.32,.94+length*.5,.19,.07,.19,team,Math.PI/2,0,0,.65);
      if(rail){d('cylinder',.5,1.64,.61,.21,.43,.21,metal,Math.PI/2);d('sphere',.5,1.64,.86,.17,.17,.07,team,0,0,0,.7);}else for(let i=0;i<3;i++)d('box',.68,1.35,.58+i*.16,.04,.18,.06,trim);
    }
    if(e.recoil>.015&&f.attackKind!=='melee'){const mz=f.id==='rail'?1.75:f.id==='mortar'?1.3:f.id==='vector'?1.2:1.38;d('sphere',f.id==='anvil'?.67:.51,1.32,mz,.16,.16,.32,'#fff6b3',0,0,0,1.1,false);}
    // Elevated health plate is attached to a body already visible in the scene.
    const player=state.entities.find(a=>a.id==='player');if(e.id==='player'||player&&(e.team===player.team||RivetRumbleEngine.visibleTo(state,player,e))){const ratio=clamp(e.hp/e.maxHp,0,1);this.part('box',x,(e.airY||0)+3.12,z,1.55,.17,.22,'#183242',0,0,0,0,false);this.part('box',x-(1-ratio)*.69,(e.airY||0)+3.22,z+.015,Math.max(.015,1.38*ratio),.10,.24,team,0,0,0,.25,false);if(e.id==='player')this.part('cone',x,(e.airY||0)+3.61+Math.sin(this.time*3)*.04,z,.29,.34,.29,'#fdf7d4',0,Math.PI,0,.18,false);}
    for(let i=0;i<f.ammo;i++)this.part('box',x+(i-(f.ammo-1)/2)*.28,2.96+(e.airY||0),z+.03,.22,.08,.18,i<e.ammo?'#ffd875':'#3e5263',0,0,0,i<e.ammo?.2:0,false);
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
    for(const p of state.projectiles){const x=(p.prevX??p.x)+(p.x-(p.prevX??p.x))*alpha,z=(p.prevZ??p.z)+(p.z-(p.prevZ??p.z))*alpha,r=Math.PI/2-Math.atan2(p.vz,p.vx),phase=1-clamp((p.life+(1-alpha)*RivetRumbleEngine.STEP)/p.duration,0,1),y=p.arc?1.1+Math.sin(phase*Math.PI)*3.5:1.32;
      if(p.heal>0)d('torus',x,y,z,1,1,.15,color('#a7ffd3',.8),r,0,0,.6,false);if(p.returning)d('torus',x,y,z,.72,.72,.2,p.color,this.time*8,0,0,.4,false);
      d('sphere',x,y,z,p.arc?.48:.27,p.arc?.48:.27,p.arc?.48:.27,'#fff8e1',0,0,0,1,false);d('box',x-p.vx*.018,y-.02,z-p.vz*.018,.16,.12,.75,color(p.color,.75),r,0,0,.9,false);
    }
    for(const f of state.fields){const q=f.life/f.maxLife,owner=state.entities.find(e=>e.id===f.owner),observer=state.entities.find(e=>e.id==='player');if(f.kind==='mine'&&observer&&f.team!==observer.team&&!RivetRumbleEngine.clearLine(state,observer,f))continue;
      d('disc',f.x,.03,f.z,f.radius*2,1,f.radius*2,color(f.color,.13+.13*q),0,0,0,.2,false);d('torus',f.x,.08,f.z,f.radius*2,f.radius*2,.2,color(f.color,.8*q),0,-Math.PI/2,0,.5,false);
      if(f.kind==='smoke'){for(let i=0;i<13;i++){const a=i*2.4+this.time*.12,r=Math.sqrt((i+.5)/13)*f.radius;d('sphere',f.x+Math.cos(a)*r,.8+Math.sin(i*3)*.3,f.z+Math.sin(a)*r,1.7,1.5,1.7,color(f.color,.22),0,0,0,0,false);}continue;}
      if(f.kind==='thorns')for(let i=0;i<9;i++){const a=i*2.4,r=Math.sqrt(i/9)*f.radius;d('cone',f.x+Math.cos(a)*r,.4,f.z+Math.sin(a)*r,.38,.8,.38,'#a6dc72',0,0,.1);}
      if(f.kind==='turret'){const target=state.entities.filter(e=>e.alive&&e.team!==f.team&&Math.hypot(e.x-f.x,e.z-f.z)<8&&RivetRumbleEngine.visibleTo(state,f,e)).sort((a,b)=>Math.hypot(a.x-f.x,a.z-f.z)-Math.hypot(b.x-f.x,b.z-f.z))[0],angle=target?Math.PI/2-Math.atan2(target.z-f.z,target.x-f.x):this.time;
        d('cylinder',f.x,.3,f.z,.85,.55,.85,'#394f68');d('sphere',f.x,.95,f.z,.75,.65,.75,f.color);d('box',f.x+Math.sin(angle)*.4,1,f.z+Math.cos(angle)*.4,.19,.2,.85,'#e5e5f5',angle);d('sphere',f.x,1.35,f.z,.18,.18,.18,'#a5ffdf',0,0,0,.7);}
      else if(f.kind==='mine'){d('cylinder',f.x,.18,f.z,.8,.25,.8,'#3b4b61');d('sphere',f.x,.38,f.z,.24,.16,.24,f.arm>0?'#fff6aa':'#ffa0a8',0,0,0,.8);}
      else if(f.kind==='repair'){d('cylinder',f.x,.4,f.z,.6,.7,.6,'#3c795c');d('box',f.x,.9,f.z,.5,.13,.18,'#b4ffbe',0,0,0,.6);d('box',f.x,.9,f.z,.13,.5,.18,'#b4ffbe',0,0,0,.6);}
    }
    for(const e of state.effects){const q=clamp(e.life/e.maxLife,0,1),r=(e.radius||.4)*(1.2-q*.25),burst=['blast','burst','special'].includes(e.kind);
      d('torus',e.x,.12,e.z,r*2,r*2,.15,color(e.color||'#fff',q*.7),0,-Math.PI/2,0,.7,false);
      if(burst){d('sphere',e.x,.8,e.z,r*q,r*q,r*q,color('#fff5c4',q*.7),0,0,0,.8,false);for(let i=0;i<3;i++){const a=i*2.1;d('sphere',e.x+Math.cos(a)*r*.4*(1-q),.7+(1-q)*.6,e.z+Math.sin(a)*r*.4*(1-q),r*.75*q,r*.8*q,r*.75*q,color(e.color,q*.5),0,0,0,.3,false);}}
      for(let i=0;i<6;i++){const a=i/6*TAU;d('box',e.x+Math.cos(a)*r*(1-q),.3+(1-q)*1.1,e.z+Math.sin(a)*r*(1-q),.07*q,.25*q,.07*q,e.color||'#fff',a,0,this.time,.6,false);}
    }
  };
  Renderer.prototype.aim=function(state,aim){const p=state.entities.find(e=>e.id==='player');if(!p?.alive||!aim)return;const f=RivetRumbleEngine.fighterMap[p.fighter],a=Math.atan2(aim.z-p.z,aim.x-p.x),range=f.splash?clamp(Math.hypot(aim.x-p.x,aim.z-p.z),.8,f.range):f.range;
    if(f.attackKind==='melee'){for(let i=-4;i<=4;i++){const angle=a+i*.28;for(let r=.8;r<f.range;r+=.45){const x=p.x+Math.cos(angle)*r,z=p.z+Math.sin(angle)*r;if(!RivetRumbleEngine.clearLine(state,p,{x,z}))break;this.part('disc',x,.05,z,.12,.02,.12,color('#fff4ce',i===0?.85:.35),0,0,0,.2,false);}}return;}
    if(f.splash){const x=p.x+Math.cos(a)*range,z=p.z+Math.sin(a)*range;this.part('disc',x,.03,z,f.splash*2,1,f.splash*2,color('#fff3d0',.12),0,0,0,0,false);this.part('torus',x,.08,z,f.splash*2,f.splash*2,.12,'#fff4ce',0,-Math.PI/2,0,.3,false);return;}
    for(const offset of f.pellets?[-.34,0,.34]:[0]){let mx=p.x,mz=p.z;for(let r=.9;r<range;r+=.65){const x=p.x+Math.cos(a+offset)*r,z=p.z+Math.sin(a+offset)*r;if(!RivetRumbleEngine.clearLine(state,p,{x,z}))break;mx=x;mz=z;this.part('box',x,.07,z,.07,.02,.28,color('#fff9dd',offset===0?.7:.35),Math.PI/2-a-offset,0,0,.2,false);}this.part('torus',mx,.085,mz,.45,.45,.08,color('#fff9dd',.65),0,-Math.PI/2,0,.3,false);}
  };
  Renderer.prototype.render=function(state,aim,now){
    if(!this.ready||this.lost)return;
    const raw=state.entities.find(e=>e.id==='player'),alpha=clamp(state.accumulator/RivetRumbleEngine.STEP,0,1),player=raw?{...raw,x:(raw.prevX??raw.x)+(raw.x-(raw.prevX??raw.x))*alpha,z:(raw.prevZ??raw.z)+(raw.z-(raw.prevZ??raw.z))*alpha}:null,portrait=this.canvas.clientWidth/this.canvas.clientHeight<.8,focus=player?clamp(player.x,portrait?5:10,portrait?27:22):16,focusZ=player?clamp(player.z-1,5.5,16):11,dt=clamp((now-(this.previousTime??now))/1000,0,.1),fresh=this.previousState!==state;
    const follow=1-Math.exp(-dt*9);this.focusX=fresh?focus:(this.focusX??focus)+(focus-(this.focusX??focus))*follow;this.focusZ=fresh?focusZ:(this.focusZ??focusZ)+(focusZ-(this.focusZ??focusZ))*follow;
    this.previousState=state;this.previousTime=now;this.eye=[this.focusX,portrait?26:21.5,this.focusZ+(portrait?14:11.5)];this.target=[this.focusX,0,this.focusZ];this.fov=.70;
    this.resize();this.time=this.options.reducedMotion?.()?0:now*.001;const p=PALETTES[state.arena]||PALETTES[0],lightVP=HD.multiply(HD.ortho(-25,25,-23,23,1,90),HD.lookAt([-6,36,30],[16,0,11],[0,1,0]));
    this.scene.begin(multiply(this.camera.p,this.camera.v),this.eye,this.time,{lightVP,clear:color(p.back).slice(0,3),fog:color(p.back).slice(0,3)});this.floor(state,p);this.scenery(state,p);this.launchPads(state);for(const e of state.entities)this.robot(state,{...e,x:(e.prevX??e.x)+(e.x-(e.prevX??e.x))*alpha,z:(e.prevZ??e.z)+(e.z-(e.prevZ??e.z))*alpha,airY:(e.prevAirY||0)+((e.airY||0)-(e.prevAirY||0))*alpha});this.action(state);this.smoke(state);this.aim(state,aim);this.scene.flush();
  };
  Renderer.prototype.debug=function(){return{...this.scene?.debug(),lost:this.lost,webgl:!!this.gl,camera:{eye:this.eye.slice(),target:this.target.slice(),aspect:this.camera.aspect,fov:this.fov},playerScreen:this.previousState?(()=>{const p=this.previousState.entities.find(e=>e.id==='player');return p?this.worldToScreen(p.x,1.5,p.z):null})():null,renderer:'hd-landscape-arena',worldStyle:'continuous-terrain',layoutVersion:this.previousState?.layoutVersion};};
  Renderer.prototype.destroy=function(){this.scene?.destroy();this.ready=false;};
  return {Renderer,color};
});
