// Skyline Sprint renderer: third-person rooftop scenes on the shared local HD
// WebGL renderer, an articulated runner, and a 2D canvas fallback.
(function(root){'use strict';
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const hexCache=new Map();
function hex(h){if(Array.isArray(h))return h;let c=hexCache.get(h);if(c)return c;let s=h.replace('#','');if(s.length===3)s=s.split('').map(x=>x+x).join('');c=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)/255);hexCache.set(h,c);return c;}
const mix=(a,b,t)=>{a=hex(a);b=hex(b);return[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];};
const shade=(c,k)=>hex(c).map(v=>clamp(v*k,0,1));
function hash(a,b=0){let h=Math.imul((a|0)^0x9e3779b9,0x85ebca6b)^Math.imul((b|0)+0x632be5ab,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;h=Math.imul(h,0x297a2d39);h^=h>>>15;return(h>>>0)/4294967296;}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),m=new Float32Array(16);m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m;}
function xform(m,p){return[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];}
function norm(v){const d=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/d,v[1]/d,v[2]/d];}
function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
// Capsule (radius r) spanning world points a and b; meshes use meshScale 2.
function limb(a,b,r){const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],len=Math.hypot(d[0],d[1],d[2])||1e-4,u=[d[0]/len,d[1]/len,d[2]/len],ref=Math.abs(u[1])<.95?[0,1,0]:[1,0,0],x=norm(cross(ref,u)),z=cross(u,x),half=len/2+r*.55;
  return new Float32Array([x[0]*r,x[1]*r,x[2]*r,0,u[0]*half,u[1]*half,u[2]*half,0,z[0]*r,z[1]*r,z[2]*r,0,(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,1]);}
// District looks. All palettes, props and silhouettes are original.
const THEMES=[
  {id:'dawn',sky:['#5b97dc','#8dbbe8','#e9d2c4','#f5bf95'],fog:'#d9c6c0',light:[.42,.62,.66],sun:'#fff3cf',roof:'#c9bba7',roofKind:2,parapet:'#ddd2c2',trim:'#6d5a4c',facade:'#b8664c',facade2:'#5d7d8e',window:'#ffe8b8',glow:.08,accent:'#2ec4b6',accent2:'#ff9f1c',lane:'#f7f1e4',night:0,clouds:true,birds:true},
  {id:'lantern',sky:['#2c1a47','#6b2f5f','#d8615d','#f6b26b'],fog:'#c46a62',light:[.55,.42,.72],sun:'#ffd29a',roof:'#a85f45',roofKind:4,parapet:'#c98a5e',trim:'#5d2f2b',facade:'#7a3d47',facade2:'#5e3346',window:'#ffc66e',glow:.75,accent:'#ff6f59',accent2:'#ffd166',lane:'#ffe3b3',night:.45,lanterns:true},
  {id:'cargo',sky:['#5f8590','#8fb0b6','#c3d4d3','#dfe7e3'],fog:'#b9cac8',light:[-.38,.72,.58],sun:'#f3f6ee',roof:'#7b878c',roofKind:2,parapet:'#9aa6a8',trim:'#38454c',facade:'#a24b3a',facade2:'#3e5a66',window:'#d8f1ee',glow:.18,accent:'#f4a261',accent2:'#2a9d8f',lane:'#f5e9c8',night:.05,cranes:true,clouds:true,sea:true},
  {id:'spires',sky:['#1f6fd6','#4c95ee','#93c4f6','#d8ebff'],fog:'#cde3f6',light:[.36,.8,.48],sun:'#ffffff',roof:'#e3e8ee',roofKind:2,parapet:'#f4f7fa',trim:'#8fa3b6',facade:'#6f9cc4',facade2:'#4f7fae',window:'#e6f7ff',glow:.05,accent:'#00b4d8',accent2:'#ff595e',lane:'#203a5c',night:0,glass:true,clouds:true,birds:true,drones:true},
  {id:'storm',sky:['#04050d','#0b1230','#18224d','#2a3463'],fog:'#1b2244',light:[-.3,.78,.55],sun:'#c9d6ff',roof:'#3b4058',roofKind:2,parapet:'#4b516b',trim:'#22263a',facade:'#1d2136',facade2:'#161a2c',window:'#7df9ff',glow:.68,accent:'#ef476f',accent2:'#06d6a0',lane:'#9ef0ff',night:1,rain:true,drones:true,neon:true}
];
const OUTFIT_DEFAULT={jacket:'#e2583e',pants:'#283a55',shoes:'#f2efe6',accent:'#ffd166',hair:'#2b1d16',skin:'#c98d62',gear:'satchel'};
class Renderer{
  constructor(canvas,engine){
    this.canvas=canvas;this.E=engine;this.lost=false;this.mode='none';this.cam=null;this.pose=null;this.lastNow=null;this.stats={};this.flash=0;
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});
    canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();});
    this.init();
  }
  init(){
    // Phones and tablets use a 1024 shadow map; precise pointers get 2048.
    const coarse=!!(root.matchMedia&&root.matchMedia('(pointer: coarse)').matches);
    try{this.scene=new root.GameHD.Scene(this.canvas,{meshScale:2,shadowSize:coarse?1024:2048,bloomStrength:.3});this.mode='webgl';this.failure=null;}
    catch(error){this.scene=null;this.mode='flat';this.failure=String(error&&error.message||error);this.ctx=this.canvas.getContext('2d');}
  }
  resize(){
    const r=this.canvas.getBoundingClientRect(),w=Math.max(1,r.width),h=Math.max(1,r.height);
    if(this.mode==='webgl')this.scene.resize(w,h,root.devicePixelRatio||1,5200000);
    else{const dpr=Math.min(2,root.devicePixelRatio||1);const W=Math.round(w*dpr),H=Math.round(h*dpr);if(this.canvas.width!==W||this.canvas.height!==H){this.canvas.width=W;this.canvas.height=H;}}
    this.aspect=w/h;this.cssW=w;this.cssH=h;
  }
  themeAt(run,z){if(run.mode==='district')return THEMES[this.E.DISTRICTS[run.district].theme];return THEMES[[1,2,3,4][Math.floor(Math.max(0,z)/700)%4]];}
  // Blend district looks across an endless-mode handover.
  palette(run,z){
    const a=this.themeAt(run,z);if(run.mode==='district')return{...a,mixT:0};
    const edge=Math.floor(z/700+1)*700,t=clamp((z-(edge-90))/90,0,1),b=this.themeAt(run,edge+1);
    if(t<=0)return{...a,mixT:0};
    const out={...a,mixT:t};for(const k of ['fog','sun','roof','parapet','trim','facade','facade2','window','accent','accent2','lane'])out[k]=mix(a[k],b[k],t);
    out.sky=a.sky.map((c,i)=>mix(c,b.sky[i],t));out.light=a.light.map((v,i)=>lerp(v,b.light[i],t));out.glow=lerp(a.glow,b.glow,t);out.night=lerp(a.night,b.night,t);return out;
  }
  project(run,point){
    // Engine coordinates (x lane offset, y height, z distance) to CSS pixels.
    if(!this.vp)return null;const v=this.vp,x=-point[0],y=point[1],z=point[2],w=v[3]*x+v[7]*y+v[11]*z+v[15];if(w<=0)return null;
    return{x:((v[0]*x+v[4]*y+v[8]*z+v[12])/w*.5+.5)*this.cssW,y:(1-((v[1]*x+v[5]*y+v[9]*z+v[13])/w*.5+.5))*this.cssH};
  }
  updateCamera(run,dt,opts){
    const p=run.player,portrait=this.aspect<.85,X=-p.x,speed=this.E.currentSpeed(run);
    const want={x:X*.72,y:(portrait?5.2:3.7)+Math.max(0,p.y)*.55,z:p.z-(portrait?8.6:7.0),tx:X*.85,ty:(portrait?1.0:1.35)+Math.max(0,p.y)*.65,tz:p.z+(portrait?11:10)};
    if(!this.cam||opts.snap){this.cam={...want,shake:0};}
    const k=1-Math.exp(-dt*9),ky=1-Math.exp(-dt*5);
    this.cam.x+=(want.x-this.cam.x)*k;this.cam.tx+=(want.tx-this.cam.tx)*k;this.cam.y+=(want.y-this.cam.y)*ky;this.cam.ty+=(want.ty-this.cam.ty)*ky;this.cam.z=want.z;this.cam.tz=want.tz;
    this.cam.shake=Math.max(0,this.cam.shake-dt*2.6);
    const fovBase=portrait?76:56,fov=(fovBase+(opts.reducedMotion?0:clamp((speed-12)/18,0,1)*6)+(p.glide>0&&!opts.reducedMotion?4:0))*Math.PI/180;
    let sx=0,sy=0;if(!opts.reducedMotion&&this.cam.shake>0){const s=this.cam.shake*this.cam.shake*.35;sx=Math.sin(opts.now*71)*s;sy=Math.cos(opts.now*53)*s;}
    const eye=[this.cam.x+sx,this.cam.y+sy,this.cam.z],target=[this.cam.tx,this.cam.ty,this.cam.tz];
    this.vp=root.GameHD.multiply(perspective(fov,this.aspect,.25,520),root.GameHD.lookAt(eye,target,[0,1,0]));this.eye=eye;this.portrait=portrait;this.fov=fov;
  }
  render(run,opts={}){
    if(this.lost||!run)return;this.resize();
    const now=opts.now??0,dt=this.lastNow===null?1/60:clamp(now-this.lastNow,0,.1);this.lastNow=now;this.frameDt=opts.reducedMotion?dt:dt;
    // React to new engine events with camera shake and particle bursts.
    this.consumeEvents(run,opts);
    this.updateCamera(run,dt,opts);
    if(this.mode==='flat'){this.renderFlat(run,opts);return;}
    const HD=root.GameHD,p=run.player,t=this.palette(run,p.z),time=opts.reducedMotion?0:now,L=norm(t.light);
    const center=[-p.x*.5,0,p.z+16],lightEye=[center[0]+L[0]*60,center[1]+L[1]*60,center[2]+L[2]*60];
    const lightVP=HD.multiply(HD.ortho(-22,22,-30,30,1,140),HD.lookAt(lightEye,center,Math.abs(L[1])>.97?[0,0,1]:[0,1,0]));
    let fog=hex(t.fog),clear=hex(t.sky[2]);if(this.flash>0){const f=this.flash;fog=mix(fog,'#c8d4ff',f*.6);clear=mix(clear,'#dfe6ff',f*.7);}
    this.scene.begin(this.vp,this.eye,time,{lightVP,clear,fog,light:L});
    this.d=(name,m,color,params,cast=true)=>this.scene.draw(name,m,color,params,cast);
    this.sky(run,t,time,opts);this.skyline(run,t,time,opts);this.track(run,t,time,opts);this.neighbors(run,t,time,opts);this.ambient(run,t,time,opts);
    this.obstacles(run,t,time,opts);this.pickups(run,t,time,opts);this.runner(run,t,time,opts,dt);this.effects(run,t,time,opts);
    this.scene.flush();this.stats=this.scene.debug();this.flash=Math.max(0,this.flash-dt*3);
  }
  // m(x,y,z,sx,sy,sz,ry,rx,rz) with engine x mirrored into screen space.
  box(name,x,y,z,sx,sy,sz,color,params=[.6,.05,0,0],cast=true,ry=0,rx=0,rz=0,alpha=1){const c=hex(color);this.scene.draw(name,root.GameHD.matrix(-x,y,z,sx,sy,sz,ry,rx,rz),[c[0],c[1],c[2],alpha],params,cast);}
  sky(run,t,time){
    const p=run.player,z=p.z+330,b=t.sky;
    // Layered bands from zenith to horizon, then a low haze strip.
    const bands=[[150,70,b[0]],[95,26,b[1]],[52,22,mix(b[1],b[2],.5)],[22,16,b[2]],[4,12,b[3]]];
    for(const [y,h,c] of bands)this.box('cube',0,y,z,520,h,1,c,[1,0,.42,0],false);
    const sunY=t.night>.6?70:t.id==='lantern'?14:48,sunX=t.id==='cargo'?60:-70;
    this.box('sphere',sunX,sunY,z-12,t.night>.6?7:12,t.night>.6?7:12,1,t.sun,[1,0,t.night>.6?.9:1.4,0],false);
    if(t.night>.6)for(let i=0;i<46;i++){const h=hash(i,77);this.box('sphere',(h-.5)*480,40+hash(i,5)*120,z-6,.5,.5,.5,'#dfe8ff',[1,0,1.2,0],false);}
  }
  skyline(run,t,time){
    const p=run.player,base=Math.floor(p.z/40)*40,far=t.night>.6?shade(t.facade,.8):mix(t.facade2,t.sky[3],.35);
    for(let z=base-40;z<base+520;z+=40)for(const side of [-1,1]){
      for(let j=0;j<2;j++){const h=hash(Math.floor(z/40)*3+j,side+9),x=side*(55+j*48+h*40),H=(t.id==='spires'?60:t.id==='storm'?44:28)+hash(z,j+side*5)*(t.id==='spires'?110:60),w=12+h*16;
        this.box('cube',x,H/2-30,z+j*17,w,H/2+30,w*.8,far,[.85,t.glass?.4:0,t.glow*.06,0],false);
        if(t.night>.3&&hash(z,j)>.4)this.box('sphere',x,H-30+H/2+30-H/2+2.2,z+j*17,.7,.7,.7,'#ff3b3b',[1,0,(Math.sin(time*2+z)>0?1.6:.4),0],false);
      }}
    if(t.sea)this.box('cube',0,-34,p.z+200,600,.5,420,'#2f5e6b',[.18,.5,.04,0],false);
  }
  track(run,t,time){
    const p=run.player,g=run.track,z0=p.z-16,z1=p.z+150,gaps=g.gaps.filter(q=>q.z+q.len>z0&&q.z<z1).sort((a,b)=>a.z-b.z);
    // Roof spans between gaps, each a separately lit building.
    const spans=[];let start=z0;for(const q of gaps){if(q.z>start)spans.push([start,q.z,q]);start=Math.max(start,q.z+q.len);}if(start<z1)spans.push([start,z1,null]);
    const roofKind=t.roofKind;
    for(const [a,b] of spans){const len=b-a,c=(a+b)/2;
      this.box('cube',0,-.25,c,4.55,.25,len/2,t.roof,[.82,.02,0,roofKind]);
      this.box('cube',0,-20.5,c,4.5,20,len/2,t.facade,[.9,t.glass?.6:0,0,t.glass?0:6],false);
      for(const s of [-1,1]){this.box('cube',s*4.3,.35,c,.22,.42,len/2,t.parapet,[.85,0,0,6]);this.box('cube',s*4.3,.8,c,.3,.05,len/2,t.trim,[.6,.2,0,0]);
        this.box('cube',s*1.3,.012,c,.06,.012,len/2,t.lane,[.7,0,.18,0],false);}
    }
    // Gap edges: hazard stripes, the far building's lit face and planks.
    for(const q of gaps){
      for(const [ez,dir] of [[q.z,-1],[q.z+q.len,1]]){for(let i=-4;i<4;i++)this.box('cube',i*1.1+.55,.02,ez+dir*.25,.5,.02,.22,i%2?'#1d1d1d':'#ffcc33',[.6,0,.25,0],false);}
      for(let row=0;row<5;row++)for(let col=-3;col<=3;col++){const lit=hash(row*13+col,Math.floor(q.z))>.35;this.box('cube',col*1.25,-2.2-row*2.6,q.z+q.len-.02,.42,.7,.04,lit?t.window:shade(t.facade,.6),[.3,.2,lit?t.glow+.15:0,0],false);}
      this.box('cube',0,-31,q.z+q.len/2,9,.4,q.len/2+1,shade(t.trim,.6),[.95,0,0,0],false);
      // Shadowed shaft just below the edges makes the drop read as a void.
      for(const [y,a] of [[-1.4,.62],[-4.5,.5],[-9,.35]])this.box('cube',0,y,q.z+q.len/2,4.6,y===-9?3:1.4,q.len/2,'#06080f',[1,0,0,0],false,0,0,0,a);
      for(let k=0;k<3;k++)this.box('sphere',lerp(-3,3,hash(k,Math.floor(q.z)))+Math.sin(time*.6+k)*2,-30.4,q.z+q.len/2+(k-1)*.8,.18,.12,.3,k%2?'#ffd27a':'#ff4d4d',[.4,0,1.4,0],false);
      if(q.plank>=0){const lx=this.E.laneX(q.plank);this.box('box',lx,-.12,q.z+q.len/2,.9,.1,q.len/2+.6,'#8a6440',[.8,0,0,7]);for(const s of [-1,1])this.box('cylinder',lx+s*.85,.25,q.z+q.len/2,.05,.35,.05,'#d9c39a',[.5,.3,0,0]);}
    }
    // Rooftop dressing along the parapets.
    for(let z=Math.floor(z0/12)*12;z<z1;z+=12){if(gaps.some(q=>z>q.z-1&&z<q.z+q.len+1))continue;const h=hash(Math.floor(z/12),3);
      for(const s of [-1,1]){
        if(t.night>.3||t.id==='lantern'){this.box('cylinder',s*4.3,1.6,z,.06,.8,.06,t.trim,[.4,.6,0,0]);this.box('sphere',s*4.3,2.45,z,.2,.2,.2,t.accent2,[.3,0,1.5,0],false);}
        else if(h>.5){this.box('cylinder',s*4.32,1.1,z,.08,.32,.08,'#7b8a90',[.4,.6,0,0]);this.box('sphere',s*4.32,1.5,z,.36,.3,.36,t.id==='dawn'?'#4c9a5b':'#5a7d58',[.95,0,0,5]);}
        else{this.box('cylinder',s*4.38,1.2,z+3,.12,.45,.12,'#9aa4aa',[.35,.7,0,0]);this.box('cylinder',s*4.38,1.7,z+3,.18,.06,.18,'#9aa4aa',[.35,.7,0,0]);}
      }}
  }
  neighbors(run,t,time){
    const p=run.player;
    for(const side of [-1,1]){
      let z=Math.floor((p.z-40)/30)*30;
      for(let i=0;i<9;i++,z+=30){
        // Most neighbours sit below our roof so the city opens out; an
        // occasional tower stands further back for depth.
        const k=Math.floor(z/30),h=hash(k,side*31+7),len=20+h*8,tower=hash(k,side*17)>(t.id==='spires'?.5:t.id==='storm'?.65:.85),gapX=(tower?16:2.2)+hash(k,side)*4.5,w=7+hash(k,side*3)*8,x=side*(4.8+gapX+w);
        const H=tower?(t.id==='spires'?12+hash(k,side*5)*36:5+hash(k,side*5)*16):-13+hash(k,side*5)*10.5;
        const zc=z+len/2,col=hash(k,side*11)>.5?t.facade:t.facade2;
        this.box('cube',x,(H-40)/2,zc,w,(H+40)/2,len/2,col,[.85,t.glass?.75:0,0,t.glass?0:6]);
        this.box('cube',x,H+.04,zc,w-.3,.04,len/2-.3,shade(t.roof,.82),[.9,0,0,2],false);
        for(const e of [-1,1])this.box('cube',x+e*(w-.15),H+.35,zc,.15,.35,len/2,t.trim,[.6,.1,0,0]);for(const e of [-1,1])this.box('cube',x,H+.35,zc+e*(len/2-.15),w,.35,.15,t.trim,[.6,.1,0,0]);
        // Lit floor strips on the face toward the track.
        const face=x-side*w-side*.02,floors=Math.min(10,Math.floor((H+20)/3.2));
        for(let f=0;f<floors;f++){const fy=H-2.2-f*3.2;if(fy<-20)break;const lit=t.night>.2?hash(k*7+f,side)>.25:hash(k*7+f,side)>.5;
          this.box('cube',face,fy,zc,.05,.62,len/2-1,lit&&t.night>.2?t.window:shade(t.glass?'#bfe3ff':t.window,t.glass?.95:.55),[t.glass?.12:.4,t.glass?.8:0,lit?t.glow*.9+.05:.02,0],false);
          if(!t.glass&&i<6)for(let m=-1;m<=1;m++)this.box('cube',face-side*.03,fy,zc+m*len/3.5,.06,.7,.12,col,[.8,0,0,0],false);}
        // Roof props of neighboring buildings seen from above.
        const r=hash(k,side*13);
        if(r<.3){const tx=x+side*w*.3,tz=zc-len*.2;this.box('cylinder',tx,H+3.1,tz,1.4,1.4,1.4,'#7d5a44',[.85,0,0,7]);this.box('cone',tx,H+4.9,tz,1.5,.45,1.5,'#4e4a48',[.7,.2,0,0]);for(const a of [0,1,2,3])this.box('cylinder',tx+Math.cos(a*TAU/4+.7)*1.1,H+.9,tz+Math.sin(a*TAU/4+.7)*1.1,.1,.9,.1,'#3b3b3b',[.5,.6,0,0]);}
        else if(r<.55){for(let a=0;a<3;a++)this.box('box',x+side*(a-1)*2.6,H+.75,zc+(a-1)*3,1.1,.75,1.3,'#c5cbcf',[.5,.5,0,0]);const fan=time*6;this.box('cylinder',x,H+1.55,zc,.8,.05,.8,'#2e3236',[.4,.6,0,0]);this.box('box',x,H+1.62,zc,.75,.03,.08,'#9aa3a8',[.4,.6,0,0],true,fan);}
        else if(r<.75){for(let a=0;a<4;a++)this.box('box',x,H+.6,zc+(a-1.5)*3.4,w*.6,.06,1.2,'#1f3b6e',[.2,.7,.05,0],true,0,-.35);}
        else{this.box('cylinder',x,H+6,zc,.12,6,.12,'#9aa3a8',[.4,.7,0,0]);this.box('sphere',x,H+12.2,zc,.3,.3,.3,'#ff3030',[.3,0,Math.sin(time*3+k)>0?2:.3,0],false);
          if(t.neon||t.id==='lantern'){const nc=hash(k,9)>.5?t.accent:t.accent2;this.box('box',x-side*w+side*.4,H+2.4,zc,.12,1.6,Math.min(6,len/3),nc,[.3,0,1.6,0],false);}}
        if(t.lanterns&&i%2===0){const zz=z+2;for(let q=0;q<6;q++){const fx=lerp(side*4.4,side*(4.8+gapX),q/5),sag=Math.sin(q/5*Math.PI)*.9;this.box('sphere',fx,2.6-sag+Math.sin(time*1.8+q+k)*.06,zz,.17,.22,.17,q%2?'#ff5a3c':'#ffcf5a',[.3,0,1.6,0],false);}}
      }
    }
  }
  ambient(run,t,time,opts){
    const p=run.player,rm=opts.reducedMotion;
    if(t.clouds)for(let i=0;i<8;i++){const h=hash(i,4),x=((h*400+time*(1.5+h))%400)-200,z=p.z+140+hash(i,8)*200;for(let k=0;k<4;k++)this.box('sphere',x+k*7-10,60+hash(i,2)*30+(k%2)*3,z+k*2,9+k%2*3,4,7,t.night>.5?'#2c3355':'#ffffff',[1,0,.25,0],false,0,0,0,.85);}
    if(t.birds&&!rm)for(let i=0;i<5;i++){const ph=time*.35+i*1.3,x=Math.sin(ph)*18+(i-2)*4,z=p.z+40+((i*23+time*7)%90),y=14+Math.sin(ph*2)*2+i,flap=Math.sin(time*11+i)*.7;
      for(const s of [-1,1])this.box('box',x+s*.35,y,z,.4,.03,.14,'#2b2f38',[.8,0,0,0],false,0,0,s*flap);}
    if(t.drones)for(let i=0;i<3;i++){const side=i%2?1:-1,z=p.z+30+i*28-((time*4)%28),x=side*(7+i*1.5),y=5+Math.sin(time*1.7+i)*.8;
      this.box('box',x,y,z,.45,.12,.45,'#2a2f3a',[.4,.6,0,0]);for(const [a,b] of [[1,1],[1,-1],[-1,1],[-1,-1]]){this.box('cylinder',x+a*.5,y+.12,z+b*.5,.28,.01,.28,'#9aa3a8',[.5,.5,0,0],false,0,0,0,.45);}
      this.box('sphere',x,y-.14,z,.08,.08,.08,i%2?t.accent:t.accent2,[.3,0,Math.sin(time*6+i)>0?2:.5,0],false);}
    if(t.cranes)for(let i=0;i<3;i++){const z=Math.floor(p.z/90)*90+i*90+60,side=i%2?1:-1,x=side*26,yaw=Math.sin(time*.15+i)*.6;
      this.box('box',x,14,z,.7,22,.7,'#e9a03b',[.6,.4,0,0],false);this.box('box',x-side*Math.cos(yaw)*8,35.5,z+Math.sin(yaw)*8,13,.5,.5,'#e9a03b',[.6,.4,0,0],false,yaw*side);
      const hx=x-side*Math.cos(yaw)*14,hz=z+Math.sin(yaw)*14,sw=rm?0:Math.sin(time*.9+i)*.6;this.box('cylinder',hx+sw,28,hz,.04,7,.04,'#333333',[.5,.6,0,0],false);this.box('box',hx+sw*1.8,20.5,hz,3,1.3,1.3,i%2?'#2a9d8f':'#c44536',[.6,.3,0,0],false);}
    if(t.rain&&!rm)for(let i=0;i<70;i++){const h=hash(i,21),x=(h-.5)*26,z=p.z-4+hash(i,3)*40,y=((hash(i,7)*14-time*22)%14+14)%14;this.box('cube',x,y,z,.012,.35,.012,'#b9d5ff',[.2,0,.5,0],false,0,0,0,.35);}
    if(t.id==='storm'&&!rm&&this.flash>.05){const z=p.z+200,x=Math.sin(Math.floor(time)*7.1)*60;for(let k=0;k<6;k++)this.box('cube',x+Math.sin(k*2.3)*4,80-k*12,z,.5,6.5,.5,'#e9f0ff',[1,0,3,0],false,0,0,Math.sin(k*1.7)*.4);}
  }
  obstacles(run,t,time,opts){
    const p=run.player;
    for(const o of run.track.obstacles){
      if(o.z+o.len<p.z-14||o.z>p.z+150)continue;const x=this.E.laneX(o.lane),z=o.z;
      if(o.broken){this.debris(o,t,time);continue;}
      if(o.kind==='hurdle'){
        // Striped rooftop barrier: clearly low, clearly a jump.
        for(const s of [-1,1])this.box('box',x+s*.95,.5,z+.22,.07,.5,.07,'#3a3a3a',[.5,.6,0,0]);
        for(let i=0;i<6;i++)this.box('box',x-.83+i*.333,.78,z+.22,.165,.13,.05,i%2?'#20242a':'#ffc632',[.5,.1,0,0]);
        this.box('box',x,.45,z+.22,.95,.04,.04,'#cfd4d8',[.4,.7,0,0]);for(const s of [-1,1])this.box('sphere',x+s*.95,1.04,z+.22,.07,.07,.07,'#ff7a1a',[.3,0,1.8,0],false);
      }else if(o.kind==='gate'){
        // Hanging sign gate: posts, lit sign board and duck chevrons.
        for(const s of [-1,1])this.box('box',x+s*1.08,1.3,z+.25,.07,1.3,.07,'#2f3540',[.4,.7,0,0]);
        this.box('box',x,1.85,z+.25,1.05,.62,.12,t.trim,[.5,.4,0,0]);this.box('cube',x,1.85,z+.12,.9,.48,.02,t.accent,[.4,0,.9,0],false);
        for(let i=-1;i<=1;i++)this.box('wedge',x+i*.55,1.6,z+.09,.16,.14,.02,'#fff6d6',[.4,0,1.1,0],false,0,0,Math.PI);
        this.box('cube',x,1.2,z+.25,1.06,.025,.13,'#ff3355',[.3,0,1.6,0],false);
      }else if(o.kind==='block'){
        // HVAC vent stack with a spinning fan: a tall solid wall.
        this.box('box',x,1.1,z+.7,1.0,1.1,.7,'#b9c2c7',[.45,.55,0,0]);this.box('box',x,2.24,z+.7,1.04,.06,.74,'#7c878e',[.4,.6,0,0]);
        this.box('cylinder',x,1.35,z-.01,.62,.04,.62,'#3a4046',[.4,.6,0,0],true,0,Math.PI/2);
        const spin=opts.reducedMotion?0:time*9;for(let b=0;b<4;b++)this.box('box',x,1.35,z-.05,.55,.08,.015,'#d9dee1',[.4,.6,0,0],false,0,0,spin+b*Math.PI/4);
        for(let i=0;i<4;i++)this.box('cube',x,.32+i*.11,z-.02,.85,.025,.02,'#4b545b',[.5,.5,0,0],false);
        this.box('sphere',x+.8,2.35,z+.2,.08,.08,.08,'#ff2a2a',[.3,0,2,0],false);this.box('cube',x,2.0,z-.01,.7,.07,.015,'#ffcc33',[.4,0,.5,0],false);
      }else if(o.kind==='crate'){
        const col=['#c44536','#2a6f97','#e9c46a','#2a9d8f','#7b2cbf'][o.id%5],start=z+(o.ramp||0),len=o.len-(o.ramp||0);
        this.box('box',x,1.3,start+len/2,.98,1.3,len/2,col,[.55,.35,0,4]);
        for(let k=0;k<Math.floor(len/.8);k++)for(const s of [-1,1])this.box('cube',x+s*.99,1.3,start+.4+k*.8,.02,1.2,.12,shade(col,.78),[.6,.3,0,0],false);
        this.box('box',x,2.62,start+len/2,.99,.03,len/2-.1,shade(col,1.15),[.5,.3,0,0],false);
        this.box('cube',x,1.3,start-.01,.92,1.2,.02,shade(col,.7),[.6,.3,0,0],false);for(const s of [-.4,.4])this.box('cube',x+s,1.3,start-.03,.03,1.1,.02,'#d9d9d9',[.4,.7,0,0],false);
        if(o.ramp){const rl=o.ramp,ang=Math.atan2(o.top,rl),hyp=Math.hypot(o.top,rl);this.box('box',x,o.top/2-.05,z+rl/2,.92,.06,hyp/2,'#8a6440',[.8,0,0,7],true,0,-ang);
          for(let k=1;k<5;k++)this.box('cube',x,o.top*k/5+.02,z+rl*k/5,.9,.015,.05,'#ffcc33',[.4,0,.4,0],false,0,-ang);}
      }else if(o.kind==='tram'){
        // Freight tram on its own rails, headlights on once rolling.
        const lit=o.active?1:.25,zc=z+o.len/2;for(const s of [-1,1])this.box('cube',x+s*.75,.03,Math.max(p.z-10,z-40)/2+(z+o.len+4)/2,.05,.03,(z+o.len+4-Math.max(p.z-10,z-40))/2,'#b8c0c6',[.3,.8,.05,0],false);
        this.box('box',x,1.35,zc,1.0,1.15,o.len/2,'#d0d6d8',[.4,.5,0,0]);this.box('box',x,.32,zc,.9,.18,o.len/2-.2,'#2b2f33',[.6,.4,0,0]);
        this.box('box',x,2.42,zc,.9,.08,o.len/2-.4,'#8d969b',[.4,.6,0,0]);for(let k=0;k<4;k++)for(const s of [-1,1])this.box('cube',x+s*1.0,1.7,z+1.3+k*2.1,.02,.32,.7,'#26313a',[.15,.8,.1,0],false);
        this.box('cube',x,1.55,z-.01,.92,.5,.02,'#1b252e',[.1,.8,.2,0],false);this.box('cube',x,.9,z-.02,.98,.14,.02,'#f4a261',[.4,0,.3,0],false);
        for(const s of [-1,1])this.box('sphere',x+s*.62,.85,z-.04,.14,.14,.05,'#fff4cf',[.3,0,2.4*lit,0],false);
        if(o.active)this.box('cone',x,.85,z-4,1.1,4,1.1,'#fff4cf',[.3,0,.4,0],false,0,Math.PI/2,0,.12);
        const roll=opts.reducedMotion||!o.active?0:time*14;for(const k of [1,o.len-1])for(const s of [-1,1])this.box('cylinder',x+s*.92,.32,z+k,.3,.06,.3,'#3a3f44',[.5,.6,0,0],true,0,roll,Math.PI/2);
      }
    }
  }
  debris(o,t,time){const x=this.E.laneX(o.lane);for(let i=0;i<6;i++){const h=hash(o.id,i);this.box('box',x+(h-.5)*2.4,.12,o.z+hash(i,o.id)*Math.min(3,o.len),.18,.1,.22,i%2?'#9aa3a8':t.trim,[.6,.3,0,0],true,h*6);}}
  pickups(run,t,time,opts){
    const p=run.player,spin=opts.reducedMotion?.6:time*3.2;
    for(const q of run.track.pickups){
      if(q.taken||q.z<p.z-4||q.z>p.z+110)continue;const bob=opts.reducedMotion?0:Math.sin(time*3+q.z)*.08;
      if(q.kind==='token'){this.box('cylinder',q.x,q.y+bob,q.z,.3,.045,.3,'#f2b632',[.28,.95,.22,0],false,spin,Math.PI/2);this.box('cylinder',q.x,q.y+bob,q.z,.18,.055,.18,'#ffe08a',[.25,.9,.35,0],false,spin,Math.PI/2);}
      else if(q.kind==='cell'){this.box('capsule',q.x,q.y+bob,q.z,.16,.3,.16,'#58e1ff',[.2,.2,1.4,0],false,spin);this.box('torus',q.x,q.y+bob,q.z,.42,.42,.42,'#c7f6ff',[.3,.6,.7,0],false,spin,Math.PI/2);this.beam(q,'#58e1ff');}
      else{this.powerIcon(q.kind,q.x,q.y+bob,q.z,spin,t);this.beam(q,{magnet:'#ff5d5d',shield:'#6fe3ff',springs:'#8cff6b'}[q.kind]);}
    }
  }
  // A slim light column marks special pickups from afar and fades up close.
  beam(q,color){const dz=q.z-(this.cam?this.cam.z:q.z-30),fade=clamp((dz-12)/18,0,1);if(fade>0)this.box('cylinder',q.x,3.5,q.z,.16,3.5,.16,color,[.3,0,.8,0],false,0,0,0,.16*fade);this.box('ring',q.x,.03,q.z,.75,.75,.75,color,[.3,0,1,0],false,0,-Math.PI/2);}
  powerIcon(kind,x,y,z,spin,t){
    if(kind==='magnet'){for(const s of [-1,1]){this.box('box',x+Math.cos(spin)*s*.24,y-.05,z+Math.sin(spin)*s*.24,.1,.26,.1,'#e63946',[.4,.4,.3,0],false,spin);this.box('box',x+Math.cos(spin)*s*.24,y-.36,z+Math.sin(spin)*s*.24,.11,.07,.11,'#e8edf0',[.3,.8,.3,0],false,spin);}
      this.box('torus',x,y+.2,z,.52,.52,1.4,'#e63946',[.4,.4,.3,0],false,spin);}
    else if(kind==='shield'){this.box('sphere',x,y,z,.48,.48,.48,'#8fe9ff',[.1,.3,.5,0],false,0,0,0,.45);this.box('wedge',x,y,z,.18,.22,.06,'#ffffff',[.3,0,1,0],false,spin,0,Math.PI);}
    else{this.box('box',x,y-.15,z,.18,.1,.32,'#f1faee',[.5,0,.2,0],false,spin);this.box('box',x,y-.27,z,.2,.03,.34,'#8cff6b',[.4,0,.8,0],false,spin);for(let k=0;k<3;k++)this.box('torus',x,y-.42-k*.09,z,.22,.22,.6,'#c9d6dc',[.3,.9,0,0],false,spin,Math.PI/2);}
  }
  // ---- Runner -------------------------------------------------------------
  targetPose(run,opts){
    const p=run.player,E=this.E,dist=p.z,phase=dist/2.3*TAU,crash=run.phase==='crashed',air=!p.grounded&&p.glide<=0&&!crash;
    const pose={hip:.92,lean:.2,roll:0,yaw:0,thL:0,thR:0,knL:.25,knR:.25,shL:0,shR:0,elL:1.2,elR:1.2,spread:.12,wing:0,pitch:0,headNod:0};
    if(crash){const k=clamp((opts.crashT||0)/.45,0,1);Object.assign(pose,{hip:lerp(.92,.32,k),lean:lerp(.2,-1.35,k),thL:lerp(0,1.2,k),thR:lerp(0,.9,k),knL:.3,knR:.6,shL:lerp(0,2.4,k),shR:lerp(0,2.1,k),elL:.4,elR:.6,spread:.6*k});return pose;}
    if(p.glide>0){Object.assign(pose,{hip:.95,lean:1.15,thL:-.15,thR:-.1,knL:.15,knR:.2,shL:-.3,shR:-.3,elL:.2,elR:.2,spread:1.35,wing:1,pitch:0,headNod:-.6});return pose;}
    if(p.slide>0){const s=Math.sin(phase*.5)*.05;Object.assign(pose,{hip:.36,lean:-1.12,thL:1.42,thR:1.25+s,knL:.12,knR:.45,shL:1.3,shR:-.7,elL:.35,elR:.25,spread:.35,headNod:.75});return pose;}
    if(air){const up=p.vy>0,k=clamp(p.vy/9.6,-1,1);Object.assign(pose,{hip:.92,lean:.32,thL:up?1.25:.7-k*.2,thR:up?.25:.35,knL:up?1.7:1.0,knR:up?.7:.5,shL:up?-1.0:-.6,shR:up?1.6:1.1,elL:.6,elR:.9,spread:up?.5:.75});return pose;}
    // Running stride, tied to distance actually covered.
    const s=Math.sin(phase),c=Math.cos(phase),speed=E.currentSpeed(run),amp=clamp(.65+speed/45,.7,1.25);
    Object.assign(pose,{hip:.92-Math.abs(c)*.05,lean:.16+speed*.006,thL:s*.85*amp,thR:-s*.85*amp,knL:.25+Math.max(0,-c)*1.35*amp,knR:.25+Math.max(0,c)*1.35*amp,shL:-s*.95*amp,shR:s*.95*amp,elL:1.35,elR:1.35,spread:.12,headNod:Math.abs(s)*.03});
    if(p.landT<.18){const k=1-p.landT/.18;pose.hip-=.2*k;pose.knL+=.7*k;pose.knR+=.7*k;pose.thL+=.35*k;pose.thR+=.35*k;pose.lean+=.25*k;}
    if(p.stumble>0){const k=p.stumble/.6;pose.shL=-1.8*k;pose.shR=2.0*k;pose.spread=.9*k;pose.headNod=-.4*k;pose.roll+=Math.sin(run.time*30)*.15*k;}
    return pose;
  }
  runner(run,t,time,opts,dt){
    const p=run.player,E=this.E,target=this.targetPose(run,opts),outfit=E.OUTFITS.find(o=>o.id===run.outfit)||OUTFIT_DEFAULT;
    if(!this.pose||opts.snap)this.pose={...target};
    const k=1-Math.exp(-dt*(p.slide>0||!p.grounded?16:22));for(const key of Object.keys(target))this.pose[key]+=(target[key]-this.pose[key])*k;
    const P=this.pose,HD=root.GameHD;
    // Lane lean from lateral velocity; slight yaw into the move.
    const lx=E.laneX(p.lane),dx=lx-p.x;const laneVel=p.laneT<1?Math.sign(dx)*Math.sin(p.laneT*Math.PI):0;
    const roll=P.roll+laneVel*.32,yaw=-laneVel*.28;
    const X=-p.x,crashSlide=run.phase==='crashed'?Math.min(1,(opts.crashT||0)*2.2)*1.2:0;
    const rootM=HD.matrix(X,Math.max(-.6,p.y),p.z-crashSlide,1,1,1,yaw,0,-roll);
    // Feet planted: shift so the lowest foot touches the surface when grounded.
    const legs=[];for(const [side,th,kn] of [[1,P.thL,P.knL],[-1,P.thR,P.knR]]){const hip=[side*.11,P.hip,0],knee=[hip[0],hip[1]-.44*Math.cos(th),hip[2]+.44*Math.sin(th)],sh=th-kn,ankle=[hip[0],knee[1]-.43*Math.cos(sh),knee[2]+.43*Math.sin(sh)];legs.push({side,hip,knee,ankle,sh});}
    let lift=0;if(p.grounded&&p.glide<=0&&run.phase!=='crashed'){const low=Math.min(legs[0].ankle[1],legs[1].ankle[1]);lift=.07-low;}
    for(const L of legs){L.hip[1]+=lift;L.knee[1]+=lift;L.ankle[1]+=lift;}
    const W=q=>xform(rootM,q),pelvisY=P.hip+lift;
    const torso=HD.multiply(rootM,HD.matrix(0,pelvisY,0,1,1,1,0,P.lean,0)),TW=q=>xform(torso,q);
    const skin=outfit.skin,jacket=outfit.jacket,pants=outfit.pants,shoes=outfit.shoes,accent=outfit.accent;
    const draw=(m,color,params)=>{const c=hex(color);this.scene.draw('capsule',m,[c[0],c[1],c[2],1],params,true);};
    // Shadow blob under the runner for ground contact readability.
    const sy=Math.max(0,this.groundUnder(run));this.box('disc',p.x,sy+.015,p.z-crashSlide,.55,.01,.45,'#000000',[1,0,0,0],false,0,0,0,.28*clamp(1-(p.y-sy)/4,.2,1));
    // Legs and shoes.
    for(const L of legs){draw(limb(W(L.hip),W(L.knee),.1),pants,[.85,0,0,8]);draw(limb(W(L.knee),W(L.ankle),.085),pants,[.85,0,0,8]);
      const foot=HD.multiply(rootM,HD.matrix(L.ankle[0],L.ankle[1]-.03,L.ankle[2]+.08,.075,.055,.15,0,-(L.sh)*.35,0));this.scene.draw('box',foot,[...hex(shoes),1],[.55,0,0,0],true);
      const sole=HD.multiply(foot,HD.matrix(0,-.85,0,1.05,.25,1.05));this.scene.draw('box',sole,[...hex(run.power.springs>0?'#8cff6b':accent),1],[.4,0,run.power.springs>0?.9:.1,0],false);
      if(run.power.springs>0)for(let c=0;c<2;c++){const pt=W([L.ankle[0],L.ankle[1]-.12-c*.06,L.ankle[2]+.05]);this.scene.draw('torus',HD.matrix(pt[0],pt[1],pt[2],.09,.09,.3,0,Math.PI/2,0),[.8,.85,.9,1],[.3,.9,0,0],false);}}
    // Pelvis and torso.
    this.scene.draw('box',HD.multiply(rootM,HD.matrix(0,pelvisY,0,.19,.1,.12)),[...hex(pants),1],[.85,0,0,8],true);
    this.scene.draw('torso',HD.multiply(torso,HD.matrix(0,.29,0,.21,.29,.15)),[...hex(jacket),1],[.75,0,0,8],true);
    this.scene.draw('box',HD.multiply(torso,HD.matrix(0,.33,.13,.05,.2,.02)),[...hex(accent),1],[.5,0,.2,0],false);
    // Arms.
    for(const [side,s,e] of [[1,P.shL,P.elL],[-1,P.shR,P.elR]]){const sp=P.spread*side,shoulder=[side*.24,.53,0],elbow=[shoulder[0]+Math.sin(sp)*.3,shoulder[1]-.3*Math.cos(s)*Math.cos(sp),shoulder[2]+.3*Math.sin(s)],a=s+e,hand=[elbow[0]+Math.sin(sp)*.14,elbow[1]-.27*Math.cos(a),elbow[2]+.27*Math.sin(a)];
      draw(limb(TW(shoulder),TW(elbow),.075),jacket,[.75,0,0,8]);draw(limb(TW(elbow),TW(hand),.062),skin,[.7,0,0,9]);const hw=TW(hand);this.scene.draw('sphere',HD.matrix(hw[0],hw[1],hw[2],.065,.065,.065),[...hex(skin),1],[.7,0,0,9],true);}
    // Neck and head (facing away from the camera, hair/headgear readable).
    const neck=TW([0,.6,.02]),head=TW([0,.74,.04+P.headNod*.03]);draw(limb(neck,TW([0,.68,.03]),.05),skin,[.7,0,0,9]);
    const headM=HD.multiply(torso,HD.matrix(0,.75,.05,.125,.135,.13,0,-P.lean*.6+P.headNod,0));this.scene.draw('sphere',headM,[...hex(skin),1],[.7,0,0,9],true);
    this.scene.draw('sphere',HD.multiply(headM,HD.matrix(0,.18,-.12,1.05,.88,1.0)),[...hex(outfit.hair),1],[.8,0,0,8],true);
    const gear=outfit.gear;
    if(gear==='cap'){this.scene.draw('sphere',HD.multiply(headM,HD.matrix(0,.35,0,1.08,.7,1.08)),[...hex(accent),1],[.7,0,0,8],true);this.scene.draw('box',HD.multiply(headM,HD.matrix(0,.25,.95,.75,.06,.45)),[...hex(accent),1],[.7,0,0,8],false);}
    if(gear==='visor')this.scene.draw('box',HD.multiply(headM,HD.matrix(0,.1,.82,.9,.22,.25)),[...hex(accent),1],[.2,.6,.9,0],false);
    if(gear==='antenna'){const a=TW([.08,.95,-.02]);this.scene.draw('cylinder',HD.matrix(a[0],a[1],a[2],.012,.14,.012),[.8,.8,.85,1],[.4,.8,0,0],false);this.scene.draw('sphere',HD.matrix(a[0],a[1]+.15,a[2],.04,.04,.04),[...hex(accent),1],[.3,0,2,0],false);}
    if(gear==='scarf'){let prev=TW([0,.6,-.08]);for(let i=1;i<=5;i++){const wave=opts.reducedMotion?0:Math.sin(time*12-i*.9)*.05*i;const pt=W([wave,pelvisY+.62-i*.05+(p.grounded?0:-p.vy*.004*i),-.12-i*.13]);draw(limb(prev,pt,.05),accent,[.9,0,0,8]);prev=pt;}}
    if(gear==='satchel'){this.scene.draw('box',HD.multiply(torso,HD.matrix(.17,.12,-.13,.1,.12,.06,0,.1,0)),[...hex(accent),1],[.85,0,0,8],true);draw(limb(TW([-.17,.55,-.1]),TW([.15,.2,-.15]),.022),'#3a2a1f',[.8,0,0,0]);}
    // Backpack thruster pack carries the Glide Wing.
    this.scene.draw('box',HD.multiply(torso,HD.matrix(0,.33,-.18,.14,.17,.06)),[...hex(shade(jacket,.6)),1],[.6,.3,0,0],true);
    if(P.wing>.05){for(const s of [-1,1]){const wm=HD.multiply(torso,HD.matrix(s*.75*P.wing,.38,-.22,.7*P.wing,.025,.3,0,0,s*.12));this.scene.draw('box',wm,[...hex(accent),1],[.4,.2,.35,0],true);this.scene.draw('box',HD.multiply(wm,HD.matrix(0,1.2,0,.95,.5,.18)),[...hex('#ffffff'),.9],[.3,0,.6,0],false);}
      const tail=TW([0,.2,-.4]);this.scene.draw('sphere',HD.matrix(tail[0],tail[1],tail[2],.12,.12,.25),[...hex('#ffd27a'),.8],[.2,0,2.2,0],false);}
    // Active power-up visuals.
    const c=TW([0,.35,0]);
    if(run.power.shield>0){const pulse=opts.reducedMotion?1:1+Math.sin(time*5)*.03,fade=run.power.shield<3?(Math.sin(time*14)>0?.32:.12):.26;this.scene.draw('sphere',HD.matrix(c[0],c[1],c[2],1.05*pulse,1.25*pulse,1.05*pulse),[.55,.9,1,fade],[.1,.3,.6,0],false);}
    if(run.power.magnet>0){for(let i=0;i<2;i++){const a=(opts.reducedMotion?0:time*3)+i*Math.PI;this.scene.draw('torus',HD.matrix(c[0],c[1]-.2+i*.4,c[2],1.2,1.2,.4,a,Math.PI/2,0),[1,.36,.36,run.power.magnet<3&&Math.sin(time*14)<0?.15:.4],[.3,0,1,0],false);}}
    if(p.grace>0&&p.glide<=0&&run.phase==='playing'&&Math.sin(time*30)>0)this.scene.draw('sphere',HD.matrix(c[0],c[1],c[2],.8,1.1,.8),[1,1,1,.12],[.2,0,1,0],false);
    this.headWorld=head;
  }
  groundUnder(run){const p=run.player;let g=0;for(const o of run.track.obstacles){if(o.broken||o.kind==='gate'||o.lane!==this.E.laneOf(p.x))continue;if(p.z>=o.z&&p.z<=o.z+o.len){const s=this.E.surfaceAt(o,p.z);if(p.y>=s-.2)g=Math.max(g,s);}}for(const q of run.track.gaps)if(q.lanes[this.E.laneOf(p.x)]&&p.z>q.z&&p.z<q.z+q.len)return -30;return g;}
  consumeEvents(run,opts){
    if(!this.seenEvents||this.seenRun!==run){this.seenEvents=new WeakSet();this.seenRun=run;this.particles=[];for(const e of run.events)this.seenEvents.add(e);return;}
    for(const e of run.events){if(this.seenEvents.has(e))continue;this.seenEvents.add(e);
      if(!this.cam)continue;
      if(e.type==='crash')this.cam.shake=1;else if(e.type==='bump'||e.type==='shield-break')this.cam.shake=.6;else if(e.type==='land'&&e.fall>1.2)this.cam.shake=.22;
      if(opts.reducedMotion)continue;
      const burst=(n,color,speed,life,y=.9,size=.06)=>{for(let i=0;i<n;i++){const a=i*2.399+Math.random()*.3,u=Math.random();this.particles.push({x:e.x,y:run.player.y+y,z:e.z,vx:Math.cos(a)*speed*u,vy:Math.random()*speed,vz:Math.sin(a)*speed*u+3,life,age:0,color,size});}};
      if(e.type==='token')burst(4,'#ffe08a',2.2,.35,.95,.05);
      else if(e.type==='cell')burst(10,'#58e1ff',3,.5,1,.07);
      else if(e.type==='power')burst(16,'#ffffff',4,.6,1,.07);
      else if(e.type==='land')burst(6,'#d9cbb8',1.6,.35,.05,.08);
      else if(e.type==='slide')burst(8,'#d9cbb8',1.4,.45,.05,.07);
      else if(e.type==='shield-break'){burst(18,'#8fe9ff',5,.7,1,.08);}
      else if(e.type==='crash'){burst(16,'#ffcc66',5,.8,.9,.09);this.flash=Math.max(this.flash,.35);}
      else if(e.type==='glide')burst(14,'#ffd27a',3,.6,1,.07);
    }
    if(this.particles.length>140)this.particles.splice(0,this.particles.length-140);
  }
  effects(run,t,time,opts){
    const p=run.player,dt=this.frameDt||1/60;
    if(this.particles){for(const q of this.particles){q.age+=dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.z+=q.vz*dt;q.vy-=6*dt;}this.particles=this.particles.filter(q=>q.age<q.life);
      for(const q of this.particles){const f=1-q.age/q.life;this.box('sphere',q.x,q.y,q.z,q.size*f+.01,q.size*f+.01,q.size*f+.01,q.color,[.3,0,1,0],false,0,0,0,.85*f);}}
    // Restrained speed streaks at high pace or while gliding.
    const v=this.E.currentSpeed(run);if(!opts.reducedMotion&&run.phase==='playing'&&(v>21||p.glide>0)){const n=p.glide>0?12:Math.floor((v-21)*1.2);for(let i=0;i<n;i++){const h=hash(i,Math.floor(time*6)),side=i%2?1:-1;this.box('cube',p.x+side*(2.5+h*3),.6+hash(i,3)*3.5,p.z+4+((h*40+time*60)%30),.012,.012,1.4,'#ffffff',[.2,0,.6,0],false,0,0,0,.22);}}
    if(t.id==='storm'&&!opts.reducedMotion&&run.phase==='playing'&&Math.floor(time*10)%137===0&&this.flash<.05)this.flash=1;
  }
  // ---- 2D fallback ------------------------------------------------------------
  renderFlat(run,opts){
    const ctx=this.ctx;if(!ctx)return;const W=this.canvas.width,H=this.canvas.height,p=run.player,t=this.palette(run,p.z),col=c=>{const v=hex(c);return`rgb(${v.map(x=>Math.round(x*255)).join(',')})`;};
    // Simple perspective matching the 3D chase view: engine +x is screen-right.
    const hz=H*.34,cam=p.z-7,fy=H*.9,fx=Math.min(W*.85,H*.9),proj=(x,y,z)=>{const d=z-cam;if(d<=.8)return null;return{x:W/2+(x-p.x*.6)*fx/d,y:hz+(4.2-y)*fy/d*.95,s:fx/d};};
    const g=ctx.createLinearGradient(0,0,0,hz);g.addColorStop(0,col(t.sky[0]));g.addColorStop(1,col(t.sky[3]));ctx.fillStyle=g;ctx.fillRect(0,0,W,hz);ctx.fillStyle=col(t.facade);ctx.fillRect(0,hz,W,H-hz);
    const strip=(z0,z1,x0,x1,color)=>{const a=proj(x0,0,z0),b=proj(x1,0,z0),c=proj(x1,0,z1),d=proj(x0,0,z1);if(!a||!b||!c||!d)return;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.fill();};
    strip(p.z-5,p.z+120,-4.4,4.4,col(t.roof));for(const q of run.track.gaps)if(q.z<p.z+120&&q.z+q.len>p.z-5)strip(Math.max(q.z,p.z-5),q.z+q.len,-4.4,4.4,'#11131a');
    for(const x of [-1.3,1.3])strip(p.z-5,p.z+120,x-.05,x+.05,col(t.lane));
    const items=[];for(const o of run.track.obstacles)if(!o.broken&&o.z+o.len>p.z-3&&o.z<p.z+110)items.push({z:o.z,o});for(const q of run.track.pickups)if(!q.taken&&q.z>p.z-2&&q.z<p.z+90)items.push({z:q.z,q});items.sort((a,b)=>b.z-a.z);
    for(const it of items){if(it.o){const o=it.o,x=this.E.laneX(o.lane),a=proj(x,o.top,Math.max(o.z,p.z-5)),b=proj(x,o.kind==='gate'?o.under:0,Math.max(o.z,p.z-5));if(!a||!b)continue;const w=a.s*.95;ctx.fillStyle={hurdle:'#ffc632',gate:col(t.accent),block:'#b9c2c7',crate:'#c44536',tram:'#d0d6d8'}[o.kind];ctx.fillRect(a.x-w,a.y,w*2,b.y-a.y);ctx.strokeStyle='#111';ctx.lineWidth=Math.max(1,a.s*.05);ctx.strokeRect(a.x-w,a.y,w*2,b.y-a.y);}
      else{const q=it.q,a=proj(q.x,q.y,q.z);if(!a)continue;ctx.fillStyle={token:'#f2b632',cell:'#58e1ff',magnet:'#e63946',shield:'#8fe9ff',springs:'#8cff6b'}[q.kind];ctx.beginPath();ctx.arc(a.x,a.y,Math.max(2,a.s*(q.kind==='token'?.25:.4)),0,TAU);ctx.fill();}}
    const r=proj(p.x,p.y,p.z);if(r){const h=(p.slide>0?.8:1.75)*fy/7*.95,phase=p.z/2.3*TAU;r.s=fx/7;ctx.strokeStyle=col((this.E.OUTFITS.find(o=>o.id===run.outfit)||OUTFIT_DEFAULT).jacket);ctx.lineWidth=Math.max(3,r.s*.14);ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(r.x,r.y-h);ctx.lineTo(r.x,r.y-h*.45);for(const s of [-1,1]){ctx.moveTo(r.x,r.y-h*.45);ctx.lineTo(r.x+Math.sin(phase)*s*r.s*.2,r.y);ctx.moveTo(r.x,r.y-h*.8);ctx.lineTo(r.x-Math.sin(phase)*s*r.s*.22,r.y-h*.5);}ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(r.x,r.y-h-r.s*.12,r.s*.13,0,TAU);ctx.fill();}
    this.stats={fallback:'2d',reason:this.failure};
  }
  debug(){return{mode:this.mode,lost:this.lost,width:this.canvas.width,height:this.canvas.height,portrait:!!this.portrait,fov:this.fov,failure:this.failure||null,...this.stats};}
  destroy(){this.scene?.destroy();}
}
root.SkylineRenderer=Renderer;root.SkylineThemes=THEMES;
})(typeof globalThis!=='undefined'?globalThis:this);
