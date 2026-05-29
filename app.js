const BIRDS = [
  { name: "Singdrossel",          query: "Turdus philomelos" },
  { name: "Alpensegler",          query: "Apus melba" },
  { name: "Mauersegler",          query: "Apus apus" },
  { name: "Buntspecht",           query: "Dendrocopos major" },
  { name: "Mittelspecht",         query: "Dendrocopos medius" },
  { name: "Haustaube",            query: "Columba livia" },
  { name: "Haussperling (Spatz)", query: "Passer domesticus" },
  { name: "Hausrotschwanz",       query: "Phoenicurus ochruros",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Black_Redstart_%282312328346%29.jpg/330px-Black_Redstart_%282312328346%29.jpg" },
  { name: "Krähe",                query: "Corvus corone" },
  { name: "Zilpzalp",             query: "Phylloscopus collybita" },
  { name: "Rotkelchen",           query: "Erithacus rubecula" },
  { name: "Zaunkönig",            query: "Troglodytes troglodytes" },
  { name: "Ringeltaube",          query: "Columba palumbus" },
  { name: "Eichelhäher",          query: "Garrulus glandarius" },
  { name: "Blaumeise",            query: "Cyanistes caeruleus" },
  { name: "Grünspecht",           query: "Picus viridis" },
  { name: "Gartenrotschwanz",     query: "Phoenicurus phoenicurus" },
  { name: "Mäusebussard",         query: "Buteo buteo",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/27/B._buteo%2C_Elsdorf_%28DE%29_--_2023_--_0315.jpg/330px-B._buteo%2C_Elsdorf_%28DE%29_--_2023_--_0315.jpg" },
  { name: "Hohltaube",            query: "Columba oenas" },
  { name: "Amsel",                query: "Turdus merula" },
  { name: "Mönchsgrasmücke",      query: "Sylvia atricapilla" },
  { name: "Hausgans",             query: "Anser anser" },
  { name: "Haushahn (Haushuhn)",  query: "Gallus gallus" },
  { name: "Hausente",             query: "Anas platyrhynchos" },
  { name: "Star",                 query: "Sturnus vulgaris" },
  { name: "Schwanengans",         query: "Anser cygnoides" },
  { name: "Buchfink",             query: "Fringilla coelebs" }
];

const XENO_CANTO_KEY = "22657f06488beec27d2de53d2d8fd45036d7da02";

// Safari benötigt Accept-Ranges: bytes zum Abspielen – xeno-canto liefert ihn nicht
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

const imageCache     = new Map();
const audioListCache = new Map(); // xeno-canto: bird.query → url[]
const wikiCache      = new Map(); // Wikimedia:  bird.query → url | null
const lastPlayed     = new Map(); // bird.query → url  (zuletzt gespielt)
const preloadCache   = new Map(); // url → Audio  (vorgeladene Audio-Objekte)
let currentAudio = null;
let currentCard = null;

// Quiz-Modus
let quizMode = false;
const quizStates = new Map(); // card → 0|1|2|3
const allCards = [];          // alle Karten für globale Operationen

function setQuizState(card, state) {
  quizStates.set(card, state);
  const img  = card.querySelector("img");
  const name = card.querySelector(".bird-name");
  const btn  = card.querySelector(".play-btn");
  const bar  = card.querySelector(".quiz-replay-bar");

  // CSS-Klassen setzen
  img.classList.toggle("quiz-hidden-img", state < 2);
  name.classList.toggle("quiz-hidden-name", state < 3);
  card.classList.toggle("quiz-solved", state === 3);

  // Text der Replay-Leiste (basierend auf ob mehrere Aufnahmen gecacht sind)
  if (state === 3 && bar) {
    const list = audioListCache.get(card.dataset.birdQuery) || [];
    bar.textContent = list.length > 1 ? "▶ Andere Aufnahme" : "▶ Wiederholen";
  }

  // Button-Symbol
  if (state === 1) btn.textContent = "🖼️";
  else if (state === 2) btn.textContent = "🔤";
  else btn.textContent = "▶️";
}

function toggleQuizMode() {
  quizMode = !quizMode;
  stopCurrentAudio();

  const toggleBtn = document.getElementById("quiz-toggle");
  const grid = document.getElementById("bird-grid");

  if (quizMode) {
    toggleBtn.textContent = "✅ Quiz beenden";
    toggleBtn.classList.add("quiz-active");

    // Karten mischen (Fisher-Yates) und in neuer Reihenfolge ins Grid hängen
    const shuffled = [...allCards];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach(({ card }) => {
      grid.appendChild(card); // verschiebt vorhandenes Element ans Ende
      setQuizState(card, 0);
    });
  } else {
    toggleBtn.textContent = "🎓 Quiz starten";
    toggleBtn.classList.remove("quiz-active");

    // Ursprüngliche Reihenfolge wiederherstellen
    allCards.forEach(({ card }) => {
      grid.appendChild(card);
      quizStates.delete(card);
      card.querySelector("img").classList.remove("quiz-hidden-img");
      card.querySelector(".bird-name").classList.remove("quiz-hidden-name");
      card.classList.remove("quiz-solved");
      card.querySelector(".play-btn").textContent = "▶️";
    });
  }
}

const PLACEHOLDER_SVG = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">
    <rect fill="#e8f5e9" width="320" height="240"/>
    <text x="160" y="120" text-anchor="middle" font-size="60" fill="#4caf50">🐦</text>
  </svg>`
);

async function fetchBirdImage(bird) {
  if (bird.image) return bird.image; // Direktes Bild überschreibt Wikipedia
  if (imageCache.has(bird.query)) return imageCache.get(bird.query);

  try {
    const title = encodeURIComponent(bird.query);
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${title}&prop=pageimages&format=json&pithumbsize=320&redirects=1&origin=*`;
    const response = await fetch(url);
    const data = await response.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0];
    const src = page?.thumbnail?.source || null;
    imageCache.set(bird.query, src);
    return src;
  } catch {
    return null;
  }
}

// Lädt Audio-Dateien still im Hintergrund vor, damit der nächste Klick sofort abspielt
function preloadInBackground(urls) {
  urls.forEach(url => {
    if (url && !preloadCache.has(url)) {
      const a = new Audio();
      a.preload = "auto";
      a.src = url; // Browser beginnt zu puffern
      preloadCache.set(url, a);
    }
  });
}

// Wählt zufällig aus der Liste, vermeidet die zuletzt gespielte URL
function pickDifferent(list, last) {
  if (!list.length) return null;
  const others = list.length > 1 ? list.filter(u => u !== last) : list;
  return others[Math.floor(Math.random() * others.length)];
}

// xeno-canto: Top-5 Qualität-A-Aufnahmen einmalig laden und cachen
async function fetchXenoList(bird) {
  if (audioListCache.has(bird.query)) return audioListCache.get(bird.query);

  const [genus, species] = bird.query.trim().split(/\s+/);
  if (!genus || !species) { audioListCache.set(bird.query, []); return []; }

  for (const q of [
    `gen:${genus}+sp:${species}+q:A`,
    `gen:${genus}+sp:${species}`
  ]) {
    try {
      const data = await (await fetch(
        `https://xeno-canto.org/api/3/recordings?query=${q}&key=${XENO_CANTO_KEY}&page=1`
      )).json();
      if (!data.recordings?.length) continue;

      const sorted = [
        ...data.recordings.filter(r => r["file-name"]?.toLowerCase().endsWith(".mp3")),
        ...data.recordings.filter(r => !r["file-name"]?.toLowerCase().endsWith(".mp3"))
      ];
      const urls = sorted.slice(0, 5).map(r => r.file).filter(Boolean);
      if (urls.length) { audioListCache.set(bird.query, urls); return urls; }
    } catch (err) {
      console.warn("xeno-canto fehlgeschlagen:", err);
      break;
    }
  }
  audioListCache.set(bird.query, []);
  return [];
}

// Wikimedia Commons: hat Accept-Ranges + CORS → funktioniert auf Safari
async function fetchWikiUrl(bird) {
  if (wikiCache.has(bird.query)) return wikiCache.get(bird.query);

  let url = null;
  try {
    const hits = (await (await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(bird.query + " filetype:audio")}&srnamespace=6&format=json&srlimit=10&origin=*`
    )).json()).query?.search || [];

    const validHit = hits
      .filter(h => {
        const name = h.title.replace(/^File:/i, "");
        return !/^[a-z]{2,3}(-[a-z]{2,4})?-/i.test(name) &&
               !/^pronunciation|^wikt|glocken|kirche|bell|clock|LL-Q/i.test(name);
      })
      .find(h => !h.title.toLowerCase().endsWith(".ogg"))
      || hits[0];

    if (validHit) {
      const page = Object.values((await (await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(validHit.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`
      )).json()).query?.pages || {})[0];
      url = page?.imageinfo?.[0]?.url || null;
    }
  } catch (err) {
    console.warn("Wikimedia fehlgeschlagen:", err);
  }
  wikiCache.set(bird.query, url);
  return url;
}

async function fetchAudioUrl(bird) {
  if (isSafari) {
    // Safari: Wikimedia immer gleich (cached), xeno-canto als Fallback mit Variation
    const wikiUrl = await fetchWikiUrl(bird);
    if (wikiUrl) return wikiUrl;
    const url = pickDifferent(await fetchXenoList(bird), lastPlayed.get(bird.query));
    if (url) lastPlayed.set(bird.query, url);
    return url;
  } else {
    // Alle anderen: jedes Mal eine andere aus der gecachten Top-5-Liste
    const url = pickDifferent(await fetchXenoList(bird), lastPlayed.get(bird.query));
    if (url) { lastPlayed.set(bird.query, url); return url; }
    return await fetchWikiUrl(bird); // Fallback
  }
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentCard) {
    currentCard.classList.remove("playing");
    const btn = currentCard.querySelector(".play-btn");
    if (btn) btn.textContent = "▶️";
    currentCard = null;
  }
}

async function playBird(card, bird) {
  const button = card.querySelector(".play-btn");

  if (currentCard === card && currentAudio) {
    stopCurrentAudio();
    return;
  }

  stopCurrentAudio();

  button.textContent = "⏳";
  button.disabled = true;

  const audioUrl = await fetchAudioUrl(bird);

  if (!audioUrl) {
    button.textContent = "❌";
    button.disabled = false;
    setTimeout(() => { button.textContent = "▶️"; }, 2000);
    return;
  }

  card.classList.add("playing");
  currentCard = card;

  // Vorgeladenes Audio-Objekt nutzen (sofort bereit) oder neu erstellen
  const audio = preloadCache.get(audioUrl) ?? new Audio(audioUrl);
  preloadCache.set(audioUrl, audio); // sicherstellen, dass es im Cache ist
  currentAudio = audio;

  audio.onplay = () => {
    button.textContent = "⏸️";
    button.disabled = false;
    // Während dieser Ton spielt: die anderen Aufnahmen im Hintergrund vorpuffern
    const others = (audioListCache.get(bird.query) || []).filter(u => u !== audioUrl);
    preloadInBackground(others);
    // Replay-Leiste aktualisieren (jetzt ist die Liste definitiv gecacht)
    const bar = card.querySelector(".quiz-replay-bar");
    if (bar) {
      const list = audioListCache.get(bird.query) || [];
      bar.textContent = list.length > 1 ? "▶ Andere Aufnahme" : "▶ Wiederholen";
    }
  };

  audio.onended = () => {
    button.textContent = "▶️";
    card.classList.remove("playing");
    if (currentCard === card) {
      currentAudio = null;
      currentCard = null;
    }
  };

  audio.onerror = () => {
    button.textContent = "❌";
    button.disabled = false;
    card.classList.remove("playing");
    setTimeout(() => { button.textContent = "▶️"; }, 2000);
    if (currentCard === card) {
      currentAudio = null;
      currentCard = null;
    }
  };

  audio.play().catch(() => {
    button.textContent = "▶️";
    button.disabled = false;
    card.classList.remove("playing");
    currentAudio = null;
    currentCard = null;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("bird-grid");

  BIRDS.forEach(bird => {
    const card = document.createElement("div");
    card.className = "bird-card";
    card.dataset.birdQuery = bird.query; // für setQuizState zugänglich

    // Dunkle Leiste oben (nur im gelösten Quiz-Zustand sichtbar)
    const replayBar = document.createElement("div");
    replayBar.className = "quiz-replay-bar";
    replayBar.textContent = "▶ Andere Aufnahme";
    replayBar.onclick = () => playBird(card, bird);
    card.appendChild(replayBar);

    const img = document.createElement("img");
    img.src = PLACEHOLDER_SVG;
    img.alt = bird.name;
    img.loading = "lazy";

    fetchBirdImage(bird).then(src => {
      if (src) img.src = src;
    });

    const name = document.createElement("div");
    name.className = "bird-name";
    name.textContent = bird.name;

    // Gemeinsame Aktion für Bild-Klick und Button-Klick
    const handleAction = () => {
      if (!quizMode) {
        playBird(card, bird);
        return;
      }
      const state = quizStates.get(card) ?? 0;
      if (state === 0) {
        playBird(card, bird);
        setQuizState(card, 1);
      } else if (state === 1) {
        setQuizState(card, 2);
      } else if (state === 2) {
        setQuizState(card, 3);
      } else {
        playBird(card, bird); // state 3: Ton nochmal abspielen
      }
    };

    img.onclick = handleAction;

    const button = document.createElement("button");
    button.className = "play-btn";
    button.textContent = "▶️";
    button.onclick = handleAction;

    allCards.push({ card, bird });
    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(button);
    grid.appendChild(card);
  });
});
