// Own the display mode; media state remains on the same video element.
export function createPlayerView({ screen, video, isActive = () => true, togglePlayback, seekBy, native = () => window.stepNativePlayer }) {
  const doc = screen.ownerDocument, win = doc.defaultView;
  const header = screen.querySelector('.screen-header'), bottom = screen.querySelector('.player-bottom');
  let full = false, controls = false, generation = 0, hintTimer, hideTimer;
  let gesture = null, interacting = false, selectionOpen = false;
  const stage = video.closest('.video-stage');
  let tapTimer, pendingTap = null, feedbackTimer, pauseTimer, playHidden = false, total = 0, lastSeek = 0, direction = 0;
  const playButton = doc.createElement('button'); playButton.className = 'player-play-feedback'; playButton.type = 'button'; playButton.setAttribute('aria-label','Video starten'); playButton.textContent = '▶';
  const pauseIcon = doc.createElement('span'); pauseIcon.className = 'player-pause-feedback'; pauseIcon.textContent = '❚❚'; pauseIcon.setAttribute('aria-hidden','true');
  const seekIcon = doc.createElement('span'); seekIcon.className = 'player-seek-feedback'; seekIcon.setAttribute('role','status');
  stage.append(playButton,pauseIcon,seekIcon); pauseIcon.hidden = true; seekIcon.hidden = true;
  const ready = () => isActive() && video.readyState >= 2 && !video.error && screen.querySelector('#videoLoading')?.hidden !== false && screen.querySelector('#retryPlayer')?.hidden !== false;
  function feedback() { playButton.hidden = !ready() || !video.paused || playHidden || !pauseIcon.hidden; }
  for (const element of [screen.querySelector('#videoLoading'),screen.querySelector('#retryPlayer')]) if(element)new win.MutationObserver(feedback).observe(element,{attributes:true,attributeFilter:['hidden']});
  function clearActions() { clearTimeout(tapTimer); clearTimeout(feedbackTimer); clearTimeout(pauseTimer); pendingTap = null; gesture = null; total = 0; direction = 0; playHidden = false; pauseIcon.hidden = true; seekIcon.hidden = true; playButton.hidden = true; }
  function singleTap() { if (!ready()) return; if(video.paused){playHidden = !playHidden; feedback();}else togglePlayback?.(); }
  function tap(x) {
    if (!ready()) return;
    const box = stage.getBoundingClientRect(), zone = x < box.left+box.width/3 ? -1 : x > box.left+box.width*2/3 ? 1 : 0;
    if (zone && pendingTap === zone) {
      clearTimeout(tapTimer); pendingTap = null;
      seekBy?.(zone*5);
      const now = performance.now(); total = direction===zone && now-lastSeek<1000 ? total+5 : 5; direction = zone; lastSeek = now;
      seekIcon.textContent = `${zone<0?'◀◀':'▶▶'} ${total} s`; seekIcon.dataset.side = zone<0?'left':'right'; seekIcon.hidden = false;
      clearTimeout(feedbackTimer); feedbackTimer = setTimeout(()=>{seekIcon.hidden=true;},700);
    } else {
      if(pendingTap !== null){clearTimeout(tapTimer);singleTap();pendingTap=null;}
      if(!zone) singleTap(); else {pendingTap=zone;tapTimer=setTimeout(()=>{pendingTap=null;singleTap();},300);}
    }
  }
  playButton.addEventListener('click', event=>{event.stopPropagation();clearTimeout(tapTimer);pendingTap=null;if(ready())togglePlayback?.();});
  video.addEventListener('pause',()=>{playHidden=false;if(ready()&&!video.ended){pauseIcon.hidden=false;clearTimeout(pauseTimer);pauseTimer=setTimeout(()=>{pauseIcon.hidden=true;feedback();},500);}feedback();});
  video.addEventListener('play',()=>{clearTimeout(pauseTimer);pauseIcon.hidden=true;playHidden=false;feedback();});
  for(const type of ['loadeddata','seeked','ended'])video.addEventListener(type,feedback);
  for(const type of ['emptied','loadstart','error'])video.addEventListener(type,clearActions);
  function scheduleHide() {
    clearTimeout(hideTimer);
    if(full)stage.setAttribute('aria-label',video.paused?'Video abspielen':'Video pausieren');
    if (full && controls && !video.paused && !video.ended && !interacting && !selectionOpen) hideTimer = setTimeout(hide, 4000);
  }
  function reveal() { if (!full) return; controls = true; paint(); scheduleHide(); }
  function hide() { if (!full) return; controls = false; clearTimeout(hideTimer); paint(); }

  const hint = doc.createElement('p'); hint.className = 'player-fullscreen-hint'; hint.setAttribute('role', 'status'); hint.hidden = true; screen.append(hint);
  function paint() {
    screen.classList.toggle('is-immersive', full);
    screen.classList.toggle('is-native-fullscreen', full && !!native());
    screen.classList.toggle('controls-visible', full && controls);
    header.inert = full && !controls; bottom.inert = full && !controls;
    header.setAttribute('aria-hidden', String(header.inert)); bottom.setAttribute('aria-hidden', String(bottom.inert));
    screen.querySelector('#fullscreen').textContent = full ? 'Verkleinern' : 'Vollbild';
    screen.querySelector('#playerBack').setAttribute('aria-label',full?'Vollbild verlassen':'Zurück zur Übersicht');
    if (full) { stage.setAttribute('role','button'); stage.setAttribute('aria-label',video.paused?'Video abspielen':'Video pausieren'); stage.setAttribute('aria-description','Hochwischen oder Pfeil nach oben zeigt die Bedienung.'); stage.tabIndex = 0; stage.focus({preventScroll:true}); }
    else {stage.removeAttribute('tabindex');stage.removeAttribute('role');stage.removeAttribute('aria-label');stage.removeAttribute('aria-description');}
  }
  async function exit({ history = true } = {}) {
    if (!full) return false;
    clearTimeout(tapTimer); pendingTap=null; gesture=null;
    full = false; controls = false; clearTimeout(hideTimer); generation++; clearTimeout(hintTimer); hint.hidden = true; paint();
    native()?.setFullscreen(false);
    if (doc.fullscreenElement === screen) try { await doc.exitFullscreen(); } catch { /* App chrome still returns. */ }
    if (history && win.history.state?.playerFullscreen) win.history.back();
    return true;
  }
  async function enter({ history = true } = {}) {
    if (full || !isActive()) return;
    clearTimeout(tapTimer); pendingTap=null;
    full = true; controls = false; gesture = null; interacting = false; selectionOpen = false; const request = ++generation; paint();
    if (history) win.history.pushState({...win.history.state, view:'player', playerFullscreen:true}, '', '#lernen');
    if (native()) { native().setFullscreen(true); return; }
    try {
      if (!screen.requestFullscreen) throw new Error('Fullscreen unavailable');
      await screen.requestFullscreen();
      if (!full && doc.fullscreenElement === screen) await doc.exitFullscreen();
    } catch {
      if (!full || generation !== request) return;
      hint.textContent = 'Die verfügbare Fläche wird genutzt. Browserleisten können sichtbar bleiben.';
      hint.hidden = false; hintTimer = setTimeout(() => {hint.hidden = true;}, 4000);
    }
  }
  video.addEventListener('play', scheduleHide);
  video.addEventListener('pause', scheduleHide);
  video.addEventListener('ended', scheduleHide);
  stage.addEventListener('pointerdown', event => {
    if (!isActive() || event.target.closest('button,input,select') || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    const start = gesture; gesture = null;
    if (!isActive() || !start || start.id !== event.pointerId) return;
    const dx = event.clientX-start.x, dy = event.clientY-start.y;
    if (Math.abs(dy) >= 35 && Math.abs(dy) > Math.abs(dx)*1.2) { clearTimeout(tapTimer); pendingTap=null; if (dy < 0) reveal(); else hide(); }
    else if (Math.hypot(dx,dy) < 12 && performance.now()-start.time < 600) tap(event.clientX);
  });
  stage.addEventListener('pointercancel', () => {gesture = null;clearTimeout(tapTimer);pendingTap=null;});
  for (const panel of [header,bottom]) {
    panel.addEventListener('pointerdown', () => {clearTimeout(tapTimer);pendingTap=null;interacting = true; clearTimeout(hideTimer);});
    panel.addEventListener('keydown', () => {interacting = true; clearTimeout(hideTimer);});
    panel.addEventListener('input', scheduleHide);
    panel.addEventListener('click', scheduleHide);
    panel.addEventListener('focusin', event => {if(event.target.matches('select')){selectionOpen = true;clearTimeout(hideTimer);}});
    panel.addEventListener('focusout', () => {selectionOpen = false;scheduleHide();});
    panel.addEventListener('change', () => {selectionOpen = false;scheduleHide();});
  }
  for (const type of ['pointerup','pointercancel','keyup']) win.addEventListener(type, () => {interacting = false;scheduleHide();});
  doc.addEventListener('keydown', event => {
    if (!full || !isActive() || event.target.closest?.('input,select,textarea,[contenteditable="true"]')) return;
    if(event.key==='ArrowUp'){event.preventDefault();reveal();}
    else if(event.key==='ArrowDown'){event.preventDefault();hide();}
    else if((event.key===' '||event.key==='Enter')&&event.target===stage){event.preventDefault();togglePlayback?.();}
  });
  doc.addEventListener('fullscreenchange', () => { if (full && !native() && doc.fullscreenElement !== screen) void exit(); });
  return {
    mediaChanged: clearActions,
    get full() { return full; }, enter, exit,
    toggle() { return full ? exit() : enter(); },
    back() { if (!full) return false; void exit(); return true; },
    reset() { clearActions(); gesture = null; interacting = false; selectionOpen = false; full = false; controls = false; clearTimeout(hideTimer); generation++; clearTimeout(hintTimer); hint.hidden = true; paint(); native()?.setFullscreen(false); }
  };
}
