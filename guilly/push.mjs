// Guilly: legge i turni e manda la notifica giusta all'ora giusta.
// Configurazione: secret GUILLY_PUSH generato dall'app (🔔 nella chat di Guilly).
import webpush from 'web-push';
import XLSX from 'xlsx';

const raw = process.env.GUILLY_PUSH;
if (!raw) { console.log('Secret GUILLY_PUSH non impostato: niente da fare.'); process.exit(0); }
let cfg;
try { cfg = JSON.parse(raw); } catch (e) { console.error('GUILLY_PUSH non è un JSON valido'); process.exit(1); }
const NAME = cfg.name || 'Barbieri';
const START = cfg.start || '2026-11-26';
const XLSX_URL = cfg.xlsx || 'https://centrale118rsm-code.github.io/Turni-Autisti-2026-Rsm/turni.xlsx';
const TEST = process.env.TEST === 'true';
const DRY = process.env.DRY === '1';

// ---- ora italiana ----
const now = process.env.NOW ? new Date(process.env.NOW) : new Date();
const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
  .formatToParts(now).map(p => [p.type, p.value]));
const DATE = `${parts.year}-${parts.month}-${parts.day}`;
const HOUR = parseInt(parts.hour, 10) % 24;
const WD = parts.weekday; // Mon, Tue...
const pad = n => String(n).padStart(2, '0');
const addD = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
const dayN = Math.round((Date.parse(DATE) - Date.parse('2026-01-05')) / 86400000);
const pick = arr => arr[((dayN % arr.length) + arr.length) % arr.length];

// ---- turni ----
const SHIFT_T = { 'P': 'pom', 'M': 'mat', 'M/R': 'mat', 'N': 'notte', 'S': 'smonto', 'R': 'libero', 'm': 'mat', 'm/R': 'mat', 'p': 'pom', 'r': 'libero', 'M+N': 'doppio' };
async function shiftType(date) {
  try {
    const res = await fetch(XLSX_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true });
    let year = parseInt(rows[0][0], 10) || 2026, month = 1, prev = 0, col = -1;
    for (let c = 1; c < rows[1].length; c++) {
      const v = rows[1][c]; if (typeof v !== 'number') continue;
      if (v < prev) month++; if (month > 12) { month = 1; year++; } prev = v;
      if (`${year}-${pad(month)}-${pad(v)}` === date) { col = c; break; }
    }
    const row = rows.find(r => r && String(r[0] || '').trim().toLowerCase() === NAME.toLowerCase());
    if (col < 0 || !row) return 'libero';
    const code = String(row[col] == null ? '' : row[col]).trim();
    return SHIFT_T[code] || 'libero';
  } catch (e) { console.log('Turni non leggibili (' + e.message + '): uso messaggi generici'); return 'libero'; }
}

// ---- messaggi ----
const MOTIV = [
  'Non serve essere perfetti, serve essere costanti. 💪',
  'Ogni giorno conta, anche quelli piccoli.',
  'Tra 12 settimane ringrazierai il Mat di oggi.',
  'Fai la prima serie, poi decidi. Quasi sempre farai anche la seconda.',
  'Un giorno storto non è una settimana storta.',
  'Stai costruendo un Mat più forte, non solo più leggero.',
  'Piccoli passi, ogni giorno: così si scalano le montagne. 🏔️'
];
const TIPS = [
  'Le proteine saziano più di tutto: mettine in ogni pasto.',
  'Un cucchiaio d\'olio sono 90 kcal: misuralo, non andare a occhio.',
  'Bibite: solo acqua o versioni zero. Le calorie liquide non saziano.',
  'Metà piatto di verdure = più sazietà, meno calorie.',
  'Peso salito? È acqua: guarda la media della settimana.',
  'Massimo 2 drink a settimana, e ognuno vale 1 porzione di carboidrati.',
  'Porta lo spuntino da casa: niente distributori in turno.'
];
const W = () => pick(['💧 Bevi mezzo litro d\'acqua adesso: obiettivo 3 litri oggi.', '💧 Pausa acqua! Un bicchiere ora, uno tra un\'ora.', '💧 Sete o fame? Prima bevi, poi decidi.']);
const M = {
  mat: {
    5: ['Buon turno, Mat! ☕', 'Prima di uscire: pesata a digiuno e colazione proteica. Lo spuntino delle 10 è in borsa?'],
    10: ['Spuntino in servizio 🥤', 'È l\'ora dello spuntino che hai portato da casa. Il distributore oggi non esiste. 😉'],
    13: ['Turno finito, a tavola 🍝', 'Pranzo: metà piatto di verdure, poi proteine e carboidrati come da menù. ' + W()],
    16: ['Tocca a te 💪', 'Alle 16:30 allenamento: apri l\'app e Guilly ti dice cosa fare. Anche una sessione corta vale.'],
    18: ['Recupero 🍎', 'Dopo l\'allenamento: spuntino proteico con un frutto. ' + pick(TIPS)],
    21: ['Giornata chiusa 🛏️', 'Domani sveglia presto: a letto entro le 22:30. ' + pick(MOTIV)]
  },
  pom: {
    8: ['Buongiorno Mat! ☀️', 'Bilancia a digiuno, poi colazione. Alle 9:30 si allena (o si cammina): lo trovi nell\'app.'],
    11: ['Prima del turno 🍝', 'Pranzo alle 11:45 e prepara lo spuntino da portare: yogurt greco o bresaola con un frutto.'],
    14: ['In turno 🚑', W()],
    16: ['Spuntino 🥤', 'Ora lo spuntino che hai portato. ' + pick(MOTIV)],
    19: ['Cena in arrivo 🍽️', 'Stasera: proteine, verdure e una sola porzione di carboidrati. ' + pick(TIPS)],
    21: ['Com\'è andata? 📝', 'Hai segnato porzioni, acqua e passi di oggi? Due secondi e Guilly è contento.']
  },
  notte: {
    9: ['Stanotte sei di turno 🌙', 'Oggi: pranzo alle 13, riposino nel primo pomeriggio e camminata alle 16.'],
    12: ['Pranzo completo 🍝', 'Mangia bene ora, così stanotte non avrai voglia di distributori. ' + W()],
    15: ['Si cammina 🚶', 'Tra poco camminata veloce: ritmo “parlo ma non canto”. Poi 10 minuti di mobilità.'],
    18: ['Prima della notte 🌙', 'Cena completa alle 19. Spuntino della notte da casa: yogurt o fiocchi di latte con un frutto.'],
    22: ['Buona notte di turno 🚑', 'Acqua a portata di mano e niente snack dolci: lo spuntino leggero è verso le 2. ' + pick(MOTIV)]
  },
  smonto: {
    13: ['Ben svegliato! 😴', 'Pranzo, poi alle 16 camminata tranquilla e mobilità. Niente pesi oggi, ordini del coach. 😉'],
    16: ['Camminata di recupero 🚶', 'Aria aperta e passo tranquillo: aiuta anche a rimettere a posto l\'orologio interno.'],
    17: ['Spuntino 🍎', 'Spuntino con proteine e un frutto. ' + W()],
    20: ['Ottimo lavoro stanotte 💛', 'Stasera a letto presto per tornare al ritmo normale.']
  },
  libero: {
    8: ['Giorno libero! 💪', 'Bilancia a digiuno, colazione e alle 10 si allena (o si cammina: vedi l\'app).'],
    10: ['Ci siamo 🏋️', 'Ora tocca a te: riscaldamento e via. ' + pick(MOTIV)],
    12: ['Pranzo 🍝', 'Dopo l\'allenamento il pranzo più ricco della giornata. ' + W()],
    16: ['Spuntino e passi 👟', 'Spuntino proteico, poi se puoi 20 minuti di camminata extra.'],
    17: ['Guilly 💡', pick(TIPS)],
    20: ['Cena 🍽️', 'Proteine e verdure, carboidrati moderati. Poi relax: te lo sei meritato.']
  },
  doppio: {
    5: ['Giornata doppia 🚑', 'Oggi niente allenamento: mangia come da menù e riposa quando puoi.'],
    13: ['Pausa tra i turni 😴', 'Pranzo, poi riposino lungo. ' + W()],
    18: ['Prima della notte 🌙', 'Cena alle 19 e spuntino leggero da portare. Forza Mat, ce la fai! 💪']
  }
};

async function main() {
  const msgs = [];
  if (TEST) msgs.push(['Ciao Mat, sono Guilly! 👋', 'Le notifiche funzionano anche a telefono bloccato. Ci sentiamo per allenamenti, pasti e consigli. 💪']);
  else if (DATE < START) {
    if (DATE === addD(START, -1) && HOUR === 20) msgs.push(['Domani si parte! 🚀', 'Stasera prepara la bilancia: domattina prima pesata a digiuno. Io sono pronto, tu?']);
  } else {
    const t = await shiftType(DATE);
    console.log(`Data ${DATE}, ora ${HOUR}, turno: ${t}`);
    const m = (M[t] || M.libero)[HOUR];
    if (m) msgs.push(m);
    if (WD === 'Mon' && HOUR === 14) msgs.push(['Lunedì di controllo 📏', 'Misura la vita all\'ombelico e dai un\'occhiata alla lista della spesa della settimana. 🛒']);
  }
  if (!msgs.length) { console.log('Nessun messaggio per quest\'ora.'); return; }
  webpush.setVapidDetails('https://titan-code-sm.github.io/Diet-Training/', cfg.pub, cfg.priv);
  for (const [title, body] of msgs) {
    const payload = JSON.stringify({ title, body, tag: 'guilly-' + DATE + '-' + HOUR, url: './' });
    if (DRY) { console.log('[prova a secco]', payload); continue; }
    try { await webpush.sendNotification(cfg.sub, payload, { TTL: 3 * 3600 }); console.log('Inviata:', title); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { console.error('Iscrizione scaduta: rigenera il codice dall\'app e aggiorna il secret GUILLY_PUSH.'); process.exit(1); }
      console.error('Errore invio:', e.statusCode || '', e.body || e.message); process.exit(1);
    }
  }
}
main();
