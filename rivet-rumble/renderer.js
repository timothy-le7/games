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
    {floor:'#74b8ab',tile:'#88c6ba',edge:'#214e62',stone:'#b4d4d8',top:'#edf7e9',accent:'#5bffe0',water:'#258eae',wood:'#c98548',back:'#396e83'},
    {floor:'#c79c73',tile:'#d8b18a',edge:'#623f4d',stone:'#af6c58',top:'#f7d6a5',accent:'#ffb958',water:'#e47545',wood:'#bf8045',back:'#664956'},
    {floor:'#7d9daa',tile:'#90b0b9',edge:'#30465f',stone:'#7c839f',top:'#dbe5f1',accent:'#c7a0ff',water:'#588ca1',wood:'#a68b62',back:'#405771'}
  ];
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
    const d=this.part.bind(this);d('box',16,-.4,11,33,.8,23,p.edge,0,0,0,0,false);d('box',16,-.13,11,32,.22,22,p.floor,0,0,0,0,false,.9,0,2);
    for(let x=1;x<32;x+=2)for(let z=1;z<22;z+=2)d('cube',x,-.006,z,1.97,.02,1.97,((x+z)%4)?p.floor:p.tile,0,0,0,0,false,.88,0,2);
    for(const z of [1.1,20.9])for(let x=2;x<31;x+=3){d('box',x,.02,z,2.45,.04,.16,z<11?'#ed7180':'#67daff',0,0,0,.12,false);d('cube',x,.025,z+.18,.3,.025,.09,'#f5eedc',0,0,0,0,false);}
    for(const x of [.25,31.75]){d('box',x,.05,11,.18,.12,21.7,p.top,0,0,0,0,false);d('box',x,-.08,11,.38,.03,21.8,p.water,0,0,0,.2,false);}
    // The objective and final ring retain the engine's exact ground coordinates.
    if(state.mode==='foundry'){
      d('cylinder',16,.018,11,6.5,.028,6.5,color(p.edge,.32),0,0,0,0,false);
      d('torus',16,.062,11,6.3,6.3,.3,p.accent,0,-Math.PI/2,0,.4,false);
      d('torus',16,.04,11,5.55,5.55,.14,color(p.top,.6),0,-Math.PI/2,0,.1,false);
      for(let i=0;i<12;i++){const a=i/12*TAU;d('box',16+Math.cos(a)*3.55,.06,11+Math.sin(a)*3.55,.12,.05,.42,p.top,-a,0,0,.1,false);}
      d('gear',16,.025,11,1.7,.12,1.7,color(p.accent,.6),this.time*.1,0,0,.15,false);
    }else{const r=state.ring||17;d('torus',16,.09,11,r*2,r*2/1.23,.55,'#b2faff',0,-Math.PI/2,0,.65,false);}
  };
  Renderer.prototype.scenery=function(state,p){
    const d=this.part.bind(this),reduced=this.options.reducedMotion?.()||false,time=reduced?0:this.time;
    // Background architecture stays beyond the playable footprint.
    d('box',16,.6,-1.4,35,1.2,1.2,p.back);d('box',16,3.7,-1.9,35,.22,.38,p.top);
    for(let x=1;x<34;x+=4){d('box',x,2,-1.45,.32,4,1,p.edge);d('box',x,2.3,-1.12,3.4,2.35,.14,p.back);for(let y=1.45;y<3.4;y+=.55)d('box',x,y,-1.02,2.5,.08,.07,p.accent,0,0,0,.25);d('cylinder',x,3.95,-1.4,.42,.3,.42,p.top);}
    for(const o of state.arenaData.obstacles){
      if(o.hp<=0)continue;const x=o.x+o.w/2,z=o.z+o.h/2,wood=o.destructible;
      d('box',x,.66,z,o.w,1.3,o.h,wood?p.wood:p.stone);d('box',x,1.34,z,o.w,.12,o.h,wood?'#f4c581':p.top);
      if(wood){
        for(let u=-o.w*.3;u<=o.w*.3+.01;u+=Math.max(.55,o.w*.3))d('box',x+u,.7,z,.075,1.25,o.h+.015,'#825334');
        for(const s of [-1,1]){d('box',x,.69,z+s*(o.h*.5+.008),o.w*.87,.12,.035,'#664936',0,0,s*.35);d('box',x+o.w*s*.33,.7,z,.12,1.38,o.h+.025,'#647b83');}
      }else{
        d('box',x,.18,z,o.w+.02,.16,o.h+.02,p.edge);
        for(const s of [-1,1]){d('box',x,.94,z+s*(o.h*.5+.005),Math.max(.3,o.w-.45),.12,.025,p.accent,0,0,0,.25);for(const u of [-1,1])d('sphere',x+u*(o.w*.5-.18),1.42,z+s*(o.h*.5-.18),.12,.08,.12,p.edge);}
      }
      // Shallow panels and metal straps never extend the collider silhouette.
      if(wood&&o.hp<65)d('box',x,.85,z+o.h*.5+.016,.035,.8,.02,'#513a35',0,0,-.28);
    }
    for(const [x,z]of [[-1,2],[-1,20],[33,2],[33,20]]){
      d('cylinder',x,.5,z,1.9,1,1.9,p.edge);d('cylinder',x,1.25,z,1.4,.5,1.4,p.stone);d('torus',x,1.58,z,1.48,1.48,.17,p.accent,0,-Math.PI/2,0,.4);d('sphere',x,1.9,z,.48,.6,.48,p.top);
      for(let i=0;i<4;i++){const a=time*.6+i*TAU/4;d('box',x+Math.cos(a)*.75,2.15,z+Math.sin(a)*.75,1.3,.09,.25,p.top,-a);}
    }
    for(let x=4;x<31;x+=6){d('box',x,.09,-.3,2.3,.12,.5,p.edge);for(let k=0;k<4;k++)d('box',x-.8+k*.5,.17,-.3,.22,.05,.48,p.accent,0,0,.1,0,false);}
  };
  function teamColor(e){return e.team==='blue'?C.blue:e.team==='red'?C.red:e.id==='player'?C.solo:'#c18bff';}
  Renderer.prototype.robot=function(state,e){
    if(!e.alive)return;const f=RivetRumbleEngine.fighterMap[e.fighter],heavy=f.id==='anvil',slim=f.id==='vector',tint=e.hit>0?'#fff3db':f.color,trim=f.trim,team=teamColor(e),dark='#203747',metal='#607b8b',x=e.x,z=e.z,r=Math.PI/2-e.heading,c=Math.cos(r),s=Math.sin(r),walk=Math.sin(e.walk),moving=Math.min(1,Math.hypot(e.vx,e.vz)/2),bob=Math.abs(walk)*.035*moving,width=heavy?1.1:slim?.73:.86;
    const d=(name,lx,y,lz,sx,sy,sz,col,rx=0,ry=0,rz=0,glow=0,cast=true)=>this.part(name,x+lx*c+lz*s,y+bob,z-lx*s+lz*c,sx,sy,sz,col,r+ry,rx,rz,glow,cast);
    this.part('disc',x,.014,z,1.7,1,1.38,color('#102c40',.22),0,0,0,0,false);
    this.part('torus',x,.04,z,1.65,1.65,.23,team,0,-Math.PI/2,0,.25,false);
    // Separate ankle pivots, boots, knee plates and hip cylinders create a readable gait.
    for(const sign of [-1,1]){const step=walk*sign*.14*moving;d('box',sign*width*.3,.21,.08+step,.36,.28,.6,dark);d('box',sign*width*.3,.33,.23+step,.31,.13,.24,trim);d('cylinder',sign*width*.3,.52,step,.19,.45,.19,metal);d('box',sign*width*.3,.67,.12+step,.30,.33,.28,tint,step);d('sphere',sign*width*.3,.85,0,.26,.26,.26,dark);}
    d('box',0,.98,0,width*.92,.26,.61,dark);d('box',0,1.38,0,width,.72,.72,tint);d('box',0,1.48,.39,width*.76,.33,.12,trim);d('box',0,1.45,.46,width*.5,.15,.025,team,0,0,0,.55);
    for(const sign of [-1,1]){d('sphere',sign*(width*.64),1.58,0,.36,.38,.38,metal);d('box',sign*(width*.67),1.63,.02,heavy?.53:.35,.33,.48,tint);d('cylinder',sign*(width*.65),1.28,.03,.2,.4,.2,dark);d('box',sign*(width*.64),1.12,.19,.29,.29,.37,trim);d('sphere',sign*width*.37,1.7,.39,.075,.075,.045,metal);}
    d('cylinder',0,1.85,0,.29,.22,.29,metal);
    if(f.id==='mortar'){d('sphere',0,2.17,0,.86,.65,.8,tint);d('cylinder',0,2.47,0,.95,.12,.85,trim);d('cylinder',0,2.59,-.04,.38,.17,.38,dark);}
    else if(f.id==='lumen'){d('sphere',0,2.18,0,.79,.64,.74,tint);d('torus',0,2.6,0,.98,.98,.16,trim,-Math.PI/2,0,0,.18);}
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
    }else{
      const rail=f.id==='rail',length=rail?1.62:.95;d('box',.5,1.32,.83-recoil*.12,.30,.28,length,dark);d('box',.5,1.49,.96,.19,.07,length*.87,trim);d('cylinder',.5,1.32,.83+length*.5,.34,.16,.34,tint,Math.PI/2);d('cylinder',.5,1.32,.94+length*.5,.19,.07,.19,team,Math.PI/2,0,0,.65);
      if(rail){d('cylinder',.5,1.64,.61,.21,.43,.21,metal,Math.PI/2);d('sphere',.5,1.64,.86,.17,.17,.07,team,0,0,0,.7);}else for(let i=0;i<3;i++)d('box',.68,1.35,.58+i*.16,.04,.18,.06,trim);
    }
    if(e.recoil>.015){const mz=f.id==='rail'?1.75:f.id==='mortar'?1.3:f.id==='vector'?1.2:1.38;d('sphere',f.id==='anvil'?.67:.51,1.32,mz,.16,.16,.32,'#fff6b3',0,0,0,1.1,false);}
    // Elevated health plate is attached to a body already visible in the scene.
    const player=state.entities.find(a=>a.id==='player');if(e.id==='player'||player&&(e.team===player.team||RivetRumbleEngine.clearLine(state,player,e))){const ratio=clamp(e.hp/e.maxHp,0,1);this.part('box',x,3.12,z,1.55,.17,.22,'#183242',0,0,0,0,false);this.part('box',x-(1-ratio)*.69,3.22,z+.015,Math.max(.015,1.38*ratio),.10,.24,team,0,0,0,.25,false);if(e.id==='player')this.part('cone',x,3.61+Math.sin(this.time*3)*.04,z,.29,.34,.29,'#fdf7d4',0,Math.PI,0,.18,false);}
    if(e.spawn>0)this.part('sphere',x,1.45,z,2.3,3,2.3,color('#99eeff',.12),0,0,0,.4,false);
    if(e.special>=.97)this.part('torus',x,.1,z,2.2,2.2,.24,'#ffe99b',0,-Math.PI/2,0,.7,false);
  };
  Renderer.prototype.action=function(state){
    const d=this.part.bind(this);for(const p of state.projectiles){const r=Math.PI/2-Math.atan2(p.vz,p.vx);d('sphere',p.x,1.32,p.z,.27,.27,.27,'#fff8e1',0,0,0,1,false);d('box',p.x-p.vx*.018,1.30,p.z-p.vz*.018,.16,.12,.75,color(p.color,.75),r,0,0,.9,false);}
    for(const f of state.fields){const q=f.life/f.maxLife;d('disc',f.x,.03,f.z,f.radius*2,1,f.radius*2,color(f.color,.13+.13*q),0,0,0,.2,false);d('torus',f.x,.08,f.z,f.radius*2,f.radius*2,.2,color(f.color,.8*q),0,-Math.PI/2,0,.5,false);}
    for(const e of state.effects){const q=clamp(e.life/e.maxLife,0,1),r=(e.radius||.4)*(1.2-q*.25);d('torus',e.x,.12,e.z,r*2,r*2,.15,color(e.color||'#fff',q*.7),0,-Math.PI/2,0,.7,false);for(let i=0;i<5;i++){const a=i/5*TAU;d('box',e.x+Math.cos(a)*r*(1-q),.25+(1-q)*.8,e.z+Math.sin(a)*r*(1-q),.1*q,.18*q,.1*q,e.color||'#fff',a,0,this.time,.5,false);}}
  };
  Renderer.prototype.aim=function(state,aim){const p=state.entities.find(e=>e.id==='player');if(!p?.alive||!aim)return;const f=RivetRumbleEngine.fighterMap[p.fighter],a=Math.atan2(aim.z-p.z,aim.x-p.x);let mx=p.x,mz=p.z;for(let r=.9;r<f.range;r+=.65){const x=p.x+Math.cos(a)*r,z=p.z+Math.sin(a)*r;if(RivetRumbleEngine.solidAt(state,x,z,.08))break;mx=x;mz=z;this.part('box',x,.07,z,.08,.02,.28,color('#fff9dd',.7),Math.PI/2-a,0,0,.25,false);}this.part('torus',mx,.085,mz,.53,.53,.10,'#fff9dd',0,-Math.PI/2,0,.4,false);};
  Renderer.prototype.render=function(state,aim,now){
    if(!this.ready||this.lost)return;
    const player=state.entities.find(e=>e.id==='player'),portrait=this.canvas.clientWidth/this.canvas.clientHeight<.8,focus=portrait&&player?clamp(player.x,3.5,28.5):16,dt=clamp((now-(this.previousTime??now))/1000,0,.1);
    // Portrait tracks the real player; the full arena remains visible in landscape.
    this.focusX=this.previousState!==state?focus:(this.focusX??focus)+(focus-(this.focusX??focus))*(1-Math.exp(-dt*9));this.previousState=state;this.previousTime=now;this.eye[0]=this.target[0]=this.focusX;
    this.resize();this.time=this.options.reducedMotion?.()?0:now*.001;const p=PALETTES[state.arena]||PALETTES[0],lightVP=HD.multiply(HD.ortho(-25,25,-23,23,1,90),HD.lookAt([-6,36,30],[16,0,11],[0,1,0]));
    this.scene.begin(multiply(this.camera.p,this.camera.v),this.eye,this.time,{lightVP,clear:color(p.back).slice(0,3),fog:color(p.back).slice(0,3)});this.floor(state,p);this.scenery(state,p);for(const e of state.entities)this.robot(state,e);this.action(state);this.aim(state,aim);this.scene.flush();
  };
  Renderer.prototype.debug=function(){return{...this.scene?.debug(),lost:this.lost,webgl:!!this.gl,camera:{eye:this.eye.slice(),target:this.target.slice(),aspect:this.camera.aspect},playerScreen:this.previousState?(()=>{const p=this.previousState.entities.find(e=>e.id==='player');return p?this.worldToScreen(p.x,1.5,p.z):null})():null,renderer:'hd-articulated-arena'};};
  Renderer.prototype.destroy=function(){this.scene?.destroy();this.ready=false;};
  return {Renderer,color};
});
