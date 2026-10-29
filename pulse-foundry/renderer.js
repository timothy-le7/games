(function(root){'use strict';
  const TAU=Math.PI*2;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const hex=value=>{const t=value.replace('#',''),s=t.length===3?t.split('').map(c=>c+c).join(''):t;return[parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255];};
  function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
  function ortho(l,r,b,t,n,f){const o=new Float32Array(16);o[0]=2/(r-l);o[5]=2/(t-b);o[10]=-2/(f-n);o[12]=-(r+l)/(r-l);o[13]=-(t+b)/(t-b);o[14]=-(f+n)/(f-n);o[15]=1;return o;}
  function lookAt(e,t,u){let zx=e[0]-t[0],zy=e[1]-t[1],zz=e[2]-t[2],q=Math.hypot(zx,zy,zz);zx/=q;zy/=q;zz/=q;let xx=u[1]*zz-u[2]*zy,xy=u[2]*zx-u[0]*zz,xz=u[0]*zy-u[1]*zx;q=Math.hypot(xx,xy,xz);xx/=q;xy/=q;xz/=q;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-xx*e[0]-xy*e[1]-xz*e[2],-yx*e[0]-yy*e[1]-yz*e[2],-zx*e[0]-zy*e[1]-zz*e[2],1]);}
  function model(x,y,z,sx,sy,sz,rz,ry){const cz=Math.cos(rz||0),szn=Math.sin(rz||0),cy=Math.cos(ry||0),syn=Math.sin(ry||0),r00=cz*cy,r01=-szn,r02=cz*syn,r10=szn*cy,r11=cz,r12=szn*syn,r20=-syn,r21=0,r22=cy;return{m:new Float32Array([r00*sx,r10*sx,r20*sx,0,r01*sy,r11*sy,r21*sy,0,r02*sz,r12*sz,r22*sz,0,x,y,z,1]),n:new Float32Array([r00,r10,r20,r01,r11,r21,r02,r12,r22])};}
  class Renderer{
    constructor(canvas,engine){this.canvas=canvas;this.engine=engine;this.gl=null;this.lost=false;this.stats={drawCalls:0,triangles:0,dpr:1,actors:0};canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.lost=true;});canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();});this.init();}
    init(){this.scene=new root.GameHD.Scene(this.canvas,{meshScale:2,shadowSize:1024,bloomStrength:.29});this.gl=this.scene.gl;}
    resize(){const r=this.canvas.getBoundingClientRect();this.scene.resize(r.width,r.height,root.devicePixelRatio||1,6500000);const aspect=this.canvas.width/this.canvas.height,portrait=aspect<.8,halfW=portrait?3.65:8.6;this.camera={aspect,portrait,halfW,halfH:halfW/aspect};}
    draw(name,x,y,z,sx,sy,sz,color,rz=0,ry=0,alpha=1,glow=0,cast=true,rough=.45,metal=.4){const rgb=Array.isArray(color)?color:hex(color);const mm=model(x,y,z,sx,sy,sz,rz,ry).m,transform=['gear','wheel'].includes(name)?mul(mm,root.GameHD.matrix(0,0,0,1,1,1,0,Math.PI/2)):mm;this.scene.draw(name==='wheel'?'cylinder':name,transform,[rgb[0],rgb[1],rgb[2],alpha],[rough,metal,glow,0],cast);}
    render(match,options){
      if(this.lost||!match)return;this.resize();const HD=root.GameHD,level=this.engine.levels[match.level],player=match.actors[0],t=level.theme,lead=this.camera.portrait?2.3:3.4,cam=clamp(player.x+lead,this.camera.halfW-1,level.length-this.camera.halfW+1),eye=[cam,5.8,11],target=[cam,3,0],vp=mul(ortho(-this.camera.halfW,this.camera.halfW,-this.camera.halfH,this.camera.halfH,-40,45),lookAt(eye,target,[0,1,0])),lightVP=mul(ortho(-15,15,-12,12,1,60),lookAt([cam-8,19,14],[cam,3,0],[0,1,0]));
      this.time=options?.reducedMotion?0:match.elapsed;this.camera.x=cam;this.scene.begin(vp,eye,this.time,{lightVP,clear:hex(t.sky),fog:hex(t.sky),light:[-.38,.83,.45]});
      this.environment(level,t,cam,this.time,options);for(const o of level.obstacles)if(Math.abs(o.x-cam)<this.camera.halfW+2)this.obstacle(o,t);for(const s of level.sections)if(Math.abs(s.x-cam)<this.camera.halfW+1)this.portal(s,t);for(const actor of match.actors.slice().sort((a,b)=>b.kind.localeCompare(a.kind)))this.actor(actor,match,t,options);if(Math.abs(level.length-cam)<this.camera.halfW+2)this.finish(level,t);this.scene.flush();this.stats={...this.scene.debug(),actors:match.actors.length};
    }
    environment(level,t,c,time,options){
      const left=Math.floor(c-this.camera.halfW)-3,right=Math.ceil(c+this.camera.halfW)+3,d=this.draw.bind(this),beat=options?.reducedMotion?1:.9+.1*Math.cos(time*level.bpm/60*TAU),theme=level.id;
      const backdrop=color=>hex(color).map((v,i)=>v*.58+hex(t.sky)[i]*.42),accent=backdrop(t.accent),hot=backdrop(t.hot);
      // All moving scenery is several world units behind the collision corridor.
      d('box',c,3,-9,this.camera.halfW+5,10,.3,t.sky,0,0,1,0,false);
      for(let x=Math.floor(left/4)*4;x<right+4;x+=4){
        const n=((x*13+theme*7)%9+9)%9,h=3+n*.45;
        d('box',x,h*.5-2,-6.5,1.6,h*.5,.65,['#254755','#49384d','#24515a','#3b325d','#4c3b50','#293d5a'][theme],0,0,1,0,false);
        d('box',x,h-1.9,-6.45,1.72,.10,.77,t.floor,0,0,1,0,false);
        for(let k=0;k<4;k++){d('box',x-1.15+k*.72,1+n*.24,-5.78,.10,1.8,.03,accent,0,0,1,.16,false);d('box',x-1.15+k*.72,4.1+n*.17,-5.76,.11,.11,.04,hot,0,0,1,.35,false);}
        d('cylinder',x+1.85,3.2,-5.5,.13,4.4,.13,'#6f889a',0,0,1,0,false);d('box',x,6.9,-4.2,2.05,.12,.12,t.floor,0,0,1,0,false);
      }
      // Each course has an authored mechanical silhouette: press / turbine / coil / prism.
      for(let x=Math.floor(left/7)*7;x<right+7;x+=7){
        const a=x*.23+theme,rotation=time*(theme%2?-.14:.14);
        if(theme===0||theme===5){
          d('torus',x,3.1,-3.9,1.4,1.4,.3,'#809ca7',rotation,0,1,0,false);d('gear',x,3.1,-3.91,1.14,1.14,.22,t.floor,rotation,0,1,0,false);
          d('torus',x,3.1,-3.60,1.02,1.02,.15,accent,rotation,0,1,.25*beat,false);
          for(let k=0;k<6;k++)d('box',x+Math.cos(rotation+k*TAU/6)*.85,3.1+Math.sin(rotation+k*TAU/6)*.85,-3.5,.4,.09,.06,hot,rotation+k*TAU/6,0,1,.2,false);
        }else if(theme===1){
          d('box',x,3.2,-3.9,1.5,2.5,.6,'#8b6f68',0,0,1,0,false);for(const s of [-1,1])d('cylinder',x+s*1.1,3.2,-3.1,.15,2.8,.15,'#c7c3b5',0,0,1,0,false);d('box',x,4.2+Math.sin(time)*.1,-3.0,1.2,.5,.33,t.floor,0,0,1,0,false);d('box',x,2.7,-3,1,.08,.35,hot,0,0,1,.5,false);
        }else if(theme===2){
          d('wheel',x,2.9,-4,1.3,1.3,.55,'#466f7d',0,0,1,0,false);for(let k=0;k<6;k++)d('box',x+Math.cos(rotation+k*TAU/6)*.6,2.9+Math.sin(rotation+k*TAU/6)*.6,-3.4,.76,.13,.08,'#93b7b9',rotation+k*TAU/6,0,1,0,false);d('torus',x,2.9,-3.25,1.32,1.32,.1,accent,0,0,1,.35,false);
        }else if(theme===3){
          d('cylinder',x,3.2,-4.1,.65,2.5,.65,t.floor,0,0,1,0,false);for(let k=0;k<6;k++)d('torus',x,1.3+k*.7,-4,1.05,1.05,.12,k%2?hot:accent,Math.PI/2,0,1,.15,false);
        }else{for(let k=0;k<4;k++)d('box',x+(k-1.5)*.62,2.5+Math.sin(a+k)*.6,-4.2,.23,1.6,.23,k%2?hot:accent,(k-1.5)*.18,.3,1,.14,false);}
      }
      // Crisp track edges and shallow inset rails establish an unambiguous safe floor.
      for(const side of [-1,1]){const y=side===-1?-.32:6.32;d('box',c,y,-.5,this.camera.halfW+3,.32,1.7,t.floor,0,0,1,0,false);d('box',c,side===-1?-.09:6.09,1.25,this.camera.halfW+3,.10,.12,'#bed6d7',0,0,1,0,false);d('box',c,side===-1?-.02:6.02,1.39,this.camera.halfW+3,.035,.04,t.accent,0,0,1,.33*beat,false);}
      for(let x=Math.floor(left);x<right;x++){
        for(const y of [-.16,6.16]){d('box',x+.5,y,1.48,.47,.14,.06,x%2?t.floor:'#71838e',0,0,1,0,false);d('sphere',x+.12,y,1.55,.025,.025,.025,'#c9d8da',0,0,1,0,false);}
        for(const y of [-.6,6.6])d('box',x+.45,y,1.2,.26,.035,.03,t.hot,.6,0,1,.2,false);
      }
      if(!options?.reducedMotion)for(let k=0;k<10;k++){const x=c-this.camera.halfW+((k*2.73+time*.24)%(this.camera.halfW*2+1));d('sphere',x,1.1+(k%4)*1.15,-2.5,.018,.018,.018,t.accent,0,0,.5,.6,false);}
    }
    obstacle(o,t){
      const d=this.draw.bind(this);
      if(o.type==='spike'){
        const y=o.side==='ceiling'?6-o.h*.5:o.h*.5,flip=o.side==='ceiling'?Math.PI:0;
        // The bright triangular front has exactly the engine's width, height and tip.
        d('wedge',o.x,y,-.75,o.w*.5,o.h*.5,1.28,'#c05d40',flip);d('wedge',o.x,y,.535,o.w*.5,o.h*.5,.018,t.hot,flip,0,1,.28);d('wedge',o.x,y-.06*(o.side==='ceiling'?-1:1),.56,o.w*.31,o.h*.31,.015,'#ffe9aa',flip,0,1,.1);
      }else if(o.type==='block'){
        const y=o.side==='ceiling'?6-o.h*.5:o.h*.5;
        d('box',o.x,y,-.75,o.w*.5,o.h*.5,1.37,t.floor);d('box',o.x,y,.64,o.w*.37,o.h*.37,.025,'#26394d');d('box',o.x,y,.675,o.w*.29,o.h*.29,.012,t.accent,0,0,1,.18);
        for(const s of [-1,1])for(const v of [-1,1])d('sphere',o.x+s*o.w*.38,y+v*o.h*.38,.67,.028,.028,.025,'#e3dfbf');
      }else{
        const low=o.center-o.gap*.5,high=o.center+o.gap*.5;
        if(low>0)d('box',o.x,low*.5,-.75,o.w*.5,low*.5,1.37,t.floor);if(high<6)d('box',o.x,(high+6)*.5,-.75,o.w*.5,(6-high)*.5,1.37,t.floor);
        for(const [y,s]of [[low,-1],[high,1]]){d('box',o.x,y+s*.045,.65,o.w*.5,.045,.045,t.hot,0,0,1,.45);d('box',o.x,y+s*.16,.66,o.w*.28,.035,.025,t.accent,0,0,1,.2);}
      }
    }
    portal(s,t){if(s.x<=.1)return;const d=this.draw.bind(this),color=s.mode==='flight'?t.accent:t.hot;for(const y of [.65,5.35]){d('torus',s.x,y,.18,.42,.42,.09,color,0,0,1,.35);d('gear',s.x,y,.03,.32,.32,.08,'#8fa9ae',this.time*.2,0,1,0);d('sphere',s.x,y,.3,.11,.11,.08,'#fff8d5',0,0,1,.8);}for(let y=1.2;y<4.9;y+=.35)d('sphere',s.x,y,.12,.025,.06,.025,color,0,0,.45,.6,false);}
    actor(a,m,t,options){
      if(!a.alive&&!a.finished)return;const d=this.draw.bind(this),lane=Number(a.id.slice(-1)||0),z=a.kind==='player'?.05:-.65-lane*.4,alpha=a.kind==='player'?1:.68,spin=a.mode==='run'?(a.grounded?0:a.x*2.4*(a.gravity===1?-1:1)):clamp(a.vy*.055,-.35,.35),col=a.palette,contact=a.gravity===1?.02:5.98;
      d('sphere',a.x,contact,z,.36,.025,.30,'#07111d',0,0,.22,0,false);
      // Rotating sealed chassis with inset faceplate, machined corners and six-sided lens.
      d('box',a.x,a.y,z,.34,.34,.26,'#192e44',spin,0,alpha);
      d('box',a.x,a.y,z+.26,.28,.28,.055,col,spin,0,alpha,.12);
      d('box',a.x,a.y,z+.325,.20,.20,.018,'#102238',spin,0,alpha);
      d('torus',a.x,a.y,z+.35,.165,.165,.045,t.accent,spin,0,alpha,.4);
      d('sphere',a.x+.035,a.y+.04,z+.39,.09,.09,.035,'#d7fff9',spin,0,alpha,.6);
      for(let k=0;k<4;k++){const ang=spin+Math.PI/4+k*Math.PI/2;d('box',a.x+Math.cos(ang)*.36,a.y+Math.sin(ang)*.36,z,.075,.075,.27,col,spin,0,alpha);d('sphere',a.x+Math.cos(ang)*.36,a.y+Math.sin(ang)*.36,z+.28,.023,.023,.02,'#f5e9bd',0,0,alpha);}
      if(a.mode==='flight'){
        for(const sign of [-1,1]){d('wedge',a.x-.09,a.y+sign*.32,z-.03,.36,.13,.22,col,sign===1?0:Math.PI,0,alpha);d('box',a.x-.36,a.y+sign*.23,z,.13,.11,.24,'#6c8997',spin,0,alpha);d('sphere',a.x-.53,a.y+sign*.23,z,.12+(a.held?.10:0),.055,.08,t.hot,0,0,alpha,.9,false);}
        d('wedge',a.x+.4,a.y,z,.23,.16,.19,col,-Math.PI/2,0,alpha,.12);
      }else{
        const g=a.gravity===1?1:-1;for(const sign of [-1,1])d('box',a.x+sign*.19,a.y-g*.37,z,.12,.07,.20,'#92c1c9',Math.sin(a.x*5)*sign*.16,0,alpha);
      }
      for(let i=0;i<a.trail.length;i+=4){const q=a.trail[i],fade=(i+1)/Math.max(1,a.trail.length);d('sphere',q.x,q.y,z-.04,.022+.035*fade,.022+.035*fade,.022, col,0,0,alpha*.22,.65,false);}
    }
    finish(level,t){this.draw('box',level.length+.15,3,0,.08,3,.9,t.accent,0,0,.4,.3,false);for(const y of [1,3,5]){this.draw('torus',level.length,y,.3,.45,.45,.09,t.hot,0,0,1,.4);this.draw('sphere',level.length,y,.4,.15,.15,.15,'#fff4c1',0,0,1,.6);}}
    debug(){return{lost:this.lost,webgl:!!this.gl,width:this.canvas.width,height:this.canvas.height,camera:this.camera,renderer:'hd-foundry-diorama',...this.stats};}
    destroy(){this.scene?.destroy();}
  }
  root.PulseFoundryRenderer=Renderer;
})(typeof globalThis!=='undefined'?globalThis:this);
