// Button positions on the browser's standard gamepad layout. Touchpad click
// is the DualSense's first extra button. Some drivers expose only Create.
export function dualSense(pad) {
  return /dualsense|playstation\s*5|\bps5\b|054c.*(?:0ce6|0df2)/i.test(pad?.id || '');
}

export class PS5Controls {
  reset() {
    this.square=this.grabHold=this.navigation=this.loadout=this.contextHold=this.lightsTap=this.vehicleMenu=null;
    this.ducking=false;this.blockCross=false;
    this.pace=0;
  }

  sample(input,pad,mode,dt,vertical,turn,throttle,reverse) {
    const down=i=>Boolean(pad.buttons[i]?.pressed || (pad.buttons[i]?.value || 0)>.25);
    const walking=mode==='walk',swimming=mode==='swim',cycling=mode==='bike';
    const vehicle=['drive','street','boat','rail','cable','passenger'].includes(mode);
    const flight=mode==='rotor' || mode==='plane';
    const armed=input.weaponControls(), mapButton=pad.buttons.length>17?17:8;
    this.mapButton=mapButton;
    const wheel=input.padWheel || input.keyWheel;
    const send=name=>input.action(name,{fromPad:true,ps5:true});
    if(!walking || armed || wheel){this.square=this.grabHold=null;}
    if(!walking || wheel)this.loadout=null;
    if(!vehicle && !cycling)this.contextHold=null;
    if(mode!=='drive'){this.lightsTap=this.vehicleMenu=null;this.ducking=false;}
    if(mode==='menu'){this.navigation=null;if(down(0))this.blockCross=true;}
    if(!down(0))this.blockCross=false;
    if(!(walking || swimming) || Math.hypot(vertical,turn)<.08 || input.padAim)this.pace=0;
    const bindings={1:walking?'stealth':null,
      2:armed && walking?'reload':null,3:mode==='skate'?'skate':walking && armed && input.padAim?'draw':'psInteract',
      5:walking?'cover':null,7:walking && armed?'fire':null,9:'pause',
      10:(mode==='drive' || cycling)?'horn':null,12:vehicle || cycling ? null:'phone',
      14:armed && input.padAim?'shoulder':null,15:mode==='passenger'?'driverSpeed':null,[mapButton]:'map'};
    for(let i=0;i<pad.buttons.length;i++){
      const pressed=down(i), previous=Boolean(input.padButtons[i]);
      if(pressed && !previous){
        input.lastDevice='pad';
        if(wheel && (i===14 || i===15))send('wheelCycle');
        else if(input.phoneButton(i)){if(i===0)this.blockCross=true;}
        else{
          if(wheel){if(i===0)this.blockCross=true;if(i===9)send('pause');}
          else if(i===2 && walking && !armed)this.square=0;
          else if(i===7 && walking && !armed)this.grabHold=0;
          else if(i===1 && mode==='drive')this.lightsTap=0;
          else if(i===14 && mode==='drive')this.vehicleMenu=0;
          else if(i===4 && walking)this.loadout=0;
          else if(i===10 && (walking || swimming) && !input.padAim)this.pace=Math.min(2,(this.pace||0)+1);
          else if(i===13 && mode!=='menu')this.navigation=0;
          else if(i===12 && (vehicle || cycling))this.contextHold=0;
          else if(bindings[i])send(bindings[i]);
        }
      }
      input.padButtons[i]=pressed;
    }
    // Resolve each gesture once. A menu taking focus cancels pending presses.
    const gesture=(field,button,tap,hold,threshold)=>{
      if(this[field]==null)return;
      if(!down(button)){this[field]=null;send(tap);}
      else if((this[field]+=dt)>=threshold){this[field]=null;send(hold);}
    };
    gesture('square',2,'fight','heavyMelee',.28);
    if(this.grabHold!=null){
      if(!down(7))this.grabHold=null;
      else if((this.grabHold+=dt)>=.14){this.grabHold=null;send('grapple');}
    }
    if(this.lightsTap!=null){
      if(!down(1)){this.lightsTap=null;send('lights');}
      else if((this.lightsTap+=dt)>=.22){this.lightsTap=null;this.ducking=true;}
    }
    if(!down(1))this.ducking=false;
    if(this.vehicleMenu!=null){
      if(!down(14))this.vehicleMenu=null;
      else if((this.vehicleMenu+=dt)>=.4){this.vehicleMenu=null;send('vehicleMenu');}
    }
    gesture('navigation',13,'status','interactionMenu',.4);
    gesture('contextHold',12,'phone','tripInteract',.4);
    if(this.loadout!=null){
      if(!down(4)){this.loadout=null;send('draw');}
      else if((this.loadout+=dt)>=.19){this.loadout=null;input.padWheel=send('weaponOpen')!==false;}
    }
    if(input.padWheel && !down(4)){input.padWheel=false;send('weaponCommit');}
    input.padLookBack=down(11) && !(walking && input.padAim);
    const moving=Math.hypot(vertical,turn)>.08;
    if(moving || Math.abs(pad.axes[2]||0)>.22 || Math.abs(pad.axes[3]||0)>.22)input.lastDevice='pad';
    const cross=down(0) && !this.blockCross;
    const jump=(walking || swimming) && cross && !wheel;
    const yaw=Number(down(1))-Number(down(2));
    let forward=null,lift=null;
    if(vehicle || cycling || mode==='plane')forward=throttle-reverse;
    if(mode==='rotor'){forward=vertical;lift=throttle-reverse;}
    if(mode==='plane')lift=-vertical;
    if(swimming)lift=Number(cross)-Number(down(5));
    return {jump,handbrake:vehicle && cross || cycling && reverse>.1,
      run:moving && this.pace===2 || swimming && this.pace>0 || cycling && cross,
      jog:moving && this.pace===1,forward,lift,turn:flight ? Math.max(-1,Math.min(1,turn+yaw)) : turn};
  }
}
