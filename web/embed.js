// Optional für die einbettende Seite: passt die Höhe der Kalender-iframes an den Inhalt an,
// damit kein innerer Scrollbalken entsteht.
//
// Ein Attribut am iframe ist nicht nötig: CMS und Cookie-Manager entfernen solche Attribute
// gern. Angepasst wird das iframe, aus dem die Meldung kommt, sofern sie von derselben Domain
// stammt wie dieses Skript.
(function () {
  'use strict';
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src, location.href).origin : null;

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'drk-kalender:height') return;
    if (origin && e.origin !== origin) return;
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === e.source) {
        var h = Math.max(120, Math.min(8000, Number(d.height) || 0));
        frames[i].style.height = h + 'px';
      }
    }
  });
})();
