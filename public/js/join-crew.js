// Sends the "meezeilen" form on the home page to Netlify Forms without leaving the page.
(function () {
  var form = document.querySelector('form[name="meezeilen"]');
  if (!form || !window.fetch) return; // without JS the form still posts normally
  var spot = form.parentNode;
  var done = spot.querySelector('.join-crew-done');
  var fail = spot.querySelector('.join-crew-fail');
  var button = form.querySelector('[type="submit"]');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var label = button.value;
    button.value = button.getAttribute('data-wait') || label;
    button.disabled = true;
    fail.hidden = true;
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(form)).toString()
    })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.hidden = true;
        done.hidden = false;
      })
      .catch(function () {
        fail.hidden = false;
      })
      .finally(function () {
        button.value = label;
        button.disabled = false;
      });
  });
})();
