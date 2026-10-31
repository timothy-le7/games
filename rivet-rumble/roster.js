(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RivetRumbleRoster=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const classes=['Damage Dealer','Tank','Marksman','Artillery','Controller','Assassin','Support'];
  const legacyClasses={spark:classes[0],anvil:classes[1],mortar:classes[3],vector:classes[5],lumen:classes[6],rail:classes[2],knuckle:classes[1],echo:classes[0],shroud:classes[5],briar:classes[3],tempo:classes[6],gyro:classes[4]};
  const specials={pierce:'Needle pulse',line:'Horizon lance',dash:'Slipstream run',slam:'Foundry quake',blast:'Crater call',field:'Haven circle',leap:'Comet landing',ricochet:'Prism volley',smoke:'Violet veil',thorns:'Bramble bed',heal:'Encore repair',orbit:'Wheelburst',turret:'Clockwork sentinel',vortex:'Gravity garden',rescue:'Rally lantern'};
  // Each family has a real attack mechanic. Six combinations have distinct main
  // attack modifiers, specials and gadgets, rather than stat-only costume swaps.
  const families=[
    ['burst','Burstline',0,'vector','#e9a54d',{hp:122,speed:6.1,damage:7,range:10.2,ammo:3,reload:1.18,cooldown:.65,projectile:21,burst:4},'a timed stream of four bolts',['Ticker','Rattlebyte','Flareline','Rivet Reed','Pip Parade','Brassburst']],
    ['scatter','Scatterworks',1,'anvil','#d5805d',{hp:164,speed:5.4,damage:8,range:6.2,ammo:3,reload:1.25,cooldown:.7,projectile:16,pellets:5,spread:.15},'five close-range pellets',['Barrelmaw','Corkjaw','Popper Pearl','Flintflock','Buckweld','Chiselchum']],
    ['scope','Longsight',2,'rail','#7aa8ce',{hp:108,speed:5.2,damage:25,range:13.6,ammo:2,reload:1.4,cooldown:.85,projectile:25,farshot:.6},'shots that gain damage with distance',['Windsight','Rangeway','Needle Nox','Faraday Flo','Distant Dot','Pinnacle']],
    ['rocket','Rocketry',0,'mortar','#d16a52',{hp:128,speed:5.3,damage:23,range:10.8,ammo:3,reload:1.35,cooldown:.8,projectile:15,explosive:1.8},'straight rockets that explode against cover or a target',['Emberjet','Cratercat','Nova Nut','Blazepod','Cinderstep','Fuse Fable']],
    ['frost','Cryonics',4,'lumen','#62bfc9',{hp:128,speed:5.4,damage:11,range:9,ammo:3,reload:1.2,cooldown:.62,projectile:17,burst:2,chill:1.1},'paired frost bolts that slow rivals',['Glaciette','Frozebit','Hailheart','Rime Rook','Sleetspoke','Frostwick']],
    ['venom','Vermillion',5,'shroud','#97b45e',{hp:112,speed:6.6,damage:10,range:8,ammo:3,reload:1.15,cooldown:.62,projectile:19,venom:2.4,venomDamage:4},'darts that poison over time',['Viper Valve','Mossmote','Nettle Nib','Scumblossom','Venumbra','Fume Finch']],
    ['chain','Conductor',4,'echo','#c2a45d',{hp:126,speed:5.5,damage:16,range:9.6,ammo:3,reload:1.22,cooldown:.65,projectile:19,chain:2},'electric bolts that chain to nearby visible rivals',['Arclark','Volta Vine','Zapperton','Coilcrest','Static Satchel','Ohm Otter']],
    ['hook','Hooksmiths',1,'knuckle','#849ea2',{hp:174,speed:5.4,damage:22,range:7.6,ammo:3,reload:1.3,cooldown:.78,projectile:18,pull:1.6},'hook bolts that pull a rival toward you',['Anchor Ada','Dockclaw','Winch Wren','Towbolt','Cable Cal','Latchling']],
    ['drain','Leechers',5,'gyro','#ce829e',{hp:114,speed:6.2,damage:22,range:8.3,ammo:3,reload:1.25,cooldown:.64,projectile:19,drain:.4},'siphon shots that repair their owner on a real hit',['Siphon Sol','Redline Ray','Nightpump','Heartgear','Ruby Rotor','Latch Lee']],
    ['shell','Siegefolk',3,'mortar','#b9aa84',{hp:132,speed:5,damage:24,range:10.4,ammo:3,reload:1.4,cooldown:.78,projectile:11,splash:2.1},'arcing shells that burst over cover',['Pebble Pat','Boulderbee','Chalkchuck','Pumice Pip','Gravel Gull','Splintershot']],
    ['medic','Radiant',6,'tempo','#d8bc65',{hp:138,speed:5.4,damage:14,range:9,ammo:3,reload:1.16,cooldown:.64,projectile:16,attackKind:'heal',pierce:1},'waves that mend allies and hurt rivals',['Medley Mae','Bellbud','Oboe Orbit','Harmony Hub','Patchpuff','Apricot Aid']],
    ['sentry','Sentinels',4,'briar','#75ad89',{hp:132,speed:5.2,damage:16,range:9.5,ammo:3,reload:1.2,cooldown:.5,projectile:19},'precise bolts with a deployable sentinel special',['Spanner Spar','Nest Nut','Turret Toad','Kernel Kit','Loom Lark','Forge Fenn']],
    ['striker','Strikers',1,'knuckle','#cc8c62',{hp:184,speed:5.8,damage:30,range:3.3,ammo:3,reload:1.05,cooldown:.6,projectile:18,attackKind:'melee',push:.45},'wide punches that move rivals back from a contested lane',['Knucklebark','Grudge Gear','Poundcake','Rumble Root','Iron Ivy','Clobber Clay']],
    ['orbit','Orbiters',0,'gyro','#ae8bbe',{hp:126,speed:6,damage:18,range:8.7,ammo:3,reload:1.2,cooldown:.64,projectile:17,attackKind:'return'},'discs that can hit once in each direction',['Spindrift','Halo Hazel','Discus Dee','Gyre Gull','Roundtrip','Radius Roo']],
    ['wraith','Wraithline',5,'shroud','#9c8abb',{hp:110,speed:7,damage:10,range:6.8,ammo:3,reload:1.17,cooldown:.58,projectile:21,pellets:3,spread:.17},'a fast close-range blade fan',['Velvet Vane','Quiet Quill','Silken Sid','Mist Mica','Night Needle','Echo Ember']],
    ['hedge','Hedgeguard',3,'briar','#83ad55',{hp:130,speed:5.1,damage:19,range:10.2,ammo:3,reload:1.4,cooldown:.78,projectile:11,splash:1.5,attackKind:'garden'},'seed bombs that leave a damaging bramble patch',['Petal Pip','Briquette Bloom','Acorn Axel','Clovercoil','Cactus Crank','Thistle Tock']],
    ['prism','Prismworks',2,'echo','#7aabc9',{hp:112,speed:5.7,damage:17,range:12.5,ammo:3,reload:1.25,cooldown:.62,projectile:22,bounce:2},'bank shots that rebound off solid cover',['Reflecta','Skipper Skye','Prism Poppy','Carom Cass','Angle Ada','Mirror Mote']],
    ['beam','Horizon',4,'lumen','#91b9aa',{hp:126,speed:5.3,damage:16,range:10.5,ammo:3,reload:1.25,cooldown:.65,projectile:19,pierce:2,shotRadius:.34},'wide pulses that pass through multiple opponents',['Lucent Lark','Aurora Axle','Beam Borough','Glimmergear','Lensling','Shimmer Shaw']]
  ];
  const variants=['Signature','Rebound','Volley','Chill','Venom','Siphon'];
  const kits=['spark','anvil','mortar','vector','lumen','rail','knuckle','echo','shroud','briar','tempo','gyro'];
  const specialCycle=['pierce','leap','turret','smoke','vortex','rescue','ricochet','heal','orbit','blast','thorns','dash','slam','field','line'];
  function tint(hex,index){const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)),ratio=[0,.08,-.08,.12,-.05,.04][index];return '#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v+(ratio>0?(255-v):v)*ratio))).toString(16).padStart(2,'0')).join('');}
  function extend(fighters,gadgets){
    fighters.forEach(f=>{f.class=legacyClasses[f.id];f.model=f.id;f.family='Founders';});
    families.forEach(([id,family,classIndex,model,color,base,description,names],familyIndex)=>{
      names.forEach((name,variant)=>{
        const f={...base,id:id+'-'+variant,name,class:classes[classIndex],role:family+' · '+variants[variant],family,model,variant,color:tint(color,variant),trim:['#fff1d3','#d9f5ff','#ffe4ba','#d1f8ff','#e2f4bd','#ffe0ef'][variant]};
        let modifier='';
        if(variant===1){if(f.splash){f.splash+=.35;modifier='Wider blast.';}else if(f.attackKind==='melee'){f.pull=.5;modifier='Punches also tug rivals.';}else{f.bounce=(f.bounce||0)+1;modifier='Shots bank off an extra wall.';}}
        if(variant===2){if(f.attackKind==='melee'){f.meleeArc=.05;f.push=.9;modifier='A wider sweep with a stronger push.';}else{f.burst=Math.min(5,(f.burst||1)+1);f.damage*=.72;f.cooldown=Math.max(f.cooldown,(f.burst-1)*.1+.26);modifier='An extra timed shot per ammo slot.';}}
        if(variant===3){f.chill=Math.max(1.3,f.chill||0);f.damage*=.88;modifier='Hits apply a short slow.';}
        if(variant===4){f.venom=2.4;f.venomDamage=3.8;f.damage*=.84;modifier='Hits apply lingering poison.';}
        if(variant===5){f.drain=Math.max(.25,f.drain||0);f.damage*=.92;modifier='Real hits repair the attacker.';}
        f.damage=Math.round(f.damage*10)/10;
        f.specialKind=id==='sentry'&&variant===0?'turret':specialCycle[(familyIndex+variant*2)%specialCycle.length];f.special=specials[f.specialKind];
        f.gadgetKind=kits[(familyIndex*2+variant)%kits.length];
        f.blurb=family+': '+description+'. '+modifier+' Special: '+f.special+'.';
        fighters.push(f);gadgets[f.id]={...gadgets[f.gadgetKind]};
      });
    });
    return fighters;
  }
  return {classes,families:families.map(f=>f[1]),extend};
});
