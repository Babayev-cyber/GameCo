// Interpolate remote snapshots and briefly extrapolate the local pilot.
// Reuse output objects so the render loop does not allocate vectors each frame.
export class FlightMotion {
  constructor(){this.tracks=new Map();}
  push(players,now){
    const ids=new Set();
    for(const p of players){
      ids.add(p.id);let t=this.tracks.get(p.id);
      if(!t||p.age<t.b.age||!!p.dead!==!!t.b.dead){t={a:p,b:p,at:now,bt:now,out:{pos:[...p.pos]}};this.tracks.set(p.id,t);}
      else{t.a=t.b;t.at=t.bt;t.b=p;t.bt=now;}
    }
    for(const id of this.tracks.keys())if(!ids.has(id))this.tracks.delete(id);
  }
  sample(id,now,local=false){
    const t=this.tracks.get(id);if(!t)return null;
    const {a,b,out}=t,time=local?now:now-80;
    const alpha=Math.max(0,Math.min(1,(time-t.at)/Math.max(1,t.bt-t.at)));
    const ahead=Math.max(0,Math.min(100,time-t.bt))/1000;
    for(let i=0;i<3;i++)out.pos[i]=a.pos[i]+(b.pos[i]-a.pos[i])*alpha+(b.velocity?.[i]||0)*ahead;
    const angle=((b.yaw-a.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
    out.yaw=a.yaw+angle*alpha+(b.yawRate||0)*ahead;
    out.pitch=a.pitch+(b.pitch-a.pitch)*alpha+(b.pitchRate||0)*ahead;
    return out;
  }
  clear(){this.tracks.clear();}
}
