/* Theme controller – applies the saved theme before first paint, then handles the animated switch. */
(function () {
  var root = document.documentElement, KEY = 'theme', busy = false;
  var COLORS = { day: '#f5f6f9', night: '#0d0d0e' };
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function paint(t) {
    root.dataset.theme = t;
    root.style.colorScheme = t === 'day' ? 'light' : 'dark';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', COLORS[t]);
  }
  var t = null;
  try { t = new URLSearchParams(location.search).get('theme'); } catch (e) {}
  t = t || read();
  if (t !== 'day' && t !== 'night') t = 'night';
  paint(t);
  document.addEventListener('DOMContentLoaded', function () { paint(root.dataset.theme); });

  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'day' || e.newValue === 'night')) {
      paint(e.newValue); window.dispatchEvent(new Event('themechange'));
    }
  });

  window.__toggleTheme = function (btn) {
    if (busy) return;
    var next = root.dataset.theme === 'day' ? 'night' : 'day';
    function commit() { paint(next); write(next); window.dispatchEvent(new Event('themechange')); }
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { commit(); return; }

    var r = btn && btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
    var x = r ? r.left + r.width / 2 : innerWidth - 60;
    var y = r ? r.top + r.height / 2 : 34;
    var maxR = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    busy = true;
    root.classList.add('theme-switching');
    function done() { root.classList.remove('theme-switching', 'theme-fade'); busy = false; }

    if (document.startViewTransition) {
      var vt;
      try { vt = document.startViewTransition(commit); } catch (e) { commit(); done(); return; }
      vt.ready.then(function () {
        root.animate(
          { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + maxR + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 900, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});
      vt.finished.then(done, done);
      setTimeout(done, 2500);
    } else {
      root.classList.remove('theme-switching');
      root.classList.add('theme-fade');
      commit();
      setTimeout(done, 750);
    }
  };
})();
