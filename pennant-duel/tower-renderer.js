(function (root) {
  'use strict';
  const TAU=Math.PI*2;
  const PALETTES=[
    {grass:'#72aa49',grass2:'#81b750',path:'#a7b968',stone:'#b9b8a2',wood:'#af763d',water:'#2c97bb'},
    {grass:'#426f58',grass2:'#508063',path:'#9a896d',stone:'#6e7778',wood:'#8f5d37',water:'#236e98'},
    {grass:'#60783f',grass2:'#71894a',path:'#a18b62',stone:'#7e8176',wood:'#925b30',water:'#267b92'},
    {grass:'#47736c',grass2:'#56827a',path:'#8f8d78',stone:'#737e83',wood:'#815334',water:'#286f91'},
    {grass:'#6f6940',grass2:'#7d7848',path:'#a07f5c',stone:'#786f67',wood:'#8d4e2b',water:'#315f80'},
    {grass:'#4c7450',grass2:'#5d855e',path:'#93876e',stone:'#737b73',wood:'#855934',water:'#2b718e'},
    {grass:'#565d78',grass2:'#656d86',path:'#8e887c',stone:'#747783',wood:'#805039',water:'#345d83'},
    {grass:'#4d5c56',grass2:'#5c6a62',path:'#8d7459',stone:'#696f70',wood:'#7c4930',water:'#285873'}
  ];
  const ARENA_THEMES=[
    {accent:'#efc55d',metal:'#607487',dark:'#34475c',motif:'roof'},
    {accent:'#75e6dc',metal:'#7c8f97',dark:'#345864',motif:'wind'},
    {accent:'#e29a55',metal:'#a8633f',dark:'#594431',motif:'canopy'},
    {accent:'#8fdded',metal:'#7393a8',dark:'#3d596e',motif:'rail'},
    {accent:'#ff825b',metal:'#8d5742',dark:'#49382f',motif:'ember'},
    {accent:'#ffe07a',metal:'#6e806f',dark:'#354c43',motif:'lantern'},
    {accent:'#d6a0ff',metal:'#777592',dark:'#45465f',motif:'prism'},
    {accent:'#ffb568',metal:'#657579',dark:'#343f43',motif:'foundry'}
  ];
  const TEAM={player:'#39c8d3',enemy:'#d65368'},TEAM_LIGHT={player:'#b8fff4',enemy:'#ffd0c7'};
  const MODEL_GROUPS={fighter:['dashling','sunshot','lantern','twinbow'],golem:['mossguard','ironroot'],beast:['nibblers','emberox','ripplefox'],flying:['kitewing','boltfinch','cloudrays','ramblebee']};
  const LANE_X=220/115,PATH_ZS=[],PLANK_ZS=[];
  for(let z=-6.65;z<=6.65;z+=.82)PATH_ZS.push(z);
  for(let z=-.61;z<=.61;z+=.19)PLANK_ZS.push(z);
  const SURFACE={grass:.028,path:.08,water:.085,bridge:.30};
  const SHADOW_RECEIVERS=[{height:SURFACE.grass,clip:[-4.36,-7.5,4.36,7.5]}];
  for(const x of [-LANE_X,LANE_X])for(const z of PATH_ZS)SHADOW_RECEIVERS.push({height:SURFACE.path,clip:[x-.72,z-.39,x+.72,z+.39]});
  SHADOW_RECEIVERS.push({height:SURFACE.water,clip:[-4.36,-.55,4.36,.55]});
  for(const x of [-LANE_X,LANE_X])for(const z of PLANK_ZS)SHADOW_RECEIVERS.push({height:SURFACE.bridge,clip:[x-.83,z-.085,x+.83,z+.085]});
  function fragmentSource(){return `
    precision highp float;
    uniform vec4 uColor; uniform float uFlash; uniform vec4 uShadow; uniform vec4 uShadowClip;
    uniform float uDepthPass; uniform float uShadowReady; uniform sampler2D uShadowMap; uniform mat4 uLightView;
    varying vec3 vNormal; varying vec3 vWorld; varying vec3 vColor; varying vec4 vTint; varying float vAlpha;
    vec4 packDepth(float d){vec4 c=fract(d*vec4(16777216.0,65536.0,256.0,1.0));return c-c.xxyz*vec4(0.0,.00390625,.00390625,.00390625);}
    float unpackDepth(vec4 c){return dot(c,vec4(.000000059604645,.000015258789,.00390625,1.0));}
    float occlusion(vec3 normal){
      if(uShadowReady<.5)return 0.0;
      vec4 light=uLightView*vec4(vWorld,1.0);vec3 q=light.xyz/light.w*.5+.5;
      if(q.x<.002||q.x>.998||q.y<.002||q.y>.998)return 0.0;
      float bias=max(.00045,.00105*(1.0-dot(normal,normalize(vec3(-.46,.84,.34))))),sum=0.0;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){float depth=unpackDepth(texture2D(uShadowMap,q.xy+vec2(float(x),float(y))/1024.0));sum+=step(depth+bias,q.z);}
      return sum/9.0;
    }
    void main(){
      if(uDepthPass>.5){gl_FragColor=packDepth(gl_FragCoord.z);return;}
      if(uShadow.z>0.0){
        if(vWorld.x<uShadowClip.x||vWorld.z<uShadowClip.y||vWorld.x>uShadowClip.z||vWorld.z>uShadowClip.w)discard;
        float radius=length((vWorld.xz-uShadow.xy)*uShadow.zw);
        gl_FragColor=vec4(uColor.rgb,uColor.a*(1.0-smoothstep(.12,1.0,radius)));return;
      }
      vec3 n=normalize(vNormal),keyDir=normalize(vec3(-.46,.84,.34)),viewDir=normalize(vec3(0.0,.88,.48));
      float key=max(dot(n,keyDir),0.0),sky=max(dot(n,normalize(vec3(.35,.65,-.70))),0.0),shade=occlusion(n);
      vec3 base=vTint.rgb*vColor;
      float grain=fract(sin(dot(floor(vWorld*45.0),vec3(127.1,311.7,74.7)))*43758.5453)-.5;
      float stone=step(.08,base.r)*step(abs(base.r-base.b),.22)*step(abs(base.g-base.r),.16);
      float turf=step(base.r*1.06,base.g)*step(base.b*1.15,base.g)*step(.7,n.y);
      base*=1.0+grain*mix(.025,.075,max(stone,turf));
      vec3 ambient=vec3(.38,.43,.48)+vec3(.10,.14,.15)*max(n.y,0.0);
      vec3 lit=base*(ambient+vec3(1.0,.91,.72)*key*.67*(1.0-shade*.72)+vec3(.31,.43,.53)*sky*.22);
      float spec=pow(max(dot(n,normalize(keyDir+viewDir)),0.0),36.0)*.23*(1.0-shade*.75);
      float rim=pow(1.0-max(dot(n,viewDir),0.0),3.0)*.12;
      lit+=vec3(1.0,.92,.75)*spec+base*rim;
      // Gentle compression preserves bright pennants, metal rims and face details.
      lit=lit/(vec3(1.0)+max(lit-vec3(.82),vec3(0.0))*.32);
      lit=mix(lit,vec3(1.0,.96,.80),clamp(vTint.a,0.0,1.0));
      gl_FragColor=vec4(clamp(lit,0.0,1.0),vAlpha);
    }
  `;}
  function hex(value){const text=value.replace('#',''),full=text.length===3?text.split('').map(c=>c+c).join(''):text;return[parseInt(full.slice(0,2),16)/255,parseInt(full.slice(2,4),16)/255,parseInt(full.slice(4,6),16)/255];}
  function mix(a,b,t){const x=hex(a),y=hex(b);return x.map((v,i)=>v+(y[i]-v)*t);}
  function mul(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)out[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return out;}
  function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2),nf=1/(near-far),out=new Float32Array(16);out[0]=f/aspect;out[5]=f;out[10]=(far+near)*nf;out[11]=-1;out[14]=2*far*near*nf;return out;}
  function orthographic(left,right,bottom,top,near,far){const out=new Float32Array(16);out[0]=2/(right-left);out[5]=2/(top-bottom);out[10]=-2/(far-near);out[12]=-(right+left)/(right-left);out[13]=-(top+bottom)/(top-bottom);out[14]=-(far+near)/(far-near);out[15]=1;return out;}
  function lookAt(eye,target,up){let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],len=Math.hypot(zx,zy,zz);zx/=len;zy/=len;zz/=len;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;len=Math.hypot(xx,xy,xz);xx/=len;xy/=len;xz/=len;const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return new Float32Array([xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-xx*eye[0]-xy*eye[1]-xz*eye[2],-yx*eye[0]-yy*eye[1]-yz*eye[2],-zx*eye[0]-zy*eye[1]-zz*eye[2],1]);}
  function inverse(a){const out=new Float32Array(16),a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15],b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return null;det=1/det;out[0]=(a11*b11-a12*b10+a13*b09)*det;out[1]=(a02*b10-a01*b11-a03*b09)*det;out[2]=(a31*b05-a32*b04+a33*b03)*det;out[3]=(a22*b04-a21*b05-a23*b03)*det;out[4]=(a12*b08-a10*b11-a13*b07)*det;out[5]=(a00*b11-a02*b08+a03*b07)*det;out[6]=(a32*b02-a30*b05-a33*b01)*det;out[7]=(a20*b05-a22*b02+a23*b00)*det;out[8]=(a10*b10-a11*b08+a13*b06)*det;out[9]=(a01*b08-a00*b10-a03*b06)*det;out[10]=(a30*b04-a31*b02+a33*b00)*det;out[11]=(a21*b02-a20*b04-a23*b00)*det;out[12]=(a11*b07-a10*b09-a12*b06)*det;out[13]=(a00*b09-a01*b07+a02*b06)*det;out[14]=(a31*b01-a30*b03-a32*b00)*det;out[15]=(a20*b03-a21*b01+a22*b00)*det;return out;}
  function transformPoint(m,x,y,z){const q=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]];return q.map(v=>v/q[3]);}
  function modelMatrix(x,y,z,sx,sy,sz,yaw,pitch,roll){const cy=Math.cos(yaw||0),syw=Math.sin(yaw||0),cx=Math.cos(pitch||0),sxw=Math.sin(pitch||0),cz=Math.cos(roll||0),szw=Math.sin(roll||0),r00=cy*cz+syw*sxw*szw,r01=-cy*szw+syw*sxw*cz,r02=syw*cx,r10=cx*szw,r11=cx*cz,r12=-sxw,r20=-syw*cz+cy*sxw*szw,r21=syw*szw+cy*sxw*cz,r22=cy*cx;return{matrix:new Float32Array([r00*sx,r10*sx,r20*sx,0,r01*sy,r11*sy,r21*sy,0,r02*sz,r12*sz,r22*sz,0,x,y,z,1]),normal:new Float32Array([r00,r10,r20,r01,r11,r21,r02,r12,r22])};}
  class TowerRenderer3D{
    constructor(canvas,engine){this.canvas=canvas;this.engine=engine;this.gl=null;this.lost=false;this.stats={drawCalls:0,triangles:0,units:0,pixelRatio:1,context:'webgl'};canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;},false);canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;this.init();},false);this.init();}
    init(){const gl=this.canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});if(!gl)throw new Error('Pennant Duel requires WebGL');this.gl=gl;this.arenaBatch=null;this.viewProjection=null;const vertex=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;
      attribute vec4 aInstance0;attribute vec4 aInstance1;attribute vec4 aInstance2;attribute vec4 aInstance3;attribute vec4 aTint;
      uniform mat4 uModel;uniform mat4 uViewProjection;uniform mat3 uNormal;uniform vec4 uColor;uniform float uFlash;uniform float uInstanced;
      varying vec3 vNormal;varying vec3 vWorld;varying vec3 vColor;varying vec4 vTint;varying float vAlpha;
      void main(){mat4 model=uModel;mat3 normals=uNormal;vTint=vec4(uColor.rgb,uFlash);vAlpha=uColor.a;
        if(uInstanced>.5){model=mat4(aInstance0,aInstance1,aInstance2,vec4(aInstance3.xyz,1.0));
          normals=mat3(aInstance0.xyz/dot(aInstance0.xyz,aInstance0.xyz),aInstance1.xyz/dot(aInstance1.xyz,aInstance1.xyz),aInstance2.xyz/dot(aInstance2.xyz,aInstance2.xyz));vTint=aTint;vAlpha=aInstance3.w;}
        vec4 w=model*vec4(aPosition,1.0);vColor=aColor;vWorld=w.xyz;vNormal=normalize(normals*aNormal);gl_Position=uViewProjection*w;}`;const fragment=fragmentSource();const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));return shader;};const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));this.program=program;this.instancing=gl.getExtension('ANGLE_instanced_arrays');this.instanceBuffers=new Map();this.locations={position:gl.getAttribLocation(program,'aPosition'),normal:gl.getAttribLocation(program,'aNormal'),colorAttribute:gl.getAttribLocation(program,'aColor'),model:gl.getUniformLocation(program,'uModel'),viewProjection:gl.getUniformLocation(program,'uViewProjection'),normalMatrix:gl.getUniformLocation(program,'uNormal'),color:gl.getUniformLocation(program,'uColor'),flash:gl.getUniformLocation(program,'uFlash'),shadow:gl.getUniformLocation(program,'uShadow'),shadowClip:gl.getUniformLocation(program,'uShadowClip')};this.locations.instanced=gl.getUniformLocation(program,'uInstanced');this.locations.instances=[0,1,2,3].map(i=>gl.getAttribLocation(program,'aInstance'+i));this.locations.tint=gl.getAttribLocation(program,'aTint');this.locations.depthPass=gl.getUniformLocation(program,'uDepthPass');this.locations.lightView=gl.getUniformLocation(program,'uLightView');this.locations.shadowReady=gl.getUniformLocation(program,'uShadowReady');this.locations.shadowMap=gl.getUniformLocation(program,'uShadowMap');this.meshes={box:this.mesh(this.boxData()),roundBox:this.mesh(this.roundBoxData()),horn:this.mesh(this.hornData()),wing:this.mesh(this.wingData(false)),'wing-left':this.mesh(this.wingData(true)),sphere:this.mesh(this.sphereData(24,14)),cylinder:this.mesh(this.cylinderData(24,1)),cone:this.mesh(this.cylinderData(24,0)),disc:this.mesh(this.cylinderData(24,1,.06)),ring:this.mesh(this.ringData(32))};gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(.11,.18,.20,1);this.initShadows();this.resize();}
    mesh(data){const gl=this.gl,mesh={count:data.indices.length,data};mesh.position=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.positions),gl.STATIC_DRAW);mesh.normal=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.normals),gl.STATIC_DRAW);mesh.index=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data.indices),gl.STATIC_DRAW);if(data.colors){mesh.color=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,mesh.color);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data.colors),gl.STATIC_DRAW);}return mesh;}
    boxData(){const p=[],n=[],i=[],faces=[[[0,0,1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],[[0,0,-1],[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]],[[1,0,0],[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]],[[-1,0,0],[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]],[[0,1,0],[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]],[[0,-1,0],[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]];faces.forEach(f=>{const base=p.length/3;for(let k=1;k<5;k++){p.push(...f[k]);n.push(...f[0]);}i.push(base,base+1,base+2,base,base+2,base+3);});return{positions:p,normals:n,indices:i};}
    roundBoxData(){
      const data={positions:[],normals:[],indices:[]},faces=this.boxData(),steps=4;
      for(let f=0;f<6;f++){
        const corners=Array.from({length:4},(_,i)=>faces.positions.slice((f*4+i)*3,(f*4+i+1)*3)),base=data.positions.length/3;
        for(let y=0;y<=steps;y++)for(let x=0;x<=steps;x++){
          const u=x/steps,v=y/steps,p=corners[0].map((a,i)=>a+(corners[1][i]-a)*u+(corners[3][i]-a)*v),c=p.map(a=>Math.max(-.76,Math.min(.76,a))),n=p.map((a,i)=>a-c[i]),length=Math.hypot(...n);
          for(let i=0;i<3;i++){data.positions.push(c[i]+n[i]/length*.24);data.normals.push(n[i]/length);}
        }
        for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){const i=base+y*(steps+1)+x;data.indices.push(i,i+1,i+steps+1,i+1,i+steps+2,i+steps+1);}
      }return data;
    }
    hornData(){
      const d={positions:[],normals:[],indices:[]},rings=9,segments=10;
      for(let y=0;y<=rings;y++){const t=y/rings,r=.24*(1-t)+.012,cx=.55*t*t,cy=t*1.35;for(let k=0;k<=segments;k++){const a=k/segments*TAU;d.positions.push(cx+Math.cos(a)*r,cy,Math.sin(a)*r);d.normals.push(Math.cos(a),.18,Math.sin(a));}}
      for(let y=0;y<rings;y++)for(let k=0;k<segments;k++){const i=y*(segments+1)+k,j=i+segments+1;d.indices.push(i,j,i+1,j,j+1,i+1);}return d;
    }
    wingData(left){
      const poly=[[0,-.28],[.85,-.12],[1.18,.18],[.67,.64],[.12,.48]],d={positions:[],normals:[],indices:[]};
      for(const side of [-1,1])for(const [x,z]of poly){d.positions.push(left?-x:x,side*.065,z);d.normals.push(0,side,0);}
      for(let i=1;i<poly.length-1;i++){d.indices.push(0,i,i+1,5,5+i+1,5+i);}
      for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length,base=d.positions.length/3,a=poly[i],b=poly[j],nx=b[1]-a[1],nz=a[0]-b[0],l=Math.hypot(nx,nz);for(const [point,y]of [[a,-.065],[a,.065],[b,.065],[b,-.065]]){d.positions.push(left?-point[0]:point[0],y,point[1]);d.normals.push((left?-nx:nx)/l,0,nz/l);}d.indices.push(base,base+1,base+2,base,base+2,base+3);}
      if(left)for(let i=0;i<d.indices.length;i+=3){const n=d.indices[i];d.indices[i]=d.indices[i+2];d.indices[i+2]=n;}return d;
    }
    sphereData(segments,rings){const p=[],n=[],i=[];for(let y=0;y<=rings;y++){const phi=y/rings*Math.PI;for(let x=0;x<=segments;x++){const theta=x/segments*TAU,nx=Math.sin(phi)*Math.cos(theta),ny=Math.cos(phi),nz=Math.sin(phi)*Math.sin(theta);p.push(nx,ny,nz);n.push(nx,ny,nz);}}for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){const a=y*(segments+1)+x,b=a+segments+1;if(y===0)i.push(b,a+1,b+1);else if(y===rings-1)i.push(a,a+1,b);else i.push(a,a+1,b,b,a+1,b+1);}return{positions:p,normals:n,indices:i};}
    cylinderData(segments,topRadius,bottomRadius){bottomRadius=bottomRadius==null?1:bottomRadius;const p=[],n=[],i=[];for(let s=0;s<=segments;s++){const a=s/segments*TAU,c=Math.cos(a),z=Math.sin(a);p.push(c*bottomRadius,-1,z*bottomRadius,c*topRadius,1,z*topRadius);n.push(c,0,z,c,0,z);}for(let s=0;s<segments;s++){const a=s*2;if(topRadius===0)i.push(a,a+1,a+2);else i.push(a,a+1,a+2,a+1,a+3,a+2);}const cap=(y,radius,normal)=>{const center=p.length/3;p.push(0,y,0);n.push(0,normal,0);for(let s=0;s<=segments;s++){const a=s/segments*TAU;p.push(Math.cos(a)*radius,y,Math.sin(a)*radius);n.push(0,normal,0);}for(let s=0;s<segments;s++)normal>0?i.push(center,center+s+2,center+s+1):i.push(center,center+s+1,center+s+2);};cap(-1,bottomRadius,-1);if(topRadius)cap(1,topRadius,1);return{positions:p,normals:n,indices:i};}
    ringData(segments){const p=[],n=[],i=[];for(let s=0;s<=segments;s++){const a=s/segments*TAU,c=Math.cos(a),z=Math.sin(a);p.push(c*.76,0,z*.76,c,0,z);n.push(0,1,0,0,1,0);}for(let s=0;s<segments;s++){const a=s*2;i.push(a,a+2,a+1,a+1,a+2,a+3);}return{positions:p,normals:n,indices:i};}
    resize(){const rect=this.canvas.getBoundingClientRect(),budget=12000000,dpr=Math.min(devicePixelRatio||1,Math.sqrt(budget/Math.max(1,rect.width*rect.height))),width=Math.max(1,Math.round(rect.width*dpr)),height=Math.max(1,Math.round(rect.height*dpr));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}this.stats.pixelRatio=Math.min(width/Math.max(1,rect.width),height/Math.max(1,rect.height));if(this.viewProjection&&this.projectionWidth===width&&this.projectionHeight===height)return;this.projectionWidth=width;this.projectionHeight=height;this.gl.viewport(0,0,width,height);const aspect=width/height,portrait=aspect<.8,eye=portrait?[0,19.5,7.2]:[0,18,9.2],target=[0,.40,0],halfHeight=portrait?7.65:8.45,halfWidth=halfHeight*aspect;this.camera={eye,target,aspect,halfHeight,halfWidth,projection:'orthographic-three-quarter'};this.viewProjection=mul(orthographic(-halfWidth,halfWidth,-halfHeight,halfHeight,-45,45),lookAt(eye,target,[0,1,0]));this.inverseViewProjection=inverse(this.viewProjection);}
    screenToWorld(clientX,clientY){const rect=this.canvas.getBoundingClientRect(),nx=(clientX-rect.left)/rect.width*2-1,ny=1-(clientY-rect.top)/rect.height*2,near=transformPoint(this.inverseViewProjection,nx,ny,-1),far=transformPoint(this.inverseViewProjection,nx,ny,1),dy=far[1]-near[1],t=Math.abs(dy)<1e-8?0:-near[1]/dy,x=near[0]+(far[0]-near[0])*t,z=near[2]+(far[2]-near[2])*t;return{x:x*115+500,y:z*100+700};}
    worldToScreen(engineX,engineY,worldHeight){const rect=this.canvas.getBoundingClientRect(),clip=transformPoint(this.viewProjection,(engineX-500)/115,worldHeight||0,(engineY-700)/100);return{x:rect.left+(clip[0]+1)*rect.width/2,y:rect.top+(1-clip[1])*rect.height/2};}
    drawMesh(name,x,y,z,sx,sy,sz,color,yaw,pitch,roll,alpha,flash,shadow,shadowClip){if(this.modelCapture){this.modelCapture.push(Array.from(arguments));return;}if(this.arenaCapture){this.arenaCapture.push(Array.from(arguments));return;}this.resetInstances();const gl=this.gl,mesh=typeof name==='string'?this.meshes[name]:name,model=modelMatrix(x,y,z,sx,sy,sz,yaw,pitch,roll),rgb=Array.isArray(color)?color:hex(color);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position);gl.enableVertexAttribArray(this.locations.position);gl.vertexAttribPointer(this.locations.position,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);gl.enableVertexAttribArray(this.locations.normal);gl.vertexAttribPointer(this.locations.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);if(mesh.color){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.color);gl.enableVertexAttribArray(this.locations.colorAttribute);gl.vertexAttribPointer(this.locations.colorAttribute,3,gl.FLOAT,false,0,0);}else{gl.disableVertexAttribArray(this.locations.colorAttribute);gl.vertexAttrib3f(this.locations.colorAttribute,1,1,1);}gl.uniformMatrix4fv(this.locations.model,false,model.matrix);gl.uniformMatrix3fv(this.locations.normalMatrix,false,model.normal);gl.uniform4f(this.locations.color,rgb[0],rgb[1],rgb[2],alpha==null?1:alpha);gl.uniform1f(this.locations.flash,flash||0);gl.uniform4f(this.locations.shadow,...(shadow||[0,0,0,0]));gl.uniform4f(this.locations.shadowClip,...(shadowClip||[0,0,0,0]));if((alpha==null?1:alpha)<1)gl.depthMask(false);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,(mesh.offset||0)*2);if((alpha==null?1:alpha)<1)gl.depthMask(true);this.stats.drawCalls++;this.stats.triangles+=mesh.count/3;}
    shadow(x,z,scale,alpha){
      const rx=Math.max(.001,scale),rz=rx*.58,footprint=[x,z,1/rx,1/rz];
      for(const receiver of SHADOW_RECEIVERS){
        const clip=receiver.clip;
        if(x+rx<clip[0]||x-rx>clip[2]||z+rz<clip[1]||z-rz>clip[3])continue;
        // Clip each soft footprint to its surface. Existing opaque depth hides
        // lower receivers beneath roads, water and bridge planks.
        this.drawMesh('disc',x,receiver.height+.001,z,rx,.0002,rz,[.025,.055,.06],0,0,0,alpha==null?.3:alpha,0,footprint,clip);
      }
    }
    part(name,origin,offset,scale,color,yaw,pitch,roll,alpha,flash){const c=Math.cos(yaw||0),s=Math.sin(yaw||0),ox=offset[0]*c+offset[2]*s,oz=-offset[0]*s+offset[2]*c;this.drawMesh(name,origin[0]+ox,origin[1]+offset[1],origin[2]+oz,scale[0],scale[1],scale[2],color,yaw,pitch,roll,alpha,flash);}
    initShadows(){
      const gl=this.gl,size=1024,texture=gl.createTexture(),framebuffer=gl.createFramebuffer(),depth=gl.createRenderbuffer();
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,size,size);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      this.shadowTarget=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE?{texture,framebuffer,depth,size}:null;
      if(!this.shadowTarget){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);gl.deleteRenderbuffer(depth);}
      this.lightView=mul(orthographic(-11,11,-11,11,1,45),lookAt([-9.2,16.8,6.8],[0,0,0],[0,1,0]));
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
    }
    resetInstances(){
      const gl=this.gl;gl.uniform1f(this.locations.instanced,0);
      for(const location of [...this.locations.instances,this.locations.tint]){gl.disableVertexAttribArray(location);if(this.instancing)this.instancing.vertexAttribDivisorANGLE(location,0);}
    }
    prepareModels(calls){
      const groups=new Map();
      for(const call of calls){const [name,x,y,z,sx,sy,sz,color,yaw,pitch,roll,alpha,flash,shadow]=call;
        if(shadow||alpha!=null&&alpha<1)continue;
        let g=groups.get(name);if(!g){g={name,values:[],count:0};groups.set(name,g);}
        const m=modelMatrix(x,y,z,sx,sy,sz,yaw,pitch,roll).matrix,rgb=Array.isArray(color)?color:hex(color);
        for(let i=0;i<16;i++)g.values.push(i===15?1:m[i]);g.values.push(...rgb,flash||0);g.count++;
      }
      if(this.instancing)for(const g of groups.values()){let buffer=this.instanceBuffers.get(g.name);if(!buffer){buffer=this.gl.createBuffer();this.instanceBuffers.set(g.name,buffer);}g.buffer=buffer;this.gl.bindBuffer(this.gl.ARRAY_BUFFER,buffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,new Float32Array(g.values),this.gl.DYNAMIC_DRAW);}
      return groups;
    }
    drawModels(calls,groups){
      if(!this.instancing){for(const call of calls)if(!call[13]&&(call[11]==null||call[11]>=1))this.drawMesh(...call);return;}
      const gl=this.gl,L=this.locations;gl.uniform1f(L.instanced,1);gl.uniform4f(L.shadow,0,0,0,0);gl.disableVertexAttribArray(L.colorAttribute);gl.vertexAttrib3f(L.colorAttribute,1,1,1);
      for(const g of groups.values()){
        const mesh=this.meshes[g.name];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.position);gl.enableVertexAttribArray(L.position);gl.vertexAttribPointer(L.position,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh.normal);gl.enableVertexAttribArray(L.normal);gl.vertexAttribPointer(L.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
        gl.bindBuffer(gl.ARRAY_BUFFER,g.buffer);
        for(let i=0;i<4;i++){const location=L.instances[i];gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,80,i*16);this.instancing.vertexAttribDivisorANGLE(location,1);}
        gl.enableVertexAttribArray(L.tint);gl.vertexAttribPointer(L.tint,4,gl.FLOAT,false,80,64);this.instancing.vertexAttribDivisorANGLE(L.tint,1);
        this.instancing.drawElementsInstancedANGLE(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0,g.count);this.stats.drawCalls++;this.stats.triangles+=mesh.count/3*g.count;
      }
      this.resetInstances();
    }
    render(match,options){
      if(this.lost||!this.gl||!match)return;this.resize();const gl=this.gl,L=this.locations;
      this.stats.drawCalls=0;this.stats.triangles=0;this.stats.units=match.units.length;gl.useProgram(this.program);
      const calls=[];this.modelCapture=calls;
      try{for(const t of match.towers)this.drawTower(t);for(const u of match.units)this.drawUnit(u,match);}finally{this.modelCapture=null;}
      const groups=this.prepareModels(calls);this.stats.modelParts=calls.filter(c=>!c[13]&&(c[11]==null||c[11]>=1)).length;this.stats.instanced=!!this.instancing;
      gl.uniformMatrix4fv(L.lightView,false,this.lightView);gl.uniform1i(L.shadowMap,0);gl.uniform1f(L.shadowReady,0);
      if(this.shadowTarget){
        gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowTarget.framebuffer);gl.viewport(0,0,1024,1024);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.uniform1f(L.depthPass,1);gl.uniformMatrix4fv(L.viewProjection,false,this.lightView);gl.disable(gl.BLEND);this.drawModels(calls,groups);gl.enable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      }
      gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(.10,.17,.19,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(L.depthPass,0);gl.uniformMatrix4fv(L.viewProjection,false,this.viewProjection);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTarget?this.shadowTarget.texture:null);gl.uniform1f(L.shadowReady,this.shadowTarget?1:0);
      this.drawArena(match);this.drawPlacement(match,options);
      // Soft contact footprints belong below opaque models; translucent deploys follow them.
      for(const c of calls)if(c[13]){const copy=c.slice();copy[11]*=this.shadowTarget?.30:1;this.drawMesh(...copy);}
      this.drawModels(calls,groups);
      for(const c of calls)if(!c[13]&&c[11]!=null&&c[11]<1)this.drawMesh(...c);
      for(const projectile of match.projectiles)this.drawProjectile(projectile,match);
      if(!options.reducedEffects)for(const effect of match.effects)this.drawEffect(effect);
      if(options.dragPreview&&options.dragPreview.inside)this.drawGhost(options.dragPreview,match);
      this.stats.directionalShadows=!!this.shadowTarget;
    }
    compileArena(calls){
      const data={positions:[],normals:[],colors:[],indices:[]},transparent=[],commands=[];
      let range=null;
      for(const call of calls){
        const [name,x,y,z,sx,sy,sz,color,yaw,pitch,roll,alpha,,shadow]=call;
        if(alpha!=null&&alpha<1||shadow){transparent.push(call);commands.push({call});range=null;continue;}
        if(!range){range={offset:data.indices.length,count:0};commands.push({range});}
        const source=this.meshes[name].data,{matrix:m,normal:n}=modelMatrix(x,y,z,sx,sy,sz,yaw,pitch,roll),rgb=Array.isArray(color)?color:hex(color),base=data.positions.length/3;
        if(base+source.positions.length/3>65535)throw new Error('Arena batch exceeds WebGL1 vertex range');
        for(let i=0;i<source.positions.length;i+=3){
          const px=source.positions[i],py=source.positions[i+1],pz=source.positions[i+2],nx=source.normals[i],ny=source.normals[i+1],nz=source.normals[i+2];
          data.positions.push(m[0]*px+m[4]*py+m[8]*pz+m[12],m[1]*px+m[5]*py+m[9]*pz+m[13],m[2]*px+m[6]*py+m[10]*pz+m[14]);
          data.normals.push(n[0]*nx+n[3]*ny+n[6]*nz,n[1]*nx+n[4]*ny+n[7]*nz,n[2]*nx+n[5]*ny+n[8]*nz);
          data.colors.push(...rgb);
        }
        for(const index of source.indices)data.indices.push(base+index);
        range.count+=source.indices.length;
      }
      return{data,transparent,commands};
    }
    drawCachedArena(index){
      if(!this.arenaBatch||this.arenaBatch.index!==index){
        if(this.arenaBatch)for(const name of ['position','normal','index','color'])this.gl.deleteBuffer(this.arenaBatch.mesh[name]);
        const calls=[];this.arenaCapture=calls;
        try{this.drawArenaStatic(index);}finally{this.arenaCapture=null;}
        const compiled=this.compileArena(calls);
        const mesh=this.mesh(compiled.data);
        // Keep alpha/shadow submissions between their original opaque runs.
        // A bridge's own shadow must remain below its deck, for example.
        this.arenaBatch={index,mesh,commands:compiled.commands.map(command=>command.call?command:{mesh:Object.assign({},mesh,command.range)}),sourceDraws:calls.length};
      }
      const batch=this.arenaBatch;
      for(const command of batch.commands){
        if(command.call)this.drawMesh(...command.call);
        else this.drawMesh(command.mesh,0,0,0,1,1,1,[1,1,1]);
      }
      this.stats.arenaSourceDraws=batch.sourceDraws;
      this.stats.arenaDrawCalls=batch.commands.length;
    }
    drawArena(match){
      const index=match.arena%PALETTES.length,p=PALETTES[index],theme=ARENA_THEMES[index];
      this.drawCachedArena(index);
      // Water glints and moving landmarks remain live; they never enter the
      // static batch or freeze when the same arena is reused after a restore.
      for(let x=-4.05;x<=4.05;x+=.58)this.drawMesh('box',x,.092,Math.sin(match.time*1.7+x)*.08,.23,.012,.014,theme.accent,0,0,0,.36);
      this.drawArenaLandmarks(index,p,theme,match.time);
    }
    drawArenaStatic(index){
      const p=PALETTES[index],theme=ARENA_THEMES[index],half=4.36,lane=LANE_X;
      // The structural slab ends below one coherent turf surface, leaving a
      // real gap instead of the former coplanar top faces and their banding.
      this.drawMesh('box',0,-.32,0,half,.30,7.5,mix(p.grass,'#172e29',.16));
      this.drawMesh('box',0,.003,0,4.31,.017,7.02,mix(p.grass,p.grass2,.12));
      // Broad alternating turf squares keep the two lanes legible at phone size.
      for(let row=0;row<16;row++)for(let col=0;col<10;col++){
        const x=-3.87+col*.86,z=-6.56+row*.875;
        if(Math.abs(z)<.7)continue;
        this.drawMesh('box',x,.024,z,.43,.004,.4375,(row+col)%2?p.grass:p.grass2);
      }
      for(const x of [-lane,lane]){
        this.drawMesh('box',x,.04,0,.72,.038,6.95,mix(p.path,p.grass,.28));
        for(let z=-5.8;z<=5.8;z+=.88)for(const dx of [-.34,.34]){
          if(Math.abs(z)<.7)continue;
          this.drawMesh('box',x+dx,SURFACE.path-.012,z,.32,.012,.41,mix(p.path,'#d9d89f',((Math.round(z*100)+dx*100)&1)?.14:.03));
        }
      }
      // Masonry banks sit above the animated stream without covering bridge paths.
      for(const side of [-1,1])for(let x=-4.13;x<4.3;x+=.46){
        if(Math.abs(Math.abs(x)-lane)<.95)continue;
        this.drawMesh('box',x,.10,side*.62,.22,.13,.11,mix(p.stone,'#e1d8bb',(Math.round(x*10)&1)?.14:.0));
      }
      this.drawMesh('box',0,SURFACE.water-.07,0,half,.07,.55,mix(p.water,'#061d39',.14));
      for(const x of [-lane,lane])this.drawBridge(x,p,theme);
      this.drawRamparts(p,theme);
    }
    drawBridge(x,p,theme){
      this.shadow(x,0,1.08,.34);
      this.drawMesh('box',x,.17,0,.91,.10,.68,mix(theme.dark,'#111820',.18));
      for(const z of PLANK_ZS)this.drawMesh('box',x,SURFACE.bridge-.075,z,.83,.075,.078,(Math.round(z*100)&1)?p.wood:mix(p.wood,'#ffe0a0',.10));
      for(const z of [-.48,-.16,.16,.48])for(const side of [-1,1]){
        this.drawMesh('sphere',x+side*.64,SURFACE.bridge+.012,z,.027,.017,.027,theme.metal);
        this.drawMesh('box',x+side*.59,SURFACE.bridge+.004,z,.08,.004,.035,mix(p.wood,'#e8cf9a',.28));
      }
      for(const side of [-1,1]){
        this.drawMesh('cylinder',x+side*.92,.38,0,.055,.5,.055,theme.dark);
        this.drawMesh('cylinder',x+side*.90,.61,0,.025,.48,.025,theme.accent,0,0,Math.PI/2);
        for(let z=-.55;z<=.55;z+=.28)this.drawMesh('sphere',x+side*.92,.68,z,.09,.09,.09,mix(theme.accent,'#ffffff',.28));
      }
    }
    drawRamparts(p,theme){
      for(const side of [-1,1]){
        const z=side*7.25;
        this.drawMesh('box',0,.28,z,4.36,.30,.20,mix(p.stone,theme.dark,.24));
        this.drawMesh('box',0,.59,z,4.30,.055,.23,mix(p.stone,'#ffffff',.12));
        for(let x=-3.9;x<=3.9;x+=1.3)this.drawMesh('box',x,.85,z,.30,.24,.24,(Math.round(x*3)&1)?p.stone:mix(p.stone,'#ffffff',.16));
        for(let x=-3.9;x<4;x+=.65){this.drawMesh('box',x,.32,z+side*.205,.006,.21,.006,mix(theme.dark,p.stone,.3));this.drawMesh('sphere',x,.54,z+side*.215,.028,.028,.015,theme.metal);}
        for(const x of [-3.65,3.65])this.drawPennant(x,1.24,z-side*.10,side,theme.accent,theme.dark,.72);
      }
    }
    drawPennant(x,y,z,facing,color,dark,size){
      this.drawMesh('cylinder',x,y,z,.025,size,.025,dark);
      this.drawMesh('box',x+.16,y+size*.55,z-facing*.015,.16,.16,.025,color,0,0,-.18*facing);
      this.drawMesh('cone',x+.34,y+size*.55,z-facing*.015,.16,.18,.025,color,0,0,-Math.PI/2);
    }
    drawArenaLandmarks(index,p,theme,time){
      const motif=theme.motif;
      for(const side of [-1,1])for(const x of [-3.45,3.45]){
        const z=side*5.65;
        if(motif==='roof'){
          this.drawMesh('box',x,.16,z,.35,.15,.30,theme.dark);
          this.drawMesh('box',x,.38,z,.22,.08,.18,theme.accent);
          this.drawMesh('cylinder',x+.18,.62,z,.08,.28,.08,theme.metal);
        }else if(motif==='wind'){
          this.drawMesh('cylinder',x,.42,z,.035,.42,.035,theme.metal);
          this.drawMesh('cone',x+.22+Math.sin(time)*.03,.72,z,.16,.34,.16,theme.accent,0,0,Math.PI/2);
        }else if(motif==='canopy'){
          this.drawMesh('cylinder',x,.34,z,.24,.34,.24,theme.metal);
          this.drawMesh('sphere',x,.72,z,.48,.20,.48,theme.accent);
          this.drawMesh('ring',x,.75,z,.56,1,.56,mix(theme.accent,'#ffffff',.25),0,0,0,.8);
        }else if(motif==='rail'){
          this.drawMesh('box',x,.18,z,.42,.12,.20,theme.dark);
          this.drawMesh('cylinder',x,.62,z,.055,.46,.055,theme.metal);
          this.drawMesh('box',x,.94,z,.30,.06,.08,theme.accent,0,0,Math.sin(time*.7)*.08);
        }else if(motif==='ember'){
          this.drawMesh('box',x,.23,z,.38,.22,.34,theme.dark);
          this.drawMesh('box',x,.48,z-.25*side,.24,.16,.08,theme.metal);
          this.drawMesh('sphere',x,.49,z-.35*side,.12,.12,.12,theme.accent,0,0,0,.9);
          this.drawMesh('cylinder',x+.24,.78,z,.09,.38,.09,theme.metal);
        }else if(motif==='lantern'){
          this.drawMesh('cylinder',x,.48,z,.04,.48,.04,theme.dark);
          this.drawMesh('box',x,.83,z,.19,.24,.19,theme.accent);
          this.drawMesh('sphere',x,.84,z,.21,.23,.21,mix(theme.accent,'#ffffff',.24),0,0,0,.58);
        }else if(motif==='prism'){
          this.drawMesh('cone',x,.42,z,.30,.42,.30,theme.accent,Math.PI/4,0,0,.92);
          this.drawMesh('ring',x,.13,z,.42,1,.42,theme.metal,0,0,0,.75);
        }else{
          this.drawMesh('cylinder',x,.28,z,.32,.26,.32,theme.dark);
          this.drawMesh('ring',x,.56,z,.39,1,.39,theme.accent,0,0,time*.18,.9);
          this.drawMesh('cylinder',x+.27,.86,z,.10,.40,.10,theme.metal);
        }
      }
    }
    drawPlacement(match,options){const id=options.dragPreview?options.dragPreview.id:options.selectedCard;if(!id)return;const card=this.engine.cardMap[id],z=card.kind==='spell'?0:3.75;this.drawMesh('box',0,.065,z,4.32,.018,card.kind==='spell'?7:3.2,card.kind==='spell'?'#f6d36d':'#55e1bf',0,0,0,.17);if(card.kind==='unit')for(const lane of [0,1]){const tower=match.towers.find(item=>item.side==='enemy'&&item.type==='lane'&&item.lane===lane);if(tower&&!tower.alive)this.drawMesh('box',lane===0?-2.05:2.05,.07,-2.02,1.72,.02,1.37,'#55e1bf',0,0,0,.19);}if(options.dragPreview&&options.dragPreview.inside){const point=options.dragPreview.world,x=(point.x-500)/115,wz=(point.y-700)/100,legal=this.engine.legalPlacement(match,'player',card,point.x,point.y),radius=Math.max(.38,(card.radius||card.size*1.8)/108);this.drawMesh('ring',x,.11,wz,radius,1,radius,legal.ok?'#c2ffea':'#ff8e83',0,0,0,.92);}}
    drawTower(t){
      const x=(t.x-500)/115,z=(t.y-700)/100,side=t.side,team=TEAM[side],light=TEAM_LIGHT[side],base=t.type==='base',s=base?1.12:.88,flash=Math.min(1,(t.hit||0)*6),face=side==='player'?-1:1;
      this.shadow(x+.12,z+.15,s*.95,.42);
      if(!t.alive){
        for(let i=0;i<16;i++){const a=i*2.29,r=.12+(i%4)*.18;this.drawMesh('roundBox',x+Math.cos(a)*r,.10+(i%3)*.07,z+Math.sin(a)*r,.13+(i%2)*.07,.10+(i%3)*.04,.13,i%2?'#858b89':'#c1b89b',a,.2*i,.4*i);}
        this.drawMesh('ring',x,.045,z,s*.72,1,s*.72,team,0,0,0,.42);return;
      }
      const p=this.crewPainter([x,.08,z],0,s,1,flash),stone='#dfd5b3',edge='#aaa68e',dark='#4a5457',gold='#e7bf65';
      p('roundBox',0,.10,0,.80,.10,.73,dark);p('roundBox',0,.28,0,.73,.12,.68,edge);
      p('roundBox',0,.69,0,.62,.36,.57,stone);p('roundBox',0,.38,0,.66,.065,.61,'#c4c0a8');
      // Offset stone courses, recessed windows and metal straps read as architecture.
      for(const y of [.50,.73,.96])for(const dir of [-1,1]){
        p('roundBox',dir*.625,y,0,.018,.009,.50,edge);p('roundBox',0,y,dir*.575,.53,.009,.018,edge);
      }
      for(const dir of [-1,1]){p('roundBox',dir*.39,.73,face*.59,.085,.17,.025,dark);p('roundBox',dir*.39,.74,face*.62,.025,.13,.014,gold);}
      p('roundBox',0,.64,face*.60,.22,.25,.045,'#574b3a');p('roundBox',0,.68,face*.65,.18,.20,.025,team);
      p('roundBox',0,.69,face*.685,.09,.11,.012,light,0,Math.PI/4);
      for(const dir of [-1,1])p('cylinder',dir*.17,.62,face*.68,.025,.21,.025,gold);
      p('roundBox',0,1.09,0,.69,.10,.65,edge);p('roundBox',0,1.21,0,.67,.035,.63,'#f3e6bd');p('roundBox',0,1.26,0,.48,.03,.44,'#887050');
      for(const dx of [-.57,.57])for(const dz of [-.51,.51]){p('cylinder',dx,1.13,dz,.18,.30,.18,stone);p('cylinder',dx,1.42,dz,.20,.065,.20,'#f5eacb');p('roundBox',dx,1.51,dz,.16,.06,.16,team);}
      for(const dir of [-1,1])p('roundBox',dir*.22,1.43,face*.57,.12,.11,.095,stone);
      if(base){p('roundBox',0,1.51,-face*.23,.33,.24,.24,team);p('cone',0,1.88,-face*.23,.43,.18,.34,gold);this.drawPennant(x+.64*s,1.89,z-face*.09,face,team,dark,.50);}
      this.drawDefender([x,base?1.68:1.39,z],side,s*(base?.73:.78),t.heading||0,t.recoil||0,flash);
      this.hpBar(x,base?2.26:1.94,z,t.hp/t.maxHp,side,base?.84:.66);
    }
    drawDefender(o,side,s,heading,recoil,flash){
      const p=this.crewPainter(o,heading+Math.PI/2,s,1,flash),team=TEAM[side],skin='#dfac7f',dark='#283443';
      p('roundBox',0,.02,.05,.25,.25,.19,team);p('sphere',0,.37,.02,.22,.24,.21,skin);p('sphere',0,.51,.06,.25,.13,.23,dark);p('cylinder',0,.47,.02,.27,.035,.26,team);
      for(const dir of [-1,1]){p('sphere',dir*.075,.38,-.18,.045,.05,.025,'#fff0d3');p('sphere',dir*.075,.375,-.20,.02,.03,.015,dark);p('sphere',dir*.24,.05,-.17,.09,.10,.09,skin);}
      p('sphere',0,.31,-.21,.04,.06,.04,skin);p('roundBox',0,.23,-.18,.07,.02,.025,'#885539');
      p('cylinder',0,.08,-.36-recoil*.12,.09,.28,.09,'#657477',Math.PI/2);p('cylinder',0,.08,-.62-recoil*.12,.13,.07,.13,'#d3ac60',Math.PI/2);p('cylinder',0,.08,-.70-recoil*.12,.075,.02,.075,'#263238',Math.PI/2);
    }
    hpBar(x,y,z,ratio,side,width){this.drawMesh('box',x,y,z,.5*width,.035,.045,'#172233');this.drawMesh('box',x-(1-ratio)*.5*width,y+.008,z-.003,.48*width*ratio,.045,.055,TEAM[side]);}
    drawUnit(u,match,ghostAlpha){const card=this.engine.cardMap[u.cardId],x=(u.x-500)/115,z=(u.y-700)/100,yaw=(u.heading||-Math.PI/2)+Math.PI/2,s=Math.max(.74,card.size/34),fly=u.flying?.66+Math.sin(match.time*5+String(u.id).length)*.08:0,bob=Math.sin(u.walk||0)*.035,surface=Math.abs(z)<.62&&Math.abs(Math.abs(x)-LANE_X)<.9?SURFACE.bridge:Math.abs(Math.abs(x)-LANE_X)<.76?SURFACE.path:SURFACE.grass,o=[x,surface+.30*s+fly+bob,z],a=ghostAlpha==null?1:ghostAlpha,flash=Math.min(1,(u.hit||0)*6),attack=(u.attackAnim||0)>0?Math.sin((1-u.attackAnim/.24)*Math.PI):0;this.shadow(x,z,.28+s*.22,u.flying?.18:.32);if(MODEL_GROUPS.golem.includes(card.id))this.drawGolem(card,u,o,yaw,s,attack,a,flash);else if(MODEL_GROUPS.beast.includes(card.id))this.drawBeast(card,u,o,yaw,s,attack,a,flash);else if(MODEL_GROUPS.flying.includes(card.id))this.drawFlying(card,u,o,yaw,s,attack,a,flash,match.time);else this.drawFighter(card,u,o,yaw,s,attack,a,flash);this.drawTeamMark(o,yaw,s,u.side,a,!!u.flying);if(ghostAlpha==null){if(u.deploy>0){const progress=Math.min(1,u.deploy/(match.rulesVersion===2?1:.58)),radius=(.42+s*.20)*(1+progress*.14);this.drawMesh('ring',x,surface+.014,z,radius,1,radius,TEAM_LIGHT[u.side],0,0,0,.3+progress*.4);}this.hpBar(x,o[1]+1.47*s,z,u.hp/u.maxHp,u.side,.46+s*.16);if(u.slow>0)this.drawMesh('ring',x,.06,z,.34+s*.16,1,.34+s*.16,'#ef9de9',0,0,0,.7);}}
    drawTeamMark(o,yaw,s,side,a,flying){
      const team=TEAM[side],light=TEAM_LIGHT[side],height=flying?.46:.58;
      this.part('box',o,[0,height,.31*s],[.105*s,.12*s,.025*s],team,yaw,0,Math.PI/4,a);
      this.part('box',o,[0,height,.325*s],[.04*s,.045*s,.028*s],light,yaw,0,Math.PI/4,a);
    }
    crewPainter(o,yaw,s,a,flash){return(name,x,y,z,sx,sy,sz,color,pitch=0,roll=0)=>this.part(name,o,[x*s,y*s,z*s],[sx*s,sy*s,sz*s],color,yaw,pitch,roll,a,flash);}
    drawFighter(card,u,o,yaw,s,attack,a,flash){
      const p=this.crewPainter(o,yaw,s,a,flash),team=TEAM[u.side],trim='#eacb81',dark='#293343',skin=card.id==='sunshot'?'#a86d4b':card.id==='lantern'?'#e2ae7e':'#d9a171',stride=Math.sin(u.walk||0)*.38;
      // Boots, knees and hip joints give each step a connected silhouette.
      for(const side of [-1,1]){const leg=stride*side;p('cylinder',side*.14,.04,.02,.105,.23,.105,dark,leg);p('sphere',side*.14,.19,.02,.12,.12,.12,card.color);p('roundBox',side*.14,-.21,-.08+leg*.08,.13,.09,.22,'#49372d');p('roundBox',side*.14,.0,-.05,.12,.10,.08,trim);}
      p('sphere',0,.43,0,.32,.33,.24,card.color,-attack*.12);p('roundBox',0,.53,-.15,.29,.26,.13,card.color,-attack*.12);
      p('roundBox',0,.28,-.01,.31,.065,.245,'#574330');p('roundBox',0,.28,-.27,.065,.055,.025,trim);
      // Segmented shoulder plates and glove cuffs follow the attack arm.
      for(const side of [-1,1]){const swing=side>0?-attack*.85:-stride*.25;p('sphere',side*.34,.62,.01,.16,.17,.17,team);p('cylinder',side*.39,.43,-attack*.06,.10,.19,.10,card.color,swing,side*.13);p('sphere',side*.40,.25,-.04-attack*.15,.105,.105,.105,skin);p('cylinder',side*.40,.29,-.04-attack*.15,.12,.065,.12,'#674631');p('roundBox',side*.35,.66,-.04,.15,.06,.17,trim);}
      p('cylinder',0,.79,0,.12,.10,.12,skin);p('sphere',0,1.0,-.02,.255,.27,.235,skin);
      p('sphere',0,1.16,.04,.27,.15,.25,dark);p('roundBox',0,1.05,.19,.22,.16,.09,dark);
      // Eyes have a white socket, dark pupil, brow and an actual protruding nose.
      for(const side of [-1,1]){p('sphere',side*.09,1.025,-.227,.053,.062,.027,'#ffefd1');p('sphere',side*.087,1.02,-.251,.026,.036,.017,'#292430');p('roundBox',side*.09,1.105,-.23,.065,.018,.025,dark,0,side*.13);}
      p('sphere',0,.955,-.255,.05,.062,.055,skin);p('roundBox',0,.88,-.221,.075,.018,.022,'#8f5440');
      p('roundBox',0,.77,-.03,.24,.055,.21,team);p('roundBox',-.19,.58,.24,.065,.22,.04,team,.12,.12);
      if(card.id==='sunshot'||card.id==='twinbow'){
        const bow=card.id==='twinbow';p('sphere',0,1.19,.045,.28,.12,.27,card.color);p('cylinder',0,1.16,-.04,.29,.035,.28,'#6a4930');
        for(const side of (bow?[-1,1]:[1])){const x=side*(bow?.48:.39);p('roundBox',x,.43,-.28-attack*.17,.07,.07,.28,'#684c33');p('cylinder',x,.44,-.35-attack*.17,.035,.31,.035,trim,0,Math.PI/2);p('roundBox',x,.43,-.52-attack*.17,.28,.035,.045,trim);p('cylinder',x,.45,-.60-attack*.17,.018,.16,.018,'#e9edf0',Math.PI/2);}
        if(!bow){p('roundBox',-.23,.53,.23,.12,.23,.10,'#734b35');for(const side of [-1,1]){p('cylinder',side*.12,1.21,-.19,.085,.035,.085,trim,Math.PI/2);p('sphere',side*.12,1.21,-.225,.061,.061,.016,'#3b6074');}}
      }else if(card.id==='lantern'){
        p('sphere',0,1.2,.02,.30,.16,.28,'#b68443');p('cylinder',0,1.22,.02,.30,.025,.29,trim);p('cylinder',.50,.50,-.05,.026,.37,.026,'#6a4a31');
        p('roundBox',.50,.86,-.06,.16,.23,.15,'#9d672f');p('roundBox',.50,.86,-.215,.12,.17,.02,'#ffdf6f');p('sphere',.50,.86,-.20,.07,.12,.055,'#fff4bf');
        for(const side of [-1,1])p('cylinder',.50+side*.13,.86,-.22,.014,.20,.014,trim);p('cone',.50,1.14,-.06,.20,.08,.18,trim);
      }else{
        p('sphere',0,1.20,.02,.29,.13,.28,'#e6d7b7');for(const side of [-1,1]){p('cylinder',side*.12,1.26,-.18,.09,.04,.09,trim,Math.PI/2);p('sphere',side*.12,1.26,-.22,.07,.07,.018,'#31495a');}
        p('roundBox',-.49,.40,-.12,.22,.29,.07,team);p('roundBox',-.49,.40,-.20,.17,.23,.025,trim);p('sphere',-.49,.40,-.24,.07,.07,.025,team);
        p('roundBox',.45,.38,-.35-attack*.20,.045,.055,.34,'#e1e8df',-attack*.55);p('cone',.45,.38,-.73-attack*.20,.05,.12,.05,'#e1e8df',Math.PI/2);p('cylinder',.45,.38,-.12,.025,.13,.025,trim,0,Math.PI/2);
      }
    }
    drawGolem(card,u,o,yaw,s,attack,a,flash){
      const p=this.crewPainter(o,yaw,s,a,flash),iron=card.id==='ironroot',stone=iron?'#655648':'#89947c',dark=iron?'#3f3631':'#54624d',moss='#6a973d',team=TEAM[u.side],stride=Math.sin(u.walk||0)*.16;
      for(const side of [-1,1]){p('roundBox',side*.23,-.12,-stride*side,.24,.18,.30,dark);p('roundBox',side*.23,.13,.01,.19,.22,.22,stone);}
      p('sphere',0,.55,0,.52,.55,.40,stone,-attack*.10);p('roundBox',0,.53,-.23,.45,.42,.23,card.color,-attack*.10);p('roundBox',0,.64,-.435,.16,.21,.03,dark);
      for(const side of [-1,1]){p('roundBox',side*.51,.68,0,.25,.24,.29,iron?'#b49760':moss,0,side*.16);p('cylinder',side*.59,.36,-attack*.22,.16,.27,.17,stone,-attack*.65,side*.12);p('roundBox',side*.59,.17,-.08-attack*.32,.24,.23,.25,dark);for(let k=0;k<3;k++)p('roundBox',side*.59+(k-1)*.11,.17,-.34-attack*.32,.043,.12,.05,iron?'#bc9e65':stone);}
      p('roundBox',0,1.04,-.01,.34,.29,.30,stone);p('roundBox',0,.94,-.30,.25,.15,.065,dark);
      for(const side of [-1,1]){p('roundBox',side*.14,1.08,-.325,.07,.055,.023,'#ffe49b');p('roundBox',side*.14,1.17,-.32,.13,.05,.05,stone,0,side*.12);}
      p('roundBox',0,.89,-.37,.09,.035,.03,stone);p('sphere',0,.56,-.46,.14,.16,.055,iron?'#efbd55':team);
      if(iron){for(const side of [-1,1]){p('roundBox',side*.37,.77,.17,.14,.37,.17,'#b49a67',0,-side*.25);p('horn',side*.35,1.19,.07,.25,.37,.25,'#bdab79',0,side*.4);}for(let k=0;k<4;k++)p('cylinder',-.30+k*.20,.35,-.45,.027,.03,.027,'#e3c88a',Math.PI/2);}
      else {for(const [x,y,z] of [[-.32,1.23,.04],[.28,1.27,.08],[-.46,.64,-.03],[.31,.47,-.36],[.17,.80,.31]]){p('sphere',x,y,z,.14,.09,.13,moss);p('sphere',x+.04,y+.08,z,.08,.045,.08,'#a4bd5d');}p('cylinder',.10,1.37,.05,.025,.11,.025,'#5f7431',0,-.30);p('wing',.10,1.46,.05,.16,.08,.16,'#92b64c');}
    }
    drawBeast(card,u,o,yaw,s,attack,a,flash){
      const p=this.crewPainter(o,yaw,s,a,flash),ox=card.id==='emberox',fox=card.id==='ripplefox',body=card.color,light=ox?'#e0b28b':'#f2ead0',dark=ox?'#503535':'#375260',stride=Math.sin(u.walk||0)*.28;
      p('sphere',0,.36,.08,.43,.37,.58,body,-attack*.13);p('sphere',0,.45,-.43-attack*.08,.34,.32,.31,body);p('sphere',0,.32,-.66-attack*.09,.26,.18,.19,light);
      for(const side of [-1,1])for(const front of [-1,1]){const step=stride*side*front;p('cylinder',side*.27,-.04+Math.abs(step)*.05,front*.31,.08,.20,.085,dark,step);p('sphere',side*.27,-.20,front*.31-.04,.11,.07,.15,dark);}
      for(const side of [-1,1]){p('sphere',side*.14,.51,-.65,.075,.075,.04,'#fff3d1');p('sphere',side*.14,.50,-.685,.038,.046,.023,'#242936');p('sphere',side*.08,.32,-.81,.033,.022,.02,'#463531');}
      p('sphere',0,.38,-.82,.065,.045,.035,fox?'#3d4660':'#624735');
      if(ox){p('roundBox',0,.48,.15,.39,.14,.47,'#5f3935');p('roundBox',0,.51,.17,.33,.07,.38,TEAM[u.side]);for(const side of [-1,1]){p('horn',side*.24,.63,-.40,.31,.47,.31,'#f6dda4',0,-side*.65);p('cylinder',side*.30,.33,-.42,.035,.23,.035,'#c39350',0,side*.22);p('roundBox',side*.32,.59,-.21,.13,.16,.19,'#b86d40');}for(let k=0;k<4;k++)p('sphere',0,.69,.02+k*.16,.13,.08,.11,'#eb9a51');}
      else {for(const side of [-1,1]){p('cone',side*.23,.79,-.40,.16,.28,.13,body,0,-side*.17);p('cone',side*.23,.78,-.47,.095,.18,.035,light,0,-side*.17);}if(fox){for(let k=0;k<4;k++)p('sphere',.12+k*.12,.31+k*.08,.50+k*.16,.23-k*.025,.18,.26,k===3?'#e9f0df':body);p('wing',.10,.55,.62,.30,.08,.35,'#b5f4e5',.2);}
        else {p('sphere',.13,.37,.67,.17,.16,.28,body,.4);for(const side of [-1,1]){p('cylinder',side*.25,.33,-.72,.012,.14,.012,light,0,Math.PI/2);p('roundBox',side*.28,.61,-.04,.10,.10,.12,'#917447');}p('roundBox',0,.24,-.18,.21,.055,.26,TEAM[u.side]);}}
    }
    drawFlying(card,u,o,yaw,s,attack,a,flash,time){
      const p=this.crewPainter(o,yaw,s,a,flash),bee=card.id==='ramblebee',ray=card.id==='cloudrays',finch=card.id==='boltfinch',body=card.color,cream='#f0e7c8',gold='#c9a456',dark='#2f3b4f',flap=Math.sin((u.walk||0)+(time||0)*10)*.38;
      p('sphere',0,.34,.05,bee?.38:.29,bee?.36:.34,.43,body,-attack*.10);p('sphere',0,.54,-.22,.24,.25,.24,cream);p('sphere',0,.62,-.10,.27,.17,.22,body);
      for(const side of [-1,1]){p(side<0?'wing-left':'wing',side*.16,.42,.02,ray?.65:.70,.12,.60,bee?'#e9efdc':body,0,side*flap);p('sphere',side*.095,.59,-.435,.083,.09,.035,dark);p('sphere',side*.095,.61,-.467,.052,.056,.02,finch?'#d8c2ff':'#9be5ed');p('sphere',side*.08,.63,-.484,.018,.019,.012,'#ffffff');}
      if(bee){for(const z of [-.07,.14,.34])p('cylinder',0,.34,z,.39,.075,.39,'#634731',Math.PI/2);for(const side of [-1,1]){p('cylinder',side*.14,.85,-.22,.02,.18,.02,gold,0,-side*.30);p('sphere',side*.20,1.0,-.22,.055,.055,.055,dark);p('sphere',side*.10,.61,-.46,.10,.11,.05,gold);}p('cone',0,.29,.55,.10,.23,.10,gold,Math.PI/2);}
      else if(finch){p('cone',0,.51,-.56,.095,.24,.08,gold,Math.PI/2);p('cone',0,.48,.51,.22,.33,.15,'#8f73ca',Math.PI/2);p('cone',0,.89,-.10,.11,.21,.11,'#c2a8ed',-.2);}
      else if(ray){p('sphere',0,.28,-.30,.31,.12,.18,cream);p('cone',0,.32,.59,.09,.41,.10,body,Math.PI/2);}
      else {p('cone',0,.45,-.52,.10,.13,.09,gold,Math.PI/2);p('roundBox',0,.52,.15,.17,.12,.20,'#8b7145');p('cylinder',0,.55,.18,.055,.11,.055,gold);for(const side of [-1,1])p('cone',side*.24,.82,-.13,.13,.15,.12,body,0,-side*.3);p('cone',0,.33,.50,.16,.25,.10,cream,Math.PI/2);}
    }
    drawProjectile(p,match){
      const x=(p.x-500)/115,z=(p.y-700)/100,color=p.color||'#fff0b0',target=match.units.find(u=>u.id===p.targetId)||match.towers.find(t=>t.id===p.targetId),dx=target?target.x-p.x:0,dz=target?target.y-p.y:(p.side==='player'?-1:1),length=Math.hypot(dx,dz)||1;
      for(let i=4;i>0;i--)this.drawMesh('sphere',x-dx/length*i*.10,.83,z-dz/length*i*.12,.035+i*.008,.035+i*.008,.035+i*.008,color,0,0,0,.48-i*.08);
      this.drawMesh('sphere',x,.83,z,p.splash?.13:.07,p.splash?.13:.07,p.splash?.13:.07,color);
      this.drawMesh('sphere',x,.85,z,.037,.037,.037,'#fff9dc');
    }
    drawEffect(e){
      const x=(e.x-500)/115,z=(e.y-700)/100,life=Math.max(0,e.life/e.maxLife),age=1-life,radius=(e.radius||40)/108,color=e.color||'#ffe2ac';
      this.drawMesh('ring',x,.115,z,radius*(.35+age*.9),1,radius*(.35+age*.9),color,0,0,0,life*.65);
      if(e.kind==='rubble'||e.kind==='defeat'){
        for(let i=0;i<10;i++){const a=i*2.17,d=age*radius*1.8,y=.15+Math.sin(age*Math.PI)*(.25+(i%3)*.14);this.drawMesh('roundBox',x+Math.cos(a)*d,y,z+Math.sin(a)*d,.065+.07*life,.06+.05*life,.065+.07*life,color,a+age*4,a*.3,a*.4,life);}
      }else{
        for(let i=0;i<10;i++){const a=i/10*TAU,d=radius*(.25+age*.9),y=.13+Math.sin(age*Math.PI)*(.24+(i%3)*.13),size=(.045+.055*life)*(i%2?.75:1);this.drawMesh('sphere',x+Math.cos(a)*d,y,z+Math.sin(a)*d,size,size,size,i%3?color:'#fff8d2',0,0,0,life*.85);}
        if(life>.58)this.drawMesh('sphere',x,.22,z,radius*.26*life,.20*life,radius*.26*life,'#fff1c3',0,0,0,(life-.58)*1.5);
      }
    }
    drawGhost(preview,match){const card=this.engine.cardMap[preview.id];if(card.kind!=='unit')return;this.drawUnit({id:'ghost',cardId:card.id,side:'player',x:preview.world.x,y:preview.world.y,hp:card.hp,maxHp:card.hp,heading:-Math.PI/2,walk:match.time*5,attackAnim:0,hit:0,deploy:0,flying:!!card.flying,slow:0},match,.62);}
    debug(){const rect=this.canvas.getBoundingClientRect(),top=this.worldToScreen(500,0),bottom=this.worldToScreen(500,1400),left=this.worldToScreen(0,700),right=this.worldToScreen(1000,700),silhouette=[];for(const dx of [-32,32])for(const dy of [-34,34])for(const h of [0,1.25])silhouette.push(this.worldToScreen(280+dx,1000+dy,h));const modelTop=Math.min(...silhouette.map(point=>point.y)),modelBottom=Math.max(...silhouette.map(point=>point.y));return Object.assign({lost:this.lost,width:this.canvas.width,height:this.canvas.height,webgl:!!this.gl,renderer:'project-authored-webgl-meshes',projection:this.camera&&this.camera.projection,arenaBounds:{top:top.y-rect.top,bottom:bottom.y-rect.top,left:left.x-rect.left,right:right.x-rect.left,usefulHeight:Math.abs(bottom.y-top.y),usefulHeightRatio:Math.abs(bottom.y-top.y)/Math.max(1,rect.height)},minimumInfantryPixels:modelBottom-modelTop},this.stats);}
  }
  root.TowerDuelRenderer3D=TowerRenderer3D;
})(typeof globalThis!=='undefined'?globalThis:this);
