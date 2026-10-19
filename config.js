// Choisit le bon programme Google selon l'adresse du site
(function () {
  var REEL = 'https://script.google.com/macros/s/AKfycbwQOGwwTMUxCecp1CSanXKVAWynQ_hQ6dX-TuGPPBNKUhpD0h9nZlo7d7gr8tXkfdRPoA/exec';
  var TEST = 'https://script.google.com/macros/s/AKfycbzwv9N2wZcpmcndLIdslMhWLTnJVpITXohhG83hVbBtw37IpfJdFzfXKSKoyrMsKyeb3w/exec';
  var estTest = location.hostname.indexOf('git-test') >= 0;
  window.SUIVI_CONFIG = {
    API_URL: estTest ? TEST : REEL,
    CLIENT_ID: '174824749765-l0qkvb94mb62lvu3e8q9joo9lv7436da.apps.googleusercontent.com'
  };
})();
