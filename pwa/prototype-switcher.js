// Prototype controls are present only on this dedicated throwaway branch.
(() => {
 const root=document.getElementById('sbs-status-prototype');
 const stages=[...root.querySelectorAll('[data-variant]')],keys=['meta','picture','strip'];
 let active=keys.indexOf(new URL(location.href).searchParams.get('variant'));if(active<0)active=0;
 const draw=()=>{stages.forEach((stage,i)=>stage.hidden=i!==active);document.getElementById('prototypeName').textContent=stages[active].dataset.variant;document.getElementById('prototypeState').textContent=`${active+1} / 3 · Smartphone / Wolke / Stift`;const url=new URL(location.href);url.searchParams.set('variant',keys[active]);history.replaceState(null,'',url);};
 const move=step=>{active=(active+step+stages.length)%stages.length;draw();};
 document.getElementById('prototypePrev').onclick=()=>move(-1);document.getElementById('prototypeNext').onclick=()=>move(1);
 document.addEventListener('keydown',event=>{if(event.target.closest('input,textarea,[contenteditable]'))return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}});draw();
})();
