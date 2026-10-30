// MODIFICA SOLO QUESTE DUE RIGHE (vedi ISTRUZIONI.md, punti 5 e 6)
window.APP_CONFIG = {
  // Indirizzo dell'app web di Apps Script (finisce con /exec)
  API_URL: 'INCOLLA_QUI_L_URL_DELL_APP_WEB_APPS_SCRIPT/exec',
  // ID client OAuth di Google Cloud (finisce con .apps.googleusercontent.com)
  GOOGLE_CLIENT_ID: 'INCOLLA_QUI_L_ID_CLIENT.apps.googleusercontent.com',

  // Riduzione delle foto prima del caricamento
  FOTO: {
    MAX_LATO: 1600,   // lato lungo massimo in pixel
    QUALITA: 0.72,    // qualità JPEG iniziale (0-1)
    MAX_KB: 400,      // peso massimo desiderato per foto (KB)
    MAX_FILE: 30      // foto massime per singolo invio
  },
  VERSIONE: '4.0.0'
};
