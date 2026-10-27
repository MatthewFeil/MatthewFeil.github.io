/* The same responsive contents disclosure serves both documentation pages. */
const contents=document.querySelector('.guide-contents');
if(contents){
  const compact=matchMedia('(max-width: 1100px)');
  const nav=contents.closest('.guide-topics'),summary=contents.querySelector('summary');
  const label=contents.querySelector('[data-guide-contents-current]');
  function updateLabel(){
    const link=contents.querySelector('[aria-current="location"]');
    label.textContent=link?[...link.childNodes].filter(node=>!node.classList?.contains('guide-lesson-number')).map(node=>node.textContent).join('').trim():'';
  }
  function adapt(){contents.open=!compact.matches;}
  contents.addEventListener('click',event=>{
    if(compact.matches&&event.target.closest('a[href^="#"]')){
      const restore=contents.contains(document.activeElement);
      contents.open=false;
      if(restore)summary.focus({preventScroll:true});
    }
  });
  compact.addEventListener('change',adapt);
  new MutationObserver(updateLabel).observe(nav,{subtree:true,attributes:true,attributeFilter:['aria-current']});
  adapt();updateLabel();
}
