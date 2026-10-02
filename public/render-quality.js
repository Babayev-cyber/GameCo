// Measure frame pacing and lower resolution before a slow GPU builds a backlog.
export function adaptiveQuality(renderer,{maxRatio=1.5,targetMs=20}={}){
  const ceiling=Math.min(devicePixelRatio,maxRatio,Math.sqrt(2300000/(innerWidth*innerHeight)));
  let ratio=ceiling,sum=0,count=0,slow=0,last=performance.now(),cooldown=0;
  renderer.setPixelRatio(ratio);
  return {
    frame(now){
      const delta=now-last;last=now;
      if(document.hidden||delta>200)return;
      sum+=delta;count++;if(delta>30)slow++;
      if(count<120)return;
      const average=sum/count,slowFraction=slow/count;sum=count=slow=0;
      if(now<cooldown)return;
      const next=average>targetMs+4||slowFraction>.05?Math.max(.65,ratio*.85):average<18&&slowFraction<.01?Math.min(ceiling,ratio+.08):ratio;
      if(Math.abs(next-ratio)>.03){ratio=next;renderer.setPixelRatio(ratio);cooldown=now+5000;}
    },
    reset(){last=performance.now();sum=count=slow=0;},
    get ratio(){return ratio;}
  };
}
