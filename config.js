// MODIFICA SOLO QUESTE DUE RIGHE (vedi ISTRUZIONI.md, punti 5 e 6)
window.APP_CONFIG = {
  // Indirizzo dell'app web di Apps Script (finisce con /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycby5KecZsx5BA793D6XbPfBKcey4BY8sDUTwc-b8GSC4Lg11hgQrtk-RUF8DGcjT9v6C/exec',
  // ID client OAuth di Google Cloud (finisce con .apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: '937783269854-m0b0fbm7m8hfuovj3f0q2jp8u6idl1f1.apps.googleusercontent.com',

  // Riduzione delle foto prima del caricamento
  FOTO: {
    MAX_LATO: 1600,   // lato lungo massimo in pixel
    QUALITA: 0.72,    // qualità JPEG iniziale (0-1)
    MAX_KB: 400,      // peso massimo desiderato per foto (KB)
    MAX_FILE: 30      // foto massime per singolo invio
  },
  VERSIONE: '4.0.0'
};
