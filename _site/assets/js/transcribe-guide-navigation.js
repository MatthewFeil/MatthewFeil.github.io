/* Reading position only: never seek, open or reframe a demonstration. */
const reference=document.querySelector('.guide-reference-layout');
if(reference){
  const sections=[...reference.querySelectorAll('.guide-reference-article > section[id]')];
  const links=new Map([...reference.querySelectorAll('.guide-topic-links a[href^="#"]')].map(link=>[link.hash.slice(1),link]));
  let current=null,frame=0;
  function update(){
    frame=0;
    if(document.querySelector('[data-guide-dialog]')?.open)return;
    const header=document.querySelector('.site-header--guide').getBoundingClientRect().bottom;
    // Keep a section current until the following heading reaches the reading line.
    let selected=sections[0];
    for(const section of sections){
      if(section.querySelector('h2').getBoundingClientRect().top<=header+96)selected=section;
      else break;
    }
    if(scrollY>0&&innerHeight+scrollY>=document.documentElement.scrollHeight-4)selected=sections.at(-1);
    if(selected===current)return;
    current=selected;
    for(const section of sections){
      const link=links.get(section.id),active=section===selected;
      section.toggleAttribute('data-guide-current',active);
      if(active)link?.setAttribute('aria-current','location');else link?.removeAttribute('aria-current');
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(update);}
  window.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  window.addEventListener('hashchange',schedule);
  document.querySelector('[data-guide-dialog]')?.addEventListener('close',schedule);
  new ResizeObserver(schedule).observe(reference);
  document.fonts.ready.then(schedule);
  update();
}
