(function(root,factory){
  const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GameHD=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const normalize=v=>{const d=Math.hypot(...v)||1;return v.map(x=>x/d);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  function multiply(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r;}
  function matrix(x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){
    const cy=Math.cos(ry),ay=Math.sin(ry),cx=Math.cos(rx),ax=Math.sin(rx),cz=Math.cos(rz),az=Math.sin(rz);
    // Ry * Rx * Rz; columns retain their lengths for inverse-scale normals.
    return new Float32Array([(cy*cz+ay*ax*az)*sx,cx*az*sx,(-ay*cz+cy*ax*az)*sx,0,
      (-cy*az+ay*ax*cz)*sy,cx*cz*sy,(ay*az+cy*ax*cz)*sy,0,ay*cx*sz,-ax*sz,cy*cx*sz,0,x,y,z,1]);
  }
  function ortho(l,r,b,t,n,f){const m=identity();m[0]=2/(r-l);m[5]=2/(t-b);m[10]=-2/(f-n);m[12]=-(r+l)/(r-l);m[13]=-(t+b)/(t-b);m[14]=-(f+n)/(f-n);return m;}
  function lookAt(eye,target,up=[0,1,0]){const z=normalize(eye.map((v,i)=>v-target[i])),x=normalize(cross(up,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);}
  function rgba(value,alpha=1){if(Array.isArray(value)||ArrayBuffer.isView(value))return [value[0],value[1],value[2],value[3]??alpha];let h=value.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).concat(alpha);}
  function mesh(){return {p:[],n:[],i:[]};}
  function vertex(m,p,n){const i=m.p.length/3;m.p.push(...p);m.n.push(...n);return i;}
  function triangle(m,a,b,c){m.i.push(a,b,c);}
  function box(bevel=.065){
    const m=mesh(),faces=[[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]],[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]]],g=bevel?[-.5,-.5+bevel,.5-bevel,.5]:[-.5,.5];
    for(const [n,u,v]of faces){const base=m.p.length/3;for(const y of g)for(const x of g){const p=n.map((q,i)=>q*.5+u[i]*x+v[i]*y),inner=p.map(q=>clamp(q,-.5+bevel,.5-bevel)),normal=bevel?normalize(p.map((q,i)=>q-inner[i])):n;vertex(m,bevel?inner.map((q,i)=>q+normal[i]*bevel):p,normal);}for(let y=0;y<g.length-1;y++)for(let x=0;x<g.length-1;x++){const a=base+y*g.length+x,b=a+1,c=a+g.length,d=c+1;m.i.push(a,b,d,a,d,c);}}
    return m;
  }
  function cylinder(s=24,top=.5,bottom=.5){
    const m=mesh();for(let k=0;k<s;k++){const a=k/s*TAU,b=(k+1)/s*TAU,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),slope=bottom-top,n0=normalize([ca,slope,sa]),n1=normalize([cb,slope,sb]);
      const j=m.p.length/3;vertex(m,[ca*bottom,-.5,sa*bottom],n0);vertex(m,[ca*top,.5,sa*top],n0);vertex(m,[cb*top,.5,sb*top],n1);vertex(m,[cb*bottom,-.5,sb*bottom],n1);m.i.push(j,j+1,j+2,j,j+2,j+3);
      const t=vertex(m,[0,.5,0],[0,1,0]),t1=vertex(m,[cb*top,.5,sb*top],[0,1,0]),t0=vertex(m,[ca*top,.5,sa*top],[0,1,0]);triangle(m,t,t1,t0);
      const q=vertex(m,[0,-.5,0],[0,-1,0]),q0=vertex(m,[ca*bottom,-.5,sa*bottom],[0,-1,0]),q1=vertex(m,[cb*bottom,-.5,sb*bottom],[0,-1,0]);triangle(m,q,q0,q1);
    }return m;
  }
  function sphere(s=24,r=12){const m=mesh();for(let y=0;y<=r;y++)for(let x=0;x<=s;x++){const ph=y/r*Math.PI,th=x/s*TAU,n=[Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)];vertex(m,n.map(v=>v*.5),n);}for(let y=0;y<r;y++)for(let x=0;x<s;x++){const a=y*(s+1)+x,b=a+s+1;if(y>0)triangle(m,a,a+1,b+1);if(y<r-1)triangle(m,a,b+1,b);}return m;}
  function torus(s=32,t=8){const m=mesh();for(let k=0;k<=s;k++)for(let j=0;j<=t;j++){const a=k/s*TAU,b=j/t*TAU,r=.42+.08*Math.cos(b);vertex(m,[Math.cos(a)*r,Math.sin(a)*r,Math.sin(b)*.08],[Math.cos(a)*Math.cos(b),Math.sin(a)*Math.cos(b),Math.sin(b)]);}for(let k=0;k<s;k++)for(let j=0;j<t;j++){const a=k*(t+1)+j,b=a+t+1;m.i.push(a,b,b+1,a,b+1,a+1);}return m;}
  function ring(s=40){const m=mesh();for(let k=0;k<=s;k++){const a=k/s*TAU;vertex(m,[Math.cos(a)*.34,Math.sin(a)*.34,0],[0,0,1]);vertex(m,[Math.cos(a)*.5,Math.sin(a)*.5,0],[0,0,1]);}for(let k=0;k<s;k++){const a=k*2;m.i.push(a,a+1,a+3,a,a+3,a+2);}return m;}
  function disc(s=40){const m=mesh();for(let k=0;k<s;k++){const a=k/s*TAU,b=(k+1)/s*TAU,j=m.p.length/3;vertex(m,[0,0,0],[0,1,0]);vertex(m,[Math.cos(b)*.5,0,Math.sin(b)*.5],[0,1,0]);vertex(m,[Math.cos(a)*.5,0,Math.sin(a)*.5],[0,1,0]);triangle(m,j,j+1,j+2);}return m;}
  function wedge(){const m=mesh(),points=[[-.5,-.5,-.5],[.5,-.5,-.5],[0,.5,-.5],[-.5,-.5,.5],[0,.5,.5],[.5,-.5,.5]];for(const [a,b,c]of [[0,2,1],[3,5,4],[0,3,4],[0,4,2],[1,2,4],[1,4,5],[0,1,5],[0,5,3]]){const n=normalize(cross(points[b].map((v,i)=>v-points[a][i]),points[c].map((v,i)=>v-points[a][i]))),j=m.p.length/3;for(const q of [a,b,c])vertex(m,points[q],n);triangle(m,j,j+1,j+2);}return m;}
  function gear(teeth=12){const m=mesh(),s=teeth*4;for(let k=0;k<s;k++){const a=k/s*TAU,b=(k+1)/s*TAU,ra=k%4<2?.5:.43,rb=(k+1)%4<2?.5:.43,pa=[Math.cos(a)*ra,Math.sin(a)*ra],pb=[Math.cos(b)*rb,Math.sin(b)*rb],normal=normalize([pb[1]-pa[1],0,pa[0]-pb[0]]),j=m.p.length/3;vertex(m,[...pa.slice(0,1),-.10,pa[1]],normal);vertex(m,[pa[0],.10,pa[1]],normal);vertex(m,[pb[0],.10,pb[1]],normal);vertex(m,[pb[0],-.10,pb[1]],normal);m.i.push(j,j+1,j+2,j,j+2,j+3);for(const sign of [-1,1]){const q=m.p.length/3;vertex(m,[0,sign*.10,0],[0,sign,0]);vertex(m,[pa[0],sign*.10,pa[1]],[0,sign,0]);vertex(m,[pb[0],sign*.10,pb[1]],[0,sign,0]);if(sign>0)triangle(m,q,q+2,q+1);else triangle(m,q,q+1,q+2);}}return m;}
  function quad(){return {p:[-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0],n:[0,0,1,0,0,1,0,0,1,0,0,1],i:[0,1,2,0,2,3]};}
  function meshes(scale=1){const all={box:box(),cube:box(0),sphere:sphere(),cylinder:cylinder(),cone:cylinder(24,.16,.5),torus:torus(),ring:ring(),disc:disc(),wedge:wedge(),gear:gear(),quad:quad()};if(scale!==1)for(const m of Object.values(all))m.p=m.p.map(v=>v*scale);return all;}
  const VERT=[
    'attribute vec3 aPosition,aNormal;attribute vec4 aM0,aM1,aM2,aM3,aTint,aMaterial;',
    'uniform mat4 uVP,uModel;uniform vec4 uColor,uMaterial;uniform float uInstanced;',
    'varying vec3 vWorld,vNormal,vLocal;varying vec4 vColor,vMaterial;',
    'void main(){mat4 M=uModel;vColor=uColor;vMaterial=uMaterial;if(uInstanced>.5){M=mat4(aM0,aM1,aM2,aM3);vColor=aTint;vMaterial=aMaterial;}',
    'vec4 w=M*vec4(aPosition,1.0);vWorld=w.xyz;vLocal=aPosition;',
    'vec3 s=max(vec3(dot(M[0].xyz,M[0].xyz),dot(M[1].xyz,M[1].xyz),dot(M[2].xyz,M[2].xyz)),vec3(.000001));',
    'vNormal=normalize(mat3(M)*(aNormal/s));gl_Position=uVP*w;}'
  ].join('\n');
  const FRAG=[
    'precision highp float;uniform vec3 uEye,uFog,uLight;uniform mat4 uLightVP;uniform sampler2D uShadow;',
    'uniform float uDepth,uShadowReady,uShadowTexel,uTime;varying vec3 vWorld,vNormal,vLocal;varying vec4 vColor,vMaterial;',
    'vec4 pack(float d){vec4 c=fract(d*vec4(16777216.,65536.,256.,1.));return c-c.xxyz*vec4(0.,.00390625,.00390625,.00390625);}',
    'float unpack(vec4 c){return dot(c,vec4(.000000059604645,.000015258789,.00390625,1.));}',
    'float hash(vec3 p){return fract(sin(dot(floor(p),vec3(127.1,311.7,74.7)))*43758.5453);}',
    'float shadow(vec3 N){if(uShadowReady<.5)return 0.;vec4 c=uLightVP*vec4(vWorld,1.);vec3 q=c.xyz/c.w*.5+.5;if(q.x<.002||q.x>.998||q.y<.002||q.y>.998)return 0.;float s=0.;float bias=max(.00065,.0017*(1.-dot(N,uLight)));for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){s+=step(unpack(texture2D(uShadow,q.xy+vec2(float(x),float(y))*uShadowTexel))+bias,q.z);}return s/9.;}',
    'void main(){if(uDepth>.5){gl_FragColor=pack(gl_FragCoord.z);return;}vec3 N=normalize(vNormal),V=normalize(uEye-vWorld),L=normalize(uLight),H=normalize(L+V);',
    'float rough=clamp(vMaterial.x,.12,1.),metal=vMaterial.y,emission=vMaterial.z,kind=vMaterial.w,occ=shadow(N);vec3 base=pow(max(vColor.rgb,vec3(0.)),vec3(2.2));',
    'float grain=(hash(vWorld*65.)-.5)*.035;float brushed=sin(vWorld.y*125.+vWorld.x*12.)*.012;',
    'float surface=1.+grain+brushed*metal;if(kind>1.5&&kind<2.5){vec2 g=abs(fract(vWorld.xz*.5)-.5);float seams=step(.487,max(g.x,g.y));surface*=1.-seams*.16;}',
    'if(kind>3.5&&kind<4.5)surface*=.86+hash(vWorld*8.)*.12;',
    'vec3 ambient=mix(vec3(.28,.35,.46),vec3(.60,.71,.80),clamp(N.y*.5+.5,0.,1.));',
    'vec3 lit=base*surface*(ambient*.78+vec3(1.,.88,.69)*max(dot(N,L),0.)*1.16*(1.-occ*.72));',
    'float spec=pow(max(dot(N,H),0.),mix(100.,9.,rough))*mix(.18,.85,metal)*(1.-occ*.78);vec3 specColor=mix(vec3(1.,.96,.87),sqrt(base),metal*.7);lit+=specColor*spec;',
    'float fres=pow(1.-max(dot(N,V),0.),3.);lit+=base*fres*.19+base*emission*2.5;',
    'float fog=smoothstep(35.,85.,distance(uEye,vWorld));lit=mix(lit,pow(uFog,vec3(2.2)),fog*.55);',
    'lit=(lit*(2.51*lit+.03))/(lit*(2.43*lit+.59)+.14);lit=pow(clamp(lit,0.,1.),vec3(.454545));gl_FragColor=vec4(lit,vColor.a);}'
  ].join('\n');
  const QUAD_VERT='attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}';
  const POST_FRAG=[
    'precision mediump float;uniform sampler2D uScene,uBloom;uniform vec2 uStep,uPixel;uniform float uMode,uExtract,uStrength;varying vec2 vUv;',
    'vec3 tap(vec2 uv){vec3 c=texture2D(uScene,uv).rgb;return mix(c,max(c-vec3(.72),vec3(0.)),uExtract);}',
    'float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}',
    'void main(){if(uMode<.5){vec3 c=tap(vUv)*.227027;c+=(tap(vUv+uStep*1.384615)+tap(vUv-uStep*1.384615))*.316216;c+=(tap(vUv+uStep*3.230769)+tap(vUv-uStep*3.230769))*.070270;gl_FragColor=vec4(c,1.);return;}',
    'vec3 c=texture2D(uScene,vUv).rgb,n=texture2D(uScene,vUv+vec2(0.,uPixel.y)).rgb,s=texture2D(uScene,vUv-vec2(0.,uPixel.y)).rgb,e=texture2D(uScene,vUv+vec2(uPixel.x,0.)).rgb,w=texture2D(uScene,vUv-vec2(uPixel.x,0.)).rgb;',
    'float l=lum(c),hi=max(l,max(max(lum(n),lum(s)),max(lum(e),lum(w)))),lo=min(l,min(min(lum(n),lum(s)),min(lum(e),lum(w))));',
    'float edge=smoothstep(.07,.22,hi-lo);vec3 aa=abs(lum(n)-lum(s))>abs(lum(e)-lum(w))?(e+w)*.5:(n+s)*.5;c=mix(c,aa,edge*.32);',
    'c+=texture2D(uBloom,vUv).rgb*uStrength;float d=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);gl_FragColor=vec4(clamp(c+(d-.5)/255.,0.,1.),1.);}'
  ].join('\n');
  function program(gl,vs,fs){const p=gl.createProgram();for(const [type,source]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('HD shader: '+gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('HD program: '+gl.getProgramInfoLog(p));return p;}
  function target(gl,w,h,depth){const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);let renderbuffer=null;if(depth){renderbuffer=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,renderbuffer);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,renderbuffer);}const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(!ok){gl.deleteTexture(texture);gl.deleteFramebuffer(framebuffer);if(renderbuffer)gl.deleteRenderbuffer(renderbuffer);return null;}return {texture,framebuffer,renderbuffer,w,h};}
  class Scene{
    constructor(canvas,options={}){
      this.canvas=canvas;this.options=options;this.gl=canvas.getContext('webgl',{alpha:false,antialias:true,premultipliedAlpha:false,powerPreference:'high-performance'});
      if(!this.gl)throw Error('HD rendering requires WebGL');const gl=this.gl;this.maxTextureSize=gl.getParameter(gl.MAX_TEXTURE_SIZE);this.ext=gl.getExtension('ANGLE_instanced_arrays');this.program=program(gl,VERT,FRAG);this.post=program(gl,QUAD_VERT,POST_FRAG);
      this.attributes=['aPosition','aNormal','aM0','aM1','aM2','aM3','aTint','aMaterial'].map(n=>gl.getAttribLocation(this.program,n));this.uniforms={};for(const n of ['uVP','uModel','uColor','uMaterial','uInstanced','uEye','uFog','uLight','uLightVP','uShadow','uDepth','uShadowReady','uShadowTexel','uTime'])this.uniforms[n]=gl.getUniformLocation(this.program,n);
      this.postPosition=gl.getAttribLocation(this.post,'aPosition');this.postUniforms={};for(const n of ['uScene','uBloom','uStep','uPixel','uMode','uExtract','uStrength'])this.postUniforms[n]=gl.getUniformLocation(this.post,n);
      this.quadBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.quadBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      this.instanceBuffer=gl.createBuffer();this.instanceData=new Float32Array(24*2048);this.meshes={};
      for(const [name,data]of Object.entries(meshes(options.meshScale||1))){const interleaved=[];for(let i=0;i<data.p.length;i+=3)interleaved.push(...data.p.slice(i,i+3),...data.n.slice(i,i+3));const b=gl.createBuffer(),ix=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(interleaved),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ix);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(data.i),gl.STATIC_DRAW);this.meshes[name]={buffer:b,index:ix,count:data.i.length};}
      const size=Math.min(options.shadowSize||1024,gl.getParameter(gl.MAX_TEXTURE_SIZE));this.shadow=target(gl,size,size,true);if(this.shadow){gl.bindTexture(gl.TEXTURE_2D,this.shadow.texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);}this.targets=null;this.commands=[];this.stats={drawCalls:0,triangles:0,instances:0,instanced:!!this.ext,softShadows:!!this.shadow,bloom:true,materials:true};
    }
    resize(width,height,dpr,budget=6000000){const max=this.maxTextureSize,ratio=Math.min(dpr||1,Math.sqrt(budget/Math.max(1,width*height)),max/Math.max(width,height));const w=Math.max(1,Math.round(width*ratio)),h=Math.max(1,Math.round(height*ratio));if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}if(!this.targets||this.targets.main.w!==w||this.targets.main.h!==h){this.disposeTargets();const main=target(this.gl,w,h,true),a=target(this.gl,Math.max(1,w>>2),Math.max(1,h>>2),false),b=target(this.gl,Math.max(1,w>>2),Math.max(1,h>>2),false);this.targets=main&&a&&b?{main,a,b}:null;if(!this.targets)for(const t of [main,a,b])if(t)this.disposeTarget(t);}this.stats.dpr=ratio;this.stats.width=w;this.stats.height=h;this.stats.bloom=!!this.targets;return ratio;}
    disposeTarget(t){const gl=this.gl;gl.deleteTexture(t.texture);gl.deleteFramebuffer(t.framebuffer);if(t.renderbuffer)gl.deleteRenderbuffer(t.renderbuffer);}
    disposeTargets(){if(this.targets)for(const t of Object.values(this.targets))this.disposeTarget(t);this.targets=null;}
    begin(vp,eye,time,options={}){this.commands.length=0;this.vp=vp;this.eye=eye;this.time=time;this.frameOptions=options;this.stats.drawCalls=this.stats.triangles=this.stats.instances=0;}
    draw(name,m,color,params=[.58,.15,0,0],cast=true){this.commands.push({name,m,color:rgba(color),params,cast});}
    meshGroup(items){
      const gl=this.gl,A=this.attributes,U=this.uniforms,mesh=this.meshes[items[0].name];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);for(let i=0;i<2;i++){gl.enableVertexAttribArray(A[i]);gl.vertexAttribPointer(A[i],3,gl.FLOAT,false,24,i*12);}gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.index);
      if(this.ext){gl.uniform1f(U.uInstanced,1);const need=items.length*24;if(this.instanceData.length<need)this.instanceData=new Float32Array(2**Math.ceil(Math.log2(need)));for(let i=0;i<items.length;i++){const c=items[i],at=i*24;this.instanceData.set(c.m,at);this.instanceData.set(c.color,at+16);this.instanceData.set(c.params,at+20);}gl.bindBuffer(gl.ARRAY_BUFFER,this.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.instanceData.subarray(0,need),gl.DYNAMIC_DRAW);for(let i=0;i<6;i++){const loc=A[i+2];gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,4,gl.FLOAT,false,96,i*16);this.ext.vertexAttribDivisorANGLE(loc,1);}this.ext.drawElementsInstancedANGLE(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0,items.length);this.stats.drawCalls++;}
      else{gl.uniform1f(U.uInstanced,0);for(let i=2;i<A.length;i++)gl.disableVertexAttribArray(A[i]);for(const c of items){gl.uniformMatrix4fv(U.uModel,false,c.m);gl.uniform4fv(U.uColor,c.color);gl.uniform4fv(U.uMaterial,c.params);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);this.stats.drawCalls++;}}
      this.stats.triangles+=mesh.count/3*items.length;
    }
    groups(items,ordered=false){if(!items.length)return;if(ordered){let run=[];for(const c of items){if(run.length&&run[0].name!==c.name){this.meshGroup(run);run=[];}run.push(c);}if(run.length)this.meshGroup(run);}else{const groups=new Map();for(const c of items){if(!groups.has(c.name))groups.set(c.name,[]);groups.get(c.name).push(c);}for(const g of groups.values())this.meshGroup(g);}}
    resetAttributes(){const gl=this.gl;for(let i=0;i<8;i++){gl.disableVertexAttribArray(i);if(this.ext)this.ext.vertexAttribDivisorANGLE(i,0);}}
    postPass(source,dest,mode,step,extract,bloom){const gl=this.gl,U=this.postUniforms;gl.bindFramebuffer(gl.FRAMEBUFFER,dest?dest.framebuffer:null);gl.viewport(0,0,dest?dest.w:this.canvas.width,dest?dest.h:this.canvas.height);gl.useProgram(this.post);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source.texture);gl.uniform1i(U.uScene,0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,bloom?bloom.texture:source.texture);gl.uniform1i(U.uBloom,1);gl.uniform2f(U.uStep,step[0],step[1]);gl.uniform2f(U.uPixel,1/this.canvas.width,1/this.canvas.height);gl.uniform1f(U.uMode,mode);gl.uniform1f(U.uExtract,extract);gl.uniform1f(U.uStrength,this.options.bloomStrength??.25);gl.bindBuffer(gl.ARRAY_BUFFER,this.quadBuffer);gl.enableVertexAttribArray(this.postPosition);gl.vertexAttribPointer(this.postPosition,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);this.stats.drawCalls++;}
    flush(){
      const gl=this.gl,U=this.uniforms,opaque=this.commands.filter(c=>c.color[3]>=.995),transparent=this.commands.filter(c=>c.color[3]<.995),options=this.frameOptions;this.stats.instances=this.commands.length;
      const light=normalize(options.light||[-.48,.86,.35]);const lightVP=options.lightVP||identity();gl.useProgram(this.program);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.depthMask(true);gl.disable(gl.BLEND);gl.uniform3fv(U.uEye,this.eye);gl.uniform3fv(U.uFog,options.fog||[.1,.16,.23]);gl.uniform3fv(U.uLight,light);gl.uniformMatrix4fv(U.uLightVP,false,lightVP);gl.uniform1f(U.uTime,this.time||0);gl.uniform1f(U.uShadowTexel,this.shadow?1/this.shadow.w:0);
      if(this.shadow){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadow.framebuffer);gl.viewport(0,0,this.shadow.w,this.shadow.h);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(U.uDepth,1);gl.uniform1f(U.uShadowReady,0);gl.uniformMatrix4fv(U.uVP,false,lightVP);this.groups(opaque.filter(c=>c.cast));}
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets?this.targets.main.framebuffer:null);gl.viewport(0,0,this.canvas.width,this.canvas.height);const clear=options.clear||[.1,.16,.23];gl.clearColor(...clear,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(U.uDepth,0);gl.uniform1f(U.uShadowReady,this.shadow?1:0);gl.uniformMatrix4fv(U.uVP,false,this.vp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadow?this.shadow.texture:null);gl.uniform1i(U.uShadow,0);this.groups(opaque);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);const depth=c=>{const x=c.m[12],y=c.m[13],z=c.m[14],v=this.vp;return(v[2]*x+v[6]*y+v[10]*z+v[14])/(v[3]*x+v[7]*y+v[11]*z+v[15]);};transparent.sort((a,b)=>depth(b)-depth(a));this.groups(transparent,true);gl.depthMask(true);this.resetAttributes();
      if(this.targets){gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);this.postPass(this.targets.main,this.targets.a,0,[1/this.canvas.width,0],1);this.postPass(this.targets.a,this.targets.b,0,[0,1/this.targets.a.h],0);this.postPass(this.targets.main,null,1,[0,0],0,this.targets.b);this.resetAttributes();}
      gl.activeTexture(gl.TEXTURE0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    debug(){return {...this.stats};}
    destroy(){this.disposeTargets();const gl=this.gl;if(this.shadow)this.disposeTarget(this.shadow);for(const m of Object.values(this.meshes)){gl.deleteBuffer(m.buffer);gl.deleteBuffer(m.index);}gl.deleteBuffer(this.quadBuffer);gl.deleteBuffer(this.instanceBuffer);gl.deleteProgram(this.program);gl.deleteProgram(this.post);}
  }
  return {Scene,meshes,box,cylinder,sphere,torus,ring,disc,wedge,gear,quad,matrix,multiply,identity,ortho,lookAt,rgba,normalize};
});
