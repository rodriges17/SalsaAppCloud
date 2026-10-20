// Apply before stylesheet loading to avoid flashing the wrong palette.
(() => {
  const scope = new URL('./', document.currentScript.src).pathname;
  const key = `step-by-step:appearance:${scope}:v1`;
  function apply(value) {
    const theme = value === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f8f2ea' : '#17121f');
    return theme;
  }
  let stored; try { stored = localStorage.getItem(key); } catch { /* Keep dark default. */ }
  apply(stored);
  window.stepAppearance = Object.freeze({
    set(value) { const theme = apply(value); try { localStorage.setItem(key, theme); return true; } catch { return false; } },
    get() { return document.documentElement.dataset.theme; }
  });
})();
