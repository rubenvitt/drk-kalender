// Optional für die einbettende Seite: passt die Höhe von
// <iframe data-drk-kalender …> an den Inhalt an, damit kein innerer Scrollbalken entsteht.
(function () {
  'use strict';
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'drk-kalender:height') return;
    var frames = document.querySelectorAll('iframe[data-drk-kalender]');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var h = Math.max(320, Math.min(8000, Number(d.height) || 0));
        frames[i].style.height = h + 'px';
      }
    }
  });
})();
