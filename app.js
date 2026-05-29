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

const imageCache = new Map();
const audioCache = new Map();
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

  // CSS-Klassen setzen
  img.classList.toggle("quiz-hidden-img", state < 2);
  name.classList.toggle("quiz-hidden-name", state < 3);
  card.classList.toggle("quiz-solved", state === 3);

  // Button-Symbol
  if (state === 1) btn.textContent = "🖼️";
  else if (state === 2) btn.textContent = "🔤";
  else btn.textContent = "▶️";
}

function toggleQuizMode() {
  quizMode = !quizMode;
  stopCurrentAudio();

  const toggleBtn = document.getElementById("quiz-toggle");
  if (quizMode) {
    toggleBtn.textContent = "✅ Quiz beenden";
    toggleBtn.classList.add("quiz-active");
    allCards.forEach(({ card }) => setQuizState(card, 0));
  } else {
    toggleBtn.textContent = "🎓 Quiz starten";
    toggleBtn.classList.remove("quiz-active");
    allCards.forEach(({ card }) => {
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

function xenoCantoQuery(scientificName) {
  // "Turdus philomelos" → "gen:Turdus+sp:philomelos+q:A"
  const [genus, species] = scientificName.trim().split(/\s+/);
  if (!species) return null;
  return `gen:${genus}+sp:${species}+q:A`;
}

async function fetchAudioUrl(bird) {
  if (audioCache.has(bird.query)) return audioCache.get(bird.query);

  // Primär: Wikimedia Commons
  // (liefert Accept-Ranges + CORS-Header → funktioniert auf Safari/Mac)
  try {
    const q = encodeURIComponent(`${bird.query} filetype:audio`);
    const searchResp = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${q}&srnamespace=6&format=json&srlimit=10&origin=*`
    );
    const searchData = await searchResp.json();
    const hits = searchData.query?.search || [];

    const validHits = hits.filter(h => {
      const name = h.title.replace(/^File:/i, "");
      return !/^[a-z]{2,3}(-[a-z]{2,4})?-/i.test(name) &&
             !/^pronunciation|^wikt|glocken|kirche|bell|clock|LL-Q/i.test(name);
    });
    // .mp3/.wav bevorzugen (.ogg läuft nicht auf Safari)
    const validHit = validHits.find(h => !h.title.toLowerCase().endsWith(".ogg")) || validHits[0];

    if (validHit) {
      const fileTitle = encodeURIComponent(validHit.title);
      const fileResp = await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&titles=${fileTitle}&prop=imageinfo&iiprop=url&format=json&origin=*`
      );
      const fileData = await fileResp.json();
      const pages = fileData.query?.pages || {};
      const page = Object.values(pages)[0];
      const audioUrl = page?.imageinfo?.[0]?.url || null;
      if (audioUrl) {
        audioCache.set(bird.query, audioUrl);
        return audioUrl;
      }
    }
  } catch (err) {
    console.warn("Wikimedia fehlgeschlagen, versuche xeno-canto...", err);
  }

  // Fallback: xeno-canto API v3
  // (kein Accept-Ranges → kein Safari, aber gut für Chrome/Android/Windows)
  try {
    const [genus, species] = bird.query.trim().split(/\s+/);
    if (genus && species) {
      const queries = [
        `gen:${genus}+sp:${species}+q:A`,
        `gen:${genus}+sp:${species}`
      ];
      for (const q of queries) {
        const resp = await fetch(
          `https://xeno-canto.org/api/3/recordings?query=${q}&key=${XENO_CANTO_KEY}&page=1`
        );
        const data = await resp.json();
        if (!data.recordings || data.recordings.length === 0) continue;
        const mp3 = data.recordings.find(r => (r["file-name"] || "").toLowerCase().endsWith(".mp3"));
        const best = mp3 || data.recordings[0];
        if (best.file) {
          audioCache.set(bird.query, best.file);
          return best.file;
        }
      }
    }
  } catch (err) {
    console.warn("xeno-canto fehlgeschlagen:", err);
  }

  audioCache.set(bird.query, null);
  return null;
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

  const audio = new Audio(audioUrl);
  currentAudio = audio;

  audio.onplay = () => {
    button.textContent = "⏸️";
    button.disabled = false;
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

    const button = document.createElement("button");
    button.className = "play-btn";
    button.textContent = "▶️";
    button.onclick = () => {
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

    allCards.push({ card, bird });
    card.appendChild(img);
    card.appendChild(name);
    card.appendChild(button);
    grid.appendChild(card);
  });
});
