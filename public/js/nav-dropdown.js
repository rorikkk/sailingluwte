// Navigation dropdowns: the ▾ button opens/closes the submenu (for touch screens and
// keyboard; with a mouse, hovering already opens it). A click elsewhere closes it.
(function () {
  var drops = document.querySelectorAll('.nav-dropdown');
  function closeAll(except) {
    drops.forEach(function (d) {
      if (d === except) return;
      d.classList.remove('is-open');
      var b = d.querySelector('.nav-dropdown-caret');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }
  drops.forEach(function (d) {
    var button = d.querySelector('.nav-dropdown-caret');
    if (!button) return;
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !d.classList.contains('is-open');
      closeAll(d);
      d.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('.nav-dropdown')) closeAll();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAll();
  });
})();
