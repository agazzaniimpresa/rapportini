'use strict';
/* Rapportini - app web installabile (PWA). Nessuna dipendenza esterna tranne "Accedi con Google". */
const CFG = window.APP_CONFIG;
const S = { utente: null, dati: null, token: null, tokenExp: 0, pila: [] };

// ============================================================ UTILITÀ
function h(tag, attrs, ...figli) {
  const e = document.createElement(tag);
  let valore;
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') e.className = v;
    else if (k === 'value') valore = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  });
  figli.flat(Infinity).forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  if (valore !== undefined) e.value = valore;
  return e;
}
const $ = s => document.querySelector(s);
const pad = n => (n < 10 ? '0' : '') + n;
const chiaveG = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dmy = d => pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear();
const inizioGiorno = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const piuGiorni = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const fmtKB = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const numIT = s => parseFloat(String(s).trim().replace(',', '.'));
const RE_ORE = /^(([0-9]|1[0-9]|2[0-3])(,[0-9]{1,2})?|24(,0{1,2})?)$/;
const RE_IMPORTO = /^[0-9]{1,7}(,[0-9]{1,2})?$/;

let timerAvviso = null;
function avviso(msg, errore) {
  const a = $('#avviso');
  a.textContent = msg; a.className = errore ? 'errore' : ''; a.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => { a.hidden = true; }, errore ? 6000 : 3000);
}
function leggi(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } }

// ============================================================ DATABASE LOCALE (coda offline + cache)
const DB = {
  _db: null,
  open() {
    return new Promise((res, rej) => {
      if (this._db) return res(this._db);
      const r = indexedDB.open('rapportini', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('coda', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async tx(store, modo, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, modo);
      const rq = fn(t.objectStore(store));
      t.oncomplete = () => res(rq ? rq.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  },
  putCoda(v) { return this.tx('coda', 'readwrite', s => s.put(v)); },
  getCoda(id) { return this.tx('coda', 'readonly', s => s.get(id)); },
  delCoda(id) { return this.tx('coda', 'readwrite', s => s.delete(id)); },
  tuttaCoda() { return this.tx('coda', 'readonly', s => s.getAll()); },
  putKV(k, v) { return this.tx('kv', 'readwrite', s => s.put(v, k)); },
  getKV(k) { return this.tx('kv', 'readonly', s => s.get(k)); },
  delKV(k) { return this.tx('kv', 'readwrite', s => s.delete(k)); }
};

// ============================================================ FESTIVITÀ E DATE AMMESSE (stessa logica del server)
function pasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451);
  const mese = Math.floor((hh + l - 7 * m + 114) / 31), giorno = ((hh + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}
function festivi(anno, patrono) {
  const s = {};
  ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26'].forEach(f => { s[anno + '-' + f] = true; });
  s[chiaveG(piuGiorni(pasqua(anno), 1))] = true;
  s[chiaveG(pasqua(anno))] = true;
  const m = String(patrono || '').match(/(\d{1,2})[-\/.](\d{1,2})/);
  if (m) s[anno + '-' + pad(+m[2]) + '-' + pad(+m[1])] = true;
  return s;
}
const isFeriale = d => d.getDay() >= 1 && d.getDay() <= 5;
const isFestivo = (d, pat) => !!festivi(d.getFullYear(), pat)[chiaveG(d)];
function ultimoLavorativoPrec(d, pat) {
  let x = piuGiorni(inizioGiorno(d), -1);
  for (let i = 0; i < 15 && (!isFeriale(x) || isFestivo(x, pat)); i++) x = piuGiorni(x, -1);
  return x;
}
/** oggi, ieri e (se diverso) l'ultimo giorno lavorativo precedente: il lunedì anche il venerdì */
function dateAmmesse(oggi, pat) {
  oggi = inizioGiorno(oggi);
  const ieri = piuGiorni(oggi, -1), ult = ultimoLavorativoPrec(oggi, pat);
  const out = [{ valore: dmy(oggi), etichetta: dmy(oggi) + ' (oggi)' }, { valore: dmy(ieri), etichetta: dmy(ieri) + ' (ieri)' }];
  if (chiaveG(ult) !== chiaveG(ieri)) out.push({ valore: dmy(ult), etichetta: dmy(ult) + ' (ultimo giorno lavorativo)' });
  return out;
}

// ============================================================ ACCESSO CON GOOGLE
function jwtScadenza(t) {
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; }
}
const tokenValido = () => !!S.token && S.tokenExp > Date.now() + 120000;
let attesaToken = null;
function alCredenziale(resp) {
  if (!resp || !resp.credential) return;
  S.token = resp.credential; S.tokenExp = jwtScadenza(S.token);
  scrivi('tk', S.token);
  if (attesaToken) { attesaToken.res(S.token); attesaToken = null; }
  if (S.pendenteLogin) { const f = S.pendenteLogin; S.pendenteLogin = null; f(); }
}
function googlePronto() { return !!(window.google && google.accounts && google.accounts.id); }
function attendiGoogle(ms) {
  return new Promise(res => {
    const t0 = Date.now();
    (function cicla() {
      if (googlePronto()) return res(true);
      if (Date.now() - t0 > ms) return res(false);
      setTimeout(cicla, 200);
    })();
  });
}
let googleInizializzato = false;
function inizializzaGoogle() {
  if (googleInizializzato || !googlePronto()) return;
  google.accounts.id.initialize({
    client_id: CFG.GOOGLE_CLIENT_ID, callback: alCredenziale, auto_select: true,
    cancel_on_tap_outside: false, use_fedcm_for_prompt: true
  });
  googleInizializzato = true;
}
function ottieniToken() {
  if (tokenValido()) return Promise.resolve(S.token);
  if (!googlePronto()) return Promise.reject(new Error('offline'));
  inizializzaGoogle();
  return new Promise((res, rej) => {
    attesaToken = { res, rej };
    try { google.accounts.id.prompt(); } catch (e) { attesaToken = null; return rej(e); }
    setTimeout(() => { if (attesaToken) { attesaToken = null; rej(new Error('login')); } }, 20000);
  });
}

// ============================================================ CHIAMATE AL SERVER
async function chiama(azione, payload, giaRiprovato) {
  let tok;
  try { tok = await ottieniToken(); } catch (e) { throw { codice: 'AUTHNEED', errore: 'Accesso necessario' }; }
  let r, j;
  try {
    r = await fetch(CFG.API_URL, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ azione: azione, token: tok }, payload || {}))
    });
  } catch (e) { throw { codice: 'RETE', errore: 'Nessuna connessione' }; }
  try { j = await r.json(); } catch (e) { throw { codice: 'RETE', errore: 'Risposta non valida dal server' }; }
  if (!j.ok) {
    if (j.codice === 'AUTH' && !giaRiprovato) { S.token = null; S.tokenExp = 0; scrivi('tk', null); return chiama(azione, payload, true); }
    throw j;
  }
  return j.dati;
}
async function caricaSessione() {
  const d = await chiama('sessione');
  S.dati = d; S.utente = d.utente;
  await DB.putKV('sessione', d);
  return d;
}

// ============================================================ CODA DI INVIO (offline)
const blobToBase64 = blob => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result).split(',')[1]);
  fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(blob);
});
async function accoda(tipo, payload, extra) {
  const it = Object.assign({ id: uuid(), tipo: tipo, payload: payload, creatoIl: Date.now(), stato: 'attesa', errore: '' }, extra || {});
  await DB.putCoda(it);
  await aggiornaStato();
  return it;
}
async function richiestaDa(it) {
  const body = Object.assign({}, it.payload, { idRichiesta: it.id, creatoIl: it.creatoIl });
  if (it.tipo === 'foto') body.dati = await blobToBase64(it.blob);
  return body;
}
let invioInCorso = false;
/** Invia in ordine tutto ciò che è in coda. Si ferma alla prima mancanza di rete; gli errori di validazione restano segnati. */
async function svuotaCoda(progresso) {
  if (invioInCorso || !navigator.onLine) return { inviati: 0, errori: 0 };
  invioInCorso = true;
  let inviati = 0, errori = 0;
  try {
    const tutti = (await DB.tuttaCoda()).filter(i => i.stato !== 'errore').sort((a, b) => a.creatoIl - b.creatoIl);
    for (const it of tutti) {
      try {
        await chiama(it.tipo, await richiestaDa(it));
        await DB.delCoda(it.id);
        inviati++;
        if (progresso) progresso(inviati + errori, tutti.length);
      } catch (e) {
        if (e && (e.codice === 'VALID' || e.codice === 'NOAUT')) {
          it.stato = 'errore'; it.errore = e.errore || 'Errore'; await DB.putCoda(it);
          errori++;
          if (progresso) progresso(inviati + errori, tutti.length);
          continue;
        }
        break;                                   // rete, accesso o server: si riprova più tardi
      }
    }
  } finally { invioInCorso = false; await aggiornaStato(); }
  return { inviati: inviati, errori: errori };
}
async function nInCoda() { try { return (await DB.tuttaCoda()).length; } catch (e) { return 0; } }
async function aggiornaStato() {
  const n = await nInCoda();
  const p = $('#stato');
  const online = navigator.onLine;
  p.textContent = (online ? 'online' : 'offline') + (n ? ' · ' + n + ' da inviare' : '');
  p.className = 'pill' + (online ? '' : ' offline');
  S.nCoda = n;
}

// ============================================================ NAVIGAZIONE
function mostra(titolo, contenuto, opz) {
  opz = opz || {};
  $('#titolo').textContent = titolo;
  $('#indietro').hidden = !opz.indietro;
  const app = $('#app');
  app.replaceChildren(...[].concat(contenuto));
  window.scrollTo(0, 0);
}
function vai(vista, arg) {
  S.pila.push([vista, arg]);
  vista(arg);
}
function indietro() {
  S.pila.pop();
  const p = S.pila[S.pila.length - 1];
  if (p) p[0](p[1]); else vistaHome();
}
function home() { S.pila = []; vistaHome(); }

// ============================================================ COMPONENTI
function campo(etichetta, input, aiuto) {
  return h('div', {}, h('label', {}, etichetta), input, aiuto ? h('div', { class: 'aiuto' }, aiuto) : null);
}
function selezione(opzioni, valore) {
  return h('select', { value: valore }, opzioni.map(o => h('option', { value: o[0] }, o[1])));
}
function selezioneConFiltro(opzioni, valore) {
  const sel = selezione(opzioni, valore);
  const f = h('input', {
    type: 'search', placeholder: 'Cerca…', oninput: () => {
      const q = f.value.trim().toLowerCase(), corrente = sel.value;
      const filtrate = opzioni.filter(o => !q || o[1].toLowerCase().includes(q));
      sel.replaceChildren(...filtrate.map(o => h('option', { value: o[0] }, o[1])));
      if (filtrate.some(o => o[0] === corrente)) sel.value = corrente;
    }
  });
  return { el: h('div', {}, opzioni.length > 8 ? f : null, sel), sel: sel };
}
function segna(el, errore) { el.classList.toggle('err-campo', !!errore); }

// ============================================================ VISTE
function vistaLogin(messaggio) {
  $('#stato').textContent = navigator.onLine ? 'online' : 'offline';
  const cont = h('div', { id: 'btn-google', style: 'display:flex;justify-content:center;margin:20px 0' });
  mostra('Rapportini', [
    h('h2', { class: 'centro' }, 'Accedi'),
    h('p', { class: 'centro' }, 'Usa l\'account Google comunicato all\'amministrazione.'),
    messaggio ? h('div', { class: 'banner' }, messaggio) : null,
    cont,
    navigator.onLine ? null : h('div', { class: 'banner' }, 'Sei offline: per il primo accesso serve la connessione.')
  ]);
  attendiGoogle(8000).then(ok => {
    if (!ok) { cont.append(h('p', {}, 'Servizio di accesso Google non raggiungibile. Controlla la connessione.')); return; }
    inizializzaGoogle();
    S.pendenteLogin = async () => {
      try { await caricaSessione(); S.pila = []; vistaHome(); sincronizza(true); }
      catch (e) { vistaLogin(e && e.errore ? e.errore : 'Accesso non riuscito'); }
    };
    google.accounts.id.renderButton(cont, { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'it', shape: 'pill' });
  });
}

function vistaHome() {
  const d = S.dati;
  const sessioneScaduta = !tokenValido();
  const bottoneAccesso = h('div', { id: 'btn-ri-accesso', style: 'margin-top:8px' });
  mostra('Rapportini', [
    h('p', {}, 'Ciao ', h('b', {}, S.utente ? S.utente.nome : ''), S.utente && S.utente.ruolo === 'MASTER' ? ' (master)' : ''),
    sessioneScaduta && navigator.onLine ? h('div', { class: 'banner' }, 'Sessione scaduta: accedi di nuovo per inviare i dati.', bottoneAccesso) : null,
    h('div', { class: 'griglia' },
      tile('📝', 'Rapportino', () => vai(vistaRapportino)),
      tile('📷', 'Foto', () => vai(vistaFoto)),
      tile('🏗️', 'Cliente / Lavoro', () => vai(vistaCliente)),
      tile('🌴', 'Ferie', () => vai(vistaFerie))),
    h('button', { class: 'sec', onclick: () => vai(vistaStorico) }, 'I miei ultimi rapportini'),
    h('button', { class: 'sec', onclick: () => vai(vistaCoda) }, 'Da inviare / sincronizza'),
    h('button', { class: 'sec', onclick: esci }, 'Esci'),
    h('p', { class: 'aiuto centro', style: 'margin-top:18px' }, 'Versione ' + CFG.VERSIONE + (d ? '' : ' · dati non ancora scaricati'))
  ]);
  if (sessioneScaduta && navigator.onLine && googlePronto()) {
    inizializzaGoogle();
    google.accounts.id.renderButton(bottoneAccesso, { theme: 'filled_blue', size: 'medium', text: 'signin_with', locale: 'it' });
    S.pendenteLogin = () => { vistaHome(); sincronizza(true); };
  }
}
function tile(icona, testo, fn) { return h('button', { class: 'tile', onclick: fn }, h('span', {}, icona), testo); }

async function esci() {
  if (!confirm('Uscire dall\'applicazione? I dati non ancora inviati restano sul telefono.')) return;
  S.token = null; S.tokenExp = 0; S.utente = null; S.dati = null;
  scrivi('tk', null);
  await DB.delKV('sessione');
  try { if (googlePronto()) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignora */ }
  S.pila = [];
  vistaLogin();
}

// ---------- Rapportino
function vistaRapportino(pre) {
  pre = pre || {};
  const d = S.dati, ult = leggi('ultime', {});
  if (!d) { mostra('Rapportino', h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.'), { indietro: true }); return; }
  const master = S.utente.ruolo === 'MASTER';
  const ammesse = dateAmmesse(new Date(), d.patrono);
  const selData = selezione(ammesse.map(a => [a.valore, a.etichetta]), ammesse[0].valore);
  const selConto = master ? selezione([['', '(per me stesso)']].concat(d.utenti.map(n => [n, n])), '') : null;
  const opLavori = d.lavori.map(l => [l.etichetta, l.etichetta]);
  const lav = selezioneConFiltro(opLavori, pre.lavoro || ult.lavoro || (opLavori[0] || [''])[0]);
  const tipoC = h('input', { type: 'radio', name: 'tipo', value: 'CANTIERE', checked: (ult.tipo || 'CANTIERE') === 'CANTIERE' });
  const tipoP = h('input', { type: 'radio', name: 'tipo', value: 'PREPARAZIONE', checked: ult.tipo === 'PREPARAZIONE' });
  const selVeic = selezione([['Nessun veicolo', 'Nessun veicolo']].concat(d.veicoli.map(v => [v, v])), ult.veicolo || 'Nessun veicolo');
  const ore = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 7,5', autocomplete: 'off' });
  const qta = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'facoltativa', autocomplete: 'off' });
  const mat = h('textarea', { placeholder: 'Descrizione dei materiali (facoltativa)' });
  const costo = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 125,50 oppure 0', autocomplete: 'off' });
  const note = h('textarea', { placeholder: 'Note (facoltative)' });
  const invia = h('button', { class: 'pieno', onclick: () => salva() }, 'Invia rapportino');

  async function salva() {
    [ore, costo, lav.sel].forEach(e => segna(e, false));
    let err = '';
    if (!lav.sel.value) { err = 'Scegli il lavoro'; segna(lav.sel, true); }
    else if (!RE_ORE.test(ore.value.trim()) || numIT(ore.value) < 0.25) { err = 'Ore: usa la virgola, da 0,25 a 24 (es. 7,5)'; segna(ore, true); }
    else if (!RE_IMPORTO.test(costo.value.trim())) { err = 'Costo materiali obbligatorio, con la virgola (es. 125,50). Scrivi 0 se non ci sono materiali'; segna(costo, true); }
    else if (qta.value.trim() && !RE_IMPORTO.test(qta.value.trim())) { err = 'Quantità: numero con la virgola'; segna(qta, true); }
    if (err) { avviso(err, true); return; }
    const tipo = tipoP.checked ? 'PREPARAZIONE' : 'CANTIERE';
    const payload = {
      perConto: selConto ? selConto.value : '', data: selData.value, lavoro: lav.sel.value, tipo: tipo,
      veicolo: selVeic.value, ore: numIT(ore.value), qta: qta.value.trim() ? numIT(qta.value) : '',
      materiali: mat.value.trim(), costoMat: numIT(costo.value), note: note.value.trim()
    };
    invia.disabled = true; invia.textContent = 'Invio…';
    try {
      const it = await accoda('rapportino', payload);
      scrivi('ultime', { tipo: tipo, veicolo: selVeic.value, lavoro: lav.sel.value });
      await svuotaCoda();
      const x = await DB.getCoda(it.id);
      if (x && x.stato === 'errore') {                 // rifiutato dal server: si corregge e si riprova
        await DB.delCoda(it.id); await aggiornaStato();
        avviso(x.errore, true);
        invia.disabled = false; invia.textContent = 'Invia rapportino';
        return;
      }
      S.pila = [[vistaHome]];
      vistaEsito(x ? 'coda' : 'ok', 'Rapportino', { lavoro: payload.lavoro });
    } catch (e) {
      avviso('Errore: ' + (e && e.message ? e.message : 'riprova'), true);
      invia.disabled = false; invia.textContent = 'Invia rapportino';
    }
  }

  mostra('Rapportino', [
    selConto ? campo('Compilo per conto di', selConto, 'Solo utenti master') : null,
    campo('Data', selData),
    campo('Cliente | Lavoro', lav.el),
    h('label', {}, 'Tipo di attività'),
    h('div', { class: 'radio' },
      h('label', {}, tipoC, 'Lavoro in cantiere'),
      h('label', {}, tipoP, 'Preparazione materiali / attrezzature')),
    campo('Veicolo utilizzato', selVeic, 'Se usi lo stesso mezzo di un collega scegli lo stesso veicolo: il viaggio è contato una sola volta.'),
    campo('Ore lavorate *', ore, 'Con la virgola per i decimali'),
    campo('Quantità', qta),
    campo('Materiali impiegati', mat, 'Se più colleghi usano gli stessi materiali, inseriscili una sola volta.'),
    campo('Costo materiali (€) *', costo, 'Con la virgola. Scrivi 0 se non ci sono materiali.'),
    campo('Note', note),
    invia
  ], { indietro: true });
}

function vistaEsito(stato, titolo, extra) {
  const inCoda = stato === 'coda';
  mostra(titolo, [
    h('div', { class: 'ok' }, inCoda ? '⏳' : '✔'),
    h('h2', { class: 'centro' }, inCoda ? 'Salvato sul telefono' : 'Registrato'),
    h('p', { class: 'centro' }, inCoda ? 'Verrà inviato appena c\'è connessione.' : 'Operazione completata.'),
    extra && extra.lavoro ? h('button', { class: 'sec', onclick: () => { S.pila = [[vistaHome], [vistaFoto, extra.lavoro]]; vistaFoto(extra.lavoro); } }, '📷 Aggiungi foto a questo lavoro') : null,
    extra && extra.nuovo ? h('button', { class: 'sec', onclick: () => vai(vistaFoto) }, '📷 Vai alle foto') : null,
    h('button', { class: 'pieno', onclick: home }, 'Torna alla home')
  ]);
}

// ---------- Foto (galleria o fotocamera, con riduzione prima dell'invio)
async function caricaBitmap(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* prova con <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, _img: img, close() { } };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
/** Ridimensiona e ricomprime in JPEG fino a rientrare in MAX_KB (riduce prima la qualità, poi le dimensioni). EXIF/GPS eliminati. */
async function comprimi(file) {
  const F = CFG.FOTO;
  const bmp = await caricaBitmap(file);
  let lato = F.MAX_LATO, migliore = null, w = 0, hh = 0;
  try {
    for (let giro = 0; giro < 6; giro++) {
      const sc = Math.min(1, lato / Math.max(bmp.width, bmp.height));
      w = Math.max(1, Math.round(bmp.width * sc)); hh = Math.max(1, Math.round(bmp.height * sc));
      const c = document.createElement('canvas');
      c.width = w; c.height = hh;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      ctx.drawImage(bmp._img || bmp, 0, 0, w, hh);
      for (let q = giro === 0 ? F.QUALITA : Math.min(F.QUALITA, 0.7); q >= 0.44; q -= 0.08) {
        const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
        if (!blob) throw new Error('compressione non riuscita');
        if (!migliore || blob.size < migliore.blob.size) migliore = { blob: blob, w: w, h: hh };
        if (blob.size <= F.MAX_KB * 1024) return migliore;
      }
      lato = Math.round(lato * 0.8);
    }
  } finally { if (bmp.close) bmp.close(); }
  return migliore;
}

function vistaFoto(preLavoro) {
  const d = S.dati, F = CFG.FOTO;
  if (!d) { mostra('Foto', h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.'), { indietro: true }); return; }
  const ult = leggi('ultime', {});
  const opLavori = d.lavori.map(l => [l.etichetta, l.etichetta]);
  const lav = selezioneConFiltro(opLavori, typeof preLavoro === 'string' ? preLavoro : (ult.lavoro || (opLavori[0] || [''])[0]));
  const elenco = [];                                           // {blob, nome, orig, w, h, url}
  const griglia = h('div', { class: 'miniature' });
  const riepilogo = h('p', { class: 'aiuto' });
  const prog = h('div', { class: 'barra-prog', hidden: true }, h('div'));
  const btnCarica = h('button', { class: 'pieno', disabled: true, onclick: () => carica() }, 'Carica foto');
  const inGalleria = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: ev => aggiungi(ev.target) });
  const inCamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: ev => aggiungi(ev.target) });

  function ridisegna() {
    griglia.replaceChildren(...elenco.map((f, i) => h('div', { class: 'mini' },
      h('img', { src: f.url, alt: 'foto ' + (i + 1) }),
      h('small', {}, fmtKB(f.orig) + ' → ' + fmtKB(f.blob.size)),
      h('button', { 'aria-label': 'Rimuovi', onclick: () => { URL.revokeObjectURL(f.url); elenco.splice(i, 1); ridisegna(); } }, '✕'))));
    const tot = elenco.reduce((s, f) => s + f.blob.size, 0), orig = elenco.reduce((s, f) => s + f.orig, 0);
    riepilogo.textContent = elenco.length ? elenco.length + ' foto · da inviare ' + fmtKB(tot) + ' (originali ' + fmtKB(orig) + ')' : '';
    btnCarica.disabled = !elenco.length;
    btnCarica.textContent = elenco.length ? 'Carica ' + elenco.length + (elenco.length === 1 ? ' foto' : ' foto') : 'Carica foto';
  }
  async function aggiungi(input) {
    const files = Array.from(input.files || []);
    input.value = '';
    for (let i = 0; i < files.length; i++) {
      if (elenco.length >= F.MAX_FILE) { avviso('Massimo ' + F.MAX_FILE + ' foto per invio', true); break; }
      riepilogo.textContent = 'Riduco le foto… ' + (i + 1) + '/' + files.length;
      try {
        const r = await comprimi(files[i]);
        elenco.push({ blob: r.blob, nome: files[i].name, orig: files[i].size, w: r.w, h: r.h, url: URL.createObjectURL(r.blob) });
      } catch (e) { avviso('Formato non supportato: ' + files[i].name, true); }
      ridisegna();
    }
    ridisegna();
  }
  async function carica() {
    if (!lav.sel.value) { avviso('Scegli il lavoro', true); return; }
    btnCarica.disabled = true; prog.hidden = false;
    const lavoro = lav.sel.value, n = elenco.length;
    scrivi('ultime', Object.assign(leggi('ultime', {}), { lavoro: lavoro }));
    try {
      for (const f of elenco) await accoda('foto', { lavoro: lavoro }, { blob: f.blob });
      elenco.forEach(f => URL.revokeObjectURL(f.url)); elenco.length = 0; ridisegna();
      const r = await svuotaCoda((fatti, tot) => { prog.firstChild.style.width = Math.round(fatti / tot * 100) + '%'; });
      prog.hidden = true;
      const rimaste = await nInCoda();
      if (r.errori) avviso(r.errori + ' foto non accettate: vedi "Da inviare"', true);
      else if (rimaste) avviso(n + ' foto salvate sul telefono: partiranno appena c\'è connessione');
      else avviso(n + (n === 1 ? ' foto caricata' : ' foto caricate') + ' ✔');
    } catch (e) { prog.hidden = true; avviso('Errore: ' + (e && e.message ? e.message : 'riprova'), true); }
    btnCarica.textContent = 'Carica foto';
  }

  mostra('Foto', [
    campo('Cliente | Lavoro', lav.el, 'Le foto vengono salvate nella cartella di questo lavoro.'),
    h('button', { class: 'sec', onclick: () => inGalleria.click() }, '🖼️ Scegli dalla galleria'),
    h('button', { class: 'sec', onclick: () => inCamera.click() }, '📷 Scatta una foto'),
    inGalleria, inCamera, riepilogo, griglia, prog, btnCarica,
    h('p', { class: 'aiuto' }, 'Le foto vengono ridotte (max ' + F.MAX_LATO + ' px, circa ' + F.MAX_KB + ' KB ciascuna) prima dell\'invio. Posizione GPS e altri dati nascosti vengono eliminati.')
  ], { indietro: true });
  ridisegna();
}

// ---------- Cliente / Lavoro
function vistaCliente() {
  const d = S.dati;
  if (!d) { mostra('Cliente / Lavoro', h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.'), { indietro: true }); return; }
  const NUOVO = '__nuovo__';
  const selCli = selezione([[NUOVO, '➕ NUOVO CLIENTE']].concat(d.clienti.map(c => [c, c])), d.clienti[0] || NUOVO);
  const nome = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Cognome e Nome oppure Ragione sociale' });
  const sede = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Via, numero, CAP, città' });
  const uguale = h('input', { type: 'radio', name: 'ub', checked: true }), diversa = h('input', { type: 'radio', name: 'ub' });
  const ubic = h('input', { type: 'text', placeholder: 'Indirizzo cantiere (se diverso)', autocomplete: 'off' });
  const cf = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off' });
  const piva = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  const t1 = h('input', { type: 'tel' }), t2 = h('input', { type: 'tel' }), t3 = h('input', { type: 'tel' });
  const email = h('input', { type: 'email', autocomplete: 'off' });
  const tipologia = selezione(d.tipologie.map(t => [t, t]), d.tipologie[0] || '');
  const descr = h('input', { type: 'text', placeholder: 'Utile per distinguere più lavori simili (facoltativa)' });
  const ubicLav = h('input', { type: 'text', placeholder: 'Solo se diverso da quello del cliente (facoltativo)' });
  const sezNuovo = h('div', {},
    h('div', { class: 'sezione' }),
    campo('Cognome e Nome – Ragione sociale *', nome),
    campo('Indirizzo residenza / sede *', sede),
    h('label', {}, 'Ubicazione cantiere'),
    h('div', { class: 'radio' }, h('label', {}, uguale, 'Uguale alla sede'), h('label', {}, diversa, 'Diversa')),
    campo('Indirizzo ubicazione cantiere (se diversa)', ubic),
    campo('Codice fiscale', cf), campo('Partita IVA', piva),
    campo('Telefono 1 *', t1), campo('Telefono 2', t2), campo('Telefono 3', t3),
    campo('Email del cliente', email));
  const invia = h('button', { class: 'pieno', onclick: () => salva() }, 'Registra');
  function aggiorna() { sezNuovo.hidden = selCli.value !== NUOVO; }
  selCli.addEventListener('change', aggiorna);

  async function salva() {
    const nuovo = selCli.value === NUOVO;
    let err = '';
    if (nuovo && !nome.value.trim()) err = 'Inserisci cognome e nome / ragione sociale';
    else if (nuovo && !sede.value.trim()) err = 'Inserisci l\'indirizzo di residenza / sede';
    else if (nuovo && !t1.value.trim()) err = 'Inserisci almeno il telefono 1';
    else if (nuovo && email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) err = 'Email del cliente non valida';
    else if (!tipologia.value) err = 'Scegli la tipologia di attività';
    if (err) { avviso(err, true); return; }
    const payload = {
      nuovo: nuovo, cliente: nuovo ? '' : selCli.value, nome: nome.value.trim(), sede: sede.value.trim(),
      ubicDiversa: diversa.checked, ubic: ubic.value.trim(), cf: cf.value.trim().toUpperCase(), piva: piva.value.trim(),
      t1: t1.value.trim(), t2: t2.value.trim(), t3: t3.value.trim(), email: email.value.trim(),
      tipologia: tipologia.value, descr: descr.value.trim(), ubicLavoro: ubicLav.value.trim()
    };
    invia.disabled = true; invia.textContent = 'Invio…';
    try {
      const it = await accoda('cliente', payload);
      await svuotaCoda();
      const x = await DB.getCoda(it.id);
      if (x && x.stato === 'errore') {
        await DB.delCoda(it.id); await aggiornaStato();
        avviso(x.errore, true); invia.disabled = false; invia.textContent = 'Registra'; return;
      }
      if (!x) { try { await caricaSessione(); } catch (e) { /* ignora */ } }
      S.pila = [[vistaHome]];
      vistaEsito(x ? 'coda' : 'ok', 'Cliente / Lavoro', { nuovo: true });
    } catch (e) { avviso('Errore: ' + (e && e.message ? e.message : 'riprova'), true); invia.disabled = false; invia.textContent = 'Registra'; }
  }

  mostra('Cliente / Lavoro', [
    campo('Cliente', selCli, 'Scegli un cliente esistente per aggiungere un nuovo lavoro, oppure registra un nuovo cliente.'),
    sezNuovo,
    h('div', { class: 'sezione' }),
    h('h2', {}, 'Attività richiesta'),
    campo('Tipologia di attività *', tipologia),
    campo('Descrizione / riferimento', descr),
    campo('Indirizzo cantiere di questo lavoro', ubicLav),
    invia
  ], { indietro: true });
  aggiorna();
}

// ---------- Ferie
function vistaFerie() {
  const d = S.dati;
  if (!d) { mostra('Ferie', h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.'), { indietro: true }); return; }
  const master = S.utente.ruolo === 'MASTER';
  const selConto = master ? selezione([['', '(per me stesso)']].concat(d.utenti.map(n => [n, n])), '') : null;
  const oggi = chiaveG(new Date());
  const dal = h('input', { type: 'date', min: oggi }), al = h('input', { type: 'date', min: oggi });
  const note = h('textarea', { placeholder: 'Note (facoltative)' });
  const invia = h('button', { class: 'pieno', onclick: () => salva() }, 'Invia richiesta ferie');
  const conv = v => v.split('-').reverse().join('-');
  async function salva() {
    if (!dal.value || !al.value) { avviso('Indica il primo e l\'ultimo giorno', true); return; }
    if (al.value < dal.value) { avviso('L\'ultimo giorno è precedente al primo', true); return; }
    invia.disabled = true; invia.textContent = 'Invio…';
    try {
      const it = await accoda('ferie', { perConto: selConto ? selConto.value : '', dal: conv(dal.value), al: conv(al.value), note: note.value.trim() });
      await svuotaCoda();
      const x = await DB.getCoda(it.id);
      if (x && x.stato === 'errore') {
        await DB.delCoda(it.id); await aggiornaStato();
        avviso(x.errore, true); invia.disabled = false; invia.textContent = 'Invia richiesta ferie'; return;
      }
      S.pila = [[vistaHome]];
      vistaEsito(x ? 'coda' : 'ok', 'Ferie', {});
    } catch (e) { avviso('Errore: ' + (e && e.message ? e.message : 'riprova'), true); invia.disabled = false; invia.textContent = 'Invia richiesta ferie'; }
  }
  mostra('Ferie', [
    selConto ? campo('Richiesta per conto di', selConto, 'Solo utenti master') : null,
    campo('Primo giorno di ferie', dal), campo('Ultimo giorno di ferie', al),
    h('p', { class: 'aiuto' }, 'Sabati, domeniche e festività non vengono contati.'),
    campo('Note', note), invia
  ], { indietro: true });
}

// ---------- Storico
async function vistaStorico() {
  mostra('I miei rapportini', h('p', { class: 'centro' }, 'Caricamento…'), { indietro: true });
  try {
    const righe = await chiama('storico');
    mostra('I miei rapportini', righe.length ? righe.map(r => h('div', { class: 'riga' },
      h('b', {}, r.data + ' · ' + r.ore.toString().replace('.', ',') + ' h'),
      h('small', {}, r.lavoro + ' · ' + (r.tipo === 'PREPARAZIONE' ? 'preparazione' : 'cantiere') + (r.veicolo && r.veicolo !== 'Nessun veicolo' ? ' · ' + r.veicolo : ''))))
      : h('p', {}, 'Nessun rapportino negli ultimi 35 giorni.'), { indietro: true });
  } catch (e) {
    mostra('I miei rapportini', h('div', { class: 'banner' }, e && e.codice === 'RETE' ? 'Sei offline: lo storico si vede solo online.' : (e && e.errore) || 'Impossibile leggere lo storico.'), { indietro: true });
  }
}

// ---------- Coda
function descrizione(it) {
  const p = it.payload || {};
  if (it.tipo === 'rapportino') return '📝 ' + p.data + ' · ' + p.lavoro + ' · ' + String(p.ore).replace('.', ',') + ' h';
  if (it.tipo === 'foto') return '📷 ' + p.lavoro + ' · ' + fmtKB(it.blob ? it.blob.size : 0);
  if (it.tipo === 'cliente') return '🏗️ ' + (p.nuovo ? p.nome : p.cliente) + ' · ' + p.tipologia;
  if (it.tipo === 'ferie') return '🌴 dal ' + p.dal + ' al ' + p.al;
  return it.tipo;
}
async function vistaCoda() {
  const items = (await DB.tuttaCoda()).sort((a, b) => a.creatoIl - b.creatoIl);
  const btn = h('button', { class: 'pieno', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Invio…';
    if (!tokenValido()) { try { await ottieniToken(); } catch (e) { avviso('Accedi di nuovo (torna alla home)', true); } }
    const r = await svuotaCoda();
    avviso(r.inviati ? r.inviati + ' inviati' : 'Niente da inviare o nessuna connessione', !r.inviati);
    vistaCoda();
  } }, 'Invia ora');
  mostra('Da inviare', [
    items.length ? btn : h('p', { class: 'centro' }, 'Niente da inviare. ✔'),
    items.map(it => h('div', { class: 'riga' + (it.stato === 'errore' ? ' errore' : '') },
      descrizione(it),
      h('small', {}, it.stato === 'errore' ? 'Non accettato: ' + it.errore : 'In attesa di invio'),
      h('div', { style: 'display:flex;gap:8px;margin-top:6px' },
        it.stato === 'errore' ? h('button', { class: 'sec', style: 'margin:0;padding:8px', onclick: async () => { it.stato = 'attesa'; it.errore = ''; await DB.putCoda(it); vistaCoda(); } }, 'Riprova') : null,
        h('button', { class: 'sec', style: 'margin:0;padding:8px', onclick: async () => { if (confirm('Eliminare questo elemento?')) { await DB.delCoda(it.id); await aggiornaStato(); vistaCoda(); } } }, 'Elimina')))),
  ], { indietro: true });
}

// ============================================================ SINCRONIZZAZIONE E AVVIO
let sincronizzando = false;
async function sincronizza(silenzioso) {
  if (sincronizzando || !navigator.onLine || !S.utente) return;
  sincronizzando = true;
  try {
    if (await nInCoda()) {
      const r = await svuotaCoda();
      if (!silenzioso && r.inviati) avviso(r.inviati + ' elementi inviati ✔');
    }
    try { await caricaSessione(); } catch (e) {
      if (e && e.codice === 'NOAUT') { avviso(e.errore, true); await esci2(); }
    }
  } finally { sincronizzando = false; await aggiornaStato(); }
}
async function esci2() {   // utente non più autorizzato
  S.token = null; S.tokenExp = 0; S.utente = null; S.dati = null; scrivi('tk', null);
  await DB.delKV('sessione');
  vistaLogin('Questo account non è autorizzato. Contatta l\'amministrazione.');
}

async function avvio() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  $('#indietro').addEventListener('click', indietro);
  window.addEventListener('online', () => { aggiornaStato(); sincronizza(true); });
  window.addEventListener('offline', aggiornaStato);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sincronizza(true); });
  setInterval(() => { if (S.nCoda) sincronizza(true); }, 60000);

  S.token = leggi('tk', null); S.tokenExp = S.token ? jwtScadenza(S.token) : 0;
  let cache = null;
  try { cache = await DB.getKV('sessione'); } catch (e) { /* ignora */ }
  await aggiornaStato();
  attendiGoogle(6000).then(ok => { if (ok) inizializzaGoogle(); });

  if (cache && cache.utente) {
    S.dati = cache; S.utente = cache.utente; vistaHome();
    sincronizza(true);
  } else if (tokenValido()) {
    try { await caricaSessione(); vistaHome(); sincronizza(true); } catch (e) { vistaLogin(e && e.errore); }
  } else {
    vistaLogin();
  }
}
avvio();
