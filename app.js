'use strict';

/* ================= KONFIGURACJA ================= */

const ROUND_SIZE = 10;
const CURRENT_KEY = 'odejmowanko-current';  // id ostatnio wybranego gracza
const LEGACY_KEY = 'odejmowanko-v1';        // stary zapis z wersji dla jednego gracza

// Punkty przyznawane są za całą rundę – liczą się tylko odpowiedzi
// dobre za pierwszym razem i bez podpowiedzi. Runda trwa ok. 1,5 min,
// średnio ~5 pkt za rundę → 200 pkt to ok. 1 godzina nauki.
const ROUND_POINTS = [
  { min: 10, pts: 10, label: '10 / 10' },
  { min: 9,  pts: 8,  label: '9 / 10' },
  { min: 8,  pts: 6,  label: '8 / 10' },
  { min: 6,  pts: 4,  label: '6–7 / 10' },
  { min: 4,  pts: 2,  label: '4–5 / 10' },
  { min: 0,  pts: 0, label: 'mniej niż 4' },
];
const roundPoints = correct => ROUND_POINTS.find(r => correct >= r.min).pts;
const POINTS_VERSION = 2; // wersja punktacji – starsze zapisy są przeliczane w init()

// Rodzaje zadań (a − b, wynik ≥ 0, a ≤ max). Liczba = 10·dziesiątki + jedności.
const TASK_TYPES = {
  // 8 − 3 (tylko jedności, do 10)
  units: () => { const a = rand(4, 10); return [a, rand(1, a - 1)]; },
  // 27 − 10, 30 − 20 (odejmowanie pełnych dziesiątek)
  tens: max => { const a = rand(11, max); return [a, 10 * rand(1, Math.floor(a / 10))]; },
  // 27 − 5 (dwucyfrowa minus jednocyfrowa, bez przekraczania dziesiątki)
  oneNoBorrow: max => {
    let a; do { a = rand(11, max); } while (a % 10 === 0);
    return [a, rand(1, a % 10)];
  },
  // 28 − 15 (dwucyfrowa minus dwucyfrowa, bez przekraczania dziesiątki)
  twoNoBorrow: max => {
    let a, b;
    do {
      a = rand(12, max);
      const t = Math.floor(a / 10), u = a % 10;
      b = 10 * rand(1, t) + rand(u ? 1 : 0, u);
    } while (b === a); // bez banalnych 22 − 22
    return [a, b];
  },
  // 23 − 7 (przekraczanie dziesiątki z jednocyfrową)
  oneBorrow: max => {
    let a; do { a = rand(11, max); } while (a % 10 === 9);
    return [a, rand(a % 10 + 1, 9)];
  },
  // 25 − 17, 30 − 14 (przekraczanie dziesiątki z dwucyfrową)
  twoBorrow: max => {
    let a; do { a = rand(20, max); } while (a % 10 === 9);
    const t = Math.floor(a / 10), u = a % 10;
    return [a, 10 * rand(1, t - 1) + rand(u + 1, 9)];
  },
};

// Poziomy: im więcej punktów, tym więcej zadań z dziesiątkami i przekraczaniem progu.
// mix = waga (procent) każdego rodzaju zadania.
const LEVELS = [
  { need: 0,    max: 20, name: 'Mały Liczykrok',      desc: 'dziesiątki do 20',
    mix: { units: 10, tens: 30, oneNoBorrow: 30, twoNoBorrow: 30 } },
  { need: 10,   max: 30, name: 'Sprytny Lisek',       desc: 'dziesiątki do 30',
    mix: { tens: 25, oneNoBorrow: 20, twoNoBorrow: 35, oneBorrow: 20 } },
  { need: 30,   max: 30, name: 'Mistrz Dziesiątek',   desc: 'przekraczanie dziesiątki',
    mix: { tens: 15, oneNoBorrow: 10, twoNoBorrow: 25, oneBorrow: 35, twoBorrow: 15 } },
  { need: 60,   max: 30, name: 'Odkrywca Liczb',      desc: 'trudniejsze przekraczanie',
    mix: { tens: 10, twoNoBorrow: 25, oneBorrow: 30, twoBorrow: 35 } },
  { need: 100,  max: 30, name: 'Król Trzydziestki',   desc: 'wszystko do 30',
    mix: { tens: 5, twoNoBorrow: 20, oneBorrow: 30, twoBorrow: 45 } },
  { need: 1000, max: 30, name: 'Legenda Odejmowania', desc: 'wszystko do 30',
    mix: { tens: 5, twoNoBorrow: 20, oneBorrow: 30, twoBorrow: 45 } },
];

// Prawdziwe nagrody do odebrania u rodzica.
const REWARDS = [
  { id: 'phone',  need: 200,  icon: '📱', name: '30 minut grania na telefonie' },
  { id: 'action', need: 500,  icon: '🛍️', name: '50 zł do wydania w Action' },
  { id: 'trip',   need: 1000, icon: '🎡', name: 'Wspólne wyjście lub wycieczka' },
];

const BADGES = [
  { id: 'first',    icon: '🐣', name: 'Pierwszy krok',   desc: 'Rozwiąż pierwsze zadanie',  test: s => s.solved >= 1 },
  { id: 'streak5',  icon: '🔥', name: 'Gorąca seria',    desc: '5 dobrych odpowiedzi z rzędu', test: s => s.best >= 5 },
  { id: 'streak10', icon: '☄️', name: 'Kometa',          desc: '10 dobrych odpowiedzi z rzędu', test: s => s.best >= 10 },
  { id: 'streak20', icon: '🚀', name: 'Rakieta',         desc: '20 dobrych odpowiedzi z rzędu', test: s => s.best >= 20 },
  { id: 'perfect',  icon: '💎', name: 'Diament',         desc: 'Runda bez żadnego błędu',    test: s => s.perfectRounds >= 1 },
  { id: 'rounds5',  icon: '🎯', name: 'Wytrwały',        desc: 'Ukończ 5 rund',              test: s => s.rounds >= 5 },
  { id: 'solved50', icon: '🧠', name: 'Mądra głowa',     desc: 'Rozwiąż 50 zadań',           test: s => s.solved >= 50 },
  { id: 'solved200',icon: '🦉', name: 'Mądra sowa',      desc: 'Rozwiąż 200 zadań',          test: s => s.solved >= 200 },
  { id: 'pts50',    icon: '🥉', name: 'Brązowy medal',   desc: 'Zdobądź 50 punktów',         test: s => s.points >= 50 },
  { id: 'pts150',   icon: '🥈', name: 'Srebrny medal',   desc: 'Zdobądź 150 punktów',        test: s => s.points >= 150 },
  { id: 'pts300',   icon: '🥇', name: 'Złoty medal',     desc: 'Zdobądź 300 punktów',        test: s => s.points >= 300 },
  { id: 'max30',    icon: '👑', name: 'Do trzydziestu!', desc: 'Dojdź do poziomu Król Trzydziestki', test: s => getLevelIndex(s.points) >= 4 },
];

// Zwierzaki-awatary: nowy co 10 dobrze rozwiązanych zadań (w tej kolejności).
const ANIMALS_EVERY = 10;
const ANIMALS = [
  { id: 'kapibara',        name: 'Kapibara Kasia' },
  { id: 'kotek',           name: 'Kotek Mruczek' },
  { id: 'piesek',          name: 'Piesek Burek' },
  { id: 'kapibara-relaks', name: 'Kapibara Relaks' },
  { id: 'krolik',          name: 'Królik Puszek' },
  { id: 'kotka',           name: 'Kotka Mgiełka' },
  { id: 'wydra',           name: 'Wydra Wanda' },
  { id: 'chomik',          name: 'Chomik Marchewka' },
  { id: 'pandka',          name: 'Pandka Ruda' },
  { id: 'kot',             name: 'Kot Łapka' },
  { id: 'pingwiny',        name: 'Pingwinki' },
  { id: 'leniwiec',        name: 'Leniwiec Leon' },
  { id: 'panda',           name: 'Panda Zjeżdżalska' },
  { id: 'kozka',           name: 'Kózka Skoczka' },
  { id: 'kapibara-mandarynka', name: 'Kapibara Mandarynka' },
  { id: 'jezyk',           name: 'Jeżyk Kolczyk' },
  { id: 'kotek-psotek',    name: 'Kotek Psotek' },
  { id: 'foczka',          name: 'Foczka Śnieżka' },
  { id: 'corgi',           name: 'Corgi Listek' },
  { id: 'kapibara-prysznic', name: 'Kapibara pod Prysznicem' },
  { id: 'koala',           name: 'Koala Przytulanka' },
  { id: 'kaczuszka',       name: 'Kaczuszka Biegaczka' },
  { id: 'kotki-blizniaki', name: 'Kotki Bliźniaki' },
  { id: 'szynszyle',       name: 'Tańczące Szynszyle' },
  { id: 'slonik',          name: 'Słonik Trąbalski' },
  { id: 'kapibara-kapitan', name: 'Kapibara Kapitan' },
  { id: 'swinka',          name: 'Świnka Morska Fistaszek' },
  { id: 'papuga',          name: 'Papuga Imprezka' },
  { id: 'szczeniak',       name: 'Szczeniak Złotko' },
  { id: 'wiewiorka',       name: 'Wiewiórka Orzeszek' },
  { id: 'piskle',          name: 'Pisklę Okruszek' },
  { id: 'fenki',           name: 'Fenki z Maluszkiem' },
  { id: 'lis',             name: 'Lis Skoczek' },
  { id: 'piesek-na-zolwiu', name: 'Piesek na Żółwiu' },
].map(a => ({ ...a, gif: `gifs/${a.id}.gif` }));
const animalById = id => ANIMALS.find(a => a.id === id);

function avatarHtml(p, cls = '') {
  const a = p && p.avatar && animalById(p.avatar);
  return a
    ? `<img class="avatar ${cls}" src="${a.gif}" alt="${esc(a.name)}">`
    : `<span class="avatar avatar-emoji ${cls}">🦊</span>`;
}

const PRAISE = ['Super!', 'Brawo!', 'Świetnie!', 'Ekstra!', 'Jesteś mistrzem!', 'Wow!', 'Doskonale!', 'Tak trzymaj!', 'Rewelacja!'];
const ENCOURAGE = ['Prawie! Spróbuj jeszcze raz 🙂', 'Hmm, policz jeszcze raz!', 'Nie poddawaj się!', 'Spokojnie, dasz radę!'];
const MASCOTS = ['🦊', '🐻', '🐼', '🐯', '🐸', '🐵'];

/* ================= STAN ================= */

const newPlayer = name => ({
  name, v: POINTS_VERSION, points: 0, best: 0, solved: 0, rounds: 0, perfectRounds: 0,
  badges: [], claimed: [], animals: [], avatar: null, createdAt: Date.now(),
});

let state = null; // aktualny gracz (rekord z bazy)
let game = null;  // stan bieżącej rundy

function saveState() {
  if (state) DB.put(state).catch(err => console.warn('Zapis nie powiódł się:', err));
}

function getLevelIndex(points) {
  let idx = 0;
  LEVELS.forEach((lvl, i) => { if (points >= lvl.need) idx = i; });
  return idx;
}

async function rankedPlayers() {
  const players = await DB.all();
  return players.sort((a, b) => b.points - a.points || a.createdAt - b.createdAt);
}

/* ================= POMOCNIKI ================= */

const $ = id => document.getElementById(id);
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
function pickWeighted(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) if ((r -= w) < 0) return key;
  return entries[0][0];
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MEDALS = ['🥇', '🥈', '🥉'];

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $('screen-' + name).classList.add('active');
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function bump(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // restart animacji
  el.classList.add(cls);
}

// Proste zabezpieczenie: pytanie, na które odpowie rodzic, a nie ośmiolatek.
function parentCheck(what) {
  const a = rand(12, 19), b = rand(6, 9);
  const answer = prompt(`${what}\n\nPytanie dla rodzica: ile to ${a} × ${b}?`);
  if (answer === null) return false;
  if (parseInt(answer, 10) === a * b) return true;
  toast('Zła odpowiedź – poproś rodzica 🙂');
  return false;
}

/* ================= DŹWIĘKI ================= */

let audioCtx;
function beep(freqs, dur = 0.12, type = 'sine') {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    freqs.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + i * dur;
      osc.type = type;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + dur);
    });
  } catch { /* dźwięk niedostępny */ }
}
const sound = {
  tap:    () => beep([600], 0.05, 'triangle'),
  good:   () => beep([523, 659, 784], 0.1),
  bad:    () => beep([300, 220], 0.15, 'triangle'),
  fanfare:() => beep([523, 659, 784, 1047, 784, 1047], 0.13),
};

/* ================= KONFETTI ================= */

function confetti(count = 60) {
  const box = $('confetti');
  const colors = ['#ff7675', '#fdcb6e', '#00b894', '#74b9ff', '#a29bfe', '#fd79a8'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = pick(colors);
    p.style.animationDuration = (1.5 + Math.random() * 1.5) + 's';
    p.style.animationDelay = Math.random() * 0.4 + 's';
    box.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}

/* ================= WYBÓR GRACZA ================= */

async function renderPlayers() {
  const players = await rankedPlayers();
  const list = $('player-list');
  if (!players.length) {
    list.innerHTML = '<p class="empty">Jeszcze nikt nie gra. Dodaj pierwszego gracza! 👇</p>';
    return;
  }
  list.innerHTML = players.map((p, i) => `
    <div class="player-item">
      <button class="player-btn" data-id="${p.id}">
        ${avatarHtml(p)}
        <span class="pname">${MEDALS[i] || ''} ${esc(p.name)}</span>
        <span class="ppts">⭐ ${p.points}</span>
      </button>
      <button class="player-del" data-del="${p.id}" aria-label="Usuń gracza ${esc(p.name)}">✕</button>
    </div>`).join('');
}

async function selectPlayer(id) {
  const p = await DB.get(id);
  if (!p) return;
  state = p;
  try { localStorage.setItem(CURRENT_KEY, String(id)); } catch { /* trudno */ }
  await renderHome();
  showScreen('home');
}

async function addPlayer(name) {
  name = name.trim();
  if (!name) return;
  const players = await DB.all();
  if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('Taki gracz już jest! Wybierz go z listy.');
    return;
  }
  const player = newPlayer(name);

  // Przenieś punkty z poprzedniej wersji gry (jeden gracz w localStorage).
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (legacy && !players.length) {
      Object.assign(player, legacy, { name, v: 1 }); // stara punktacja – przeliczy ją init()
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch { /* brak starych danych */ }

  const id = await DB.put(player);
  await migratePlayers();
  $('input-name').value = '';
  await selectPlayer(id);
  toast(`Witaj, ${name}! 👋`);
}

async function deletePlayer(id) {
  const p = await DB.get(id);
  if (!p || !parentCheck(`Usunąć gracza „${p.name}” razem z punktami?`)) return;
  await DB.remove(id);
  if (state && state.id === id) state = null;
  renderPlayers();
  toast('Gracz usunięty.');
}

/* ================= EKRAN STARTOWY ================= */

async function renderHome() {
  const idx = getLevelIndex(state.points);
  const lvl = LEVELS[idx];
  const next = LEVELS[idx + 1];

  $('home-hello').textContent = `Cześć, ${state.name}!`;
  $('home-avatar').innerHTML = avatarHtml(state);
  const left = ANIMALS_EVERY - (state.solved % ANIMALS_EVERY);
  $('home-animals').textContent = state.animals.length < ANIMALS.length
    ? `🐾 Zwierzaki: ${state.animals.length} / ${ANIMALS.length} · nowy za ${left} ${left === 1 ? 'zadanie' : left < 5 ? 'zadania' : 'zadań'}`
    : `🐾 Wszystkie zwierzaki zebrane! Co ${ANIMALS_EVERY} zadań – taniec radości!`;
  $('home-points').textContent = state.points;
  $('home-best').textContent = state.best;
  $('home-level-name').textContent = `Poziom ${idx + 1}: ${lvl.name} · ${lvl.desc}`;

  if (next) {
    const pct = ((state.points - lvl.need) / (next.need - lvl.need)) * 100;
    $('home-progress').style.width = Math.min(100, pct) + '%';
    $('home-level-next').textContent = `Jeszcze ${next.need - state.points} pkt do poziomu „${next.name}”`;
  } else {
    $('home-progress').style.width = '100%';
    $('home-level-next').textContent = 'Najwyższy poziom! Jesteś legendą! 🏆';
  }

  renderRewards();
  $('rules-table').innerHTML = ROUND_POINTS.map(r =>
    `<tr><td>${r.label}</td><td>${r.pts ? '+' + r.pts + ' ⭐' : 'brak punktów'}</td></tr>`).join('');

  const players = await rankedPlayers();
  const place = players.findIndex(p => p.id === state.id) + 1;
  $('home-place').textContent = place ? (MEDALS[place - 1] || place) : '–';
}

function renderRewards() {
  $('rewards-list').innerHTML = REWARDS.map(r => {
    const claimed = state.claimed.includes(r.id);
    const unlocked = state.points >= r.need;
    if (claimed) {
      return `<div class="reward claimed">
        <div class="ricon">${r.icon}</div>
        <div class="rbody"><div class="rname">${r.name}</div><div class="rinfo">✅ Odebrana – gratulacje!</div></div>
      </div>`;
    }
    if (unlocked) {
      return `<div class="reward unlocked">
        <div class="ricon">${r.icon}</div>
        <div class="rbody"><div class="rname">${r.name}</div><div class="rinfo">🎉 Zdobyta! Pokaż rodzicowi.</div></div>
        <button class="claim" data-reward="${r.id}">Odebrana</button>
      </div>`;
    }
    const pct = Math.min(100, (state.points / r.need) * 100);
    return `<div class="reward locked">
      <div class="ricon">${r.icon}</div>
      <div class="rbody">
        <div class="rname">${r.name}</div>
        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
        <div class="rinfo">${state.points} / ${r.need} pkt – brakuje ${r.need - state.points}</div>
      </div>
    </div>`;
  }).join('');
}

function claimReward(id) {
  const r = REWARDS.find(x => x.id === id);
  if (!r || state.points < r.need || state.claimed.includes(id)) return;
  if (!parentCheck(`Potwierdź, że ${state.name} odebrał(a) nagrodę: ${r.name}.`)) return;
  state.claimed.push(id);
  saveState();
  renderRewards();
  toast('Nagroda odebrana! 🎉');
}

/* ================= RANKING ================= */

async function renderRanking() {
  const players = await rankedPlayers();
  const podium = $('podium');
  const list = $('ranking-list');

  if (!players.length) {
    podium.innerHTML = '';
    list.innerHTML = '<p class="empty">Ranking jest pusty. Zagraj pierwszą rundę!</p>';
    return;
  }

  // Podium: 2. miejsce – 1. miejsce – 3. miejsce
  podium.innerHTML = [1, 0, 2].filter(i => players[i]).map(i => {
    const p = players[i];
    return `<div class="podium-col p${i + 1}">
      <div class="pmedal">${MEDALS[i]}</div>
      <div class="pname">${esc(p.name)}</div>
      <div class="ppts">⭐ ${p.points}</div>
      <div class="block">${i + 1}</div>
    </div>`;
  }).join('');

  list.innerHTML = players.map((p, i) => {
    const rewards = REWARDS.filter(r => p.points >= r.need).map(r => r.icon).join(' ');
    return `<li class="${state && p.id === state.id ? 'me' : ''}">
      <span class="place">${MEDALS[i] || i + 1}</span>
      ${avatarHtml(p)}
      <div class="who">
        <div class="n">${esc(p.name)}</div>
        <div class="l">${LEVELS[getLevelIndex(p.points)].name} · 🏅 ${p.badges.length} ${rewards ? '· ' + rewards : ''}</div>
      </div>
      <span class="pts">⭐ ${p.points}</span>
    </li>`;
  }).join('');
}

let rankingBack = 'home';
function openRanking(from) {
  rankingBack = from;
  renderRanking();
  showScreen('ranking');
}

/* ================= GRA ================= */

function startRound() {
  // Maskotka rundy: wybrany zwierzak-awatar albo losowe zwierzątko-emoji.
  const mascot = state.avatar ? avatarHtml(state, 'mascot-img') : esc(pick(MASCOTS));
  game = {
    index: 0,
    results: [],          // 'ok' | 'half' | 'bad'
    pointsAtStart: state.points,
    levelAtStart: getLevelIndex(state.points),
    badgesAtStart: [...state.badges],
    streak: 0,
    mascot,
    lastTask: null,
  };
  $('mascot').innerHTML = mascot;
  $('game-correct').textContent = 0;
  $('game-round-pts').textContent = 0;
  updateStreak();
  showScreen('game');
  nextTask();
}

function makeTask() {
  const lvl = LEVELS[getLevelIndex(state.points)];
  let a, b, key;
  do {
    [a, b] = TASK_TYPES[pickWeighted(lvl.mix)](lvl.max);
    key = a + '-' + b;
  } while (key === game.lastTask);
  game.lastTask = key;
  return { a, b, result: a - b };
}

function nextTask() {
  if (game.index >= ROUND_SIZE) return endRound();

  game.task = makeTask();
  game.input = '';
  game.tries = 0;
  game.usedHint = false;
  game.locked = false;

  $('num-a').textContent = game.task.a;
  $('num-b').textContent = game.task.b;
  $('task').classList.remove('correct', 'wrong');
  $('hint').hidden = true;
  $('btn-hint').disabled = false;
  $('bubble').textContent = pick(['Ile to będzie?', 'Policz!', 'Dasz radę!', 'Spróbuj!']);
  renderAnswer();
  renderDots();
}

function renderAnswer() {
  $('answer').textContent = game.input === '' ? '?' : game.input;
}

function renderDots() {
  const box = $('round-dots');
  box.innerHTML = '';
  for (let i = 0; i < ROUND_SIZE; i++) {
    const d = document.createElement('span');
    if (game.results[i]) d.className = game.results[i];
    else if (i === game.index) d.className = 'current';
    box.appendChild(d);
  }
}

function updateCorrect() {
  const correct = game.results.filter(r => r === 'ok').length;
  const el = $('game-correct');
  el.textContent = correct;
  bump(el.parentElement, 'pop');
  $('game-round-pts').textContent = roundPoints(correct);
}

function updateStreak() {
  $('game-streak').textContent = game.streak;
  $('streak-pill').classList.toggle('hot', game.streak >= 3);
}

function pressKey(key) {
  if (!game || game.locked) return;
  if (key === 'del') {
    game.input = game.input.slice(0, -1);
    sound.tap();
  } else if (key === 'ok') {
    if (game.input !== '') checkAnswer();
    return;
  } else if (game.input.length < 2) {
    game.input = game.input === '0' ? key : game.input + key;
    sound.tap();
  }
  $('task').classList.remove('wrong');
  renderAnswer();
}

function checkAnswer() {
  const value = parseInt(game.input, 10);
  const taskEl = $('task');
  const mascotEl = $('mascot');
  game.tries++;

  if (value === game.task.result) {
    // DOBRZE – do punktów liczy się tylko odpowiedź za pierwszym razem i bez podpowiedzi
    const clean = game.tries === 1 && !game.usedHint;
    if (clean) {
      game.streak++;
      game.results[game.index] = 'ok';
    } else {
      game.streak = 0;
      game.results[game.index] = 'half';
    }
    state.solved++;
    state.best = Math.max(state.best, game.streak);
    saveState();

    taskEl.classList.add('correct');
    bump(mascotEl, 'happy');
    updateCorrect();
    updateStreak();

    let msg = clean ? `${pick(PRAISE)} ✅` : 'Dobrze! Ale to się nie liczy do punktów – następne za pierwszym razem!';
    if (game.streak >= 3) msg += ` Seria ${game.streak}! 🔥`;
    $('bubble').textContent = msg;
    sound.good();
    if (game.streak > 0 && game.streak % 5 === 0) confetti(40);

    checkBadges(true);
    if (state.solved % ANIMALS_EVERY === 0) {
      game.locked = true;
      setTimeout(() => showAnimalModal(unlockAnimal(), () => advance(300)), 700);
    } else {
      advance(clean ? 1100 : 1800);
    }
  } else {
    // ŹLE
    game.streak = 0;
    updateStreak();
    taskEl.classList.remove('wrong');
    void taskEl.offsetWidth;
    taskEl.classList.add('wrong');
    bump(mascotEl, 'sad');
    sound.bad();

    if (game.tries >= 2) {
      game.results[game.index] = 'bad';
      game.input = String(game.task.result);
      renderAnswer();
      $('bubble').textContent = `To było ${game.task.result}. Następnym razem się uda! 💪`;
      showHint();
      advance(3200);
    } else {
      $('bubble').textContent = pick(ENCOURAGE);
      game.input = '';
      setTimeout(renderAnswer, 500);
    }
  }
}

function advance(delay) {
  game.locked = true;
  $('btn-hint').disabled = true;
  const current = game;
  setTimeout(() => {
    if (game !== current) return; // runda przerwana (powrót do menu)
    game.index++;
    nextTask();
  }, delay);
}

// Podpowiedź: rysuje "a" jabłek i skreśla "b" z nich.
function showHint() {
  const { a, b } = game.task;
  const box = $('hint');
  box.innerHTML = '';
  for (let i = 0; i < a; i++) {
    if (i > 0 && i % 10 === 0) {
      const br = document.createElement('span');
      br.className = 'group-break';
      box.appendChild(br);
    }
    const d = document.createElement('span');
    d.className = 'dot' + (i >= a - b ? ' gone' : '');
    d.textContent = '🍎';
    box.appendChild(d);
  }
  box.hidden = false;
}

function useHint() {
  if (!game || game.locked || game.usedHint) return;
  game.usedHint = true;
  $('btn-hint').disabled = true;
  $('bubble').textContent = 'Policz jabłka, które zostały (bez skreślonych)!';
  showHint();
}

/* ================= OKNO NAGRODY ================= */

let rewardModalDone = null;
function showRewardModal(reward, onClose) {
  $('reward-modal-icon').textContent = reward.icon;
  $('reward-modal-name').textContent = reward.name;
  $('reward-modal').hidden = false;
  rewardModalDone = onClose;
  sound.fanfare();
  confetti(120);
}
$('reward-modal-ok').addEventListener('click', () => {
  $('reward-modal').hidden = true;
  const done = rewardModalDone;
  rewardModalDone = null;
  if (done) done();
});

/* ================= ZWIERZAKI ================= */

// Odblokuj następnego zwierzaka; gdy wszystkie zebrane – wylosuj jednego do "tańca radości".
function unlockAnimal() {
  const next = ANIMALS.find(a => !state.animals.includes(a.id));
  if (!next) return { animal: animalById(pick(state.animals)), isNew: false };
  state.animals.push(next.id);
  if (!state.avatar) state.avatar = next.id; // pierwszy zwierzak od razu zostaje awatarem
  saveState();
  return { animal: next, isNew: true };
}

let animalModalDone = null;
let animalModalId = null;
function showAnimalModal({ animal, isNew }, onClose) {
  animalModalId = animal.id;
  animalModalDone = onClose;
  $('animal-modal-gif').src = animal.gif;
  $('animal-modal-gif').alt = animal.name;
  $('animal-modal-title').textContent = isNew ? 'Nowy przyjaciel! 🎉' : 'Taniec radości! 🎉';
  $('animal-modal-name').textContent = animal.name;
  $('animal-modal-sub').textContent = isNew
    ? `Za ${state.solved} dobrze rozwiązanych zadań! (${state.animals.length} / ${ANIMALS.length})`
    : `Kolejne ${ANIMALS_EVERY} zadań rozwiązanych – brawo!`;
  $('animal-modal-avatar').hidden = state.avatar === animal.id;
  $('animal-modal').hidden = false;
  sound.fanfare();
  confetti(80);
}

function closeAnimalModal() {
  $('animal-modal').hidden = true;
  const done = animalModalDone;
  animalModalDone = null;
  if (done) done();
}

$('animal-modal-ok').addEventListener('click', closeAnimalModal);
$('animal-modal-avatar').addEventListener('click', () => {
  setAvatar(animalModalId);
  closeAnimalModal();
});

function setAvatar(id) {
  if (!state.animals.includes(id)) return;
  state.avatar = id;
  saveState();
  if (game) $('mascot').innerHTML = game.mascot = avatarHtml(state, 'mascot-img');
  toast(`${animalById(id).name} jest teraz Twoim awatarem!`);
}

function renderAnimals() {
  $('animals-grid').innerHTML = ANIMALS.map((a, i) => {
    if (state.animals.includes(a.id)) {
      return `<button class="animal ${state.avatar === a.id ? 'chosen' : ''}" data-animal="${a.id}">
        <img src="${a.gif}" alt="${esc(a.name)}" loading="lazy">
        <span class="name">${esc(a.name)}</span>
        <span class="desc">${state.avatar === a.id ? '⭐ Twój awatar' : 'Dotknij, aby wybrać'}</span>
      </button>`;
    }
    return `<div class="animal locked">
      <div class="mystery">❓</div>
      <span class="name">???</span>
      <span class="desc">po ${(i + 1) * ANIMALS_EVERY} zadaniach</span>
    </div>`;
  }).join('');
}

/* ================= KONIEC RUNDY ================= */

function endRound() {
  const correct = game.results.filter(r => r === 'ok').length;
  const gained = roundPoints(correct);

  state.points += gained;
  state.rounds++;
  if (correct === ROUND_SIZE) state.perfectRounds++;
  saveState();
  checkBadges(false);

  const stars = correct >= 9 ? 3 : correct >= 6 ? 2 : 1;
  $('summary-stars').innerHTML = [1, 2, 3]
    .map(n => `<span class="${n <= stars ? '' : 'off'}">⭐</span>`).join('');
  $('summary-title').textContent = stars === 3 ? 'Fantastycznie!' : stars === 2 ? 'Bardzo dobrze!' : 'Dobra robota!';
  $('summary-mascot').innerHTML = game.mascot;
  $('summary-correct').textContent = correct;
  $('summary-points').textContent = `+${gained} (razem ${state.points})`;

  // Ile brakuje do najbliższej nagrody
  const nextReward = REWARDS.find(r => state.points < r.need);
  $('summary-next-reward').textContent = nextReward
    ? `Do nagrody ${nextReward.icon} brakuje jeszcze ${nextReward.need - state.points} pkt!`
    : 'Masz już wszystkie nagrody! 🏆';

  // Nagrody odblokowane w tej rundzie
  const newRewards = REWARDS.filter(r => game.pointsAtStart < r.need && state.points >= r.need);
  $('summary-rewards').innerHTML = newRewards.map(r =>
    `<div class="reward-unlocked-box">🎁 Nagroda: ${r.icon} ${r.name}!<br>Pokaż to rodzicowi!</div>`).join('');

  // Nowe odznaki zdobyte w tej rundzie
  const newBadges = state.badges.filter(id => !game.badgesAtStart.includes(id));
  $('summary-badges').innerHTML = newBadges.map(id => {
    const b = BADGES.find(x => x.id === id);
    return `<div class="badge-new">Nowa odznaka: ${b.icon} ${b.name}</div>`;
  }).join('');

  const newLevel = getLevelIndex(state.points);
  const lu = $('summary-levelup');
  if (newLevel > game.levelAtStart) {
    lu.hidden = false;
    lu.textContent = `🎉 Nowy poziom: ${LEVELS[newLevel].name}! Teraz: ${LEVELS[newLevel].desc}!`;
  } else {
    lu.hidden = true;
  }

  showScreen('summary');
  if (newRewards.length) {
    showRewardModal(newRewards[newRewards.length - 1], null);
  } else if (stars === 3 || newLevel > game.levelAtStart || newBadges.length) {
    sound.fanfare();
    confetti(100);
  } else {
    sound.good();
  }
  game = null;
}

/* ================= ODZNAKI ================= */

function checkBadges(notify) {
  let changed = false;
  BADGES.forEach(b => {
    if (!state.badges.includes(b.id) && b.test(state)) {
      state.badges.push(b.id);
      changed = true;
      if (notify) {
        toast(`Nowa odznaka: ${b.icon} ${b.name}!`);
        confetti(50);
      }
    }
  });
  if (changed) saveState();
}

function renderBadges() {
  $('badges-grid').innerHTML = BADGES.map(b => {
    const has = state.badges.includes(b.id);
    return `<div class="badge ${has ? '' : 'locked'}">
      <div class="icon">${b.icon}</div>
      <div class="name">${b.name}</div>
      <div class="desc">${b.desc}</div>
    </div>`;
  }).join('');
}

/* ================= ZDARZENIA ================= */

const goHome = () => { renderHome(); showScreen('home'); };

$('btn-start').addEventListener('click', startRound);
$('btn-again').addEventListener('click', startRound);
$('btn-hint').addEventListener('click', useHint);
$('btn-home').addEventListener('click', () => { game = null; goHome(); });
$('btn-summary-home').addEventListener('click', goHome);
$('btn-badges').addEventListener('click', () => { renderBadges(); showScreen('badges'); });
$('btn-badges-back').addEventListener('click', goHome);
$('btn-ranking').addEventListener('click', () => openRanking('home'));
$('btn-ranking-players').addEventListener('click', () => openRanking('players'));
$('btn-ranking-back').addEventListener('click', () => {
  if (rankingBack === 'home' && state) goHome();
  else { renderPlayers(); showScreen('players'); }
});
$('btn-animals').addEventListener('click', () => { renderAnimals(); showScreen('animals'); });
$('btn-animals-back').addEventListener('click', goHome);
$('home-avatar').addEventListener('click', () => { renderAnimals(); showScreen('animals'); });
$('animals-grid').addEventListener('click', e => {
  const btn = e.target.closest('[data-animal]');
  if (btn) { setAvatar(btn.dataset.animal); renderAnimals(); }
});
$('btn-switch').addEventListener('click', () => { renderPlayers(); showScreen('players'); });

$('btn-reset').addEventListener('click', () => {
  if (parentCheck(`Wyzerować wszystkie punkty, odznaki i nagrody gracza ${state.name}?`)) {
    state = Object.assign(newPlayer(state.name), { id: state.id, createdAt: state.createdAt });
    saveState();
    renderBadges();
    toast('Zaczynamy od nowa!');
  }
});

$('form-add').addEventListener('submit', e => {
  e.preventDefault();
  addPlayer($('input-name').value);
});

$('player-list').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del) return deletePlayer(Number(del.dataset.del));
  const btn = e.target.closest('[data-id]');
  if (btn) selectPlayer(Number(btn.dataset.id));
});

$('rewards-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-reward]');
  if (btn) claimReward(btn.dataset.reward);
});

$('keypad').addEventListener('click', e => {
  const btn = e.target.closest('.key');
  if (btn) pressKey(btn.dataset.key);
});

document.addEventListener('keydown', e => {
  if (!$('screen-game').classList.contains('active') || document.querySelector('.modal:not([hidden])')) return;
  if (/^[0-9]$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('del');
  else if (e.key === 'Enter') pressKey('ok');
});

/* ================= PWA ================= */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  });
}

/* ================= START ================= */

// Stara punktacja dawała ~40× więcej punktów – przelicz zapisanych graczy na nową skalę.
async function migratePlayers() {
  for (const p of await DB.all()) {
    if ((p.v || 1) < POINTS_VERSION) {
      p.points = Math.floor(p.points / 40);
      p.badges = p.badges.filter(id => BADGES.some(b => b.id === id && b.test(p)));
      p.claimed = (p.claimed || []).filter(id => p.points >= REWARDS.find(r => r.id === id).need);
      p.v = POINTS_VERSION;
      await DB.put(p);
    }
    // Zwierzaki dodane później – daj graczom te, na które już zapracowali.
    if (!p.animals) {
      p.animals = ANIMALS.slice(0, Math.floor(p.solved / ANIMALS_EVERY)).map(a => a.id);
      p.avatar = p.animals[0] || null;
      await DB.put(p);
    }
  }
}

(async function init() {
  await migratePlayers();
  let lastId = null;
  try { lastId = Number(localStorage.getItem(CURRENT_KEY)) || null; } catch { /* trudno */ }
  const last = lastId ? await DB.get(lastId) : null;
  if (last) {
    state = last;
    await renderHome();
    showScreen('home');
  } else {
    await renderPlayers();
    showScreen('players');
  }
})().catch(err => {
  console.error(err);
  alert('Nie udało się otworzyć bazy danych w tej przeglądarce. Wyłącz tryb prywatny i spróbuj ponownie.');
});
