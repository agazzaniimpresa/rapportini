'use strict';
/* Rapportini v5 - app web installabile (PWA).
   Calendario lavori -> orari inizio/fine -> bozze (sezione Rapportini) -> invio. Nessuna dipendenza esterna tranne "Accedi con Google". */
const DEF = {
  FOTO: { MAX_LATO: 1600, QUALITA: 0.72, MAX_KB: 400, MAX_FILE: 30 },
  DOC: { MAX_LATO: 2000, QUALITA: 0.8, MAX_KB: 700, MAX_FILE: 15, MAX_PDF_MB: 6 }
};
const CFG = Object.assign({}, window.APP_CONFIG || {});
CFG.FOTO = Object.assign({}, DEF.FOTO, CFG.FOTO || {});
CFG.DOC = Object.assign({}, DEF.DOC, CFG.DOC || {});
CFG.VERSIONE = '5.1.0';                        // la versione è quella dell'app, non quella scritta in config.js
const serverVecchio = () => { const v = String((S.dati && S.dati.versioneApi) || '0').split('.').map(Number); return v[0] < 5 || (v[0] === 5 && (v[1] || 0) < 1); };
const S = { utente: null, dati: null, anag: [], vociBase: [], vociAltro: [], condivise: [], coda: [], token: null, tokenExp: 0, pila: [], tk: 0,
  cal: { giorno: null, utente: '' }, tmp: {}, risultati: {}, filtroBozze: '' };

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
const GIORNI_IT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const parseDMY = s => { const m = String(s || '').match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
const hhmm = ms => { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const minDa = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; };
const hmDaMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const r2 = n => Math.round(n * 100) / 100;
const oreIT = n => String(r2(n)).replace('.', ',');
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const fmtKB = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const numIT = s => parseFloat(String(s).trim().replace(',', '.'));
const RE_ORE = /^(([0-9]|1[0-9]|2[0-3])(,[0-9]{1,2})?|24(,0{1,2})?)$/;
const RE_IMPORTO = /^[0-9]{1,7}(,[0-9]{1,2})?$/;
const NESSUN_VEICOLO = 'Nessun veicolo';
const giornoLungo = d => GIORNI_IT[d.getDay()] + ' ' + d.getDate() + ' ' + MESI_IT[d.getMonth()] + ' ' + d.getFullYear();

let timerAvviso = null;
function avviso(msg, errore) {
  const a = $('#avviso');
  a.textContent = msg; a.className = errore ? 'errore' : ''; a.hidden = false;
  clearTimeout(timerAvviso);
  timerAvviso = setTimeout(() => { a.hidden = true; }, errore ? 7000 : 3200);
}
function leggi(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
function scrivi(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } }

// icone (stile lineare)
const ICO = {
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  rapportini: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><polyline points="9 14 11.5 16.5 15.5 12"/>',
  foto: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  clienti: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  ferie: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>',
  storico: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  coda: '<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
  esci: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>', stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>', plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22 6 12 13 2 6"/>',
  matita: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
};
function ico(nome, cls) {
  const s = document.createElement('span');
  s.className = 'ico' + (cls ? ' ' + cls : '');
  s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICO[nome] || '') + '</svg>';
  return s;
}

// ============================================================ DATABASE LOCALE
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
const googlePronto = () => !!(window.google && google.accounts && google.accounts.id);
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
  google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: alCredenziale, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true });
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
    r = await fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ azione: azione, token: tok }, payload || {})) });
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
async function caricaAnagrafica() { S.anag = await chiama('anagrafica'); await DB.putKV('anagrafica', S.anag); return S.anag; }
async function aggiornaVoci() {
  const d = await chiama('calendario', {});
  S.vociBase = d.voci; await DB.putKV('vociBase', d.voci);
  S.condivise = d.condivise || []; await DB.putKV('condivise', S.condivise);
  return d.voci;
}

// ============================================================ MODIFICHE IN CODA (anche senza rete)
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
  if (it.blob) body.dati = await blobToBase64(it.blob);
  return body;
}
let codaPromise = Promise.resolve();
/** Invia in ordine tutto ciò che è in coda (le esecuzioni si mettono in fila). Si ferma alla prima mancanza di rete. */
function svuotaCoda(progresso) {
  const p = codaPromise.then(() => svuotaReale(progresso));
  codaPromise = p.catch(() => { });
  return p;
}
async function svuotaReale(progresso) {
  if (!navigator.onLine) return { inviati: 0, errori: 0 };
  let inviati = 0, errori = 0;
  try {
    const tutti = (await DB.tuttaCoda()).filter(i => i.stato !== 'errore').sort((a, b) => a.creatoIl - b.creatoIl);
    for (const it of tutti) {
      try {
        const dati = await chiama(it.tipo, await richiestaDa(it));
        S.risultati[it.id] = dati || {};
        await DB.delCoda(it.id);
        inviati++;
        if (progresso) progresso(inviati + errori, tutti.length);
      } catch (e) {
        if (e && (e.codice === 'VALID' || e.codice === 'NOAUT' || e.codice === 'CONF')) {
          it.stato = 'errore'; it.errore = e.errore || 'Errore'; await DB.putCoda(it);
          errori++;
          if (progresso) progresso(inviati + errori, tutti.length);
          continue;
        }
        break;                                   // rete, accesso o server: si riprova più tardi
      }
    }
  } finally { await aggiornaStato(); }
  return { inviati: inviati, errori: errori };
}
async function aggiornaStato() {
  try { S.coda = await DB.tuttaCoda(); } catch (e) { S.coda = []; }
  const n = S.coda.length;
  const p = $('#stato');
  const online = navigator.onLine;
  p.textContent = (online ? 'online' : 'offline') + (n ? ' · ' + n + ' da inviare' : '');
  p.className = 'pill' + (online ? '' : ' offline');
}
/** Registra l'operazione, la invia subito se c'è rete e dice com'è andata: ok / coda / errore */
async function eseguiOp(tipo, payload, extra) {
  const it = await accoda(tipo, payload, extra);
  if (navigator.onLine) await svuotaCoda();
  const x = await DB.getCoda(it.id);
  if (!x) {
    if (/^(cal|bozza|rapportino)/.test(tipo)) { try { await aggiornaVoci(); } catch (e) { /* resta la copia locale */ } }
    return { esito: 'ok', dati: S.risultati[it.id] || {}, it: it };
  }
  if (x.stato === 'errore') { await DB.delCoda(it.id); await aggiornaStato(); return { esito: 'errore', errore: x.errore, it: it }; }
  return { esito: 'coda', it: it };
}

// ============================================================ CALENDARIO: stato locale = dati del server + operazioni ancora in coda
const lavInfo = et => { const l = ((S.dati && S.dati.lavori) || []).find(x => x.etichetta === et) || {}; return { cliente: l.cliente || et, nome: l.nome || '' }; };
const finestraOre = () => (S.dati && S.dati.calendario && S.dati.calendario.finestraOre) || 13;
const maxOreGiorno = () => (S.dati && S.dati.calendario && S.dati.calendario.maxOreGiorno) || 8;
function mancantiBozza(v) {
  const m = [];
  if (!(v.ore >= 0.25)) m.push('ore lavorate');
  if (!v.veicolo) m.push('veicolo');
  if (v.costoMat === '' || v.costoMat === null || v.costoMat === undefined) m.push('costo materiali');
  if (v.noleggio && !(v.costoNol > 0)) m.push('costo noleggio');
  return m;
}
function applicaCoda(base, coda) {
  const out = base.map(v => Object.assign({}, v));
  const per = id => out.find(v => v.id === id);
  const io = S.utente ? S.utente.nome : '';
  coda.filter(i => i.stato !== 'errore').sort((a, b) => a.creatoIl - b.creatoIl).forEach(it => {
    const p = it.payload || {};
    if (it.tipo === 'calAggiungi') {
      if ((p.perConto && p.perConto !== io) || per(it.id)) return;
      const l = lavInfo(p.lavoro);
      out.push({ id: it.id, data: p.data, utente: io, lavoro: p.lavoro, cliente: l.cliente, nome: l.nome, stato: 'PROGRAMMATO', inizio: '', fine: '', ore: 0,
        origine: 'CALENDARIO', chiusura: '', scadenzaTs: 0, scadenza: '', tipo: 'CANTIERE', veicolo: '', materiali: '', costoMat: '', noleggio: false, costoNol: '', note: '', mancanti: [], locale: true, visibileA: visTesto(p.visibileA) });
    } else if (it.tipo === 'calVisibilita') {
      const v = per(p.voce); if (v) v.visibileA = visTesto(p.visibileA);
    } else if (it.tipo === 'calElimina') {
      const i = out.findIndex(v => v.id === p.voce); if (i >= 0) out.splice(i, 1);
    } else if (it.tipo === 'calInizio') {
      const v = per(p.voce);
      if (!v || v.stato !== 'PROGRAMMATO') return;
      const m = minDa(hhmm(it.creatoIl));
      out.filter(x => x.utente === v.utente && x.stato === 'IN_CORSO' && x.id !== v.id && x.data === v.data).forEach(x => {
        const mf = Math.max(m, minDa(x.inizio));
        x.fine = hmDaMin(mf); x.ore = r2((mf - minDa(x.inizio)) / 60); x.stato = 'BOZZA'; x.chiusura = 'CAMBIO';
      });
      const ts = Math.floor(it.creatoIl / 60000) * 60000;
      v.stato = 'IN_CORSO'; v.inizio = hhmm(ts); v.scadenzaTs = ts + finestraOre() * 3600000;
      v.scadenza = hhmm(v.scadenzaTs) + (dmy(new Date(v.scadenzaTs)) !== v.data ? ' del ' + dmy(new Date(v.scadenzaTs)) : '');
    } else if (it.tipo === 'calFine') {
      const v = per(p.voce);
      if (!v || v.stato !== 'IN_CORSO') return;
      const mf = p.modo === 'ALTRO' ? minDa(p.ora) : minDa(hhmm(it.creatoIl));
      if (mf === null || mf <= minDa(v.inizio)) return;
      v.fine = hmDaMin(mf); v.ore = r2((mf - minDa(v.inizio)) / 60); v.stato = 'BOZZA'; v.chiusura = p.modo === 'ALTRO' ? 'ALTRO' : 'ORA';
    } else if (it.tipo === 'calOrari') {
      const v = per(p.voce);
      if (!v) return;
      v.inizio = p.inizio; v.fine = p.fine; v.ore = r2((minDa(p.fine) - minDa(p.inizio)) / 60); v.stato = 'BOZZA'; v.chiusura = 'MASTER';
    } else if (it.tipo === 'bozzaSalva') {
      const v = per(p.voce);
      if (!v || v.stato !== 'BOZZA') return;
      ['tipo', 'veicolo', 'materiali', 'costoMat', 'noleggio', 'costoNol', 'note'].forEach(k => { if (p[k] !== undefined) v[k] = p[k]; });
      if (p.ore !== undefined && p.ore !== '') v.ore = p.ore;
    } else if (it.tipo === 'rapportino') {
      const v = per(p.voce);
      if (v) v.stato = 'INVIATO';
    }
  });
  out.forEach(v => { if (v.stato === 'BOZZA') v.mancanti = mancantiBozza(v); });
  return out;
}
/** visibilità: '' (solo io) | '*' (tutti) | elenco di nomi -> testo come sul server */
const visTesto = x => (x === '*' ? '*' : [].concat(x || []).filter(Boolean).join(';'));
const descVis = x => { const t = visTesto(x); return t === '' ? 'solo tu' : t === '*' ? 'tutti gli utenti' : t.split(';').join(', '); };
const vociOwn = () => applicaCoda(S.vociBase, S.coda);
const vociVisibili = () => (S.cal.utente ? S.vociAltro : vociOwn());
function trovaVoce(id) { return vociOwn().find(v => v.id === id) || S.vociAltro.find(v => v.id === id) || null; }
const ordina = (a, b) => (parseDMY(a.data) - parseDMY(b.data)) || ((a.inizio || '99:99') < (b.inizio || '99:99') ? -1 : 1);

// ============================================================ INTERFACCIA: base
function mostra(titolo, contenuto, opz) {
  opz = opz || {};
  document.body.classList.toggle('login', !!opz.login);
  $('#titolo').textContent = titolo;
  $('#indietro').hidden = !opz.indietro;
  const nodi = [].concat(contenuto).flat(Infinity)
    .filter(x => x !== null && x !== undefined && x !== false)
    .map(x => (x.nodeType ? x : document.createTextNode(String(x))));
  $('#app').replaceChildren(...nodi);
  window.scrollTo(0, 0);
  return ++S.tk;
}
function vai(vista, arg) { S.pila.push([vista, arg]); vista(arg); }
function indietro() {
  chiudiSheet();
  S.pila.pop();
  const p = S.pila[S.pila.length - 1];
  if (p) p[0](p[1]); else vistaHome();
}
function home() { chiudiSheet(); S.pila = []; vistaHome(); }
function rinfresca() { const p = S.pila[S.pila.length - 1]; if (p) p[0](p[1]); else vistaHome(); }

function chiudiSheet() { const o = $('#sheet'); if (o) o.remove(); document.body.classList.remove('blocca'); }
/** Finestra dal basso (menu) o al centro (messaggio). Ritorna la funzione di chiusura. */
function sheet(titolo, sottotitolo, corpo, opz) {
  opz = opz || {};
  chiudiSheet();
  const ov = h('div', { id: 'sheet', class: opz.centrato ? 'centrato' : '', onclick: e => { if (e.target === ov && !opz.fisso) chiudiSheet(); } },
    h('div', { class: 'panel' }, h('div', { class: 'grip' }), titolo ? h('h3', {}, titolo) : null, sottotitolo ? h('div', { class: 'sott' }, sottotitolo) : null, corpo));
  document.body.append(ov); document.body.classList.add('blocca');
  return chiudiSheet;
}
/** Messaggio con bottoni; ritorna il valore del bottone premuto. Non si chiude toccando fuori. */
function modale(titolo, righe, bottoni) {
  return new Promise(res => {
    const corpo = h('div', {}, [].concat(righe).map(r => h('p', { style: 'margin:.5rem 0;line-height:1.45' }, r)),
      bottoni.map(b => h('button', { class: b.classe || 'pieno', onclick: () => { chiudiSheet(); res(b.v); } }, b.t)));
    sheet(titolo, '', corpo, { centrato: true, fisso: true });
  });
}
function campo(etichetta, input, aiuto) {
  return h('div', {}, h('label', {}, etichetta), input, aiuto ? h('div', { class: 'aiuto' }, aiuto) : null);
}
function selezione(opzioni, valore) { return h('select', { value: valore }, opzioni.map(o => h('option', { value: o[0] }, o[1]))); }
function selezioneConFiltro(opzioni, valore) {
  const sel = selezione(opzioni, valore);
  const f = h('input', { type: 'search', placeholder: 'Cerca…', oninput: () => {
    const q = f.value.trim().toLowerCase(), corrente = sel.value;
    const filtrate = opzioni.filter(o => !q || o[1].toLowerCase().includes(q));
    sel.replaceChildren(...filtrate.map(o => h('option', { value: o[0] }, o[1])));
    if (filtrate.some(o => o[0] === corrente)) sel.value = corrente;
  } });
  return { el: h('div', {}, opzioni.length > 8 ? f : null, sel), sel: sel };
}
const segna = (el, err) => el.classList.toggle('err-campo', !!err);
const vuoto = (icona, testo, bottone) => h('div', { class: 'vuoto-msg' }, ico(icona), h('div', {}, testo), bottone || null);
const chip = stato => h('span', { class: 'chip ' + stato.toLowerCase() }, { PROGRAMMATO: 'Da fare', IN_CORSO: 'In corso', BOZZA: 'Bozza', INVIATO: 'Inviato' }[stato] || stato);

// ============================================================ ACCESSO
function vistaLogin(messaggio) {
  const cont = h('div', { class: 'gbtn' });
  const logo = '<svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="8" width="30" height="34" rx="4"/><rect x="17" y="4" width="14" height="8" rx="3" fill="#fff" stroke="none"/><polyline points="16 26 22 32 33 20"/><line x1="16" y1="38" x2="26" y2="38" opacity=".6"/></svg>';
  const l = h('div', { class: 'logo' }); l.innerHTML = logo;
  mostra('Rapportini', h('div', { class: 'login-wrap' },
    h('div', { class: 'login-top' }, l, h('h1', {}, 'Rapportini'), h('p', {}, 'Calendario lavori, orari, rapportini, foto e documenti di cantiere.'),
      h('div', { class: 'funz' }, h('span', {}, 'Calendario'), h('span', {}, 'Orari'), h('span', {}, 'Rapportini'), h('span', {}, 'Foto e DDT'))),
    h('div', { class: 'login-card' }, h('h2', {}, 'Accedi'), h('p', {}, 'Usa l\'account Google comunicato all\'amministrazione.'),
      messaggio ? h('div', { class: 'banner errore' }, messaggio) : null,
      cont,
      navigator.onLine ? null : h('div', { class: 'banner' }, 'Sei offline: per il primo accesso serve la connessione.'),
      h('div', { class: 'nota' }, 'Versione ' + CFG.VERSIONE))), { login: true });
  attendiGoogle(8000).then(ok => {
    if (!ok) { cont.append(h('p', { class: 'muto' }, 'Servizio di accesso Google non raggiungibile. Controlla la connessione.')); return; }
    inizializzaGoogle();
    S.pendenteLogin = async () => {
      try { await caricaSessione(); S.pila = []; vistaHome(); sincronizza(true); }
      catch (e) { vistaLogin(e && e.errore ? e.errore : 'Accesso non riuscito'); }
    };
    google.accounts.id.renderButton(cont, { theme: 'filled_blue', size: 'large', text: 'signin_with', locale: 'it', shape: 'pill', width: 280 });
  });
}
async function esci() {
  if (!(await modale('Uscire?', 'I dati non ancora inviati restano sul telefono.', [{ t: 'Esci', v: true }, { t: 'Annulla', v: false, classe: 'sec' }]))) return;
  S.token = null; S.tokenExp = 0; S.utente = null; S.dati = null; S.vociBase = []; S.condivise = []; S.anag = [];
  scrivi('tk', null);
  await DB.delKV('sessione'); await DB.delKV('vociBase'); await DB.delKV('condivise'); await DB.delKV('anagrafica');
  try { if (googlePronto()) google.accounts.id.disableAutoSelect(); } catch (e) { /* ignora */ }
  S.pila = [];
  vistaLogin();
}

// ============================================================ HOME
function vistaHome() {
  const oggi = new Date(), dOggi = dmy(oggi);
  const voci = vociOwn().filter(v => v.data === dOggi);
  const nBozze = vociOwn().filter(v => v.stato === 'BOZZA').length;
  const inCorso = vociOwn().find(v => v.stato === 'IN_CORSO');
  const scaduta = !tokenValido();
  const bottoneAccesso = h('div', { style: 'margin-top:8px' });
  const vecchioServer = S.dati && serverVecchio();
  mostra('Rapportini', [
    h('div', { class: 'hero' }, h('small', {}, giornoLungo(oggi)), h('b', {}, 'Ciao ' + (S.utente ? S.utente.nome : '') + (S.utente && S.utente.ruolo === 'MASTER' ? ' · master' : '')),
      h('div', { class: 'sint' }, h('span', {}, voci.length + (voci.length === 1 ? ' lavoro oggi' : ' lavori oggi')),
        inCorso ? h('span', {}, '● in corso: ' + (inCorso.cliente || inCorso.lavoro)) : null,
        nBozze ? h('span', {}, nBozze + (nBozze === 1 ? ' bozza da completare' : ' bozze da completare')) : null)),
    vecchioServer ? h('div', { class: 'banner errore' }, 'Il server (Apps Script) non è aggiornato alla versione 5.1: ripubblica il codice come da istruzioni.') : null,
    scaduta && navigator.onLine ? h('div', { class: 'banner' }, 'Sessione scaduta: accedi di nuovo per inviare i dati.', bottoneAccesso) : null,
    h('div', { class: 'griglia' },
      tile('calendario', 'Calendario lavori', () => vai(vistaCalendario)),
      tile('rapportini', 'Rapportini', () => vai(vistaRapportini), nBozze),
      tile('foto', 'Foto', () => vai(vistaFoto)),
      tile('doc', 'DDT · Ricevute · Fatture', () => vai(vistaDocumenti)),
      tile('clienti', 'Clienti / Lavori', () => vai(vistaClienti)),
      tile('ferie', 'Ferie', () => vai(vistaFerie))),
    listaBtn('storico', 'I miei ultimi rapportini', 'Inviati negli ultimi 35 giorni', () => vai(vistaStorico)),
    listaBtn('coda', 'Da inviare / sincronizza', S.coda.length ? S.coda.length + ' elementi in attesa' : 'Tutto inviato', () => vai(vistaCoda)),
    listaBtn('esci', 'Esci', '', esci),
    h('p', { class: 'aiuto centro', style: 'margin-top:18px' }, 'Versione ' + CFG.VERSIONE)
  ]);
  if (scaduta && navigator.onLine && googlePronto()) {
    inizializzaGoogle();
    google.accounts.id.renderButton(bottoneAccesso, { theme: 'filled_blue', size: 'medium', text: 'signin_with', locale: 'it' });
    S.pendenteLogin = () => { vistaHome(); sincronizza(true); };
  }
}
const tile = (icona, testo, fn, badge) => h('button', { class: 'tile', onclick: fn }, ico(icona), testo, badge ? h('span', { class: 'badge' }, badge) : null);
const listaBtn = (icona, testo, sotto, fn) => h('button', { class: 'lista-btn', onclick: fn }, ico(icona), h('div', {}, testo, sotto ? h('small', {}, sotto) : null));

// ============================================================ CALENDARIO LAVORI
function vistaCalendario() {
  if (!S.cal.giorno) S.cal.giorno = inizioGiorno(new Date());
  disegnaCalendario();
  if (navigator.onLine && !S.cal.utente) {
    const prima = JSON.stringify(S.vociBase);
    aggiornaVoci().then(() => { if (JSON.stringify(S.vociBase) !== prima && S.pila.length && S.pila[S.pila.length - 1][0] === vistaCalendario) disegnaCalendario(); }).catch(() => { });
  }
}
function disegnaCalendario() {
  const g = S.cal.giorno, oggi = inizioGiorno(new Date()), dG = dmy(g), eOggi = chiaveG(g) === chiaveG(oggi);
  const master = S.utente.ruolo === 'MASTER';
  const mio = !S.cal.utente;
  const tutte = vociVisibili().filter(v => v.utente === (S.cal.utente || S.utente.nome));
  const delGiorno = tutte.filter(v => v.data === dG).sort(ordina);
  const aperte = eOggi ? tutte.filter(v => v.stato === 'IN_CORSO' && v.data !== dG) : [];
  const condDelGiorno = mio ? S.condivise.filter(v => v.data === dG).sort(ordina) : [];
  const oreTot = r2(delGiorno.filter(v => v.stato === 'BOZZA' || v.stato === 'INVIATO').reduce((t, v) => t + (v.ore || 0), 0));
  const selUtente = master ? h('select', { onchange: async e => {
    S.cal.utente = e.target.value;
    if (S.cal.utente) { try { const d = await chiama('calendario', { perConto: '*' }); S.vociAltro = d.voci; } catch (x) { avviso('Serve la connessione per vedere il calendario di un collega', true); S.cal.utente = ''; } }
    disegnaCalendario();
  } }, h('option', { value: '' }, 'Il mio calendario'), (S.dati.utenti || []).filter(n => n !== S.utente.nome).map(n => h('option', { value: n }, 'Calendario di ' + n))) : null;
  if (selUtente) selUtente.value = S.cal.utente;
  const puoAggiungere = mio ? chiaveG(g) >= chiaveG(oggi) || master : master;
  mostra('Calendario lavori', [
    selUtente,
    h('div', { class: 'giorno-nav' },
      h('button', { 'aria-label': 'Giorno precedente', onclick: () => { S.cal.giorno = piuGiorni(g, -1); disegnaCalendario(); } }, '‹'),
      h('div', { class: 'gd' }, h('b', {}, GIORNI_IT[g.getDay()][0].toUpperCase() + GIORNI_IT[g.getDay()].slice(1) + (eOggi ? '' : ''), eOggi ? h('span', { class: 'oggi-chip' }, 'oggi') : null), h('small', {}, dG)),
      h('button', { 'aria-label': 'Giorno successivo', onclick: () => { S.cal.giorno = piuGiorni(g, 1); disegnaCalendario(); } }, '›')),
    eOggi ? null : h('button', { class: 'sec', style: 'margin-top:6px', onclick: () => { S.cal.giorno = oggi; disegnaCalendario(); } }, 'Torna a oggi'),
    aperte.length ? h('div', { class: 'banner' }, 'Lavoro ancora in corso da un altro giorno: toccalo per registrare la fine.') : null,
    aperte.map(cartaVoce),
    delGiorno.length ? delGiorno.map(cartaVoce) : (aperte.length || condDelGiorno.length ? null : vuoto('calendario', 'Nessun lavoro in programma per questo giorno.')),
    condDelGiorno.length ? [h('h3', { class: 'sez-cond' }, 'Programma condiviso da altri utenti'), condDelGiorno.map(cartaCondivisa)] : null,
    oreTot > 0 ? h('div', { class: 'totale-giorno' }, h('span', {}, 'Ore registrate nel giorno'), h('span', {}, oreIT(oreTot) + ' h')) : null,
    puoAggiungere ? h('button', { class: 'pieno', onclick: () => apriAggiungi(g) }, ico('plus'), 'Aggiungi cliente / lavoro') : null,
    h('p', { class: 'aiuto centro', style: 'margin-top:14px' }, 'Il calendario è solo dell\'app: non usa né modifica Google Calendar. I tasti di inizio e fine lavoro si attivano solo nella giornata in corso.')
  ], { indietro: true });
}
function cartaVoce(v) {
  let tempo = '';
  if (v.stato === 'PROGRAMMATO') tempo = 'Da avviare';
  else if (v.stato === 'IN_CORSO') tempo = 'Iniziato alle ' + v.inizio + ' · fine entro le ' + (v.scadenza || '');
  else tempo = v.inizio + ' → ' + v.fine + ' · ' + oreIT(v.ore) + ' h' + (v.chiusura === 'AUTO' ? ' (fine automatica)' : '');
  return h('button', { class: 'voce s-' + v.stato.toLowerCase(), onclick: () => apriMenuVoce(v) },
    h('div', { class: 'testa' }, h('b', {}, v.cliente || v.lavoro), chip(v.stato)),
    v.nome ? h('div', { class: 'sub' }, v.nome + (v.origine === 'SOPRALLUOGO' ? ' · sopralluogo' : '')) : null,
    h('div', { class: 'tempo' }, tempo),
    v.visibileA ? h('div', { class: 'vis' }, 'Visibile a: ' + descVis(v.visibileA)) : null,
    v.stato === 'BOZZA' && v.mancanti && v.mancanti.length ? h('div', { class: 'man' }, 'Da completare: ' + v.mancanti.join(', ')) : null);
}
/** Attività di un altro utente resa visibile a me: sola lettura */
function cartaCondivisa(v) {
  let tempo = v.stato === 'PROGRAMMATO' ? 'Da avviare' : v.stato === 'IN_CORSO' ? 'In corso dalle ' + v.inizio : v.inizio + ' → ' + v.fine + ' · ' + oreIT(v.ore) + ' h';
  return h('button', { class: 'voce condivisa s-' + v.stato.toLowerCase(), onclick: () => sheet(v.cliente || v.lavoro, (v.nome ? v.nome + ' · ' : '') + v.data,
    h('div', {}, h('div', { class: 'banner info' }, 'Programma di ' + v.utente + ': puoi solo consultarlo. Per registrare il tuo lavoro su questo cliente aggiungilo al tuo calendario.'),
      h('button', { class: 'sec', onclick: chiudiSheet }, 'Chiudi'))) },
    h('div', { class: 'testa' }, h('b', {}, v.cliente || v.lavoro), chip(v.stato)),
    v.nome ? h('div', { class: 'sub' }, v.nome) : null,
    h('div', { class: 'tempo' }, tempo),
    h('div', { class: 'vis' }, 'di ' + v.utente));
}
/** Scelta di chi può vedere l'attività (oltre a chi la inserisce). valore(): '' | '*' | [nomi] */
function sceltaVisibilita(iniziale) {
  const t = visTesto(iniziale), colleghi = (S.dati && S.dati.colleghi) || [];
  const modo0 = t === '' ? 'solo' : t === '*' ? 'tutti' : 'alcuni';
  const sel0 = t && t !== '*' ? t.split(';') : [];
  const rs = h('input', { type: 'radio', name: 'vis', value: 'solo', checked: modo0 === 'solo' });
  const rt = h('input', { type: 'radio', name: 'vis', value: 'tutti', checked: modo0 === 'tutti' });
  const ra = h('input', { type: 'radio', name: 'vis', value: 'alcuni', checked: modo0 === 'alcuni' });
  const checks = colleghi.map(n => h('input', { type: 'checkbox', value: n, checked: sel0.indexOf(n) >= 0 }));
  const lista = h('div', { class: 'vis-lista', hidden: modo0 !== 'alcuni' }, colleghi.length ? colleghi.map((n, i) => h('label', { class: 'spunta' }, checks[i], n)) : h('div', { class: 'aiuto' }, 'Nessun altro utente attivo.'));
  [rs, rt, ra].forEach(r => r.addEventListener('change', () => { lista.hidden = !ra.checked; }));
  const el = h('div', { class: 'vis-box' }, h('label', {}, 'Chi può vedere questa attività oltre a te?'),
    h('div', { class: 'radio vert' }, h('label', {}, rs, 'Solo io'), h('label', {}, rt, 'Tutti gli utenti'), h('label', {}, ra, 'Solo alcuni utenti')), lista);
  return { el: el, valore: () => (rt.checked ? '*' : ra.checked ? checks.filter(c => c.checked).map(c => c.value) : '') };
}
function apriVisibilita(v) {
  const sc = sceltaVisibilita(v.visibileA);
  sheet('Visibilità nel calendario', (v.cliente || v.lavoro) + ' · ' + v.data,
    h('div', {}, sc.el, h('button', { class: 'pieno', onclick: async () => {
      const val = sc.valore();
      if (Array.isArray(val) && !val.length) { avviso('Scegli almeno un utente, oppure "Solo io"', true); return; }
      chiudiSheet();
      const r = await eseguiOp('calVisibilita', { voce: v.id, visibileA: val });
      if (r.esito === 'errore') avviso(r.errore, true); else avviso(r.esito === 'coda' ? 'Salvato sul telefono: verrà inviato appena c\'è connessione' : 'Visibilità aggiornata');
      if (S.cal.utente) { try { S.vociAltro = (await chiama('calendario', { perConto: '*' })).voci; } catch (e) { /* ignora */ } }
      disegnaCalendario();
    } }, 'Salva')));
}

function apriAggiungi(g) {
  const d = S.dati;
  const op = d.lavori.map(l => [l.etichetta, l.etichetta]);
  const lav = selezioneConFiltro(op, (op[0] || [''])[0]);
  const dG = dmy(g);
  const vis = sceltaVisibilita(leggi('ultime', {}).vis);
  const corpo = h('div', {},
    campo('Cliente | Lavoro', lav.el),
    vis.el,
    h('button', { class: 'pieno', onclick: async () => {
      if (!lav.sel.value) { avviso('Scegli il cliente / lavoro', true); return; }
      const perConto = S.cal.utente || '';
      const visibileA = vis.valore();
      if (Array.isArray(visibileA) && !visibileA.length) { avviso('Scegli almeno un utente, oppure "Solo io"', true); return; }
      scrivi('ultime', Object.assign(leggi('ultime', {}), { vis: visibileA }));
      chiudiSheet();
      const r = await eseguiOp('calAggiungi', { data: dG, lavoro: lav.sel.value, perConto: perConto, visibileA: visibileA });
      if (r.esito === 'errore') avviso(r.errore, true);
      else {
        if (perConto) { try { S.vociAltro = (await chiama('calendario', { perConto: '*' })).voci; } catch (e) { /* ignora */ } }
        avviso(r.esito === 'coda' ? 'Aggiunto sul telefono: verrà inviato appena c\'è connessione' : 'Aggiunto al calendario');
      }
      disegnaCalendario();
    } }, ico('plus'), 'Aggiungi al ' + dG),
    h('button', { class: 'sec', onclick: () => { const v2 = vis.valore(); chiudiSheet(); vai(vistaClienti, { tab: 'nuovo', calendario: dG, visibileA: Array.isArray(v2) && !v2.length ? '' : v2 }); } }, 'Cliente o lavoro non presente? Registra nuovo'));
  sheet('Aggiungi al calendario', 'Giorno ' + dG, corpo);
}

function apriMenuVoce(v) {
  const oggiStr = dmy(new Date()), eOggi = v.data === oggiStr;
  const mio = v.utente === S.utente.nome, master = S.utente.ruolo === 'MASTER';
  const corpo = h('div', {});
  if (v.stato === 'INVIATO') corpo.append(h('div', { class: 'banner info' }, 'Rapportino già inviato (' + v.inizio + ' → ' + v.fine + ', ' + oreIT(v.ore) + ' h).'));
  if (mio) {
    corpo.append(h('button', { class: 'az avvia', disabled: !(eOggi && v.stato === 'PROGRAMMATO'), onclick: () => { chiudiSheet(); registraInizio(v); } }, ico('play'),
      h('div', {}, 'Registra orario inizio lavoro', h('small', {}, v.stato === 'PROGRAMMATO' ? (eOggi ? 'Registra l\'ora e i minuti attuali' : 'Attivo solo nella giornata in corso') : 'Già registrato'))));
    corpo.append(h('button', { class: 'az ferma', disabled: v.stato !== 'IN_CORSO', onclick: () => { chiudiSheet(); apriFine(v); } }, ico('stop'),
      h('div', {}, 'Registra orario fine lavoro', h('small', {}, v.stato === 'IN_CORSO' ? 'Ora attuale oppure un altro orario dello stesso giorno' : 'Prima registra l\'inizio'))));
    corpo.append(h('button', { class: 'az', disabled: v.stato !== 'BOZZA', onclick: () => { chiudiSheet(); vai(vistaBozza, v.id); } }, ico('rapportini'), h('div', {}, 'Completa rapportino', h('small', {}, v.stato === 'BOZZA' ? 'Apre la bozza nella sezione Rapportini' : v.stato === 'INVIATO' ? 'Già inviato' : 'Disponibile dopo inizio e fine lavoro'))));
  }
  if ((mio || master) && v.stato !== 'INVIATO') {
    corpo.append(h('button', { class: 'az', onclick: () => { chiudiSheet(); apriVisibilita(v); } }, ico('clienti'), h('div', {}, 'Chi può vedere questa attività', h('small', {}, 'Ora visibile a: ' + descVis(v.visibileA)))));
  }
  if (master && v.stato !== 'INVIATO') {
    corpo.append(h('button', { class: 'az', onclick: () => { chiudiSheet(); apriOrariMaster(v); } }, ico('matita'), h('div', {}, 'Imposta orari (solo master)', h('small', {}, 'Inserisce inizio e fine di un giorno qualsiasi'))));
  }
  if ((v.stato === 'PROGRAMMATO' && (mio || master)) || (master && v.stato !== 'INVIATO')) {
    corpo.append(h('button', { class: 'peri', onclick: async () => {
      chiudiSheet();
      if (!(await modale('Eliminare dal calendario?', v.lavoro, [{ t: 'Elimina', v: true, classe: 'peri' }, { t: 'Annulla', v: false, classe: 'sec' }]))) return;
      const r = await eseguiOp('calElimina', { voce: v.id });
      if (r.esito === 'errore') avviso(r.errore, true);
      if (S.cal.utente) { try { S.vociAltro = (await chiama('calendario', { perConto: '*' })).voci; } catch (e) { /* ignora */ } }
      disegnaCalendario();
    } }, ico('trash'), 'Elimina dal calendario'));
  }
  sheet(v.cliente || v.lavoro, (v.nome ? v.nome + ' · ' : '') + v.data + (v.utente !== S.utente.nome ? ' · ' + v.utente : ''), corpo);
}

async function registraInizio(v) {
  const r = await eseguiOp('calInizio', { voce: v.id });
  if (r.esito === 'errore') { avviso(r.errore, true); disegnaCalendario(); return; }
  const lista = vociOwn().find(x => x.id === v.id) || {};
  let inizio = (r.dati && r.dati.inizio) || lista.inizio || hhmm(r.it.creatoIl);
  let scad = (r.dati && r.dati.scadenza) || lista.scadenza || '';
  const chiusi = (r.dati && r.dati.chiusi) || [];
  disegnaCalendario();
  await modale('Inizio lavoro registrato', [
    'Inizio alle ' + inizio + ' · ' + (v.cliente || v.lavoro),
    chiusi.length ? 'Il lavoro precedente (' + chiusi.map(c => c.lavoro).join(', ') + ') è stato chiuso con questo orario (' + chiusi.map(c => oreIT(c.ore) + ' h').join(', ') + ').' : null,
    h('b', {}, 'La fine lavoro va registrata entro le ' + scad + ' (' + finestraOre() + ' ore).'),
    'Se entro quell\'orario non la registri, la fine verrà impostata automaticamente: le ore lavorate saranno quelle che mancano per arrivare al massimo di ' + maxOreGiorno() + ' ore complessive nella giornata, tolte quelle già registrate.',
    r.esito === 'coda' ? 'Sei offline: l\'operazione è salvata sul telefono e partirà appena c\'è connessione.' : null
  ], [{ t: 'OK, ho preso visione', v: true }]);
}

function apriFine(v) {
  const adesso = new Date(), stesso = v.data === dmy(adesso), oraStr = hhmm(adesso.getTime());
  const inp = h('input', { type: 'time', value: stesso ? oraStr : '', min: v.inizio, max: stesso ? oraStr : '23:59' });
  const blocco = h('div', { hidden: true }, campo('Orario di fine', inp, 'Deve essere successivo all\'inizio (' + v.inizio + ')' + (stesso ? ' e non oltre l\'ora attuale' : ' e dello stesso giorno (entro le 23:59)')),
    h('button', { class: 'pieno', onclick: () => { const ora = inp.value; if (!controllaFine(v, ora, stesso, oraStr)) return; chiudiSheet(); registraFine(v, 'ALTRO', ora); } }, 'Conferma orario'));
  const corpo = h('div', {},
    h('button', { class: 'az ferma', disabled: !stesso, onclick: () => { chiudiSheet(); registraFine(v, 'ORA'); } }, ico('check'), h('div', {}, 'Registra ora (' + oraStr + ')', h('small', {}, stesso ? 'Usa l\'orario attuale' : 'Giornata già terminata: usa un altro orario'))),
    h('button', { class: 'az', onclick: () => { blocco.hidden = false; inp.focus(); } }, ico('storico'), h('div', {}, 'Registra altro orario', h('small', {}, 'Solo antecedente e dello stesso giorno'))),
    blocco);
  sheet('Fine lavoro', (v.cliente || v.lavoro) + ' · inizio ' + v.inizio, corpo);
}
function controllaFine(v, ora, stesso, oraStr) {
  const mf = minDa(ora), mi = minDa(v.inizio);
  if (mf === null) { avviso('Inserisci l\'orario di fine', true); return false; }
  if (mf <= mi) { avviso('La fine deve essere successiva all\'inizio (' + v.inizio + ')', true); return false; }
  if (stesso && mf > minDa(oraStr)) { avviso('La fine non può essere successiva all\'ora attuale', true); return false; }
  return true;
}
async function registraFine(v, modo, ora) {
  const r = await eseguiOp('calFine', { voce: v.id, modo: modo, ora: ora || '' });
  if (r.esito === 'errore') { avviso(r.errore, true); disegnaCalendario(); return; }
  const aggiornata = vociOwn().find(x => x.id === v.id) || {};
  const ore = (r.dati && r.dati.ore !== undefined) ? r.dati.ore : aggiornata.ore;
  disegnaCalendario();
  const stesso = v.data === dmy(new Date());
  const scelta = await modale('Fine lavoro registrata', [
    (v.cliente || v.lavoro) + ': ' + v.inizio + ' → ' + (aggiornata.fine || '') + ' · ' + oreIT(ore || 0) + ' ore lavorate.',
    'Il rapportino è ora una bozza nella sezione Rapportini. Cosa vuoi fare?',
    r.esito === 'coda' ? 'Sei offline: l\'operazione partirà appena c\'è connessione.' : null
  ], [stesso ? { t: 'Prosegui con la compilazione', v: 'avanti' } : null, { t: 'Salva bozza', v: 'bozza', classe: stesso ? 'sec' : 'pieno' }].filter(Boolean));
  if (scelta === 'avanti') vai(vistaBozza, v.id);
}
function apriOrariMaster(v) {
  const a = h('input', { type: 'time', value: v.inizio || '' }), b = h('input', { type: 'time', value: v.fine || '' });
  const corpo = h('div', {}, h('div', { class: 'riga2' }, campo('Inizio', a), campo('Fine', b)),
    h('button', { class: 'pieno', onclick: async () => {
      if (minDa(a.value) === null || minDa(b.value) === null || minDa(b.value) <= minDa(a.value)) { avviso('Orari non validi: la fine deve seguire l\'inizio', true); return; }
      chiudiSheet();
      const r = await eseguiOp('calOrari', { voce: v.id, inizio: a.value, fine: b.value });
      if (r.esito === 'errore') avviso(r.errore, true); else avviso('Orari impostati: la voce è ora una bozza');
      if (S.cal.utente) { try { S.vociAltro = (await chiama('calendario', { perConto: '*' })).voci; } catch (e) { /* ignora */ } }
      disegnaCalendario();
    } }, 'Salva orari'));
  sheet('Imposta orari', (v.cliente || v.lavoro) + ' · ' + v.data + ' · ' + v.utente, corpo);
}

// ============================================================ RAPPORTINI = SOLO BOZZE
async function vistaRapportini() {
  const master = S.utente.ruolo === 'MASTER';
  const filtro = master ? S.filtroBozze : '';
  const tk = mostra('Rapportini', h('p', { class: 'centro muto' }, 'Caricamento…'), { indietro: true });
  let voci;
  if (filtro) {
    try { S.vociAltro = (await chiama('calendario', { perConto: '*' })).voci; } catch (e) { avviso('Serve la connessione per vedere le bozze dei colleghi', true); S.filtroBozze = ''; return vistaRapportini(); }
    voci = S.vociAltro.filter(v => v.stato === 'BOZZA' && (filtro === '*' || v.utente === filtro));
  } else voci = vociOwn().filter(v => v.stato === 'BOZZA');
  if (tk !== S.tk) return;
  voci.sort((a, b) => (parseDMY(b.data) - parseDMY(a.data)) || (a.inizio < b.inizio ? -1 : 1));
  const sel = master ? h('select', { onchange: e => { S.filtroBozze = e.target.value; vistaRapportini(); } },
    h('option', { value: '' }, 'Le mie bozze'), h('option', { value: '*' }, 'Tutte le bozze'), (S.dati.utenti || []).filter(n => n !== S.utente.nome).map(n => h('option', { value: n }, 'Bozze di ' + n))) : null;
  if (sel) sel.value = filtro;
  mostra('Rapportini', [
    sel,
    h('div', { class: 'banner info' }, 'Qui trovi le bozze dei rapportini: si creano dal Calendario lavori registrando inizio e fine. Completa i dati mancanti e invia.'),
    voci.length ? voci.map(v => h('button', { class: 'voce s-bozza', onclick: () => vai(vistaBozza, v.id) },
      h('div', { class: 'testa' }, h('b', {}, v.cliente || v.lavoro), h('span', { class: 'chip bozza' }, v.data)),
      v.nome ? h('div', { class: 'sub' }, v.nome + (v.utente !== S.utente.nome ? ' · ' + v.utente : '')) : null,
      h('div', { class: 'tempo' }, v.inizio + ' → ' + v.fine + ' · ' + oreIT(v.ore) + ' h'),
      v.mancanti && v.mancanti.length ? h('div', { class: 'man' }, 'Da completare: ' + v.mancanti.join(', ')) : h('div', { class: 'man', style: 'color:var(--ok)' }, 'Pronta per l\'invio')))
      : vuoto('rapportini', 'Nessuna bozza in sospeso.', h('button', { class: 'pieno', onclick: () => { S.pila = [[vistaHome]]; vai(vistaCalendario); } }, ico('calendario'), 'Vai al Calendario lavori'))
  ], { indietro: true });
}

function vistaBozza(arg) {
  const id = typeof arg === 'string' ? arg : arg.id;
  const v = trovaVoce(id);
  const d = S.dati, master = S.utente.ruolo === 'MASTER';
  if (!v || v.stato !== 'BOZZA') {
    mostra('Rapportino', [h('div', { class: 'banner' }, !v ? 'Bozza non trovata: potrebbe essere già stata inviata.' : 'Questo rapportino non è più modificabile.'),
      h('button', { class: 'pieno', onclick: () => indietro() }, 'Torna indietro')], { indietro: true });
    return;
  }
  const tmp = S.tmp[id] || {};
  const val = (k, def) => (tmp[k] !== undefined ? tmp[k] : def);
  const ammessa = master || dateAmmesse(new Date(), d.patrono).some(x => x.valore === v.data);
  const tipoP = val('tipo', v.tipo) === 'PREPARAZIONE';
  const rC = h('input', { type: 'radio', name: 'tipo', value: 'CANTIERE', checked: !tipoP }), rP = h('input', { type: 'radio', name: 'tipo', value: 'PREPARAZIONE', checked: tipoP });
  const veic = selezione([['', '— scegli il veicolo —'], [NESSUN_VEICOLO, 'Nessun veicolo']].concat(d.veicoli.map(x => [x, x])), val('veicolo', v.veicolo || ''));
  const ore = h('input', { type: 'text', inputmode: 'decimal', value: val('ore', oreIT(v.ore)), readonly: !master, autocomplete: 'off' });
  const mat = h('textarea', { placeholder: 'Descrizione dei materiali (facoltativa)' }); mat.value = val('materiali', v.materiali || '');
  const costo = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 125,50 oppure 0', autocomplete: 'off', value: val('costoMat', v.costoMat === '' || v.costoMat === undefined ? '' : String(v.costoMat).replace('.', ',')) });
  const nol = h('input', { type: 'checkbox', checked: val('noleggio', v.noleggio) });
  const costoNol = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'es. 80,00', autocomplete: 'off', value: val('costoNol', v.costoNol === '' || v.costoNol === undefined ? '' : String(v.costoNol).replace('.', ',')) });
  const boxNol = h('div', { hidden: !nol.checked }, campo('Costo noleggio (€) *', costoNol, 'Obbligatorio se hai spuntato il noleggio: compare nel consuntivo e si somma al totale.'));
  nol.addEventListener('change', () => { boxNol.hidden = !nol.checked; });
  const note = h('textarea', { placeholder: 'Esempi:\n• tipo impianto\n• lavorazioni eseguite\n• utilizzo strumentazione ricerca\n• utilizzo macchina relining\n• costi materiali / noleggi da aggiungere…', style: 'min-height:130px' });
  note.value = val('note', v.note || '');
  const invia = h('button', { class: 'pieno', disabled: !ammessa, onclick: () => salva(true) }, 'Invia rapportino');
  const btnBozza = h('button', { class: 'sec', onclick: () => salva(false) }, 'Salva bozza');
  const corpo = h('div', {});
  const leggiForm = () => ({ tipo: rP.checked ? 'PREPARAZIONE' : 'CANTIERE', veicolo: veic.value, ore: ore.value, materiali: mat.value, costoMat: costo.value, noleggio: nol.checked, costoNol: costoNol.value, note: note.value });
  const memorizza = () => { S.tmp[id] = leggiForm(); };
  corpo.addEventListener('input', memorizza); corpo.addEventListener('change', memorizza);

  async function salva(invio) {
    [veic, costo, costoNol, ore].forEach(e => segna(e, false));
    const f = leggiForm();
    let err = '';
    if (master && (!RE_ORE.test(f.ore.trim()) || numIT(f.ore) < 0.25)) { err = 'Ore: usa la virgola, da 0,25 a 24'; segna(ore, true); }
    else if (f.costoMat.trim() && !RE_IMPORTO.test(f.costoMat.trim())) { err = 'Costo materiali: numero con la virgola (es. 125,50)'; segna(costo, true); }
    else if (f.noleggio && f.costoNol.trim() && !RE_IMPORTO.test(f.costoNol.trim())) { err = 'Costo noleggio: numero con la virgola (es. 80,00)'; segna(costoNol, true); }
    if (!err && invio) {
      if (!f.veicolo) { err = 'Il veicolo utilizzato è obbligatorio (scegli "Nessun veicolo" se non ne hai usati)'; segna(veic, true); }
      else if (!f.costoMat.trim()) { err = 'Costo materiali obbligatorio: scrivi 0 se non ci sono materiali'; segna(costo, true); }
      else if (f.noleggio && !(numIT(f.costoNol) > 0)) { err = 'Se hai spuntato il noleggio devi indicarne il costo'; segna(costoNol, true); }
    }
    if (err) { avviso(err, true); return; }
    const payload = { voce: id, tipo: f.tipo, veicolo: f.veicolo, materiali: f.materiali.trim(), costoMat: f.costoMat.trim() ? numIT(f.costoMat) : '',
      noleggio: f.noleggio, costoNol: f.noleggio && f.costoNol.trim() ? numIT(f.costoNol) : '', note: f.note.trim() };
    if (master) payload.ore = numIT(f.ore);
    [invia, btnBozza].forEach(b => { b.disabled = true; });
    const r = await eseguiOp(invio ? 'rapportino' : 'bozzaSalva', payload);
    if (r.esito === 'errore') { avviso(r.errore, true); invia.disabled = !ammessa; btnBozza.disabled = false; return; }
    delete S.tmp[id];
    if (invio) {
      S.pila = [[vistaHome], [vistaRapportini]];
      vistaEsito(r.esito, 'Rapportino', r.esito === 'coda' ? 'Salvato sul telefono: verrà inviato appena c\'è connessione.' : 'Rapportino inviato.', { ritorno: vistaRapportini });
    } else { avviso(r.esito === 'coda' ? 'Bozza salvata sul telefono' : 'Bozza salvata'); indietro(); }
  }
  corpo.append(
    h('div', { class: 'card' }, h('b', {}, v.cliente || v.lavoro), v.nome ? h('div', { class: 'muto' }, v.nome) : null,
      h('div', { style: 'margin-top:6px;font-weight:600;color:var(--blu-scuro)' }, v.data + ' · ' + v.inizio + ' → ' + v.fine),
      v.chiusura === 'AUTO' ? h('div', { class: 'man', style: 'color:var(--warn);margin-top:6px' }, 'Fine impostata automaticamente (limite di ' + maxOreGiorno() + ' ore al giorno): verifica con un master se non è corretta.') : null,
      v.utente !== S.utente.nome ? h('div', { class: 'muto' }, 'Utente: ' + v.utente) : null),
    ammessa ? null : h('div', { class: 'banner errore' }, 'Questa data non è più compilabile (solo oggi, ieri o l\'ultimo giorno lavorativo). Contatta un utente master.'),
    campo('Ore lavorate', ore, master ? 'Come master puoi modificarle.' : 'Calcolate dalle registrazioni di inizio e fine: non modificabili.'),
    h('label', {}, 'Tipo di attività *'),
    h('div', { class: 'radio' }, h('label', {}, rC, 'Lavoro in cantiere'), h('label', {}, rP, 'Preparazione materiali / attrezzature')),
    campo('Veicolo utilizzato *', veic, 'Se usi lo stesso mezzo di un collega scegli lo stesso veicolo: il viaggio è contato una sola volta.'),
    campo('Materiali impiegati', mat, 'Se più colleghi usano gli stessi materiali, inseriscili una sola volta.'),
    campo('Costo materiali (€) *', costo, 'Con la virgola. Scrivi 0 se non ci sono materiali.'),
    h('label', { class: 'spunta' }, nol, 'Attrezzature / macchinari a noleggio'),
    boxNol,
    campo('Note', note),
    h('button', { class: 'sec', onclick: () => { memorizza(); vai(vistaDocumenti, { lavoro: v.lavoro }); } }, ico('doc'), 'DDT · Ricevute · Fatture di questo lavoro'),
    btnBozza, invia);
  mostra('Completa rapportino', corpo, { indietro: true });
}

function vistaEsito(stato, titolo, messaggio, opz) {
  opz = opz || {};
  mostra(titolo, [
    h('div', { class: 'ok' }, stato === 'coda' ? '⏳' : '✔'),
    h('h2', { class: 'centro' }, stato === 'coda' ? 'Salvato sul telefono' : 'Operazione completata'),
    h('p', { class: 'centro' }, messaggio),
    opz.extra || null,
    opz.ritorno ? h('button', { class: 'sec', onclick: () => { opz.ritorno(); } }, 'Torna all\'elenco') : null,
    h('button', { class: 'pieno', onclick: home }, 'Torna alla home')
  ]);
}

// ============================================================ FOTO e DOCUMENTI: riduzione sul telefono prima dell'invio
async function caricaBitmap(file) {
  if (window.createImageBitmap) { try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* prova con <img> */ } }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, _img: img, close() { } };
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
/** Ridimensiona e ricomprime in JPEG fino a rientrare in MAX_KB (prima la qualità, poi le dimensioni). EXIF/GPS eliminati. */
async function comprimi(file, F) {
  const bmp = await caricaBitmap(file);
  let lato = F.MAX_LATO, migliore = null;
  try {
    for (let giro = 0; giro < 6; giro++) {
      const sc = Math.min(1, lato / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * sc)), hh = Math.max(1, Math.round(bmp.height * sc));
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh); ctx.drawImage(bmp._img || bmp, 0, 0, w, hh);
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
/** Schermata di raccolta file (usata da Foto e da DDT-Ricevute-Fatture). tipo: 'foto' | 'documento' */
function vistaRaccolta(tipo, preLavoro) {
  const d = S.dati, doc = tipo === 'documento', F = doc ? CFG.DOC : CFG.FOTO;
  const titolo = doc ? 'DDT · Ricevute · Fatture' : 'Foto';
  if (!d) { mostra(titolo, h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.'), { indietro: true }); return; }
  const ult = leggi('ultime', {});
  const opLavori = d.lavori.map(l => [l.etichetta, l.etichetta]);
  const lav = selezioneConFiltro(opLavori, typeof preLavoro === 'string' && preLavoro ? preLavoro : (ult.lavoro || (opLavori[0] || [''])[0]));
  const tipoDoc = doc ? selezione([['DDT', 'DDT'], ['Ricevuta', 'Ricevuta'], ['Fattura', 'Fattura'], ['Altro', 'Altro documento']], 'DDT') : null;
  const elenco = [];
  const griglia = h('div', { class: 'miniature' }), riepilogo = h('p', { class: 'aiuto' });
  const prog = h('div', { class: 'barra-prog', hidden: true }, h('div'));
  const btnCarica = h('button', { class: 'pieno', disabled: true, onclick: () => carica() }, 'Carica');
  const inGalleria = h('input', { type: 'file', accept: doc ? 'image/*,application/pdf' : 'image/*', multiple: true, hidden: true, onchange: ev => aggiungi(ev.target) });
  const inCamera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: ev => aggiungi(ev.target) });
  function ridisegna() {
    griglia.replaceChildren(...elenco.map((f, i) => h('div', { class: 'mini' },
      f.url ? h('img', { src: f.url, alt: 'file ' + (i + 1) }) : h('div', { class: 'pdf' }, 'PDF'),
      h('small', {}, f.url ? fmtKB(f.orig) + ' → ' + fmtKB(f.blob.size) : fmtKB(f.blob.size)),
      h('button', { 'aria-label': 'Rimuovi', onclick: () => { if (f.url) URL.revokeObjectURL(f.url); elenco.splice(i, 1); ridisegna(); } }, '✕'))));
    const tot = elenco.reduce((s, f) => s + f.blob.size, 0), orig = elenco.reduce((s, f) => s + f.orig, 0);
    riepilogo.textContent = elenco.length ? elenco.length + ' file · da inviare ' + fmtKB(tot) + ' (originali ' + fmtKB(orig) + ')' : '';
    btnCarica.disabled = !elenco.length;
    btnCarica.textContent = elenco.length ? 'Carica ' + elenco.length + (elenco.length === 1 ? ' file' : ' file') : 'Carica';
  }
  async function aggiungi(input) {
    const files = Array.from(input.files || []); input.value = '';
    for (let i = 0; i < files.length; i++) {
      if (elenco.length >= F.MAX_FILE) { avviso('Massimo ' + F.MAX_FILE + ' file per invio', true); break; }
      const file = files[i];
      riepilogo.textContent = 'Preparo i file… ' + (i + 1) + '/' + files.length;
      if (doc && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) {
        if (file.size > F.MAX_PDF_MB * 1048576) { avviso('PDF troppo grande (max ' + F.MAX_PDF_MB + ' MB): ' + file.name, true); continue; }
        elenco.push({ blob: file, mime: 'application/pdf', orig: file.size, url: '' });
      } else {
        try { const r = await comprimi(file, F); elenco.push({ blob: r.blob, mime: 'image/jpeg', orig: file.size, url: URL.createObjectURL(r.blob) }); }
        catch (e) { avviso('Formato non supportato: ' + file.name, true); }
      }
      ridisegna();
    }
    ridisegna();
  }
  async function carica() {
    if (!lav.sel.value) { avviso('Scegli il cliente / lavoro', true); return; }
    btnCarica.disabled = true; prog.hidden = false;
    const lavoro = lav.sel.value, n = elenco.length;
    scrivi('ultime', Object.assign(leggi('ultime', {}), { lavoro: lavoro }));
    try {
      for (const f of elenco) await accoda(tipo, doc ? { lavoro: lavoro, tipoDoc: tipoDoc.value, mime: f.mime } : { lavoro: lavoro, mime: 'image/jpeg' }, { blob: f.blob });
      elenco.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); }); elenco.length = 0; ridisegna();
      const r = await svuotaCoda((fatti, tot) => { prog.firstChild.style.width = Math.round(fatti / tot * 100) + '%'; });
      prog.hidden = true;
      const rimaste = S.coda.length;
      if (r.errori) avviso(r.errori + ' file non accettati: vedi "Da inviare"', true);
      else if (rimaste) avviso(n + ' file salvati sul telefono: partiranno appena c\'è connessione');
      else avviso(n + (n === 1 ? ' file caricato' : ' file caricati') + ' ✔');
    } catch (e) { prog.hidden = true; avviso('Errore: ' + (e && e.message ? e.message : 'riprova'), true); }
    btnCarica.textContent = 'Carica';
  }
  mostra(titolo, [
    campo('Cliente | Lavoro', lav.el, doc ? 'I documenti vengono salvati nella cartella del cliente, sottocartella DDT-Ricevute-Fatture.' : 'Le foto vengono salvate nella cartella di questo lavoro, per data.'),
    tipoDoc ? campo('Tipo di documento', tipoDoc) : null,
    h('button', { class: 'sec', onclick: () => inGalleria.click() }, ico('foto'), doc ? 'Scegli foto o PDF dal telefono' : 'Scegli dalla galleria'),
    h('button', { class: 'sec', onclick: () => inCamera.click() }, ico('foto'), doc ? 'Fotografa il documento' : 'Scatta una foto'),
    inGalleria, inCamera, riepilogo, griglia, prog, btnCarica,
    h('p', { class: 'aiuto' }, 'Le immagini vengono ridotte (max ' + F.MAX_LATO + ' px, circa ' + F.MAX_KB + ' KB ciascuna) prima dell\'invio; posizione GPS e dati nascosti vengono eliminati.' + (doc ? ' I PDF si caricano come sono (max ' + F.MAX_PDF_MB + ' MB).' : ''))
  ], { indietro: true });
  ridisegna();
}
const vistaFoto = pre => vistaRaccolta('foto', pre);
const vistaDocumenti = arg => vistaRaccolta('documento', arg && arg.lavoro);

// ============================================================ CLIENTI / LAVORI
function vistaClienti(opz) {
  opz = opz || {};
  const tab = opz.tab || 'consulta';
  const seg = h('div', { class: 'seg' },
    h('button', { class: tab === 'consulta' ? 'on' : '', onclick: () => { S.pila[S.pila.length - 1][1] = Object.assign({}, opz, { tab: 'consulta' }); vistaClienti(Object.assign({}, opz, { tab: 'consulta' })); } }, 'Consulta'),
    h('button', { class: tab === 'nuovo' ? 'on' : '', onclick: () => { S.pila[S.pila.length - 1][1] = Object.assign({}, opz, { tab: 'nuovo' }); vistaClienti(Object.assign({}, opz, { tab: 'nuovo' })); } }, 'Nuovo cliente / lavoro'));
  mostra('Clienti / Lavori', [seg, tab === 'consulta' ? corpoConsulta() : corpoNuovo(opz)], { indietro: true });
}
function corpoConsulta() {
  const lista = h('div', {});
  const q = h('input', { type: 'search', placeholder: 'Cerca cliente, lavoro, indirizzo o telefono…', oninput: () => disegna() });
  function disegna() {
    const t = q.value.trim().toLowerCase();
    const f = S.anag.filter(c => !t || [c.nome, c.sede, c.cantiere, c.tel.join(' '), c.lavori.map(l => l.nome + ' ' + l.descr + ' ' + l.tipologia).join(' ')].join(' ').toLowerCase().includes(t));
    lista.replaceChildren(...(f.length ? f.map(schedaCliente) : [vuoto('clienti', S.anag.length ? 'Nessun risultato.' : 'Anagrafica non ancora scaricata: collegati a Internet.')]));
  }
  disegna();
  return [q, h('p', { class: 'aiuto' }, S.anag.length + ' clienti in anagrafica · mostrati solo i lavori attivi'), lista];
}
function schedaCliente(c) {
  const mappa = ind => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(ind);
  return h('details', { class: 'cli' },
    h('summary', {}, h('div', {}, c.nome, h('small', {}, c.sede || 'indirizzo non indicato')), h('span', { class: 'chip ' + (c.lavori.length ? 'bozza' : '') }, c.lavori.length + (c.lavori.length === 1 ? ' lavoro' : ' lavori'))),
    h('div', { class: 'cli-corpo' },
      c.sede ? h('div', { class: 'r' }, ico('pin'), h('div', {}, h('small', { class: 'muto' }, 'Sede / residenza'), h('br'), h('a', { href: mappa(c.sede), target: '_blank', rel: 'noopener' }, c.sede))) : null,
      c.cantiere && c.cantiere !== c.sede ? h('div', { class: 'r' }, ico('pin'), h('div', {}, h('small', { class: 'muto' }, 'Ubicazione cantiere'), h('br'), h('a', { href: mappa(c.cantiere), target: '_blank', rel: 'noopener' }, c.cantiere))) : null,
      c.tel.map(t => h('div', { class: 'r' }, ico('tel'), h('a', { href: 'tel:' + t.replace(/[^\d+]/g, '') }, t))),
      c.email ? h('div', { class: 'r' }, ico('mail'), h('a', { href: 'mailto:' + c.email }, c.email)) : null,
      h('b', {}, 'Lavori attivi'),
      c.lavori.length ? c.lavori.map(l => h('div', { class: 'lav' }, l.nome, h('small', {}, [l.tipologia, l.indirizzo].filter(Boolean).join(' · ')))) : h('div', { class: 'muto' }, 'Nessun lavoro attivo')));
}
function corpoNuovo(opz) {
  const d = S.dati;
  if (!d) return h('p', {}, 'Dati non ancora scaricati: collegati a Internet e riapri l\'app.');
  const NUOVO = '__nuovo__';
  const selCli = selezione([[NUOVO, '➕ NUOVO CLIENTE']].concat(d.clienti.map(c => [c, c])), d.clienti[0] || NUOVO);
  const nome = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Cognome e Nome oppure Ragione sociale' });
  const sede = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Via, numero, CAP, città' });
  const uguale = h('input', { type: 'radio', name: 'ub', checked: true }), diversa = h('input', { type: 'radio', name: 'ub' });
  const ubic = h('input', { type: 'text', placeholder: 'Indirizzo cantiere (se diverso)', autocomplete: 'off' });
  const cf = h('input', { type: 'text', autocapitalize: 'characters', autocomplete: 'off' }), piva = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off' });
  const t1 = h('input', { type: 'tel' }), t2 = h('input', { type: 'tel' }), t3 = h('input', { type: 'tel' });
  const email = h('input', { type: 'email', autocomplete: 'off' });
  const tipologia = selezione(d.tipologie.map(t => [t, t]), d.tipologie[0] || '');
  const descr = h('input', { type: 'text', placeholder: 'Utile per distinguere più lavori simili (facoltativa)' });
  const ubicLav = h('input', { type: 'text', placeholder: 'Solo se diverso da quello del cliente (facoltativo)' });
  // sopralluogo
  const amm = dateAmmesse(new Date(), d.patrono);
  const sopNo = h('input', { type: 'radio', name: 'sop', checked: true }), sopSi = h('input', { type: 'radio', name: 'sop' });
  const sopGiorno = selezione(amm.map(a => [a.valore, a.etichetta]), amm[0].valore);
  const sopIni = h('input', { type: 'time' }), sopFin = h('input', { type: 'time' });
  const boxSop = h('div', { hidden: true }, campo('Giorno del sopralluogo', sopGiorno), h('div', { class: 'riga2' }, campo('Ora inizio', sopIni), campo('Ora fine', sopFin)),
    h('div', { class: 'aiuto' }, 'Le ore verranno aggiunte alla giornata come bozza nella sezione Rapportini: poi completa i dati e invia.'));
  [sopNo, sopSi].forEach(r => r.addEventListener('change', () => { boxSop.hidden = !sopSi.checked; }));
  const sezNuovo = h('div', {}, h('div', { class: 'sezione' }),
    campo('Cognome e Nome – Ragione sociale *', nome), campo('Indirizzo residenza / sede *', sede),
    h('label', {}, 'Ubicazione cantiere'), h('div', { class: 'radio' }, h('label', {}, uguale, 'Uguale alla sede'), h('label', {}, diversa, 'Diversa')),
    campo('Indirizzo ubicazione cantiere (se diversa)', ubic), campo('Codice fiscale', cf), campo('Partita IVA', piva),
    campo('Telefono 1 *', t1), campo('Telefono 2', t2), campo('Telefono 3', t3), campo('Email del cliente', email));
  const invia = h('button', { class: 'pieno', onclick: () => salva() }, 'Registra');
  const aggiorna = () => { sezNuovo.hidden = selCli.value !== NUOVO; };
  selCli.addEventListener('change', aggiorna);

  async function salva() {
    const nuovo = selCli.value === NUOVO;
    let err = '';
    if (nuovo && !nome.value.trim()) err = 'Inserisci cognome e nome / ragione sociale';
    else if (nuovo && !sede.value.trim()) err = 'Inserisci l\'indirizzo di residenza / sede';
    else if (nuovo && !t1.value.trim()) err = 'Inserisci almeno il telefono 1';
    else if (nuovo && email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) err = 'Email del cliente non valida';
    else if (!tipologia.value) err = 'Scegli la tipologia di attività';
    let sopralluogo = { fatto: false };
    if (!err && sopSi.checked) {
      const mi = minDa(sopIni.value), mf = minDa(sopFin.value);
      if (mi === null || mf === null) err = 'Sopralluogo: indica ora di inizio e di fine';
      else if (mf <= mi) err = 'Sopralluogo: la fine deve essere successiva all\'inizio';
      else if (sopGiorno.value === dmy(new Date()) && mf > minDa(hhmm(Date.now()))) err = 'Sopralluogo: la fine non può essere successiva all\'ora attuale';
      else sopralluogo = { fatto: true, data: sopGiorno.value, inizio: sopIni.value, fine: sopFin.value };
    }
    if (err) { avviso(err, true); return; }
    const payload = {
      nuovo: nuovo, cliente: nuovo ? '' : selCli.value, nome: nome.value.trim(), sede: sede.value.trim(), ubicDiversa: diversa.checked, ubic: ubic.value.trim(),
      cf: cf.value.trim().toUpperCase(), piva: piva.value.trim(), t1: t1.value.trim(), t2: t2.value.trim(), t3: t3.value.trim(), email: email.value.trim(),
      tipologia: tipologia.value, descr: descr.value.trim(), ubicLavoro: ubicLav.value.trim(), sopralluogo: sopralluogo, calendario: opz.calendario || '', visibileA: opz.visibileA || ''
    };
    invia.disabled = true; invia.textContent = 'Invio…';
    const r = await eseguiOp('cliente', payload);
    if (r.esito === 'errore') { avviso(r.errore, true); invia.disabled = false; invia.textContent = 'Registra'; return; }
    if (r.esito === 'ok') { try { await caricaSessione(); await caricaAnagrafica(); await aggiornaVoci(); } catch (e) { /* ignora */ } }
    const msg = [];
    if (r.dati && r.dati.sopralluogo) msg.push('Il sopralluogo è tra le bozze della sezione Rapportini: completa i dati e invia.');
    if (opz.calendario) msg.push('Il lavoro è stato aggiunto al calendario del ' + opz.calendario + '.');
    S.pila = [[vistaHome]];
    if (opz.calendario) { S.cal.giorno = parseDMY(opz.calendario); S.pila.push([vistaCalendario]); }
    vistaEsito(r.esito, 'Cliente / Lavoro', (r.esito === 'coda' ? 'Verrà registrato appena c\'è connessione. ' : 'Registrazione completata. ') + msg.join(' '),
      { ritorno: opz.calendario ? vistaCalendario : null });
  }
  setTimeout(aggiorna, 0);
  return [
    opz.calendario ? h('div', { class: 'banner info' }, 'Il cliente / lavoro verrà aggiunto al calendario del ' + opz.calendario + '.') : null,
    campo('Cliente', selCli, 'Scegli un cliente esistente per aggiungere un nuovo lavoro, oppure registra un nuovo cliente.'),
    sezNuovo, h('div', { class: 'sezione' }), h('h2', {}, 'Attività richiesta'),
    campo('Tipologia di attività *', tipologia), campo('Descrizione / riferimento', descr), campo('Indirizzo cantiere di questo lavoro', ubicLav),
    h('div', { class: 'sezione' }), h('h2', {}, 'Sopralluogo'),
    h('label', {}, 'Per questo cliente / lavoro hai già fatto un sopralluogo?'),
    h('div', { class: 'radio' }, h('label', {}, sopNo, 'No'), h('label', {}, sopSi, 'Sì')),
    boxSop, invia
  ];
}

// ============================================================ FERIE, STORICO, CODA
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
    const r = await eseguiOp('ferie', { perConto: selConto ? selConto.value : '', dal: conv(dal.value), al: conv(al.value), note: note.value.trim() });
    if (r.esito === 'errore') { avviso(r.errore, true); invia.disabled = false; invia.textContent = 'Invia richiesta ferie'; return; }
    S.pila = [[vistaHome]];
    vistaEsito(r.esito, 'Ferie', r.esito === 'coda' ? 'La richiesta partirà appena c\'è connessione.' : 'Richiesta inviata.');
  }
  mostra('Ferie', [selConto ? campo('Richiesta per conto di', selConto, 'Solo utenti master') : null, campo('Primo giorno di ferie', dal), campo('Ultimo giorno di ferie', al),
    h('p', { class: 'aiuto' }, 'Sabati, domeniche e festività non vengono contati.'), campo('Note', note), invia], { indietro: true });
}
async function vistaStorico() {
  const tk = mostra('I miei rapportini', h('p', { class: 'centro muto' }, 'Caricamento…'), { indietro: true });
  try {
    const righe = await chiama('storico');
    if (tk !== S.tk) return;
    mostra('I miei rapportini', righe.length ? righe.map(r => h('div', { class: 'riga' },
      h('b', {}, r.data + ' · ' + oreIT(r.ore) + ' h'),
      h('small', {}, r.lavoro + ' · ' + (r.tipo === 'PREPARAZIONE' ? 'preparazione' : 'cantiere') + (r.veicolo && r.veicolo !== NESSUN_VEICOLO ? ' · ' + r.veicolo : '') + (r.costoNol > 0 ? ' · noleggio ' + oreIT(r.costoNol) + ' €' : ''))))
      : vuoto('storico', 'Nessun rapportino negli ultimi 35 giorni.'), { indietro: true });
  } catch (e) {
    if (tk !== S.tk) return;
    mostra('I miei rapportini', h('div', { class: 'banner' }, e && e.codice === 'RETE' ? 'Sei offline: lo storico si vede solo online.' : (e && e.errore) || 'Impossibile leggere lo storico.'), { indietro: true });
  }
}
function descrizione(it) {
  const p = it.payload || {};
  const nomeV = () => { const v = trovaVoce(p.voce); return v ? (v.cliente || v.lavoro) : 'attività'; };
  switch (it.tipo) {
    case 'rapportino': return '📝 Invio rapportino · ' + nomeV();
    case 'bozzaSalva': return '💾 Salvataggio bozza · ' + nomeV();
    case 'calAggiungi': return '📅 Calendario: aggiunta · ' + p.lavoro + ' · ' + p.data;
    case 'calVisibilita': return '👁 Visibilità calendario · ' + nomeV();
    case 'calElimina': return '📅 Calendario: eliminazione · ' + nomeV();
    case 'calInizio': return '▶ Inizio lavoro ' + hhmm(it.creatoIl) + ' · ' + nomeV();
    case 'calFine': return '■ Fine lavoro ' + (p.modo === 'ALTRO' ? p.ora : hhmm(it.creatoIl)) + ' · ' + nomeV();
    case 'calOrari': return '🕒 Orari master · ' + nomeV();
    case 'foto': return '📷 Foto · ' + p.lavoro + ' · ' + fmtKB(it.blob ? it.blob.size : 0);
    case 'documento': return '🧾 ' + (p.tipoDoc || 'Documento') + ' · ' + p.lavoro + ' · ' + fmtKB(it.blob ? it.blob.size : 0);
    case 'cliente': return '🏗️ Cliente / lavoro · ' + (p.nuovo ? p.nome : p.cliente) + ' · ' + p.tipologia;
    case 'ferie': return '🌴 Ferie dal ' + p.dal + ' al ' + p.al;
    default: return it.tipo;
  }
}
async function vistaCoda() {
  await aggiornaStato();
  const items = S.coda.slice().sort((a, b) => a.creatoIl - b.creatoIl);
  const btn = h('button', { class: 'pieno', onclick: async () => {
    btn.disabled = true; btn.textContent = 'Invio…';
    if (!tokenValido()) { try { await ottieniToken(); } catch (e) { avviso('Accedi di nuovo (torna alla home)', true); } }
    const r = await svuotaCoda();
    if (r.inviati) { try { await aggiornaVoci(); } catch (e) { /* ignora */ } }
    avviso(r.inviati ? r.inviati + ' inviati' : 'Niente da inviare o nessuna connessione', !r.inviati);
    vistaCoda();
  } }, 'Invia ora');
  mostra('Da inviare', [
    items.length ? btn : vuoto('coda', 'Niente da inviare. ✔'),
    items.map(it => h('div', { class: 'riga' + (it.stato === 'errore' ? ' errore' : '') }, descrizione(it),
      h('small', {}, it.stato === 'errore' ? 'Non accettato: ' + it.errore : 'In attesa di invio'),
      h('div', { style: 'display:flex;gap:8px;margin-top:6px' },
        it.stato === 'errore' ? h('button', { class: 'sec mini-b', onclick: async () => { it.stato = 'attesa'; it.errore = ''; await DB.putCoda(it); vistaCoda(); } }, 'Riprova') : null,
        h('button', { class: 'sec mini-b', onclick: async () => { if (await modale('Eliminare questo elemento?', descrizione(it), [{ t: 'Elimina', v: true, classe: 'peri' }, { t: 'Annulla', v: false, classe: 'sec' }])) { await DB.delCoda(it.id); await aggiornaStato(); vistaCoda(); } } }, 'Elimina'))))
  ], { indietro: true });
}

// ============================================================ SINCRONIZZAZIONE E AVVIO
let sincronizzando = false;
async function sincronizza(silenzioso) {
  if (sincronizzando || !navigator.onLine || !S.utente) return;
  sincronizzando = true;
  try {
    if (S.coda.length) { const r = await svuotaCoda(); if (!silenzioso && r.inviati) avviso(r.inviati + ' elementi inviati ✔'); }
    try { await caricaSessione(); } catch (e) { if (e && e.codice === 'NOAUT') { avviso(e.errore, true); await esci2(); return; } }
    try { await caricaAnagrafica(); } catch (e) { /* ignora */ }
    try { await aggiornaVoci(); } catch (e) { /* ignora */ }
  } finally { sincronizzando = false; await aggiornaStato(); }
  const p = S.pila[S.pila.length - 1];
  if (!$('#sheet') && (!p || p[0] === vistaHome || p[0] === vistaCalendario)) rinfresca();
}
async function esci2() {
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
  setInterval(() => { if (!document.hidden) sincronizza(true); }, 180000);

  S.token = leggi('tk', null); S.tokenExp = S.token ? jwtScadenza(S.token) : 0;
  let cache = null;
  try { cache = await DB.getKV('sessione'); S.anag = (await DB.getKV('anagrafica')) || []; S.vociBase = (await DB.getKV('vociBase')) || []; S.condivise = (await DB.getKV('condivise')) || []; } catch (e) { /* ignora */ }
  await aggiornaStato();
  attendiGoogle(6000).then(ok => { if (ok) inizializzaGoogle(); });
  if (cache && cache.utente) {
    S.dati = cache; S.utente = cache.utente; vistaHome();
    sincronizza(true);
  } else if (tokenValido()) {
    try { await caricaSessione(); vistaHome(); sincronizza(true); } catch (e) { vistaLogin(e && e.errore); }
  } else vistaLogin();
}
avvio();
