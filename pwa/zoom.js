// Keep app gestures at the layout scale while retaining ordinary scrolling and controls.
(() => {
  const preventZoom = event => { if (event.cancelable) event.preventDefault(); };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, preventZoom, { passive: false });
  }
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1) preventZoom(event);
  }, { passive: false });
  document.addEventListener('wheel', event => {
    if (event.ctrlKey) preventZoom(event);
  }, { passive: false });
})();
