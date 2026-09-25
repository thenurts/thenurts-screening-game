/* The Nurts screening game – stable loader for embedding (e.g. the Shopify page).
   Reads Vite's manifest (no-store) and injects the current hashed entry, so the host page never changes. */
(function () {
  var s = document.currentScript;
  var base = (s && s.src ? s.src.replace(/loader\.js.*$/, '') : './');
  window.__NURTS_BASE__ = base;
  fetch(base + '.vite/manifest.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (m) {
      var e = m['index.html'];
      (e.css || []).forEach(function (c) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + c; document.head.appendChild(l); });
      var j = document.createElement('script'); j.type = 'module'; j.crossOrigin = 'anonymous'; j.src = base + e.file; document.head.appendChild(j);
    })
    .catch(function (err) {
      var root = document.getElementById('nurts-game');
      if (root) root.innerHTML = '<p style="font:600 16px sans-serif;padding:24px;text-align:center">Sorry, the game could not load. Please refresh the page.</p>';
      console.error('[The Nurts] loader failed', err);
    });
})();
