/* The instructions, step rail and camera share one ordered lesson player. */
import { createDemonstration, DEMONSTRATION_PACE } from './transcribe-guide-demonstration.js?v=20261026-step-scroll';
import { quickStart, reference, legacyTopics } from './transcribe-guide-lessons.js?v=20261025-full-guide';
import { fullReference } from './transcribe-guide-reference.js?v=20261026-title-case';
const app=document.querySelector('[data-guide-mockup]');
if(app){
  const camera=document.getElementById('guide-camera'),stage=document.getElementById('guide-stage');
  const dialog=document.querySelector('[data-guide-dialog]');
  const article=document.getElementById(dialog?'guide-demo-article':'guide-article'),button=document.querySelector('[data-guide-playback]');
  const mode=document.querySelector('[data-guide-kind]').dataset.guideKind;
  const autoplayControl=document.querySelector('[data-guide-autoplay]'),rateControl=document.querySelector('[data-guide-rate]');
  const lessons=Object.fromEntries(Object.entries(mode==='quick-start'?quickStart:dialog?fullReference:reference).map(([id,lesson])=>[id,{...lesson,id}]));
  if(dialog){
    for(const [id,lesson] of Object.entries(lessons)){
      const section=document.createElement('section');section.dataset.guideSection=id;section.hidden=true;
      const list=document.createElement('ol');list.className='guide-steps';
      lesson.steps.forEach((step,index)=>{
        const row=document.createElement('li');row.dataset.guideStep=step.id;
        const jump=document.createElement('button');jump.type='button';jump.dataset.guideJump=step.id;jump.setAttribute('aria-label',`View step ${index+1}: ${step.title}`);
        const number=document.createElement('span');number.className='guide-step-number';number.textContent=index+1;number.setAttribute('aria-hidden','true');
        const title=document.createElement('span');title.dataset.stepTitle='';title.textContent=step.title;
        const detail=document.createElement('p');detail.textContent=step.detail;
        jump.append(number,title);row.append(jump,detail);list.append(row);
      });section.append(list);article.append(section);
    }
  }
  const sections=[...article.querySelectorAll('[data-guide-section]')];
  const mobile=matchMedia('(max-width: 720px), (max-height: 500px) and (pointer: coarse)');
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let active=Object.keys(lessons)[0],selectedStep=0,revision=0,animation,lastFocus=null,lastSize='',pendingResize;
  const demonstration=createDemonstration(app,camera,reducedMotion,{frame:frameDemonstration,cancel:stopMotion,setPaused:pauseCamera,setRate:rate=>animation?.updatePlaybackRate(rate),panel:setPanel,step:(index,options)=>showStep(index,false,options?.follow),progress:setStepProgress,frameDuration:view=>framePlan(view).duration,contextDuration:view=>view==='context'||reducedMotion.matches||!posesDiffer(focusPose(view),fullPose())?0:700,complete:()=>showStep(selectedStep,true)});
  function updateControl(){
    const idle=camera.dataset.demoPhase==='idle',finished=camera.dataset.demoPhase==='complete',staticExample=camera.dataset.demoPhase==='static',paused=demonstration.isPaused();
    button.setAttribute('aria-label',idle?'Play demonstration':paused?'Resume demonstration':finished||staticExample?'Replay demonstration':'Pause demonstration');
    button.innerHTML=idle||paused||finished||staticExample?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  }
  new MutationObserver(updateControl).observe(camera,{attributes:true,attributeFilter:['data-demo-phase','data-demo-paused']});
  let followScroll=0;
  function cancelFollowScroll(){
    cancelAnimationFrame(followScroll);followScroll=0;delete camera.dataset.followScrolling;
  }
  function scrollToInstruction(top){
    cancelFollowScroll();
    const from=scrollY,target=Math.max(0,Math.min(document.documentElement.scrollHeight-innerHeight,top));
    if(reducedMotion.matches){window.scrollTo({top:target,behavior:'instant'});return;}
    if(Math.abs(target-from)<1)return;
    const started=demonstration.getTime(),duration=500*DEMONSTRATION_PACE;
    camera.dataset.followScrolling='true';
    function tick(){
      if(!demonstration.isPaused()){
        const progress=Math.min(1,(demonstration.getTime()-started)/duration);
        window.scrollTo({top:from+(target-from)*(1-Math.pow(1-progress,3)),behavior:'instant'});
        if(progress===1){cancelFollowScroll();return;}
      }
      followScroll=requestAnimationFrame(tick);
    }
    followScroll=requestAnimationFrame(tick);
  }
  // Reader input takes priority over automatic following; playback controls can
  // pause/resume the same scroll through the shared demonstration clock.
  window.addEventListener('wheel',cancelFollowScroll,{passive:true});
  const readerInput=event=>{if(!event.target.closest('[data-guide-playback],.guide-animation-settings'))cancelFollowScroll();};
  window.addEventListener('touchstart',readerInput,{passive:true});
  window.addEventListener('pointerdown',readerInput,{passive:true});
  window.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))readerInput(event);});
  function showStep(index,complete=false,follow=false){
    selectedStep=index;camera.dataset.step=lessons[active].steps[index].id;
    for(const control of article.querySelectorAll('[aria-current="step"]'))control.removeAttribute('aria-current');
    const rows=sections.find(s=>s.dataset.guideSection===active).querySelectorAll('[data-guide-step]');
    rows.forEach((row,i)=>{
      row.dataset.stepState=i<index||complete?'complete':i===index?'active':'upcoming';
      const control=row.querySelector('[data-guide-jump]');
      row.style.setProperty('--step-progress',i<index||complete?'1':'0');
      if(i===index)control.setAttribute('aria-current','step');else control.removeAttribute('aria-current');
    });
    const currentInstruction=document.querySelector('[data-guide-current-instruction]');
    currentInstruction.querySelector('[data-guide-current-title]').textContent=rows[index].querySelector('[data-step-title]').textContent;
    currentInstruction.querySelector('[data-guide-current-detail]').textContent=rows[index].querySelector('p')?.textContent||'';
    const timeline=document.querySelector('[data-guide-timeline]');
    timeline.replaceChildren(...[...rows].map(row=>{const segment=document.createElement('button');segment.type='button';segment.dataset.guideJump=row.dataset.guideStep;segment.setAttribute('aria-label',row.querySelector('[data-guide-jump]').getAttribute('aria-label'));segment.style.setProperty('--step-progress',row.style.getPropertyValue('--step-progress'));return segment;}));
    updateRails();
    history.replaceState({},'',`#${active}/${lessons[active].steps[index].id}`);updateControl();
    if(follow&&matchMedia('(max-width: 720px) and (orientation: portrait)').matches){
      // The current instruction travels with the viewer; never pull a reader back to it.
    }else if(follow&&dialog){
      const row=rows[index].getBoundingClientRect(),bounds=article.getBoundingClientRect();
      if(row.top<bounds.top||row.bottom>bounds.bottom)article.scrollTop+=row.top-bounds.top;
    }else if(follow){
      const row=rows[index].getBoundingClientRect(),header=document.querySelector('.site-header--guide').getBoundingClientRect().height;
      const viewer=document.querySelector('.guide-layout > .guide-viewer');
      const readingTop=innerWidth<=1100&&viewer?parseFloat(getComputedStyle(viewer).top)+viewer.offsetHeight+32:header+16;
      if(row.top<readingTop||row.bottom>innerHeight-16)scrollToInstruction(scrollY+row.top-readingTop);
    }
  }
  function setStepProgress(index,value){
    if(index!==selectedStep)return;
    const row=sections.find(s=>s.dataset.guideSection===active)?.querySelectorAll('[data-guide-step]')[index];
    const progress=String(Math.max(0,Math.min(1,value)));
    row?.style.setProperty('--step-progress',progress);
    document.querySelector('[data-guide-timeline]')?.children[index]?.style.setProperty('--step-progress',progress);
  }
  function updateRails(){
    const rows=[...sections.find(s=>s.dataset.guideSection===active).querySelectorAll('[data-guide-step]')];
    rows.forEach((row,index)=>{
      const bounds=row.getBoundingClientRect(),number=row.querySelector('.guide-step-number').getBoundingClientRect();
      const end=rows[index+1]?.querySelector('.guide-step-number').getBoundingClientRect().top??bounds.bottom-4;
      row.style.setProperty('--rail-top',`${number.bottom-bounds.top}px`);
      row.style.setProperty('--rail-length',`${Math.max(0,end-number.bottom)}px`);
    });
  }
  function layout(){
    const width=Math.max(1,camera.clientWidth),height=Math.max(1,camera.clientHeight);
    const factor=Math.max(innerWidth/width,(mobile.matches?720:480)/height);
    stage.style.setProperty('--guide-control-width',`${Math.min(240,Math.max(130,innerWidth/2-12))}px`);
    stage.style.setProperty('--guide-app-width',`${width*factor}px`);stage.style.setProperty('--guide-app-height',`${height*factor}px`);
    stage.style.width=`${width*factor}px`;stage.style.height=`${height*factor}px`;
  }
  function fullPose(){const scale=Math.min(camera.clientWidth/app.offsetWidth,camera.clientHeight/app.offsetHeight);return{scale,x:(camera.clientWidth-app.offsetWidth*scale)/2,y:(camera.clientHeight-app.offsetHeight*scale)/2};}
  const transform=p=>`translate(${p.x}px,${p.y}px) scale(${p.scale})`;
  function stopMotion(){const current=getComputedStyle(stage).transform;animation?.cancel();stage.style.transform=current==='none'?'translate(0px,0px) scale(1)':current;}
  function pauseCamera(paused){if(!animation||!['running','paused'].includes(animation.playState))return;if(paused){const time=animation.currentTime;animation.pause();animation.currentTime=time;}else animation.play();}
  async function moveTo(pose,duration){const from=getComputedStyle(stage).transform;stage.style.transform=transform(pose);animation=stage.animate([{transform:from},{transform:transform(pose)}],{duration:duration*DEMONSTRATION_PACE,easing:'cubic-bezier(0.45,0,0.15,1)'});animation.updatePlaybackRate(demonstration.getRate());if(demonstration.isPaused())animation.pause();try{await animation.finished;return true;}catch{return false;}}
  function regionFor(element){const scale=new DOMMatrixReadOnly(getComputedStyle(stage).transform).a||1,root=app.getBoundingClientRect(),r=element.getBoundingClientRect();return{x:(r.left-root.left)/scale,y:(r.top-root.top)/scale,width:r.width/scale,height:r.height/scale};}
  function focusPose(focus){
    let box=regionFor(app.querySelector(focus.target));
    for(const selector of focus.relatedTargets||[]){const other=regionFor(app.querySelector(selector)),x=Math.min(box.x,other.x),y=Math.min(box.y,other.y);box={x,y,width:Math.max(box.x+box.width,other.x+other.width)-x,height:Math.max(box.y+box.height,other.y+other.height)-y};}
    if(box.width>=app.offsetWidth*.7)return fullPose();
    const width=camera.clientWidth,height=camera.clientHeight;
    const scale=Math.max(fullPose().scale,Math.min(width/Math.max(box.width+64,mobile.matches?180:280),height/(box.height+Math.min(64,height*.15)),1.5));
    return{scale,x:Math.min(0,Math.max(width-app.offsetWidth*scale,width/2-(box.x+box.width/2)*scale)),y:Math.min(0,Math.max(height-app.offsetHeight*scale,height/2-(box.y+box.height/2)*scale))};
  }
  function setPanel(open){
    app.querySelector('#transcribe-sidebar').hidden=!open;
    app.querySelector('#transcribe-controls-content').hidden=false;app.querySelector('#transcribe-shortcuts-content').hidden=true;
    app.querySelector('#transcribe-controls-toggle').setAttribute('aria-expanded',String(open));
    app.querySelector('.transcribe-workspace').classList.toggle('has-sidebar',open&&!mobile.matches);
    app.querySelector('.transcribe-workspace').classList.toggle('mobile-section-open',open&&mobile.matches);
    for(const popup of app.querySelectorAll('#transcribe-measure-panel,#transcribe-eq-info,#transcribe-stems-info')){popup.hidden=true;popup.dataset.guideVisible='false';}
  }
  function changed(pose){const matrix=new DOMMatrixReadOnly(getComputedStyle(stage).transform);return Math.hypot(matrix.e-pose.x,matrix.f-pose.y)>1||Math.abs(matrix.a-pose.scale)>.002;}
  const posesDiffer=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)>1||Math.abs(a.scale-b.scale)>.002;
  function framePlan(view){
    if(view!=='context'){
      const target=app.querySelector(view.target),scroll=target?.closest('.transcribe-sidebar-scroll');
      if(scroll){const r=target.getBoundingClientRect(),b=scroll.getBoundingClientRect(),scale=new DOMMatrixReadOnly(getComputedStyle(stage).transform).a||1;
        if(r.top<b.top||r.bottom>b.bottom)scroll.scrollTop+=(r.top-b.top-(b.height-r.height)/2)/scale;
      }
    }
    const pose=view==='context'?fullPose():focusPose(view);
    let restore=false;
    if(view!=='context'&&lastFocus&&lastFocus!==view.target){
      const from=app.querySelector(lastFocus),to=app.querySelector(view.target);
      restore=from?.closest('.transcribe-control-bar,.transcribe-transport,.transcribe-sidebar')!==to?.closest('.transcribe-control-bar,.transcribe-transport,.transcribe-sidebar');
    }
    return{pose,restore,duration:!reducedMotion.matches&&changed(pose)?(restore?1050:700):0};
  }
  async function frameDemonstration(view,lesson){
    const turn=revision,{pose,restore,duration}=framePlan(view);
    stopMotion();
    if(duration){
      if(restore&&!await moveTo(fullPose(),350))return false;
      if(!await moveTo(pose,700))return false;
    }else stage.style.transform=transform(pose);
    lastFocus=view==='context'?null:view.target;
    return turn===revision&&lesson===lessons[active];
  }
  async function startLesson(motion=true,keepCamera=false,explicitPlay=false){
    const turn=++revision,lesson=lessons[active],index=selectedStep;
    demonstration.prepare(lesson,index);button.hidden=false;
    camera.dataset.lesson=active;camera.dataset.topic=active;camera.dataset.phase='framing';
    if(!keepCamera){const full=fullPose();if(motion&&autoplayControl?.checked!==false&&!reducedMotion.matches&&changed(full)){if(!await moveTo(full,500)||turn!==revision)return;}else stage.style.transform=transform(full);lastFocus=null;}
    if(turn!==revision)return;
    camera.dataset.phase='focused';demonstration.start(lesson,explicitPlay,index,autoplayControl?.checked!==false);
  }
  function selectLesson(id,index=0,{motion=true,keepCamera=false,explicitPlay=false}={}){
    if(!lessons[id]||(dialog&&!dialog.open))return;cancelFollowScroll();active=id;
    if(dialog)document.getElementById('guide-demo-title').textContent=lessons[id].title;selectedStep=Math.max(0,Math.min(index,lessons[id].steps.length-1));
    for(const section of sections)section.hidden=section.dataset.guideSection!==active;
    for(const link of document.querySelectorAll('[data-guide-lesson]')){if(link.dataset.guideLesson===active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');}
    void startLesson(motion,keepCamera,explicitPlay);
  }
  let returnLink=null,returnHash='';
  function openDemo(id,index=0){
    if(!lessons[id])return;
    if(dialog&&!dialog.open){dialog.showModal();document.documentElement.classList.add('guide-dialog-open');layout();lastSize=sizeKey();}
    selectLesson(id,index);
  }
  function closeDemo(updateURL=true){
    if(!dialog?.open)return;
    ++revision;demonstration.stop();dialog.close();document.documentElement.classList.remove('guide-dialog-open');
    if(updateURL)history.replaceState({},'',returnHash||`#${active==='pitch'?'sound':active}`);
    returnLink?.focus({preventScroll:true});returnLink=null;
  }
  if(dialog){
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDemo();});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDemo();}});
  }
  function fromLocation(){
    let fragmentText;try{fragmentText=decodeURIComponent(location.hash.slice(1));}catch{fragmentText='';}
    const [fragment,step]=fragmentText.split('/');
    if(dialog){
      if(!step){
        const old=legacyTopics[fragment];
        if(old&&!document.getElementById(fragment)){openDemo(old[0],Math.max(0,lessons[old[0]].steps.findIndex(s=>s.id===old[1])));return;}
        closeDemo(false);return;
      }
      const mapped=lessons[fragment]?fragment:null;
      if(mapped)openDemo(mapped,Math.max(0,lessons[mapped].steps.findIndex(s=>s.id===step)));
      return;
    }
    const legacy=mode==='reference'?legacyTopics[fragment]:null;
    const id=lessons[fragment]?fragment:legacy?.[0]||Object.keys(lessons)[0],stepId=step||legacy?.[1];
    selectLesson(id,Math.max(0,lessons[id].steps.findIndex(s=>s.id===stepId)));
  }
  document.addEventListener('click',event=>{
    const demoLink=event.target.closest('[data-guide-demo]');
    if(dialog&&demoLink){
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();returnLink=demoLink;returnHash=`#${demoLink.closest('section').id}`;
      const [id]=demoLink.dataset.guideDemo.split('/');
      if(!lessons[id])return;
      history.pushState({},'',`#${id}/${lessons[id].steps[0].id}`);openDemo(id);return;
    }
    if(event.target.closest('[data-guide-close]')){closeDemo();return;}
    if(event.target.closest('[data-guide-playback]')){
      if(['complete','static','idle'].includes(camera.dataset.demoPhase))selectLesson(active,['static','idle'].includes(camera.dataset.demoPhase)?selectedStep:0,{keepCamera:true,explicitPlay:true});else demonstration.setPaused(!demonstration.isPaused());return;
    }
    const jump=event.target.closest('[data-guide-jump]');
    if(jump){const index=lessons[active].steps.findIndex(s=>s.id===jump.dataset.guideJump);history.pushState({},'',`#${active}/${jump.dataset.guideJump}`);selectLesson(active,index,{keepCamera:true});return;}
    const link=event.target.closest('[data-guide-lesson]');
    if(!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();history.pushState({},'',`#${link.dataset.guideLesson}`);selectLesson(link.dataset.guideLesson);
    (matchMedia('(max-width: 720px) and (orientation: portrait)').matches?document.querySelector('.guide-layout > .guide-viewer'):article).scrollIntoView({block:'start',behavior:'instant'});
  });
  autoplayControl?.addEventListener('change',()=>{
    const phase=camera.dataset.demoPhase;
    if(!autoplayControl.checked){if(!['complete','static','idle','none'].includes(phase))demonstration.setPaused(true);}
    else if(demonstration.isPaused())demonstration.setPaused(false);
    else if(phase==='idle')selectLesson(active,selectedStep,{keepCamera:true});
  });
  rateControl?.addEventListener('change',()=>demonstration.setRate(Number(rateControl.value)));
  window.addEventListener('popstate',fromLocation);window.addEventListener('hashchange',fromLocation);
  const sizeKey=()=>[innerWidth,innerHeight,camera.clientWidth,camera.clientHeight].join(':');
  function resize(){if(dialog&&!dialog.open)return;if(sizeKey()===lastSize)return;lastSize=sizeKey();layout();selectLesson(active,selectedStep,{motion:false});}
  window.addEventListener('resize',()=>{cancelAnimationFrame(pendingResize);pendingResize=requestAnimationFrame(resize);});
  const header=document.querySelector('.site-header--guide');
  new ResizeObserver(()=>{document.documentElement.style.setProperty('--guide-header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);}).observe(header);
  document.documentElement.style.setProperty('--guide-header-height',`${Math.ceil(header.getBoundingClientRect().height)}px`);
  if(!dialog)layout();lastSize=sizeKey();fromLocation();new ResizeObserver(resize).observe(camera);
  new ResizeObserver(updateRails).observe(article);
  function refresh(){if(dialog&&!dialog.open)return;selectLesson(active,selectedStep,{motion:false,keepCamera:true});}
  new MutationObserver(refresh).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',refresh);
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)refresh();});
  let resumeWhenVisible=document.hidden&&!['complete','static'].includes(camera.dataset.demoPhase);
  if(resumeWhenVisible)demonstration.setPaused(true);
  document.addEventListener('visibilitychange',()=>{if(dialog&&!dialog.open)return;if(document.hidden){resumeWhenVisible=!demonstration.isPaused()&&!['complete','static'].includes(camera.dataset.demoPhase);if(resumeWhenVisible)demonstration.setPaused(true);}else if(resumeWhenVisible){resumeWhenVisible=false;demonstration.setPaused(false);}});
  document.fonts.ready.then(()=>{if(camera.dataset.phase==='focused'&&!demonstration.isPaused())refresh();});
}
