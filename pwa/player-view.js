// Own the display mode; media state remains on the same video element.
export function createPlayerView({ screen, video, isActive = () => true, togglePlayback, native = () => window.stepNativePlayer }) {
  const doc = screen.ownerDocument, win = doc.defaultView;
  const header = screen.querySelector('.screen-header'), bottom = screen.querySelector('.player-bottom');
  let full = false, controls = false, generation = 0, hintTimer, hideTimer;
  let gesture = null, interacting = false, selectionOpen = false;
  const stage = video.closest('.video-stage');
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
    full = false; controls = false; clearTimeout(hideTimer); generation++; clearTimeout(hintTimer); hint.hidden = true; paint();
    native()?.setFullscreen(false);
    if (doc.fullscreenElement === screen) try { await doc.exitFullscreen(); } catch { /* App chrome still returns. */ }
    if (history && win.history.state?.playerFullscreen) win.history.back();
    return true;
  }
  async function enter({ history = true } = {}) {
    if (full || !isActive()) return;
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
    if (!full || event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
    gesture = {id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now()};
    stage.setPointerCapture?.(event.pointerId);
  });
  stage.addEventListener('pointerup', event => {
    const start = gesture; gesture = null;
    if (!full || !start || start.id !== event.pointerId) return;
    const dx = event.clientX-start.x, dy = event.clientY-start.y;
    if (Math.abs(dy) >= 35 && Math.abs(dy) > Math.abs(dx)*1.2) { if (dy < 0) reveal(); else hide(); }
    else if (Math.hypot(dx,dy) < 12 && performance.now()-start.time < 600) togglePlayback?.();
  });
  stage.addEventListener('pointercancel', () => {gesture = null;});
  for (const panel of [header,bottom]) {
    panel.addEventListener('pointerdown', () => {interacting = true; clearTimeout(hideTimer);});
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
    get full() { return full; }, enter, exit,
    toggle() { return full ? exit() : enter(); },
    back() { if (!full) return false; void exit(); return true; },
    reset() { gesture = null; interacting = false; selectionOpen = false; full = false; controls = false; clearTimeout(hideTimer); generation++; clearTimeout(hintTimer); hint.hidden = true; paint(); native()?.setFullscreen(false); }
  };
}
