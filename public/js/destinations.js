// "Bestemmingen" on the home page: fade-up when a row scrolls into view, and open/close
// on click. Re-implements the Webflow interactions the rows used to have (see webflow.js):
//   a-26 "fadeup-0.5"        (SCROLL_INTO_VIEW on .accordian-item, plays once)
//   a-27 "Accordion (open)"  (first click on .faq-q)
//   a-28 "Accordion (Close)" (second click on .faq-q)
// Like Webflow IX2, values are tweened per frame from their current value with the same
// easing functions, so rows added in the CMS animate exactly like the old ones.
(function () {
  var items = document.querySelectorAll('.accordian-block .accordian-item');

  // --- a-26: initial state (translateY 50px, opacity 0) is the inline style of each row.
  // Into view: move to 0 (1000ms, ease, delay 500ms) and opacity 1 (600ms, ease, delay 500ms).
  function reveal(el) {
    el.style.transition = 'transform 1000ms ease 500ms, opacity 600ms ease 500ms';
    el.style.transform = 'translate3d(0px, 0px, 0px)';
    el.style.opacity = '1';
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.unobserve(e.target); reveal(e.target); }
      });
    });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(reveal);
  }

  // --- Accordion: tiny tween engine (one running tween per element+property; starting a
  // new one stops the old one where it is, like Webflow's autoStopEventId).
  var EASE = {
    linear: function (t) { return t; },                        // Webflow easing ""
    inQuad: function (t) { return t * t; },                    // Webflow "inQuad"
    outQuad: function (t) { return -(Math.pow(t - 1, 2) - 1); } // Webflow "outQuad"
  };
  var running = new Map(); // element -> { prop: tween }

  function tween(el, prop, from, to, duration, ease, render, done) {
    var map = running.get(el) || {};
    running.set(el, map);
    var tw = { stopped: false };
    if (map[prop]) map[prop].stopped = true;
    map[prop] = tw;
    var start = null;
    render(from);
    function frame(now) {
      if (tw.stopped) return;
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / duration);
      render(from + (to - from) * EASE[ease](p));
      if (p < 1) requestAnimationFrame(frame);
      else { if (map[prop] === tw) delete map[prop]; if (done) done(); }
    }
    requestAnimationFrame(frame);
  }
  function isRunning(el, prop) {
    var map = running.get(el);
    return !!(map && map[prop]);
  }
  // Height of an element when its inline height is removed ("AUTO" in Webflow).
  function autoHeight(el) {
    var cur = el.style.height;
    el.style.height = '';
    var h = el.offsetHeight;
    el.style.height = cur;
    return h;
  }
  function currentHeight(el) {
    return parseFloat(getComputedStyle(el).height) || 0;
  }
  function px(el) { return function (v) { el.style.height = v + 'px'; }; }

  items.forEach(function (item) {
    var q = item.querySelector('.faq-q');
    var ans = item.querySelector('.faq-ans');
    var icon = q.querySelector('.plus-icon');
    var vert = q.querySelector('.plus-vert');
    if (!ans || !icon || !vert) return;
    var angle = 0;
    function rotate(v) { angle = v; icon.style.transform = 'rotateZ(' + v + 'deg)'; }
    var open = false;

    q.addEventListener('click', function () {
      open = !open;
      if (open) {
        // a-27: stopping a running close resets the plus-vert to its CSS height (Webflow
        // clears "AUTO" sizes when an animation stops).
        if (isRunning(vert, 'height')) { running.get(vert).height.stopped = true; delete running.get(vert).height; vert.style.height = ''; }
        // .faq-ans -> auto height, outQuad 200ms; then the inline height is removed so the
        // answer keeps its natural height (e.g. after resizing).
        tween(ans, 'height', currentHeight(ans), autoHeight(ans), 200, 'outQuad', px(ans), function () {
          ans.style.height = '';
        });
        // .plus-vert -> 0px, linear 200ms; .plus-icon -> rotateZ(180deg), linear 200ms.
        tween(vert, 'height', currentHeight(vert), 0, 200, 'linear', px(vert));
        tween(icon, 'rotate', angle, 180, 200, 'linear', rotate);
      } else {
        // a-28: stopping a running open sets the answer back to auto height first (same
        // Webflow clean-up), so the close starts from the full height.
        if (isRunning(ans, 'height')) { running.get(ans).height.stopped = true; delete running.get(ans).height; ans.style.height = ''; }
        // .faq-ans -> 0px, inQuad 200ms; .plus-vert -> auto (CSS 12px), linear 200ms, then
        // the inline height is removed; .plus-icon -> rotateZ(0deg), linear 200ms.
        tween(ans, 'height', currentHeight(ans), 0, 200, 'inQuad', px(ans));
        tween(vert, 'height', currentHeight(vert), autoHeight(vert), 200, 'linear', px(vert), function () {
          vert.style.height = '';
        });
        tween(icon, 'rotate', angle, 0, 200, 'linear', rotate);
      }
    });
  });
})();
