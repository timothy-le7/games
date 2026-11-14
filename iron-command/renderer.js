/* Original procedural battlefield, armor and architecture. No remote assets. */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./hd-scene.js'):root.GameHD,typeof module==='object'&&module.exports?require('./engine.js'):root.IronEngine);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.IronBattlefield=api.Battlefield;
})(typeof globalThis!=='undefined'?globalThis:this,(H,E)=>{'use strict';
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a)),turn=(a,b,rate)=>a+wrap(b-a)*(1-Math.exp(-rate));
const hash=(a,b=0)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v);};
const MAT=[.8,.02,0,6],METAL=[.4,.65,0,0],DARK='#233039',SAND='#b59b70',TEAMS=['#48c8bb','#e07951'];
class VehicleMotion{
  constructor(){this.units=new Map();}
  sample(u,time,reduced=false){
    let a=this.units.get(u.id);
    if(!a||a.type!==u.type||time<a.time||time-a.time>.3||Math.hypot(u.x-a.x,u.z-a.z)>5){a={type:u.type,x:u.x,z:u.z,time,angle:u.angle,yaw:u.angle,turret:u.turret,left:0,right:0,speed:0,pitch:0,roll:0};this.units.set(u.id,a);}
    const dt=clamp(time-a.time,0,.1),dx=u.x-a.x,dz=u.z-a.z,rotation=wrap(u.angle-a.angle),travel=dx*Math.sin(u.angle)+dz*Math.cos(u.angle);
    // Travel drives wheels and each side of the belt. Turning can move one
    // side backward; a stopped or paused vehicle never has a scrolling tread.
    a.left+=travel+rotation*1.05;a.right+=travel-rotation*1.05;
    const speed=dt>0?travel/dt:0,blend=1-Math.exp(-dt*12),acceleration=dt>0?(speed-a.speed)/dt:0;
    a.pitch+=(clamp(-acceleration*.0015,-.035,.035)-a.pitch)*blend;a.roll+=(clamp(rotation*.35,-.035,.035)-a.roll)*blend;
    a.speed+=(speed-a.speed)*blend;a.yaw=turn(a.yaw,u.angle,dt*13);a.turret=turn(a.turret,u.turret,dt*17);
    a.yaw=u.angle+clamp(wrap(a.yaw-u.angle),-.32,.32);a.turret=u.turret+clamp(wrap(a.turret-u.turret),-.65,.65);
    a.x=u.x;a.z=u.z;a.time=time;a.angle=u.angle;
    return{yaw:reduced?u.angle:a.yaw,turret:reduced?u.turret:a.turret,left:a.left,right:a.right,pitch:reduced?0:a.pitch,roll:reduced?0:a.roll,speed:a.speed};
  }
}
  function joint(from,to,a,b,bend){
    const delta=to.map((v,i)=>v-from[i]),distance=Math.hypot(...delta),axis=distance>.00001?H.normalize(delta):[0,-1,0],
      reach=clamp(distance,Math.abs(a-b)+.0001,a+b-.0001),along=(a*a-b*b+reach*reach)/(2*reach),height=Math.sqrt(Math.max(0,a*a-along*along));
    let plane=bend.map((v,i)=>v-axis[i]*bend.reduce((n,v,i)=>n+v*axis[i],0));
    if(Math.hypot(...plane)<.00001)plane=[axis[1],-axis[0],.001];
    const side=H.normalize(plane);
    return {knee:from.map((v,i)=>v+axis[i]*along+side[i]*height),end:from.map((v,i)=>v+axis[i]*reach),clamped:distance>reach+.001};
  }
class InfantryMotion{
  constructor(){this.units=new Map();}
  sample(u,time,reduced=false){
    let a=this.units.get(u.id);const moved=a?Math.hypot(u.x-a.x,u.z-a.z):0;
    if(!a||a.type!==u.type||time<a.time||time-a.time>.3||moved>2){a={type:u.type,x:u.x,z:u.z,time,body:u.turret,hips:u.angle,next:0,active:-1,weight:0,feet:[-1,1].map(k=>({x:u.x+Math.cos(u.angle)*k*.23,z:u.z-Math.sin(u.angle)*k*.23,y:.14}))};this.units.set(u.id,a);}
    const dt=clamp(time-a.time,0,.1),vx=dt?(u.x-a.x)/dt:0,vz=dt?(u.z-a.z)/dt:0,speed=Math.hypot(vx,vz);
    a.weight+=(clamp(speed/5,0,1)-a.weight)*(1-Math.exp(-dt*13));a.body=turn(a.body,u.turret,dt*15);a.hips=turn(a.hips,u.angle,dt*12);
    const right=[Math.cos(a.hips),0,-Math.sin(a.hips)],forward=[Math.sin(a.hips),0,Math.cos(a.hips)];
    if(reduced){a.active=-1;a.feet.forEach((f,i)=>{const k=i?1:-1;f.x=u.x+right[0]*k*.23;f.z=u.z+right[2]*k*.23;f.y=.14;});}
    else if(dt>0){
      if(a.active>=0){const f=a.feet[a.active],t=clamp((time-f.began)/f.duration,0,1),q=t*t*t*(t*(t*6-15)+10);f.x=f.from.x+(f.to.x-f.from.x)*q;f.z=f.from.z+(f.to.z-f.from.z)*q;f.y=.14+Math.sin(t*Math.PI)*.24;if(t===1){a.next=1-a.active;a.active=-1;}}
      if(a.active<0){const f=a.feet[a.next],k=a.next?1:-1,home={x:u.x+right[0]*k*.23,z:u.z+right[2]*k*.23};if(Math.hypot(home.x-f.x,home.z-f.z)>(speed>.2?.20:.13)){const duration=clamp(.32/Math.max(.1,speed),.045,.18);f.from={x:f.x,z:f.z};f.to={x:home.x+vx*Math.max(duration*1.1,.10),z:home.z+vz*Math.max(duration*1.1,.10)};f.began=time;f.duration=duration;a.active=a.next;}}
    }
    a.x=u.x;a.z=u.z;a.time=time;return{yaw:a.body,hipYaw:a.hips,weight:a.weight,feet:a.feet.map((f,i)=>({x:f.x,y:f.y,z:f.z,swing:a.active===i})),forward,right};
  }
}
function vehicleMeshes(){return{
  cuirass:H.loft([[-.5,0,0],[-.45,.65,.72],[-.25,.82,.86],[.12,1,1],[.37,.92,.9],[.5,0,0]],32,3),
  helmet:H.loft([[-.5,0,0],[-.43,.77,.8],[-.1,1,1],[.24,.93,.96],[.45,.54,.61],[.5,0,0]],32,3),
  armorHull:H.loft([[-.5,0,0],[-.45,.76,.77,-.02],[-.18,1,.95],[.13,.98,1],[.39,.77,.80,-.035],[.5,0,0,-.05]],32,4),
  armorTurret:H.loft([[-.5,0,0],[-.46,.84,.82],[-.27,1,.95],[.13,.94,1,-.04],[.38,.72,.74,-.08],[.5,0,0,-.08]],32,3.5),
  tread:H.loft([[-.5,0,0],[-.47,.85,.71],[-.23,1,.94],[.23,1,.94],[.47,.85,.71],[.5,0,0]],24,4)
};}
class Battlefield{
  constructor(canvas,overlay){this.canvas=canvas;this.overlay=overlay;this.ctx=overlay.getContext('2d');this.scene=new H.Scene(canvas,{shadowSize:2048,bloomStrength:.20,meshes:vehicleMeshes()});this.motion=new VehicleMotion();this.infantryMotion=new InfantryMotion();this.unitPoses=new Map();this.camera={x:-28,z:18,zoom:1};this.resetEffects();this.vp=null;this.stats={};this.width=1;this.height=1;this.frame=0;this.staticCommands=null;}
  resetEffects(){this.effects=[];this.lastEvent=0;this.shots=new Map();this.hits=new Map();this.motion?.units.clear();this.infantryMotion?.units.clear();}
  resize(){const r=this.canvas.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.scene.resize(this.width,this.height,devicePixelRatio||1,3500000);const d=Math.min(devicePixelRatio||1,2);const w=Math.round(this.width*d),h=Math.round(this.height*d);if(this.overlay.width!==w||this.overlay.height!==h){this.overlay.width=w;this.overlay.height=h;}this.ctx.setTransform(d,0,0,d,0,0);}
  setup(){const c=this.camera,aspect=this.width/this.height,span=(aspect<.8?64:48)/c.zoom,eye=[c.x+21,31.5,c.z+25.5];this.eye=eye;this.span=span;this.vp=H.multiply(H.ortho(-span*aspect/2,span*aspect/2,-span/2,span/2,.1,220),H.lookAt(eye,[c.x,0,c.z]));}
  project(x,z,y=0){const m=this.vp;if(!m)return{x:0,y:0};return{x:(m[0]*x+m[4]*y+m[8]*z+m[12]+1)*this.width/2,y:(1-m[1]*x-m[5]*y-m[9]*z-m[13])*this.height/2};}
  ground(x,y){const m=this.vp;if(!m)return{x:0,z:0};const a=x/this.width*2-1-m[12],b=1-y/this.height*2-m[13],det=m[0]*m[9]-m[8]*m[1];return{x:clamp((a*m[9]-b*m[8])/det,-54,54),z:clamp((b*m[0]-a*m[1])/det,-42,42)};}
  pan(dx,dy){const a=this.ground(this.width/2,this.height/2),b=this.ground(this.width/2+dx,this.height/2+dy);this.camera.x=clamp(this.camera.x+a.x-b.x,-48,48);this.camera.z=clamp(this.camera.z+a.z-b.z,-36,36);this.setup();}
  zoom(amount){this.camera.zoom=clamp(this.camera.zoom*amount,.58,1.7);this.setup();}
  center(x,z){this.camera.x=clamp(x,-48,48);this.camera.z=clamp(z,-36,36);this.setup();}
  piece(shape,x,y,z,sx,sy,sz,color,mat=MAT,ry=0,rx=0,rz=0,cast=true){this.scene.draw(shape,H.matrix(x,y,z,sx,sy,sz,ry,rx,rz),color,mat,cast);}
  box(...a){this.piece('box',...a);}
  local(u,shape,x,y,z,sx,sy,sz,color,mat=MAT,angle=u.angle,rx=0){const c=Math.cos(angle),s=Math.sin(angle);this.piece(shape,u.x+x*c+z*s,y,u.z-x*s+z*c,sx,sy,sz,color,mat,angle,rx);}
  biomeTerrain(s){
    const snow=E.mission(s).biome==='snow',ground=snow?'#becdd0':'#657b54',rock=snow?'#798d97':'#636f5d',cap=snow?'#e3eded':'#84936d';
    this.box(0,-.7,0,118,1.3,96,rock);this.box(0,-.03,0,108,.14,84,ground,[.96,0,0,6]);
    const a=Math.atan2(76,-48);this.box(0,.08,0,5,.12,90,snow?'#9eafb3':'#a39c7c',MAT,a);
    for(const k of [-1,1]){this.box(-35*k,.14,22*k,27,.13,27,snow?'#8d9da2':'#89907d',MAT);for(let i=0;i<4;i++)this.box((-47+i*8)*k,.23,34*k,6,.04,.18,'#d1cdb2');}
    const trees=(x,z,scale)=>{this.piece('cylinder',x,scale*1.7,z,.28*scale,3.4*scale,.28*scale,'#575d4d');for(let j=0;j<3;j++)this.piece('cone',x,(2+j*.8)*scale,z,(2.9-j*.6)*scale,2.4*scale,(2.9-j*.6)*scale,snow&&j===2?'#d6e3df':['#3b5a49','#456751','#557656'][j],MAT);};
    for(const [i,o]of E.obstacles(s).entries()){for(let k=0;k<7;k++){const t=k/7*TAU,x=o.x+Math.sin(t)*o.r*.42,z=o.z+Math.cos(t)*o.r*.42,h=3+hash(i,k)*3;this.piece('cone',x,h*.4,z,o.r*.9,h,o.r*.85,rock,MAT,k);this.piece('cone',x,h*.68,z,o.r*.61,h*.38,o.r*.58,cap,MAT,k);if(!snow)trees(x,z,1+hash(k,i)*.4);}}
    for(let i=0;i<70;i++){const k=i%4,x=k<2?(k?-1:1)*(57+hash(i)*4):(hash(i)-.5)*115,z=k>=2?(k===2?-1:1)*(46+hash(i)*4):(hash(i,5)-.5)*90;trees(x,z,.9+hash(i,4)*1.1);if(snow&&i%3===0)this.piece('cone',x,4,z,12,12,10,'#8a9fa9',MAT,i);}
    for(const k of [-1,1])for(let j=0;j<3;j++){this.box((-16+j*3)*k,.8,35*k,2.4,1.5,5,snow?'#7c929b':'#687e68',METAL);for(let q=0;q<4;q++)this.box((-16+j*3)*k,.8,35*k+q-1.5,2.5,1.55,.07,DARK,METAL);}
  }
  terrain(s){
    if(E.mission(s).biome!=='desert'){this.biomeTerrain(s);return;}
    this.box(0,-.7,0,118,1.3,96,'#907856',MAT);
    this.box(0,-.03,0,108,.14,84,SAND,[.96,0,0,6]);
    // Dry braided wash, a paved supply route and original ground markings.
    for(let i=-11;i<=11;i++){const x=i*5,z=Math.sin(i*.58)*2;this.box(x,.045,z,6,.035,6.6,'#99846a',MAT,Math.sin(i)*.1);for(let j=0;j<2;j++)this.box(x+(j-.5)*2,.09,z,1.9,.03,4.8,'#9d8c72',MAT,.12);}
    const a={x:-38,z:24},b={x:38,z:-24},len=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.x-a.x,b.z-a.z);
    this.box(0,.11,0,5,.14,len,'#767b75',[.93,.08,0,6],angle);
    for(let i=-9;i<=9;i++){const f=i/20,x=(b.x-a.x)*f,z=(b.z-a.z)*f;this.box(x,.2,z,.15,.035,2,'#dfc89e',[.9,0,0,0],angle);}
    for(const team of [0,1]){const k=team===0?1:-1;this.box(-35*k,.14,22*k,27,.13,27,'#96968a',[.9,.05,0,2]);for(let i=0;i<4;i++)this.box((-47+i*8)*k,.23,34*k,6,.04,.18,'#c9bd98');}
    // Distant mesas frame every camera angle. Large pieces share instanced draws.
    for(let i=0;i<58;i++){const edge=i%4,t=i/58*TAU,x=edge<2?(edge?1:-1)*(59+hash(i)*7):Math.sin(t)*62,z=edge>=2?(edge===2?1:-1)*(47+hash(i,9)*7):Math.cos(t)*48,h=4+hash(i,2)*12;this.piece('cone',x,h/2-1,z,8+hash(i,3)*10,h,7+hash(i,4)*8,i%2?'#8c7054':'#a0855d',MAT,i*.72);this.box(x,h-1,z,4+hash(i)*5,.8,4+hash(i)*4,'#b59d74',MAT,i*.72);}
    for(let j=0;j<E.obstacles(s).length-1;j++){const o=E.obstacles(s)[j];for(let k=0;k<7;k++){const a=k/7*TAU,r=o.r*.5;this.piece('cone',o.x+Math.cos(a)*r,1.8+hash(j,k)*1.5,o.z+Math.sin(a)*r,4.8,4+hash(k,j)*3,4.2,k%2?'#a18a65':'#8c795e',MAT,k);}}
    // An oasis beyond the supply road, with shallow shelves and palms.
    this.piece('disc',47,.13,30,16,.1,16,'#789a8c',[.3,.25,.02,0],0,0,0,false);
    for(let i=0;i<4;i++)this.piece('disc',47+i*.2,.15+i*.015,30-i*.3,14-i*2,.1,14-i*2,['#4a8580','#36777b','#2a6b73','#28626b'][i],[.22,.55,.02,0],0,0,0,false);
    for(let i=0;i<86;i++){const x=(hash(i,1)-.5)*105,z=(hash(i,2)-.5)*80;if(E.obstacles(s).some(o=>Math.hypot(x-o.x,z-o.z)<o.r+1)||Math.abs(x/1.58+z)<6||Math.hypot(x+35,z-22)<19||Math.hypot(x-35,z+22)<19)continue;if(i%3===0){this.piece('cone',x,.25,z,.8,.7,.6,'#c1aa81',MAT,i);}else{this.piece('cylinder',x,.6,z,.13,1.3,.13,'#7a6b47',MAT);for(let k=0;k<3;k++)this.piece('cone',x+Math.sin(k*2)*.25,1.1,z+Math.cos(k*2)*.25,.45,1.1,.45,'#697952',[.95,0,0,5],k);}}
    for(let i=0;i<8;i++){const x=39+hash(i)*16,z=21+hash(i,5)*18;if(Math.hypot(x-47,z-30)<7)continue;this.piece('cylinder',x,2,z,.24,4,.24,'#8e7753',MAT,0,0,.12);for(let k=0;k<5;k++)this.piece('capsule',x+Math.sin(k*1.25)*1.2,3.8,z+Math.cos(k*1.25)*1.2,.65,.3,3.5,'#63815b',[.8,0,0,5],k*1.25, .25);}
    // Parked freight, pylons and sandbag checkpoints add scale.
    for(const k of [-1,1]){for(let j=0;j<3;j++){this.box(-18*k+j*2.8,.8,33*k,2.3,1.5,5,['#907857','#6f8380','#9e7155'][j],METAL);for(let q=0;q<4;q++)this.box(-18*k+j*2.8,.8,33*k+q*.95-1.5,2.4,1.55,.08,DARK,METAL);}for(let j=0;j<4;j++)this.box((-12+j*1.3)*k,.4,22*k,1.2,.7,.9,'#968367',MAT);}
  }
  building(u,s,time){
    const c=TEAMS[u.team],base=u.team===0?'#747f73':'#8e7968',trim=u.team===0?'#acc2b1':'#beaa93',r=E.TYPES[u.type].r;
    this.box(u.x,.25,u.z,r*2+.4,.4,r*2+.4,'#40484a',METAL);
    if(u.progress<1){const h=.2+u.progress*2;this.box(u.x,h/2+.4,u.z,r*1.8,h,r*1.8,base,METAL);for(const dx of [-r,r])for(const dz of [-r,r]){this.box(u.x+dx,1.8,u.z+dz,.16,3.6,.16,'#d4a347',METAL);this.box(u.x+dx,3.5,u.z,r*0+.14,.16,r*2,'#e6b357',METAL);}this.box(u.x,3.5,u.z,r*2,.15,.15,'#e6b357',METAL);return;}
    if(u.type==='command'){
      this.box(u.x,1.8,u.z,6.7,2.9,5.7,base,METAL);this.box(u.x,3.35,u.z-.5,5.4,.3,4.9,trim,METAL);this.box(u.x,3.8,u.z-.8,3.5,.8,2.8,'#3b4c50',METAL);
      for(let i=-1;i<=1;i++){this.box(u.x+i*1.6,2.3,u.z+2.9,1.05,.65,.1,u.team===0?'#8bdfd1':'#f1b27c',[.2,.6,.28,0]);this.box(u.x+3.39,2.3,u.z+i*1.5,.1,.65,1.05,u.team===0?'#79c8c8':'#e7a367',[.2,.6,.2,0]);}
      this.box(u.x,1,u.z+3.2,1.9,1.6,.5,DARK,METAL);this.box(u.x,.26,u.z+4,2,.3,1.7,trim);this.piece('cylinder',u.x-1.5,5.4,u.z-1,.15,3,.15,trim,METAL);
      this.piece('sphere',u.x-1.5,6.8,u.z-1,1.9,.5,1.9,'#ccd4bd',METAL,0,0,.35);this.box(u.x-1.5,7,u.z-1,.15,.6,.15,c,[.4,.4,.7,0]);
      this.box(u.x+2.8,4.7,u.z-2,.1,3,.1,trim,METAL);this.box(u.x+3.5,5.3,u.z-2,1.4,.8,.08,c,[.8,0,.1,8]);
    }else if(u.type==='power'){
      this.box(u.x,.8,u.z,4.7,.9,4.4,base,METAL);for(const dx of [-1.1,1.1]){this.piece('cylinder',u.x+dx,2.2,u.z,1.65,3,1.65,trim,METAL);this.piece('torus',u.x+dx,2.8,u.z,1.75,1.75,1.75,c,[.3,.5,.6,0],0,Math.PI/2);this.piece('cylinder',u.x+dx,3.8,u.z,1.1,.35,1.1,DARK,METAL);this.piece('sphere',u.x+dx,4,u.z,.8,.4,.8,c,[.35,.3,.8,0]);}this.box(u.x,1.5,u.z+1.5,2.8,1.6,.65,DARK,METAL);
    }else if(u.type==='factory'){
      this.box(u.x,1.7,u.z,7,2.8,6,base,METAL);this.box(u.x,3.3,u.z,7.5,.45,6.5,trim,METAL);this.box(u.x,1.3,u.z+3.1,4.7,2.2,.12,DARK,METAL);
      for(let k=0;k<5;k++)this.box(u.x,1.3,u.z+3.19,4.4,.08,.09,'#7a8682',METAL,0,0,0);
      for(const dx of [-2.8,2.8]){this.box(u.x+dx,1.5,u.z+3.25,.25,2.7,.23,c,[.4,.4,.35,0]);this.piece('cylinder',u.x+dx,4.2,u.z-2,.5,1.7,.5,DARK,METAL);this.box(u.x+dx,5.1,u.z-2,.8,.2,.8,trim,METAL);}
      this.box(u.x,3.65,u.z,2.6,.25,1.6,DARK,METAL);for(let k=-1;k<=1;k++)this.box(u.x+k*.7,3.8,u.z,.3,.12,1.2,'#a0aba4',METAL);
      this.box(u.x,.36,u.z+4.3,5,.17,2.1,'#777b6e');for(let k=-2;k<=2;k++)this.box(u.x+k,.48,u.z+5.2,.45,.05,.32,k%2?DARK:'#d3aa53');
    }else if(u.type==='barracks'){
      this.box(u.x,1.15,u.z,5,1.8,4.5,base,METAL);this.piece('armorHull',u.x,2.2,u.z,5.4,1,4.8,trim,METAL);this.box(u.x,1.1,u.z+2.28,1.3,1.7,.1,DARK,METAL);
      for(const k of [-1,1]){this.box(u.x+k*1.8,1.35,u.z+2.3,.9,.5,.1,c,[.3,.5,.2,0]);this.box(u.x+k*2.3,.3,u.z-3,.65,.5,.8,'#b3a175');}this.box(u.x,2.9,u.z,.1,1.6,.1,trim);this.box(u.x+.6,3.35,u.z,1.2,.6,.06,c);
    }else if(u.type==='refinery'){
      this.box(u.x,1.5,u.z,4.8,2.1,4.2,base,METAL);this.box(u.x,2.7,u.z,5.1,.35,4.5,trim,METAL);this.piece('cylinder',u.x-1.1,3.5,u.z-1,1.8,2.2,1.8,'#b4b4a0',METAL);this.piece('cone',u.x-1.1,4.8,u.z-1,1.8,.65,1.8,trim,METAL);this.box(u.x+1.1,3.4,u.z-.8,.7,2.2,.8,DARK,METAL);this.box(u.x,1.2,u.z+2.2,3.8,1.6,.2,c,METAL);this.box(u.x,.22,u.z-4.2,4.1,.16,2.1,'#6c7267');
    }else if(u.type==='sentry'){
      this.piece('cylinder',u.x,.9,u.z,2.8,1.1,2.8,base,METAL);this.piece('cylinder',u.x,1.8,u.z,1.2,1.1,1.2,DARK,METAL);const a=u.turret;this.local(u,'box',0,2.5,0,2.2,1.1,1.9,trim,METAL,a);for(const dx of [-.5,.5])this.local(u,'cylinder',dx,2.5,1.8,.22,2.6,.22,DARK,METAL,a,Math.PI/2);this.local(u,'box',0,3.15,.1,.5,.3,.5,c,[.3,.4,.6,0],a);
    }
    // Common faction identification and tiny perimeter lights.
    this.box(u.x,1.2,u.z+r+.25,1,.35,.08,c,[.5,.2,.4,0]);for(const dx of [-r,r])this.piece('sphere',u.x+dx,.5,u.z+r,.18,.18,.18,'#f1bf6c',[.3,.1,.9,0],0,0,0,false);
  }
  infantry(u,time,reduce){
    const p=this.infantryMotion.sample(u,time,reduce),c=TEAMS[u.team],armor=u.team===0?'#68877d':'#a17e5a',light=u.team===0?'#b2c8b5':'#cfb88d',cloth=u.team===0?'#354c47':'#61503e',shot=time-(this.shots.get(u.id)??-100),recoil=reduce?0:Math.exp(-shot*18)*(shot>=0&&shot<.35?.08:0),bob=reduce?0:-p.weight*.06;
    const root=H.matrix(u.x,bob,u.z,1,1,1,p.yaw),draw=(shape,x,y,z,sx,sy,sz,col,mat=MAT,ry=0,rx=0)=>this.scene.draw(shape,H.multiply(root,H.matrix(x,y,z,sx,sy,sz,ry,rx)),col,mat);
    const world=(x,y,z,yaw=p.yaw)=>[u.x+x*Math.cos(yaw)+z*Math.sin(yaw),y+bob,u.z-x*Math.sin(yaw)+z*Math.cos(yaw)];
    const limb=(a,b,w,col)=>{const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);this.piece('capsule',(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2,w,len,w,col,MAT,Math.atan2(dx,dz),Math.acos(clamp(dy/Math.max(.001,len),-1,1)));};
    const legPos=[];for(const [i,k]of [-1,1].entries()){const hip=world(k*.22,1.12,0,p.hipYaw),f=p.feet[i],ik=joint(hip,[f.x,f.y+.08,f.z],.59,.59,p.forward);limb(hip,ik.knee,.27,cloth);limb(ik.knee,ik.end,.25,armor);this.piece('sphere',...ik.knee,.31,.26,.31,light);this.piece('armorHull',ik.end[0]+p.forward[0]*.10,ik.end[1]-.07,ik.end[2]+p.forward[2]*.10,.32,.29,.55,DARK,METAL,p.hipYaw);legPos.push({hip,knee:ik.knee,foot:ik.end,swing:f.swing});}
    draw('armorHull',0,1.14,0,.68,.3,.48,cloth);draw('cuirass',0,1.62,0,.83,.81,.52,armor,[.72,.20,0,10]);draw('cuirass',0,1.66,.22,.60,.55,.14,light);draw('box',0,1.79,.31,.41,.09,.04,c,[.4,.3,.12,0]);
    for(const k of [-1,1]){draw('box',k*.23,1.27,.30,.19,.23,.15,cloth);draw('armorTurret',k*.44,1.85,0,.33,.30,.40,light);}
    draw('cylinder',0,2.02,0,.24,.20,.24,cloth);draw('helmet',0,2.24,0,.56,.50,.54,armor);draw('armorTurret',0,2.21,.25,.45,.16,.08,'#233943');draw('box',0,2.22,.30,.34,.045,.025,'#94ddd4',[.25,.5,.12,0]);draw('box',0,2.47,0,.19,.04,.24,c);
    draw('armorHull',0,1.58,-.38,.54,.65,.28,u.type==='medic'?light:cloth);draw('cylinder',.21,1.93,-.42,.035,.60,.035,DARK);
    for(const k of [-1,1]){const shoulder=world(k*.43,1.80,.03),hand=world(k<0?-.18:.16,1.62,k<0?.61:.34),arm=joint(shoulder,hand,.38,.39,[k,-.4,.15]);limb(shoulder,arm.knee,.23,cloth);limb(arm.knee,arm.end,.22,armor);this.piece('sphere',...arm.end,.20,.21,.20,light);}
    if(u.type==='lancer'){draw('cylinder',.22,1.88,.24-recoil,.28,1.55,.28,cloth,METAL,0,Math.PI/2);draw('cylinder',.22,1.88,1.03-recoil,.32,.10,.32,light,METAL,0,Math.PI/2);draw('sphere',.22,1.88,1.10-recoil,.19,.19,.11,DARK);draw('box',-.24,1.70,-.53,.22,.74,.22,light);}
    else if(u.type==='medic'){draw('box',0,1.66,.48,.39,.24,.18,light);draw('box',0,1.64,-.54,.12,.36,.04,c);draw('box',0,1.64,-.55,.34,.12,.04,c);}
    else{draw('box',.06,1.63,.49-recoil,.18,.20,.63,DARK);draw('cylinder',.06,1.68,1.02-recoil,.075,.57,.075,DARK,METAL,0,Math.PI/2);draw('box',.06,1.80,.52-recoil,.13,.10,.22,light);draw('box',.06,1.48,.42-recoil,.12,.25,.18,cloth);}
    this.unitPoses.set(u.id,{...p,legs:legPos,infantry:true,recoil});
  }
  vehicle(u,time,reduce){
    if(E.TYPES[u.type].infantry){this.infantry(u,time,reduce);return;}
    const pose=this.motion.sample(u,time,reduce),shot=time-(this.shots.get(u.id)??-100),hit=!reduce&&time-(this.hits.get(u.id)??-100)<.1,
      recoil=reduce?0:shot>=0&&shot<.48?Math.sin(Math.min(1,shot/.035)*Math.PI/2)*Math.exp(-shot*10)*.36:0,
      c=TEAMS[u.team],armor=u.team===0?'#526f68':'#8c694e',light=u.team===0?'#8daca0':'#b49774',edge=u.team===0?'#bdcbb9':'#d8bf94',rubber='#1d2528',steel='#77827c',
      scout=u.type==='scout',tracked=['tank','artillery','builder'].includes(u.type),w=scout?1.58:u.type==='artillery'?2.5:2.18,len=scout?2.55:u.type==='artillery'?4.05:3.55,
      root=H.matrix(u.x,0,u.z,1,1,1,pose.yaw,pose.pitch,pose.roll),weapon=H.matrix(u.x,0,u.z,1,1,1,pose.turret,pose.pitch*.3,pose.roll*.3),
      draw=matrix=>(shape,x,y,z,sx,sy,sz,color,mat=[.62,.32,0,10],ry=0,rx=0,rz=0,cast=true)=>this.scene.draw(shape,H.multiply(matrix,H.matrix(x,y,z,sx,sy,sz,ry,rx,rz)),color,mat,cast),d=draw(root),g=draw(weapon),
      detail=len*this.height/this.span>38;
    this.unitPoses.set(u.id,{...pose,recoil});
    // Sloped composite hull, armored skirts and functional running gear.
    d('armorHull',0,.99,0,w,.75,len,armor);
    d('armorHull',0,1.25,-.28,w*.80,.48,len*.67,light);
    d('box',0,.72,-len*.45,w*.73,.28,.35,rubber);
    for(const side of [-1,1]){
      const trackX=side*w*.51,travel=side<0?pose.left:pose.right;
      if(tracked){
        const straight=len*.5-.40,radius=.38,perimeter=4*straight+TAU*radius;
        d('tread',trackX,.52,0,.48,.79,len+.20,rubber,[.83,.25,0,0]);
        for(let k=0;k<6;k++){
          const z=(k/5*2-1)*straight,spin=travel/.32,x=trackX+side*.24;
          d('cylinder',x,.52,z,.64,.16,.64,steel,METAL,0,spin,Math.PI/2);
          d('cylinder',x+side*.095,.52,z,.39,.035,.39,armor,METAL,0,spin,Math.PI/2);
          d('cylinder',x+side*.12,.52,z,.14,.045,.14,edge,METAL,0,spin,Math.PI/2);
          if(detail)for(let j=0;j<3;j++){const a=j*TAU/3+spin;d('sphere',x+side*.12,.52+Math.cos(a)*.13,z+Math.sin(a)*.13,.055,.055,.055,rubber);}
        }
        if(detail&&!reduce)for(let k=0;k<22;k++){
          let q=((k/22*perimeter+travel)%perimeter+perimeter)%perimeter,y,z,angle;
          if(q<2*straight){z=-straight+q;y=.52+radius;angle=0;}
          else if(q<2*straight+Math.PI*radius){angle=(q-2*straight)/radius;z=straight+radius*Math.sin(angle);y=.52+radius*Math.cos(angle);}
          else if(q<4*straight+Math.PI*radius){z=straight-(q-2*straight-Math.PI*radius);y=.52-radius;angle=Math.PI;}
          else{angle=Math.PI+(q-4*straight-Math.PI*radius)/radius;z=-straight+radius*Math.sin(angle);y=.52+radius*Math.cos(angle);}
          d('box',trackX,y,z,.57,.09,.25,'#46504d',[.68,.5,0,0],0,angle);
        }
        for(let k=0;k<3;k++){d('armorHull',side*w*.51,1.14,(k-1)*len*.27,.30,.57,len*.31,armor);d('box',side*(w*.51+.16),1.19,(k-1)*len*.27,.025,.12,len*.22,c,[.5,.45,.04,0]);}
      }else for(let k=0;k<(scout?2:3);k++){
        const z=(k-(scout?.5:1))*len*(scout?.60:.31),spin=travel/.40,x=side*w*.54;
        d('cylinder',x,.51,z,.82,.33,.82,rubber,[.94,.04,0,0],0,spin,Math.PI/2);
        d('cylinder',x+side*.18,.51,z,.51,.045,.51,steel,METAL,0,spin,Math.PI/2);
        d('cylinder',x+side*.21,.51,z,.19,.06,.19,armor,METAL,0,spin,Math.PI/2);
        if(detail)for(let j=0;j<5;j++){const a=j*TAU/5+spin;d('box',x+side*.22,.51+Math.cos(a)*.16,z+Math.sin(a)*.16,.025,.075,.045,edge,METAL,0,spin+a);}
        d('box',side*w*.51,1.02,z,.67,.15,.95,armor);
      }
      d('box',side*w*.38,1.06,len*.48,.30,.16,.10,'#eee4ba',[.28,.2,.35,0]);
      d('box',side*w*.38,1.05,-len*.48,.25,.12,.07,'#a7513e',[.6,.1,.08,0]);
      d('capsule',side*w*.37,1.47,-len*.17,.11,.07,.48,steel,METAL,0,Math.PI/2);
    }
    // Separate deck fittings remain readable when the vehicle is small.
    for(let k=0;k<5;k++)d('box',-.40+k*.20,1.43,-len*.33,.075,.045,.60,rubber);
    d('box',0,1.47,-len*.31,w*.55,.045,.07,steel);
    for(const side of [-1,1])d('box',side*w*.33,1.44,.14,.18,.045,.58,c,[.45,.4,.04,0]);
    if(u.type==='tank'||scout){
      g('cylinder',0,1.46,-.08,w*.68,.20,w*.68,rubber);
      g('armorTurret',0,1.80,-.18,w*.85,scout?.58:.77,scout?1.35:1.90,light);
      for(const side of [-1,1])g('armorTurret',side*w*.30,1.79,.45,w*.30,.48,.72,armor);
      g('cylinder',0,1.85,.67,.47,.40,.47,steel,METAL,0,Math.PI/2);
      const length=scout?1.47:2.10,z=scout?1.26:1.57;
      g('cylinder',0,1.85,z-recoil,scout?.13:.20,length,scout?.13:.20,steel,METAL,0,Math.PI/2);
      g('cylinder',0,1.85,.95-recoil,scout?.24:.33,.63,scout?.24:.33,armor,METAL,0,Math.PI/2);
      const muzzle=z+length/2-recoil;
      g('box',0,1.85,muzzle,scout?.24:.37,.27,.38,armor);
      g('cylinder',0,1.85,muzzle+.20,scout?.10:.18,.025,scout?.10:.18,'#10191f',METAL,0,Math.PI/2);
      if(!scout)for(const side of [-1,1])g('box',side*.19,1.85,muzzle,.025,.12,.15,rubber);
      g('cylinder',-.32,2.20,-.39,.65,.12,.65,armor);g('cylinder',-.32,2.27,-.39,.46,.06,.46,edge);
      g('armorTurret',.39,2.17,.08,.42,.31,.42,armor);g('box',.39,2.20,.30,.29,.11,.035,'#8ebfc0',[.22,.7,.10,0]);
      g('box',0,1.88,-1.00,w*.55,.33,.21,armor);g('box',0,1.88,-1.12,w*.46,.08,.035,c,[.5,.4,.04,0]);
      if(detail){for(const side of [-1,1])for(let k=0;k<2;k++)g('cylinder',side*(w*.43),2.04+k*.13,.22+k*.23,.12,.32,.12,rubber,METAL,0,Math.PI/2-.25);g('cylinder',-.48,2.32,-.70,.05,.88,.05,rubber);g('box',.55,2.24,-.55,.38,.12,.22,steel);}
    }else if(u.type==='rocket'){
      g('cylinder',0,1.52,-.17,1.55,.22,1.55,rubber);g('armorTurret',0,1.81,-.25,1.85,.48,2.03,armor);
      for(const dx of [-.52,.52])for(const dy of [1.89,2.33]){
        g('cylinder',dx,dy,-.18,.42,2.20,.42,light,METAL,0,Math.PI/2-.14);
        g('cylinder',dx,dy+.15,.92,.30,.045,.30,rubber,METAL,0,Math.PI/2-.14);
        g('cylinder',dx,dy+.151,.946,.16,.012,.16,'#272a27',METAL,0,Math.PI/2-.14);
        g('box',dx,dy-.05,-.66,.46,.10,.22,steel);
      }
      g('box',0,2.51,-.5,.40,.18,.49,armor);g('box',0,2.52,-.24,.26,.08,.035,c,[.28,.45,.1,0]);
    }else if(u.type==='artillery'){
      g('cylinder',0,1.48,-.45,1.85,.27,1.85,rubber);g('armorTurret',0,1.78,-.55,2.13,.79,2.30,light);
      for(const side of [-1,1]){g('armorTurret',side*.76,2.07,.0,.47,.73,1.18,armor);g('cylinder',side*.48,2.20,.70,.14,1.88,.14,steel,METAL,0,Math.PI/2-.34);}
      g('cylinder',0,2.68-recoil*.32,1.17-recoil,.33,3.95,.33,steel,METAL,0,Math.PI/2-.30);
      g('cylinder',0,2.41-recoil*.32,.32-recoil,.55,1.44,.55,armor,METAL,0,Math.PI/2-.30);
      g('box',0,3.28-recoil*.32,3.04-recoil,.53,.43,.55,armor);
      g('cylinder',0,3.29-recoil*.32,3.33-recoil,.27,.025,.27,'#121d23',METAL,0,Math.PI/2-.30);
      g('box',0,1.87,-1.63,1.33,.70,.44,armor);g('box',0,2.10,-1.88,.92,.10,.04,c,[.4,.4,.06,0]);
    }else if(u.type==='builder'){
      d('armorHull',0,1.72,-.48,1.47,1.24,1.44,'#c19b53');d('armorTurret',0,2.11,-.43,1.27,.57,1.25,steel);
      d('box',0,1.95,.19,1.10,.49,.065,'#4e858c',[.22,.7,.03,0]);
      for(const side of [-1,1]){d('cylinder',side*.80,.85,1.10,.16,1.40,.16,steel,METAL,0,.42);d('box',side*.77,.72,1.24,.23,.22,1.44,armor);d('box',side*.49,2.45,-.61,.075,.26,.075,edge);}
      d('armorHull',0,.60,2.06,3.04,.82,.43,steel);d('box',0,.24,2.25,3.14,.16,.16,'#bcaa72');for(let k=-2;k<=2;k++)d('box',k*.55,.63,2.27,.20,.34,.045,'#c5a352',METAL,0,0,.35);
      d('cylinder',.63,2.20,-.98,.14,.68,.14,rubber);
    }else{
      d('armorHull',0,1.70,.72,1.84,1.20,1.52,light);d('box',0,1.96,1.47,1.43,.45,.065,'#588b93',[.22,.7,.03,0]);
      for(const side of [-1,1]){d('box',side*.94,1.70,.77,.06,.46,.75,armor);d('capsule',side*.99,1.75,.98,.05,.05,.24,edge);}
      d('box',0,1.60,-.97,1.93,.75,1.85,armor);d('box',0,2.01,-.97,1.76,.09,1.68,steel);
      for(const side of [-1,1])d('box',side*.87,2.22,-.97,.12,.40,1.72,armor);
      const cargo=Math.ceil((u.cargo||0)/30);for(let k=0;k<Math.min(6,cargo);k++){const dx=(k%2-.5)*.68,z=-1.45+Math.floor(k/2)*.48;d('box',dx,2.20,z,.60,.36,.43,'#bca36b');d('box',dx,2.29,z,.62,.06,.45,'#e0c78c');}
    }
    if(hit)d('armorHull',0,1.12,0,w*.95,.22,len*.83,'#d1c9a1',[.4,.45,.20,0]);
    if(!reduce&&Math.abs(pose.speed)>.6){const phase=(pose.left+pose.right)*.5;for(let k=0;k<2;k++){const off=(phase*.5+k*.47)%1;d('sphere',(k?1:-1)*w*.46,.20+off*.12,-len*.5-off,.50+off*.5,.20,.55+off*.5,[.64,.56,.41,(1-off)*.16],[1,0,0,0],0,0,0,false);}}
  }
  supplies(s){for(const [i,n]of s.supplies.entries()){this.box(n.x,.15,n.z,6,.2,5,'#8a8370');const count=Math.ceil(n.amount/(i<2?18000:12000)*8);for(let k=0;k<count;k++){const x=n.x+(k%3-1)*1.3,z=n.z+(Math.floor(k/3)-1)*1.3;this.box(x,.65,z,1.12,.9,1.12,'#b9a16c',METAL);this.box(x,.8,z,1.16,.12,1.16,'#e7ce8e',METAL);}for(const k of [-1,1]){this.box(n.x+k*3,.6,n.z+2.7,.12,1,.12,'#deb65b',METAL);this.box(n.x+k*3,1.1,n.z+2.7,.5,.1,.5,'#f2cc76',[.5,0,.5,0]);}}}
  uplink(s,time,reduce){const r=s.relay,c=r.owner<0?'#e9ca8f':TEAMS[r.owner],piece=(shape,x,y,z,...args)=>this.piece(shape,x+r.x,y,z+r.z,...args);piece('cylinder',0,.4,0,4.2,.6,4.2,'#4e6465',METAL);piece('cylinder',0,2,0,.8,3,.8,'#b4c3b3',METAL);piece('torus',0,1.1,0,3.5,3.5,3.5,c,[.4,.3,.7,0],0,Math.PI/2);piece('sphere',0,4,0,3.5,.65,3.5,'#a4bab2',METAL,reduce?0:time*.35,0,.35);piece('cylinder',0,4.7,0,.12,1.8,.12,c,[.4,.3,.8,0]);}
  events(s){if(s.eventId<this.lastEvent)this.resetEffects();for(const e of s.events){if(e.id<=this.lastEvent)continue;const born=e.time??s.time;if(e.type==='shot')this.shots.set(e.entityId,born);if(e.type==='damage')this.hits.set(e.entityId,born);if(['destroy','impact','shot'].includes(e.type))this.effects.push({...e,born});}this.lastEvent=s.eventId;this.effects=this.effects.filter(e=>s.time-e.born<2).slice(-110);for(const map of [this.shots,this.hits])for(const [id,t]of map)if(s.time-t>1)map.delete(id);}
  render(s,opts={}){
    this.resize();this.setup();const c=this.camera,time=s.time,reduce=opts.reducedMotion;this.events(s);const l=[-.48,.86,.35],center=[c.x,0,c.z],le=[c.x+l[0]*70,l[1]*70,c.z+l[2]*70],lv=H.multiply(H.ortho(-48,48,-48,48,1,180),H.lookAt(le,center));
    this.scene.begin(this.vp,this.eye,reduce?0:time,{clear:E.mission(s).biome==='snow'?[.65,.75,.81]:E.mission(s).biome==='forest'?[.50,.62,.54]:[.67,.67,.56],fog:E.mission(s).biome==='snow'?[.72,.82,.87]:E.mission(s).biome==='forest'?[.62,.72,.59]:[.75,.72,.62],light:l,lightVP:lv});
    if(this.terrainId!==(s.mission||'redstone')){this.staticCommands=null;this.terrainId=s.mission||'redstone';}if(!this.staticCommands){this.terrain(s);this.staticCommands=this.scene.commands.slice();}else this.scene.commands.push(...this.staticCommands);
    this.unitPoses.clear();const live=new Set(s.entities.map(u=>u.id));for(const id of this.motion.units.keys())if(!live.has(id))this.motion.units.delete(id);for(const id of this.infantryMotion.units.keys())if(!live.has(id))this.infantryMotion.units.delete(id);this.supplies(s);this.uplink(s,time,reduce);
    for(const u of s.entities)if(Math.hypot(u.x-c.x,u.z-c.z)<this.span*this.width/this.height+32){if(E.TYPES[u.type].building)this.building(u,s,time);else this.vehicle(u,time,reduce);if(opts.selected?.includes(u.id))this.piece('ring',u.x,.3,u.z,(E.TYPES[u.type].r+1)*2,(E.TYPES[u.type].r+1)*2,.1,TEAMS[0],[.5,.1,.4,0],0,-Math.PI/2,0,false);}
    if(opts.ghost){const g=opts.ghost,r=E.TYPES[g.type].r,valid=!E.placement(s,0,g.type,g.x,g.z);this.box(g.x,1,g.z,r*2,2,r*2,valid?[.2,.9,.72,.4]:[1,.23,.17,.45],[.6,0,.4,0]);this.piece('ring',g.x,.3,g.z,r*2.8,r*2.8,.1,valid?'#76f3b3':'#ff644d',[.5,0,.7,0],0,-Math.PI/2,0,false);}
    for(const p of s.projectiles){const f=p.elapsed/p.duration,length=Math.hypot(p.toX-p.fromX,p.toZ-p.fromZ),offset=Math.min(.8,2.7/Math.max(1,length)),q=offset+(1-offset)*f,y=p.kind==='artillery'?2.5+Math.sin(f*Math.PI)*10:1.8,x=p.fromX+(p.toX-p.fromX)*q,z=p.fromZ+(p.toZ-p.fromZ)*q;this.piece('sphere',x,y,z,p.kind==='rocket'?.35:.2,.2,.7,p.kind==='rocket'?'#fff0b2':'#ffe2a2',[.3,.3,2,0],Math.atan2(p.toX-p.fromX,p.toZ-p.fromZ),0,0,false);if(!reduce)for(let k=1;k<4;k++){const q=offset+(1-offset)*Math.max(0,f-k*.035);this.piece('sphere',p.fromX+(p.toX-p.fromX)*q,y,p.fromZ+(p.toZ-p.fromZ)*q,.25+k*.1,.2+k*.1,.3,[.8,.77,.65,.5-k*.1],[1,0,.1,0],0,0,0,false);}}
    for(const e of this.effects){const t=time-e.born;if(e.type==='shot'){if(t<.13)this.piece('sphere',e.x+Math.sin(e.angle)*(E.TYPES[e.kind]?.infantry?1.1:2.8),e.kind==='artillery'?3:E.TYPES[e.kind]?.infantry?1.68:1.8,e.z+Math.cos(e.angle)*(E.TYPES[e.kind]?.infantry?1.1:2.8),.8,.5,.8,'#ffe3a4',[.2,0,3,0],0,0,0,false);continue;}const big=e.type==='destroy',f=t/(big?2:.65);if(f>1)continue;const size=(big?3:1.3)*(1+f);this.piece('sphere',e.x,size*.4,e.z,size*(1-f*.4),size*(1-f*.3),size*(1-f*.4),[1,.46,.12,clamp(1-f*1.8,0,1)],[.8,0,1.7,0],0,0,0,false);if(!reduce)for(let k=0;k<(big?5:2);k++){const a=k*2.4;this.piece('sphere',e.x+Math.sin(a)*t*2,1+t*3,e.z+Math.cos(a)*t*2,1+t*2,1+t*2,1+t*2,[.27,.28,.26,(1-f)*.45],[1,0,0,0],0,0,0,false);}}
    this.scene.flush();this.stats={...this.scene.debug(),unitStyle:'detailed-armor',units:[...this.unitPoses.entries()].map(([id,p])=>({id,...p}))};this.drawOverlay(s,opts);
  }
  drawOverlay(s,opts){const ctx=this.ctx;ctx.clearRect(0,0,this.width,this.height);ctx.font='600 10px system-ui';ctx.textAlign='center';for(const u of s.entities){const selected=opts.selected?.includes(u.id);if(!selected&&u.hp===E.TYPES[u.type].hp&&u.progress===1)continue;const p=this.project(u.x,u.z,E.TYPES[u.type].building?6:3.5),w=selected?48:32;ctx.fillStyle='rgba(8,20,23,.8)';ctx.fillRect(p.x-w/2-1,p.y-1,w+2,5);ctx.fillStyle=u.progress<1?'#efc375':u.team===0?'#74d8b6':'#eb8c6b';ctx.fillRect(p.x-w/2,p.y,w*(u.progress<1?u.progress:u.hp/E.TYPES[u.type].hp),3);if(selected&&E.TYPES[u.type].building){ctx.fillStyle='#eff6e5';ctx.shadowColor='#09201c';ctx.shadowBlur=4;ctx.fillText(E.TYPES[u.type].name,p.x,p.y-7);ctx.shadowBlur=0;}}
    for(const u of s.entities)if(['factory','barracks'].includes(u.type)&&u.rally&&opts.selected?.includes(u.id)){const a=this.project(u.x,u.z),b=this.project(u.rally.x,u.rally.z);ctx.strokeStyle='#8ce4ba';ctx.lineWidth=1.5;ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x,b.y-24);ctx.stroke();ctx.fillStyle='#8ce4ba';ctx.beginPath();ctx.moveTo(b.x,b.y-24);ctx.lineTo(b.x+14,b.y-20);ctx.lineTo(b.x,b.y-15);ctx.fill();}
    if(opts.box){const b=opts.box;ctx.strokeStyle='#7ee2c0';ctx.fillStyle='rgba(79,214,178,.12)';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeRect(b.x,b.y,b.w,b.h);}
    if(opts.marker&&performance.now()-opts.marker.time<900){const m=opts.marker,p=this.project(m.x,m.z),r=8+(performance.now()-m.time)/70;ctx.strokeStyle=m.attack?'#f5a17e':'#9cf3ca';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(p.x,p.y,r,r*.5,0,0,TAU);ctx.stroke();}
  }
  minimap(canvas,s){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,point=(x,z)=>({x:(x+56)/112*w,y:(z+44)/88*h});ctx.fillStyle=E.mission(s).biome==='snow'?'#9eafb8':E.mission(s).biome==='forest'?'#61774f':'#776e50';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#ada580';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(w*.14,h*.78);ctx.lineTo(w*.86,h*.22);ctx.stroke();for(const o of E.obstacles(s)){const p=point(o.x,o.z);ctx.fillStyle='#514f3f';ctx.beginPath();ctx.arc(p.x,p.y,o.r/112*w,0,TAU);ctx.fill();}for(const n of s.supplies){const p=point(n.x,n.z);ctx.fillStyle='#e5c379';ctx.fillRect(p.x-2,p.y-2,4,4);}for(const u of s.entities){const p=point(u.x,u.z),r=E.TYPES[u.type].building?3:1.8;ctx.fillStyle=TEAMS[u.team];ctx.fillRect(p.x-r,p.y-r,r*2,r*2);}const r=point(s.relay.x,s.relay.z);ctx.strokeStyle=s.relay.owner<0?'#f5db98':TEAMS[s.relay.owner];ctx.strokeRect(r.x-3,r.y-3,6,6);ctx.strokeStyle='#eff8d9';ctx.lineWidth=1;ctx.beginPath();for(const [i,p]of [[0,this.ground(0,0)],[1,this.ground(this.width,0)],[2,this.ground(this.width,this.height)],[3,this.ground(0,this.height)]]){const q=point(p.x,p.z);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}ctx.closePath();ctx.stroke();}
  destroy(){this.scene.destroy();}
}
return {Battlefield,VehicleMotion,InfantryMotion,joint,vehicleMeshes};
});
