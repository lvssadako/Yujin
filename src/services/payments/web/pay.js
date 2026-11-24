(function () {
  var el = document.getElementById('checkout');
  var errorEl = document.getElementById('error');
  function fail() { if (errorEl) errorEl.hidden = false; }
  if (!el || typeof Stripe !== 'function') return fail();
  var token = el.getAttribute('data-token');
  var stripe = Stripe(el.getAttribute('data-key'));
  stripe.initEmbeddedCheckout({
    fetchClientSecret: function () {
      return fetch('/pay/session/' + encodeURIComponent(token), { method: 'POST', headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('session'); return r.json(); })
        .then(function (d) { return d.clientSecret; });
    }
  }).then(function (checkout) { checkout.mount('#checkout'); }).catch(fail);
})();
