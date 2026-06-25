const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ===================== MODO CLARO / OSCURO =====================
   Default oscuro. Se recuerda la preferencia entre partidas con
   localStorage; si el navegador no lo permite (ej. modo privado), el
   juego simplemente vuelve a abrir en oscuro cada vez, sin romper nada. */
let currentTheme = "dark";
try{ currentTheme = localStorage.getItem("bloqueTheme") || "dark"; }catch(e){}
function applyTheme(){
  document.body.classList.toggle("light", currentTheme==="light");
  const btn = $("#hudTheme");
  if(btn) btn.textContent = currentTheme==="light" ? "☀️ Claro" : "🌙 Oscuro";
}
$("#hudTheme").onclick = ()=>{
  currentTheme = currentTheme==="light" ? "dark" : "light";
  try{ localStorage.setItem("bloqueTheme", currentTheme); }catch(e){}
  applyTheme();
};
applyTheme();

/* ===================== ESTADO ===================== */
let lives = 5;
let inventory = []; // {id, icon}
let selectedInvId = null;
let playerName = "";

function renderLives(){
  let h = "";
  for(let i=0;i<5;i++) h += i<lives ? "❤️" : "🖤";
  $("#hudLives").innerHTML = h;
}
function loseLife(){
  lives = Math.max(0, lives-1);
  renderLives();
  if(currentRoomKey && roomMistakes[currentRoomKey]!==undefined) roomMistakes[currentRoomKey]++;
  if(lives===0){ lives = 3; renderLives(); }
}

/* ===================== RESUMEN POR NÚCLEO Y RESULTADOS FINALES =====================
   Cada vez que el jugador pierde una vida dentro de una sala, se cuenta como un
   "intento fallido" para el núcleo correspondiente. Al completar las 6 salas se
   muestra un resumen por núcleo (sin penalizar, solo informativo) y se intenta
   enviar el resultado a una hoja de Google Sheets vía webhook; si falla (sin
   conexión, sin configurar, o error de red) se muestra una advertencia clara
   para que el estudiante pueda respaldar su resultado con una captura. */
let currentRoomKey = null;
let roomMistakes = {1:0,2:0,3:0,4:0,5:0,6:0};
let gameCompleteShown = false;
const roomNames = {
  1:"Evolución de la Web",
  2:"Fundamentos del blockchain",
  3:"Tipos de blockchain",
  4:"Contratos inteligentes y DApps",
  5:"Tokenización",
  6:"NFTs"
};
/* Configura aquí la URL de tu Google Apps Script Web App para recibir resultados.
   Si se deja vacío, el juego no intentará enviar nada y mostrará directamente
   la advertencia de respaldo manual. */
const GOOGLE_SHEETS_WEBHOOK_URL = "";

function checkGameComplete(){
  if(gameCompleteShown) return;
  if(!doorMeta.every(d=> d.status==="solved")) return;
  gameCompleteShown = true;
  if(timerInterval){ clearInterval(timerInterval); timerInterval = null; }
  enterFinalPuzzle();
}

/* ===================== SALA FINAL: PUZZLE DE LA PALABRA =====================
   Usa directamente los fragmentos de letra que el jugador ya tiene en su
   inventario (fragB, fragL, fragO, fragQ, fragU, fragE, recogidos al resolver
   cada núcleo). El jugador selecciona una letra del inventario (igual que con
   el USB o el lector de tokens) y luego toca la posición donde corresponde;
   si acierta, la letra se consume del inventario y queda fija en su slot. */
const finalLetters = [
  {fragId:"fragB", letter:"B"},
  {fragId:"fragL", letter:"L"},
  {fragId:"fragO", letter:"O"},
  {fragId:"fragQ", letter:"Q"},
  {fragId:"fragU", letter:"U"},
  {fragId:"fragE", letter:"E"}
];
let finalSlotsFilled = 0;

/* ===================== ASIGNACIÓN ALEATORIA DE LETRA POR SALA =====================
   La palabra final siempre es BLOQUE y el puzzle final siempre exige hallar
   la posición correcta de cada letra (eso no cambia). Lo que se sortea cada
   partida es QUÉ sala entrega cuál letra, para que no sea siempre "sala 1 =
   B, sala 2 = L..." sino un orden distinto cada vez que se juega. */
let roomLetterAssignment = null;
function assignRoomLetters(){
  if(roomLetterAssignment) return;
  const shuffled = finalLetters.map(l=>l.letter);
  for(let i=shuffled.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [shuffled[i],shuffled[j]] = [shuffled[j],shuffled[i]];
  }
  roomLetterAssignment = {};
  for(let n=1;n<=6;n++) roomLetterAssignment[n] = shuffled[n-1];
}

function buildFinalSlots(){
  const row = $("#finalSlotsRow");
  row.innerHTML = "";
  finalLetters.forEach((l, i)=>{
    const s = document.createElement("div");
    s.className = "letterslot";
    s.dataset.slot = i;
    s.dataset.num = i+1;
    s.onclick = ()=> onFinalSlotClick(i);
    row.appendChild(s);
  });
}

function enterFinalPuzzle(){
  showScene("scn-finalpuzzle");
  setObjective("Selecciona una letra de tu inventario y tócala en la posición donde corresponde.");
  finalSlotsFilled = 0;
  buildFinalSlots();
  subtitle("ARCA","Has recuperado todos los fragmentos. Selecciona una letra de tu inventario y toca la posición donde corresponde para formar la palabra clave.",4800);
}

function onFinalSlotClick(idx){
  const slotEl = document.querySelector('#finalSlotsRow .letterslot[data-slot="'+idx+'"]');
  if(!slotEl || slotEl.classList.contains("filled")) return;
  if(!selectedInvId){
    subtitle("ARCA","Primero selecciona una letra de tu inventario.",2400);
    return;
  }
  const expected = finalLetters[idx];
  if(selectedInvId === expected.fragId){
    slotEl.textContent = expected.letter;
    slotEl.classList.add("filled");
    removeItem(selectedInvId);
    finalSlotsFilled++;
    if(finalSlotsFilled === finalLetters.length) finishGameWithWord();
  } else {
    slotEl.classList.add("shake");
    setTimeout(()=> slotEl.classList.remove("shake"), 450);
    loseLife();
    subtitle("ARCA","Esa letra no corresponde a esta posición. Vuelve a intentarlo.",2800);
  }
}

function finishGameWithWord(){
  subtitle("ARCA","¡Palabra reconstruida correctamente! Sistema desbloqueado por completo.",3400);
  setTimeout(()=> showFinalResults(), 1600);
}

function buildNucleoSummary(){
  const box = $("#nucleoSummary");
  if(!box) return;
  box.innerHTML = "";
  for(let n=1;n<=6;n++){
    const mistakes = roomMistakes[n] || 0;
    let calif = "Excelente";
    if(mistakes>=3) calif = "A reforzar";
    else if(mistakes>=1) calif = "Bien";
    const row = document.createElement("div");
    row.className = "nucleoRow";
    row.innerHTML = `<span class="nName">Núcleo ${n} · ${roomNames[n]}</span><span class="nStat">${mistakes} intento(s) fallido(s) · ${calif}</span>`;
    box.appendChild(row);
  }
}

function computeScoreAndRank(){
  const totalMistakes = Object.values(roomMistakes).reduce((a,b)=>a+b,0);
  const elapsedSec = gameStartTime ? Math.floor((Date.now()-gameStartTime)/1000) : 0;
  const elapsedMin = elapsedSec/60;
  let score = Math.round(Math.max(0, 1000 - totalMistakes*40 - elapsedMin*8));
  let rank = "Recluta Digital";
  if(score>=850) rank = "Maestro de Bloques";
  else if(score>=650) rank = "Agente Competente";
  else if(score>=400) rank = "Sobreviviente";
  const mm = String(Math.floor(elapsedSec/60)).padStart(2,"0");
  const ss = String(elapsedSec%60).padStart(2,"0");
  return {score, rank, totalMistakes, timeStr: mm+":"+ss};
}

function showFinalResults(){
  buildNucleoSummary();
  const {score, rank, totalMistakes, timeStr} = computeScoreAndRank();
  $("#finalWord").textContent = "BLOQUE";
  $("#scoreLine").textContent = `Puntaje: ${score} · Tiempo: ${timeStr} · Errores totales: ${totalMistakes}`;
  $("#rankBadge").textContent = "Rango: " + rank;
  $("#ov-final").classList.remove("hidden");
  sendResultsToSheet({playerName, score, rank, totalMistakes, timeStr, roomMistakes});
}

function sendResultsToSheet(payload){
  const warn = $("#sendWarning");
  if(!GOOGLE_SHEETS_WEBHOOK_URL){
    warn.classList.add("show");
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(()=> controller.abort(), 6000);
  fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: "POST",
    mode: "no-cors",
    // text/plain evita el preflight CORS que Apps Script Web Apps no maneja
    // bien en modo no-cors; el servidor igual hace JSON.parse() del cuerpo.
    headers: {"Content-Type":"text/plain;charset=utf-8"},
    body: JSON.stringify(payload),
    signal: controller.signal
  }).then(()=>{
    clearTimeout(timeout);
    warn.classList.remove("show");
  }).catch(()=>{
    clearTimeout(timeout);
    warn.classList.add("show");
  });
}

/* ===================== PISTAS (sin narrador hablando) =====================
   ARCA ya no interrumpe automáticamente. Cada vez que el código antiguo
   llama subtitle(...), el texto se guarda como "pista disponible" y solo
   se muestra si el estudiante presiona el botón de pista. */
let lastHint = "";
let hintTimer = null;
function subtitle(who, text, ms=3200){
  lastHint = text;
  const dot = $("#hintBtn");
  if(dot){ dot.classList.add("has-hint"); }
}
function showHintNow(){
  if(!lastHint) return;
  const box = $("#subtitleBox");
  box.querySelector(".who").textContent = "Pista";
  box.querySelector(".txt").textContent = lastHint;
  box.classList.add("show");
  if(hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(()=> box.classList.remove("show"), 4200);
}
/* showNotice: a guaranteed-visible message, independent from the
   pista/lastHint mechanism. Use this for critical content the player
   MUST see immediately (e.g. a code found on a note), instead of
   subtitle(), which only queues text for the optional hint button. */
let noticeTimer = null;
function showNotice(who, text, ms=4200){
  const box = $("#subtitleBox");
  box.querySelector(".who").textContent = who || "Aviso";
  box.querySelector(".txt").textContent = text;
  box.classList.add("show");
  if(noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(()=> box.classList.remove("show"), ms);
}
/* Botón ✕: el estudiante decide cuándo quitar el texto en pantalla en vez
   de esperar a que se oculte solo, sin importar si lo abrió showHintNow,
   showNotice o showPuzzleHint (todos comparten el mismo #subtitleBox). */
$("#subtitleClose").onclick = (e)=>{
  e.stopPropagation();
  if(hintTimer) clearTimeout(hintTimer);
  if(noticeTimer) clearTimeout(noticeTimer);
  $("#subtitleBox").classList.remove("show");
};

/* ===================== HISTORIAL =====================
   Registro de pistas usadas y elementos/pistas encontrados durante la
   partida, para que el estudiante pueda repasarlos en cualquier momento. */
const gameLog = [];
function logEntry(type, room, text){
  gameLog.push({type, room, text});
  const dot = $("#hudHistory");
  if(dot) dot.classList.add("has-hint");
}
function logDiscovery(room, text){
  logEntry("discovery", room, text);
}
function logHintUse(room, text){
  logEntry("hint", room, text);
}
function renderHistory(){
  const list = $("#historyList");
  list.innerHTML = "";
  if(gameLog.length === 0){
    const empty = document.createElement("div");
    empty.className = "glossaryEmpty";
    empty.textContent = "Todavía no has encontrado pistas ni elementos. ¡Sigue explorando!";
    list.appendChild(empty);
    return;
  }
  gameLog.forEach(entry=>{
    const row = document.createElement("div");
    row.className = "glossaryTerm";
    const tag = entry.type === "hint" ? "💡 Pista" : "🔎 Encontrado";
    row.innerHTML = `<b>Sala ${entry.room} — ${tag}</b><div>${entry.text}</div>`;
    list.appendChild(row);
  });
}

/* ===================== SISTEMA DE 3 PISTAS POR PUZZLE =====================
   Cada sala/puzzle tiene exactamente 3 pistas, ordenadas de más general a
   más concreta. El estudiante decide si quiere usarlas o no: cada click en
   el botón 💡 revela la siguiente pista disponible para la sala activa.
   Una vez reveladas las 3, seguir pulsando vuelve a mostrar la última.
   (En la Sala 3, donde el orden correcto se sortea cada partida, las dos
   primeras pistas son conceptuales; la tercera se genera dinámicamente
   según el sorteo real de esa partida, ver resolveRoom3DynamicHint().) */
const roomHints = {
  1: [
    "Piensa en el orden histórico de internet: ¿cuál llegó primero, una web estática sin interacción, una donde todos compartían contenido en redes sociales, o una sin empresas controlando los datos?",
    "El orden correcto va de lo más antiguo a lo más reciente: primero la Web 1.0 (estática, de solo lectura), después la Web 2.0 (redes sociales centralizadas) y al final la Web 3.0 (blockchain, descentralizada).",
    "Coloca primero la tarjeta de líneas ▮▯▮▯ (Web 1.0) en el casillero 1, luego la de los perfiles ◉ ◉ ◉ (Web 2.0) en el casillero 2, y la restante (Web 3.0) en el casillero 3."
  ],
  2: [
    "Sigue el camino que recorre una transacción desde que se crea hasta que queda sellada para siempre en la cadena.",
    "El proceso es: primero se crea la transacción, luego los nodos la validan, después se empaqueta junto a otras, en seguida se minan con cómputo para sellarla, y por último se enlaza al bloque anterior.",
    "Orden exacto: ⚡ Transacción → 🔍 Validación → 📦 Empaquetado → ⛏ Minería → ⛓ Enlace."
  ],
  3: [
    "Bajo cada nodo aparecen ejemplos reales de blockchains. Relaciona cada ejemplo con el tipo de red que estudiaste en la tarjeta de teoría de esta sala (Pública, Privada o Híbrida) y arrastra la ficha correspondiente.",
    "Recuerda las diferencias: Pública = cualquiera entra y valida (Bitcoin, Ethereum). Privada = una sola organización controla todo. Híbrida = varias organizaciones de confianza comparten el control.",
    "__ROOM3_DYNAMIC__"
  ],
  4: [
    "Revisa los tres cajones del archivero, uno de ellos esconde una nota con instrucciones — no asumas que está siempre en el mismo cajón.",
    "La nota indica la palabra clave para activar la terminal y cuál es la única fuente de datos verificada que no debes cortar.",
    "El código de activación es ORACULO (mayúsculas o minúsculas, da igual). Después de escribirlo y presionar Enter, corta los cables rojo y azul, y deja conectado el cable verde (nodo oráculo verificado)."
  ],
  5: [
    "Escanea primero la caja con el lector de tokens de tu inventario para revelar las tres fichas, y fíjate en los ejemplos que aparecen bajo cada ranura de la bóveda — te ayudan a identificar qué tipo de token va ahí.",
    "Cada token representa algo distinto: de Utilidad (paga comisiones o accesos, como BNB o FIL), de Activo real (representa un bien físico tokenizado, como RealT) y de Gobernanza (da derecho a voto en una DAO, como UNI o MKR).",
    "Orden exacto en la bóveda: 💱 Utilidad en la primera ranura, 🏠 Activo real en la segunda, 🗳️ Gobernanza en la tercera."
  ],
  6: [
    "Compara el certificado original (arriba) con cada bloque de hash, carácter por carácter, de izquierda a derecha.",
    "Las copias alteradas suelen cambiar un solo carácter del hash — basta una diferencia minúscula para que ya no sea el mismo archivo.",
    "Recorre cada bloque comparándolo letra por letra contra el certificado de arriba; en cuanto encuentres una diferencia, descarta ese bloque y sigue con el siguiente hasta hallar el único idéntico."
  ]
};
const hintsUsed = {1:0,2:0,3:0,4:0,5:0,6:0};
function updateHintBadge(){
  const btn = $("#hintBtn"), badge = $("#hintBadge");
  if(!btn || !badge) return;
  const hints = roomHints[currentRoomKey];
  if(!hints){ btn.style.display = "none"; return; }
  btn.style.display = "flex";
  const remaining = Math.max(0, hints.length - (hintsUsed[currentRoomKey]||0));
  badge.textContent = remaining;
  btn.classList.toggle("no-hints-left", remaining===0);
  btn.classList.toggle("has-hint", remaining>0);
}
function showPuzzleHint(){
  const hints = roomHints[currentRoomKey];
  if(!hints){ showHintNow(); return; }
  let used = hintsUsed[currentRoomKey]||0;
  if(used < hints.length){
    used++;
    hintsUsed[currentRoomKey] = used;
  }
  const idx = Math.min(used, hints.length) - 1;
  let text = hints[idx];
  if(text === "__ROOM3_DYNAMIC__"){
    text = resolveRoom3DynamicHint();
  }
  const box = $("#subtitleBox");
  box.querySelector(".who").textContent = `Pista ${idx+1}/${hints.length}`;
  box.querySelector(".txt").textContent = text;
  box.classList.add("show");
  if(hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(()=> box.classList.remove("show"), 5200);
  updateHintBadge();
  logHintUse(currentRoomKey, text);
}

/* ===================== TARJETAS DE TEORÍA OBLIGATORIAS ===================== */
const roomIntros = {
  1: {
    title: "Sala 1 · Evolución de la Web",
    sub: "Web 1.0 → Web 2.0 → Web 3.0",
    text: "La Web ha evolucionado en tres grandes etapas. Web 1.0 era estática y de solo lectura: páginas fijas sin interacción. Web 2.0 introdujo contenido generado por los usuarios y redes sociales. Web 3.0 es descentralizada, basada en blockchain, donde los usuarios controlan sus propios datos sin depender de una empresa central.",
    examples: [
      "Web 1.0: páginas HTML personales de los 90s, como las de Geocities.",
      "Web 2.0: redes sociales como Facebook, YouTube o Instagram.",
      "Web 3.0: Bitcoin, Ethereum y aplicaciones DeFi descentralizadas."
    ]
  },
  2: {
    title: "Sala 2 · El proceso de una transacción blockchain",
    sub: "Transacción → Validación → Empaquetado → Minería → Enlace",
    text: "Toda transacción en una blockchain sigue 5 pasos fijos: primero se crea la transacción, luego la red la valida, después se empaqueta junto a otras en un bloque, ese bloque se mina (resuelve un problema computacional) y finalmente se enlaza de forma permanente a la cadena anterior.",
    examples: [
      "Enviar Bitcoin de un monedero a otro sigue exactamente estos 5 pasos.",
      "Una transferencia de Ethereum se valida por los nodos antes de incluirse en un bloque.",
      "Una vez enlazado el bloque, la transacción queda registrada para siempre."
    ]
  },
  3: {
    title: "Sala 3 · Tipos de redes blockchain",
    sub: "Pública · Privada · Híbrida",
    text: "Una blockchain pública es abierta: cualquiera puede unirse, leer y validar transacciones. Una blockchain privada restringe el acceso a un grupo autorizado, controlado por una organización. Una blockchain híbrida combina ambas: partes públicas y partes privadas según la necesidad.",
    examples: [
      "Pública: Bitcoin, Ethereum — cualquier persona puede participar.",
      "Privada: Hyperledger Fabric, JPM Coin — solo bancos o empresas autorizadas.",
      "Híbrida: IBM Food Trust, Dragonchain — datos públicos y privados combinados."
    ]
  },
  4: {
    title: "Sala 4 · Contratos inteligentes y DApps",
    sub: "Código autoejecutable en la blockchain",
    text: "Un contrato inteligente es un programa que se ejecuta automáticamente cuando se cumplen ciertas condiciones, sin necesidad de un intermediario. Una DApp (aplicación descentralizada) es una aplicación construida sobre uno o más contratos inteligentes.",
    examples: [
      "Contratos inteligentes: Uniswap (intercambio automático), seguros paramétricos que pagan solos.",
      "DApps: Uniswap, OpenSea (mercado de NFTs), Aave (préstamos descentralizados).",
      "Un oráculo conecta el contrato con datos del mundo real (por ejemplo, el clima o un precio)."
    ]
  },
  5: {
    title: "Sala 5 · Tipos de tokens",
    sub: "Utilidad · Activo real · Gobernanza",
    text: "Un token de utilidad da acceso a un servicio dentro de una plataforma. Un token de activo real representa la propiedad de algo tangible (tokenización). Un token de gobernanza otorga derecho a votar decisiones sobre un proyecto.",
    examples: [
      "Utilidad: BNB (paga comisiones en Binance), FIL (paga almacenamiento en Filecoin).",
      "Activo real: RealT (fracciones de bienes raíces), PAXG (oro tokenizado).",
      "Gobernanza: UNI, MKR — usados para votar en DAOs (organizaciones autónomas descentralizadas)."
    ]
  },
  6: {
    title: "Sala 6 · NFTs (Tokens No Fungibles)",
    sub: "Certificados únicos de propiedad digital",
    text: "Un NFT es un token único e irrepetible que certifica la propiedad de un activo digital (o vinculado a uno físico). A diferencia de las criptomonedas, cada NFT tiene un hash distinto y no es intercambiable 1 a 1 por otro.",
    examples: [
      "CryptoPunks y Bored Ape Yacht Club: colecciones de arte digital únicas.",
      "NBA Top Shot: momentos deportivos coleccionables tokenizados.",
      "Cada NFT tiene un hash único que prueba su autenticidad y propietario."
    ]
  }
};
const roomIntroShown = {1:false,2:false,3:false,4:false,5:false,6:false};
function showRoomIntro(n){
  if(roomIntroShown[n]) return;
  roomIntroShown[n] = true;
  const data = roomIntros[n];
  if(!data) return;
  $("#roomIntroTitle").textContent = data.title;
  $("#roomIntroSub").textContent = data.sub;
  $("#roomIntroText").textContent = data.text;
  const ul = $("#roomIntroExamples");
  ul.innerHTML = "";
  data.examples.forEach(ex=>{
    const li = document.createElement("li");
    li.textContent = ex;
    ul.appendChild(li);
  });
  $("#ov-roomintro").classList.remove("hidden");
}
$("#btnRoomIntroContinue").onclick = ()=>{
  $("#ov-roomintro").classList.add("hidden");
};

/* ===================== OBJETIVO ACTUAL ===================== */
function setObjective(text){
  const el = $("#objectiveText");
  if(el) el.textContent = text;
}

/* ===================== POSICIONAMIENTO SIN SOLAPES (grid determinista) =====================
   Reemplaza los antiguos métodos de "posición aleatoria con reintento", que podían
   fallar o solaparse en zonas angostas. Reparte n tarjetas en una grilla cols×rows
   calculada según el aspecto de la zona, baraja qué tarjeta va en cada celda, y
   agrega un pequeño jitter (~28% de la celda) para que no se vea perfectamente
   alineado. Garantiza separación mínima de una celda completa entre tarjetas. */
function gridPositions(n, zone){
  const w = zone.xMax - zone.xMin, h = zone.yMax - zone.yMin;
  let cols = Math.max(1, Math.min(n, Math.ceil(Math.sqrt(n * w / h))));
  let rows = Math.ceil(n / cols);
  const cellW = w / cols, cellH = h / rows;
  const cells = [];
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      if(cells.length < n) cells.push({c,r});
    }
  }
  for(let i=cells.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const jitterW = cellW*0.28, jitterH = cellH*0.28;
  return cells.map(({c,r})=>{
    const baseX = zone.xMin + c*cellW + cellW/2;
    const baseY = zone.yMin + r*cellH + cellH/2;
    const x = baseX + (Math.random()*2-1)*jitterW/2;
    const y = baseY + (Math.random()*2-1)*jitterH/2;
    return {x,y};
  });
}

/* ===================== RESALTADO DE OBJETOS INTERACTIVOS ===================== */
function pulse(sel){
  const el = (typeof sel === "string") ? $(sel) : sel;
  if(el) el.classList.add("hotspot-pulse");
}
function unpulse(sel){
  const el = (typeof sel === "string") ? $(sel) : sel;
  if(el) el.classList.remove("hotspot-pulse");
}

/* ===================== ESCENAS ===================== */
function showScene(id){
  $$(".scene").forEach(s=> s.classList.toggle("active", s.id===id));
  if(id==="scn-hallway") currentRoomKey = null;
  updateHintBadge();
}

/* ===================== INVENTARIO ===================== */
function addItem(id, icon, name){
  if(inventory.find(i=>i.id===id)) return;
  inventory.push({id, icon, name: name||""});
  renderInventory();
  logDiscovery(currentRoomKey||"-", `${icon||"🔎"} Encontraste: ${name||id}`.trim());
}
function removeItem(id){
  inventory = inventory.filter(i=>i.id!==id);
  selectedInvId = null;
  renderInventory();
}
function renderInventory(){
  const bar = $("#invBar");
  bar.innerHTML = "";
  inventory.forEach(it=>{
    const d = document.createElement("div");
    d.className = "inv-item" + (selectedInvId===it.id ? " sel":"");
    d.title = it.name || "";
    d.innerHTML = `<div class="inv-ic">${it.icon}</div>${it.name ? `<div class="inv-nm">${it.name}</div>` : ""}`;
    d.onclick = ()=>{
      selectedInvId = (selectedInvId===it.id) ? null : it.id;
      renderInventory();
    };
    bar.appendChild(d);
  });
}

/* ===================== PASILLO ===================== */
const doorMeta = [
  {n:1, status:"active"},
  {n:2, status:"locked"},
  {n:3, status:"locked"},
  {n:4, status:"locked"},
  {n:5, status:"locked"},
  {n:6, status:"locked"},
];
function renderDoors(){
  const row = $("#doorsRow");
  row.innerHTML = "";
  doorMeta.forEach(d=>{
    const div = document.createElement("div");
    div.className = "door " + d.status + (d.status==="active" ? " hotspot-pulse" : "");
    div.innerHTML = `<div class="panel"></div><div class="led"></div>
      <div class="doornum">N-${d.n}</div>
      ${d.status==="locked" ? '<div class="lock">🔒</div>' : ''}`;
    div.onclick = ()=>{
      if(d.status==="locked"){
        div.classList.add("shake");
        setTimeout(()=>div.classList.remove("shake"),450);
        subtitle("ARCA","Ese sector aún está bloqueado por NULO.",2400);
        return;
      }
      if(d.n===1){ enterRoom1(); }
      if(d.n===2){ enterRoom2(); }
      if(d.n===3){ enterRoom3(); }
      if(d.n===4){ enterRoom4(); }
      if(d.n===5){ enterRoom5(); }
      if(d.n===6){ enterRoom6(); }
    };
    row.appendChild(div);
  });
  const activeDoor = doorMeta.find(d=>d.status==="active");
  if(activeDoor) setObjective("Pasillo: el sector N-"+activeDoor.n+" está disponible. Entra ahí.");
  else if(doorMeta.every(d=>d.status==="solved")) setObjective("¡Todos los sectores recuperados!");
  else setObjective("Explora el pasillo.");
}
function unlockNextDoor(currentN){
  const next = doorMeta.find(d=>d.n===currentN+1);
  if(next && next.status==="locked") next.status = "active";
}

/* ===================== SALA 1 ===================== */
let room1Initialized = false;
let drawerOpen=false, usbTaken=false, monitorOn=false, cardsSpawned=false;
let slots = [null,null,null]; // card ids per slot
const eraCards = [
  {id:"cardA", cls:"cardA", order:0, examine:"Una pantalla estática, sin botones ni enlaces que tocar."},
  {id:"cardB", cls:"cardB", order:1, examine:"Cientos de perfiles compartiendo contenido en la misma plataforma."},
  {id:"cardC", cls:"cardC", order:2, examine:"Un registro encadenado, sin una sola empresa que lo controle."}
];

function enterRoom1(){
  currentRoomKey = 1;
  showScene("scn-room1");
  setObjective("Sala 1 · Web 1.0/2.0/3.0 — Explora el cuarto y enciende algo.");
  pulse("#hs-drawer"); pulse("#hs-monitor");
  if(!room1Initialized){
    room1Initialized = true;
    showRoomIntro(1);
    setTimeout(()=> subtitle("ARCA","Algo en este cuarto necesita energía. Busca cómo encenderlo.",3600), 600);
  }
}
$("#backToHall").onclick = ()=> showScene("scn-hallway");

/* Drawer */
$("#hs-drawer").onclick = ()=>{
  drawerOpen = !drawerOpen;
  $("#hs-drawer").classList.toggle("open", drawerOpen);
  if(drawerOpen && !usbTaken){
    setTimeout(()=> $("#usbItem").classList.add("show"), 250);
  } else if(!drawerOpen){
    $("#usbItem").classList.remove("show");
  }
};
$("#usbItem").onclick = (e)=>{
  e.stopPropagation();
  if(usbTaken) return;
  usbTaken = true;
  addItem("usb","💾","Memoria USB");
  $("#usbItem").classList.remove("show");
  unpulse("#hs-drawer");
  subtitle("ARCA","Una memoria USB. Quizás algún dispositivo la necesite.",3000);
  if(monitorOn) setObjective("Selecciona el USB en tu inventario y tócalo con la pantalla.");
  else setObjective("Enciende la pantalla del escritorio.");
};

/* Monitor */
$("#hs-monitor").onclick = ()=>{
  if(!monitorOn){
    monitorOn = true;
    $("#hs-monitor").classList.add("on");
    subtitle("ARCA","La pantalla pide un dispositivo de almacenamiento.",3000);
    if(usbTaken) setObjective("Selecciona el USB en tu inventario y tócalo con la pantalla.");
    else setObjective("Busca un dispositivo de almacenamiento en el cuarto.");
    return;
  }
  if(selectedInvId==="usb" && !cardsSpawned){
    cardsSpawned = true;
    removeItem("usb");
    unpulse("#hs-monitor");
    subtitle("ARCA","Tres archivos dañados salieron a la luz. Examínalos y colócalos en orden en el gabinete.",4200);
    setObjective("Ordena los 3 archivos en el gabinete: del más antiguo al más reciente.");
    pulse("#hs-cabinet");
    spawnEraCards();
  } else if(!cardsSpawned){
    subtitle("ARCA","Necesito algo que pueda conectarse a este puerto.",2600);
  }
};

/* Spawn loose draggable era cards at randomized desk-area positions */
function spawnEraCards(){
  const zone = {xMin:26, xMax:64, yMin:36, yMax:58}; // % within scene
  const positions = gridPositions(eraCards.length, zone);
  eraCards.forEach((card, i)=>{
    const {x,y} = positions[i];
    const el = document.createElement("div");
    el.className = "era-card " + card.cls;
    el.id = "card-"+card.id;
    el.style.left = x+"%";
    el.style.top = y+"%";
    el.dataset.cardId = card.id;
    $("#scn-room1").appendChild(el);
    makeDraggable(el, card);
  });
}

/* Pointer-based drag for era cards */
function makeDraggable(el, cardMeta){
  // homeLeft/homeTop = posición donde apareció la pieza al iniciar el puzzle (fuera de
  // las casillas) — nunca se sobreescribe, para que una suelta inválida regrese ahí.
  const homeLeft = el.style.left, homeTop = el.style.top;
  let dragging=false, offX=0, offY=0;
  let clickStart=0;

  function pct(val, axis){
    const stage = $("#stage").getBoundingClientRect();
    return axis==="x" ? ((val-stage.left)/stage.width*100) : ((val-stage.top)/stage.height*100);
  }

  el.addEventListener("pointerdown", (e)=>{
    if(el.classList.contains("placed")) {
      // picking back up from a slot
      const slotIdx = +el.dataset.slotIdx;
      if(slotIdx>=0) slots[slotIdx]=null;
      el.classList.remove("placed");
      el.parentElement.querySelectorAll(".slot").forEach(s=>{
        if(+s.dataset.slot===slotIdx) s.classList.remove("filled");
      });
    }
    dragging = true;
    clickStart = Date.now();
    el.classList.add("dragging");
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    offX = e.clientX - r.left;
    offY = e.clientY - r.top;
    showExamineHint(cardMeta.examine, e.clientX, e.clientY);
  });
  el.addEventListener("pointermove",(e)=>{
    if(!dragging) return;
    const stage = $("#stage").getBoundingClientRect();
    let leftPx = e.clientX - offX - stage.left;
    let topPx = e.clientY - offY - stage.top;
    el.style.left = (leftPx/stage.width*100)+"%";
    el.style.top = (topPx/stage.height*100)+"%";
  });
  el.addEventListener("pointerup",(e)=>{
    if(!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    hideExamineHint();
    const heldMs = Date.now()-clickStart;
    // check slot overlap
    const cardRect = el.getBoundingClientRect();
    const cx = cardRect.left + cardRect.width/2;
    const cy = cardRect.top + cardRect.height/2;
    let dropped = false;
    document.querySelectorAll(".slot").forEach(slotEl=>{
      const sr = slotEl.getBoundingClientRect();
      const slotIdx = +slotEl.dataset.slot;
      if(cx>sr.left && cx<sr.right && cy>sr.top && cy<sr.bottom && slots[slotIdx]===null && !dropped){
        dropped = true;
        snapToSlot(el, slotEl, cardMeta);
      }
    });
    if(!dropped){
      el.style.left = homeLeft;
      el.style.top = homeTop;
    }
    if(heldMs < 180){
      subtitle("ARCA", cardMeta.examine, 2600);
    }
  });
}

function snapToSlot(cardEl, slotEl, cardMeta){
  const stage = $("#stage").getBoundingClientRect();
  const sr = slotEl.getBoundingClientRect();
  const cr = cardEl.getBoundingClientRect();
  const left = (sr.left + sr.width/2 - cr.width/2 - stage.left)/stage.width*100;
  const top = (sr.top + sr.height/2 - cr.height/2 - stage.top)/stage.height*100;
  cardEl.style.left = left+"%";
  cardEl.style.top = top+"%";
  cardEl.classList.add("placed");
  const slotIdx = +slotEl.dataset.slot;
  cardEl.dataset.slotIdx = slotIdx;
  slots[slotIdx] = cardMeta.id;
  slotEl.classList.add("filled");
  checkCabinetOrder();
}

let room1CheckGen = 0;
function checkCabinetOrder(){
  if(slots.includes(null)) return;
  const orderMap = {cardA:0, cardB:1, cardC:2};
  const correct = slots.every((cid, idx)=> orderMap[cid]===idx);
  if(correct){
    room1CheckGen++;
    unlockCabinet();
  } else {
    const gen = ++room1CheckGen;
    $("#hs-cabinet").classList.add("shake");
    loseLife();
    subtitle("ARCA","Algo no conecta bien. Vuelve a intentarlo.",2800);
    setTimeout(()=>{
      $("#hs-cabinet").classList.remove("shake");
      // Solo reiniciar si el tablero no cambió desde esta detección de error —
      // evita que un reinicio atrasado borre un intento nuevo ya correcto.
      if(gen===room1CheckGen) resetCardsToScene();
    }, 700);
  }
}
function resetCardsToScene(){
  slots = [null,null,null];
  document.querySelectorAll(".slot").forEach(s=>s.classList.remove("filled"));
  document.querySelectorAll(".era-card").forEach(el=>{
    el.classList.remove("placed");
    delete el.dataset.slotIdx;
  });
  const zone = {xMin:26, xMax:64, yMin:36, yMax:58};
  const cards = document.querySelectorAll(".era-card");
  const positions = gridPositions(cards.length, zone);
  cards.forEach((el, i)=>{
    el.style.left = positions[i].x+"%";
    el.style.top = positions[i].y+"%";
  });
}

let cabinetWasLocked = true;
$("#hs-cabinet").addEventListener("click", (e)=>{
  if(e.target.closest(".era-card")) return;
  if(cabinetWasLocked && !cardsSpawned){
    $("#hs-cabinet").classList.add("shake");
    setTimeout(()=> $("#hs-cabinet").classList.remove("shake"), 450);
    subtitle("ARCA","Está cerrado. Necesito otra forma de abrirlo.",2400);
  }
});

function unlockCabinet(){
  cabinetWasLocked = false;
  unpulse("#hs-cabinet");
  $("#cabinetPadlock").classList.add("gone");
  $("#cabinetDoor").classList.add("swing");
  subtitle("ARCA","¡Conexión correcta! El gabinete se abrió.",3200);
  setObjective("Recoge el fragmento de letra que apareció.");
  $("#fragmentB").textContent = roomLetterAssignment[1];
  setTimeout(()=>{
    $("#fragmentB").classList.add("show");
  }, 500);
}
$("#fragmentB").onclick = (e)=>{
  e.stopPropagation();
  const letter = roomLetterAssignment[1];
  addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
  $("#fragmentB").classList.remove("show");
  $("#fragmentB").style.pointerEvents = "none";
  subtitle("ARCA","Fragmento "+letter+" recuperado. El pasillo reconoce tu progreso.",3400);
  doorMeta[0].status = "solved";
  unlockNextDoor(1);
  setObjective("Vuelve al pasillo. Un nuevo sector está disponible.");
  setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
};

/* Examine hint tooltip */
function showExamineHint(text,x,y){ /* reserved for future hover hints */ }
function hideExamineHint(){}

/* ===================== MOTOR GENÉRICO DE ARRASTRAR-Y-SOLTAR ===================== */
/* Reutilizable por cualquier sala: arma piezas sueltas que se arrastran a "slots".
   opts:{id, scene, slotSelector, cardClass, cards:[{id,cls,label,examine}], zone, slotsCount, checkFn, onSolved, onWrong} */
function createDragPuzzle(opts){
  let slots = new Array(opts.slotsCount).fill(null);
  const cardEls = {};

  function spawn(){
    const positions = gridPositions(opts.cards.length, opts.zone);
    opts.cards.forEach((card, i)=>{
      const {x,y} = positions[i];
      const el = document.createElement("div");
      el.className = opts.cardClass + " " + card.cls;
      el.id = "pc-"+opts.id+"-"+card.id;
      el.style.left = x+"%"; el.style.top = y+"%";
      el.dataset.cardId = card.id;
      if(card.label) el.textContent = card.label;
      if(card.name){
        const nm = document.createElement("span");
        nm.className = "chiplabel";
        nm.textContent = card.name;
        el.appendChild(nm);
      }
      $(opts.scene).appendChild(el);
      cardEls[card.id] = el;
      attachDrag(el, card);
    });
  }

  function attachDrag(el, cardMeta){
    // homeLeft/homeTop = the spot where this piece first appeared (outside any slot),
    // captured once and never overwritten — this is "donde estaba al principio".
    const homeLeft = el.style.left, homeTop = el.style.top;
    let dragging=false, offX=0, offY=0, clickStart=0;
    el.addEventListener("pointerdown",(e)=>{
      if(el.classList.contains("placed")){
        const slotIdx = +el.dataset.slotIdx;
        slots[slotIdx] = null;
        el.classList.remove("placed");
        document.querySelectorAll(opts.slotSelector).forEach(s=>{
          if(+s.dataset.slot===slotIdx) s.classList.remove("filled");
        });
      }
      dragging = true; clickStart = Date.now();
      el.classList.add("dragging"); el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect(); offX = e.clientX-r.left; offY = e.clientY-r.top;
    });
    el.addEventListener("pointermove",(e)=>{
      if(!dragging) return;
      const stage = $("#stage").getBoundingClientRect();
      let leftPx = e.clientX-offX-stage.left, topPx = e.clientY-offY-stage.top;
      el.style.left = (leftPx/stage.width*100)+"%";
      el.style.top = (topPx/stage.height*100)+"%";
    });
    el.addEventListener("pointerup",(e)=>{
      if(!dragging) return;
      dragging = false; el.classList.remove("dragging");
      const heldMs = Date.now()-clickStart;
      const cardRect = el.getBoundingClientRect();
      const cx = cardRect.left+cardRect.width/2, cy = cardRect.top+cardRect.height/2;
      let dropped = false;
      document.querySelectorAll(opts.slotSelector).forEach(slotEl=>{
        const sr = slotEl.getBoundingClientRect();
        const slotIdx = +slotEl.dataset.slot;
        if(cx>sr.left && cx<sr.right && cy>sr.top && cy<sr.bottom && slots[slotIdx]===null && !dropped){
          dropped = true; snap(el, slotEl, cardMeta);
        }
      });
      if(!dropped){
        // Invalid drop (empty space, on top of another piece, or onto an already-occupied
        // slot) — the piece's old slot was already freed on pointerdown, so just send the
        // piece back to its very first position outside the board instead of leaving it
        // floating wherever it was released.
        el.style.left = homeLeft; el.style.top = homeTop;
      }
      if(heldMs < 180 && cardMeta.examine) subtitle("ARCA", cardMeta.examine, 2600);
    });
  }

  function snap(cardEl, slotEl, cardMeta){
    const stage = $("#stage").getBoundingClientRect();
    const sr = slotEl.getBoundingClientRect(), cr = cardEl.getBoundingClientRect();
    const left = (sr.left+sr.width/2-cr.width/2-stage.left)/stage.width*100;
    const top = (sr.top+sr.height/2-cr.height/2-stage.top)/stage.height*100;
    cardEl.style.left = left+"%"; cardEl.style.top = top+"%";
    cardEl.classList.add("placed");
    const slotIdx = +slotEl.dataset.slot;
    cardEl.dataset.slotIdx = slotIdx;
    slots[slotIdx] = cardMeta.id;
    slotEl.classList.add("filled");
    checkAll();
  }

  let checkGen = 0;
  function checkAll(){
    if(slots.includes(null)) return;
    if(opts.checkFn(slots)){ checkGen++; opts.onSolved(slots); }
    else {
      const gen = ++checkGen;
      opts.onWrong && opts.onWrong();
      loseLife();
      setTimeout(()=>{
        // Only reset if the board hasn't been changed again since this wrong check
        // (e.g. the player pulled a piece back out before the auto-reset fired) —
        // otherwise this stale timeout would wipe out a newer, possibly-correct attempt.
        if(gen===checkGen) reset();
      }, 700);
    }
  }

  function reset(){
    slots = new Array(opts.slotsCount).fill(null);
    document.querySelectorAll(opts.slotSelector).forEach(s=>s.classList.remove("filled"));
    const positions = gridPositions(opts.cards.length, opts.zone);
    opts.cards.forEach((card, i)=>{
      const el = cardEls[card.id];
      el.classList.remove("placed");
      delete el.dataset.slotIdx;
      el.style.left = positions[i].x+"%"; el.style.top = positions[i].y+"%";
    });
  }

  return {spawn, reset};
}

/* ===================== SALA 2: CONSOLA DE RED ===================== */
let room2Initialized=false, toolboxOpen=false, toolkitTaken=false, netOpened=false, room2Puzzle=null;
const room2Cards = [
  {id:"step0", cls:"n0", label:"⚡", name:"Transacción", order:0, examine:"Un impulso de datos saliendo de un monedero digital."},
  {id:"step1", cls:"n1", label:"🔍", name:"Validación", order:1, examine:"Nodos comparando que todo esté en orden antes de aceptar nada."},
  {id:"step2", cls:"n2", label:"📦", name:"Empaquetado", order:2, examine:"La información ya empaquetada, lista para unirse a la cadena."},
  {id:"step3", cls:"n3", label:"⛏", name:"Minería", order:3, examine:"Una competencia de cómputo para sellar el paquete con un código único."},
  {id:"step4", cls:"n4", label:"⛓", name:"Enlace", order:4, examine:"El eslabón final, ahora imposible de separar del resto."},
];
function enterRoom2(){
  currentRoomKey = 2;
  showScene("scn-room2");
  setObjective("Sala 2 · Los 5 pasos del blockchain — Busca una herramienta.");
  pulse("#hs-toolbox");
  if(!room2Initialized){
    room2Initialized = true;
    showRoomIntro(2);
    setTimeout(()=> subtitle("ARCA","Esta consola de red está dañada. Necesito una herramienta para abrirla.",3800), 600);
  }
}
$("#backToHall2").onclick = ()=> showScene("scn-hallway");
$("#hs-toolbox").onclick = ()=>{
  toolboxOpen = !toolboxOpen;
  $("#hs-toolbox").classList.toggle("open", toolboxOpen);
  if(toolboxOpen && !toolkitTaken) setTimeout(()=> $("#toolboxItem").classList.add("show"), 250);
  else if(!toolboxOpen) $("#toolboxItem").classList.remove("show");
};
$("#toolboxItem").onclick = (e)=>{
  e.stopPropagation();
  if(toolkitTaken) return;
  toolkitTaken = true;
  addItem("toolkit","🧰","Kit de herramientas");
  $("#toolboxItem").classList.remove("show");
  unpulse("#hs-toolbox");
  pulse("#hs-netcover");
  subtitle("ARCA","Un kit de herramientas. Podría abrir paneles atascados.",3000);
  setObjective("Selecciona la herramienta y usa el panel de red.");
};
$("#hs-netcover").onclick = ()=>{
  if(netOpened) return;
  if(selectedInvId==="toolkit"){
    netOpened = true;
    $("#hs-netcover").classList.add("open");
    unpulse("#hs-netcover");
    removeItem("toolkit");
    subtitle("ARCA","Cinco fragmentos de proceso quedaron sueltos. Reconéctalos en el orden correcto.",4200);
    setObjective("Conecta los 5 fragmentos en el orden correcto del proceso.");
    buildRoom2Hexes();
    room2Puzzle = createDragPuzzle({
      id:"r2", scene:"#scn-room2", slotSelector:"#netHexes .hexsocket", cardClass:"node-chip",
      cards: room2Cards, zone:{xMin:24,xMax:74,yMin:74,yMax:80}, slotsCount:5,
      checkFn: (slots)=>{
        const orderMap = {step0:0,step1:1,step2:2,step3:3,step4:4};
        return slots.every((cid,idx)=> orderMap[cid]===idx);
      },
      onSolved: ()=> unlockRoom2(),
      onWrong: ()=>{
        $("#netHexes").classList.add("shake");
        setTimeout(()=> $("#netHexes").classList.remove("shake"), 450);
        subtitle("ARCA","Ese orden no estabiliza la red. Vuelve a intentarlo.",2800);
      }
    });
    room2Puzzle.spawn();
  } else {
    $("#hs-netcover").classList.add("shake");
    setTimeout(()=> $("#hs-netcover").classList.remove("shake"), 450);
    subtitle("ARCA","Está atascado. Necesito una herramienta.",2400);
  }
};
function buildRoom2Hexes(){
  const hex = $("#netHexes");
  hex.innerHTML = "";
  const positions = [
    {left:"6%", top:"8%"}, {left:"30%", top:"30%"}, {left:"54%", top:"8%"},
    {left:"6%", top:"58%"}, {left:"54%", top:"58%"}
  ];
  positions.forEach((p,i)=>{
    const d = document.createElement("div");
    d.className = "hexsocket";
    d.dataset.slot = i;
    d.style.left = p.left; d.style.top = p.top;
    const badge = document.createElement("span");
    badge.className = "slotnum";
    badge.textContent = (i+1);
    d.appendChild(badge);
    hex.appendChild(d);
  });
}
function unlockRoom2(){
  const letter = roomLetterAssignment[2];
  subtitle("ARCA","¡Red estabilizada! Un fragmento quedó expuesto en el panel.",3400);
  setObjective("Recoge el fragmento de letra del panel.");
  const frag = document.createElement("div");
  frag.className = "fragmentGlow show";
  frag.id = "fragmentRoom2";
  frag.textContent = letter;
  frag.style.left = "50%"; frag.style.top = "50%";
  $("#netHexes").appendChild(frag);
  frag.onclick = (e)=>{
    e.stopPropagation();
    addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
    frag.remove();
    subtitle("ARCA","Fragmento "+letter+" recuperado.",3000);
    doorMeta[1].status = "solved";
    unlockNextDoor(2);
    setObjective("Vuelve al pasillo. Un nuevo sector está disponible.");
    setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
  };
}

/* ===================== SALA 3: MAPA DE RED ===================== */
let room3Initialized=false, breakerOn=false, room3Built=false;
const room3Types = [
  {id:"pub", icon:"🌐", name:"Pública", examine:"Cualquiera puede unirse, ver y validar. Nadie pide permiso. Así funcionan Bitcoin o Ethereum.", examples:"Bitcoin · Ethereum"},
  {id:"priv", icon:"🏛", name:"Privada", examine:"Una sola organización controla quién entra y valida. Útil para el libro contable interno de un banco.", examples:"Hyperledger · JPM Coin"},
  {id:"hyb", icon:"🔗", name:"Híbrida", examine:"Varias organizaciones de confianza se reparten el control, como un consorcio entre empresas aliadas.", examples:"IBM Food Trust"},
];
let room3RequiredType = [];
function resolveRoom3DynamicHint(){
  if(!room3RequiredType.length) return "Primero activa el interruptor de energía para revelar los nodos.";
  const nameById = {};
  room3Types.forEach(t=> nameById[t.id] = t.name);
  const parts = room3RequiredType.map((id,i)=> `Nodo ${i+1} → ${nameById[id]}`);
  return "Orden exacto de esta partida: " + parts.join(", ") + ". Arrastra cada ficha al nodo que le corresponda.";
}
function enterRoom3(){
  currentRoomKey = 3;
  showScene("scn-room3");
  setObjective("Sala 3 · Tipos de blockchain — Busca el interruptor de energía.");
  pulse("#hs-breaker");
  if(!room3Initialized){
    room3Initialized = true;
    showRoomIntro(3);
    setTimeout(()=> subtitle("ARCA","Sin energía no podré leer estos nodos. Busca el interruptor.",3600), 600);
  }
}
$("#backToHall3").onclick = ()=> showScene("scn-hallway");
$("#hs-breaker").onclick = ()=>{
  if(breakerOn) return;
  breakerOn = true;
  $("#hs-breaker").classList.add("on");
  unpulse("#hs-breaker");
  subtitle("ARCA","Energía restaurada. Conecta cada nodo con la red a la que pertenece.",4000);
  setObjective("Conecta cada nodo con el tipo de red que le corresponde (público/privado/híbrido).");
  buildRoom3();
};
function buildRoom3(){
  if(room3Built) return;
  room3Built = true;
  const shuffled = [...room3Types].sort(()=>Math.random()-0.5);
  room3RequiredType = new Array(3);
  const hubsRow = $("#hubsRow3");
  hubsRow.innerHTML = "";
  shuffled.forEach((t,i)=>{
    room3RequiredType[i] = t.id;
    const d = document.createElement("div");
    d.className = "hub"; d.dataset.slot = i;
    d.innerHTML = `<div class="hubicon">🖧</div><div class="nodeTextWrap"><span class="hublabel">Nodo ${i+1}</span><span class="hubexamples">${t.examples}</span></div>`;
    hubsRow.appendChild(d);
  });
  const cards = room3Types.map(t=>({id:t.id, cls:"n"+t.id, label:t.icon, name:t.name, examine:t.examine}));
  const puzzle = createDragPuzzle({
    id:"r3", scene:"#scn-room3", slotSelector:"#hubsRow3 .hub", cardClass:"node-chip",
    cards, zone:{xMin:22,xMax:78,yMin:54,yMax:74}, slotsCount:3,
    checkFn: (slots)=> slots.every((cid,idx)=> cid===room3RequiredType[idx]),
    onSolved: ()=> unlockRoom3(),
    onWrong: ()=>{
      $("#hubsRow3").classList.add("shake");
      setTimeout(()=> $("#hubsRow3").classList.remove("shake"), 450);
      subtitle("ARCA","Esa conexión no corresponde. Vuelve a intentarlo.",2800);
    }
  });
  puzzle.spawn();
}
function unlockRoom3(){
  const letter = roomLetterAssignment[3];
  subtitle("ARCA","¡Red mapeada correctamente! Un fragmento se liberó.",3400);
  setObjective("Recoge el fragmento de letra liberado.");
  const frag = document.createElement("div");
  frag.className = "fragmentGlow show";
  frag.id = "fragmentRoom3"; frag.textContent = letter;
  frag.style.left = "50%"; frag.style.top = "8%";
  $("#scn-room3").appendChild(frag);
  frag.onclick = (e)=>{
    e.stopPropagation();
    addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
    frag.remove();
    subtitle("ARCA","Fragmento "+letter+" recuperado.",3000);
    doorMeta[2].status = "solved";
    unlockNextDoor(3);
    setObjective("Vuelve al pasillo. Un nuevo sector está disponible.");
    setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
  };
}

/* ===================== SALA 4 — CONTRATOS INTELIGENTES / DAPPS =====================
   Nota: siguiendo la decisión de Nicole, esta sala (aún no construida antes) usa
   SOLO aleatorización de posiciones en pantalla — la lógica correcta es fija:
   - El cajón donde aparece la nota con el código se elige al azar entre 3 (visual).
   - El orden visual de los 3 cables (izq/centro/der) se baraja, pero el cable
     "correcto" (verde = fuente de datos verificada por el oráculo) es siempre
     el mismo conceptualmente; solo cambia su posición en pantalla. */
let room4Initialized = false;
let room4NoteDrawer = 1;
let room4NoteFound = false;
let room4Armed = false;
let room4Solved = false;
let room4CablesCut = new Set();

function enterRoom4(){
  currentRoomKey = 4;
  showScene("scn-room4");
  setObjective("Sala 4 · Contratos inteligentes — Revisa el archivero en busca de pistas.");
  pulse("#hs-filecab");
  if(!room4Initialized){
    room4Initialized = true;
    showRoomIntro(4);
    room4NoteDrawer = 1 + Math.floor(Math.random()*3); // solo posición, no afecta la lógica
    setTimeout(()=> subtitle("ARCA","Un contrato inteligente es código que vive en la blockchain y se ejecuta solo, automáticamente, cuando se cumple una condición — nadie tiene que activarlo a mano. Una DApp es, justamente, una aplicación construida sobre contratos como este.",5600), 600);
    setTimeout(()=> subtitle("ARCA","Hay un contrato pendiente de ejecución. Busca instrucciones en el archivero.",3600), 6300);
  }
}
$("#backToHall4").onclick = ()=> showScene("scn-hallway");

[1,2,3].forEach(i=>{
  const d = $("#fdrawer"+i);
  d.onclick = ()=>{
    if(d.classList.contains("open")) return;
    d.classList.add("open");
    if(i===room4NoteDrawer && !room4NoteFound){
      const note = $("#noteItem");
      const tops = {1:"23%",2:"41%",3:"58%"};
      note.style.left = "23%";
      note.style.top = tops[i];
      note.classList.add("show");
    }
  };
});
$("#noteItem").onclick = (e)=>{
  e.stopPropagation();
  if(room4NoteFound) return;
  room4NoteFound = true;
  $("#noteItem").classList.remove("show");
  unpulse("#hs-filecab");
  const noteText = "\"El contrato se autoejecuta solo cuando el oráculo confirma el dato externo. Código de activación: ORACULO.\"";
  showNotice("Nota", noteText, 6200);
  logDiscovery(4, `📄 Nota encontrada: ${noteText}`);
  setObjective("Introduce el código de activación en la terminal del contrato.");
  pulse("#hs-termbox");
};

function shuffleRoom4Cables(){
  const container = document.querySelector("#scn-room4 .cables");
  const cables = Array.from(container.children);
  for(let i=cables.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [cables[i],cables[j]] = [cables[j],cables[i]];
  }
  cables.forEach(c=> container.appendChild(c));
}

$("#termBtn").onclick = ()=>{
  if(room4Armed) return;
  if(!room4NoteFound){
    subtitle("ARCA","Necesitas encontrar el código de activación antes de usar la terminal.",2800);
    return;
  }
  const val = $("#termInput").value.trim().toUpperCase();
  if(val === "ORACULO"){
    room4Armed = true;
    $("#hs-termbox").classList.add("armed");
    unpulse("#hs-termbox");
    shuffleRoom4Cables();
    subtitle("ARCA","Contrato armado. Corta los cables que no correspondan a una fuente verificada por el oráculo, y deja conectado el cable correcto.",4400);
    setObjective("Corta los cables que no correspondan a una fuente verificada por el oráculo. Si no sabes cuál es, usa una pista.");
    pulse(".cables");
    $("#cablesHint").classList.add("show");
  } else {
    loseLife();
    subtitle("ARCA","Código incorrecto. Revisa la nota nuevamente.",2800);
    $("#termInput").value = "";
  }
};
$("#termInput").addEventListener("keydown",(e)=>{
  if(e.key==="Enter"){ e.preventDefault(); $("#termBtn").click(); }
});

function resetRoom4Cables(){
  room4CablesCut.clear();
  document.querySelectorAll("#scn-room4 .cable").forEach(c=> c.classList.remove("cut"));
}
function checkRoom4Solved(){
  if(room4CablesCut.has("red") && room4CablesCut.has("blue") && !room4CablesCut.has("green")){
    room4Solved = true;
    unpulse(".cables");
    unlockRoom4();
  }
}
document.querySelectorAll("#scn-room4 .cable").forEach(cableEl=>{
  cableEl.onclick = ()=>{
    if(!room4Armed || room4Solved) return;
    if(cableEl.classList.contains("cut")) return;
    const color = cableEl.dataset.c;
    cableEl.classList.add("cut");
    room4CablesCut.add(color);
    if(color === "green"){
      loseLife();
      subtitle("ARCA","¡Ese cable alimentaba la fuente verificada! El contrato se reinició.",3200);
      setTimeout(resetRoom4Cables, 700);
      return;
    }
    checkRoom4Solved();
  };
});
function unlockRoom4(){
  $("#cablesHint").classList.remove("show");
  const letter = roomLetterAssignment[4];
  subtitle("ARCA","¡Contrato ejecutado correctamente! Un fragmento se liberó.",3400);
  setObjective("Recoge el fragmento de letra liberado.");
  const frag = document.createElement("div");
  frag.className = "fragmentGlow show";
  frag.id = "fragmentRoom4"; frag.textContent = letter;
  frag.style.left = "50%"; frag.style.top = "10%";
  $("#scn-room4").appendChild(frag);
  frag.onclick = (e)=>{
    e.stopPropagation();
    addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
    frag.remove();
    subtitle("ARCA","Fragmento "+letter+" recuperado.",3000);
    doorMeta[3].status = "solved";
    unlockNextDoor(4);
    setObjective("Vuelve al pasillo. Un nuevo sector está disponible.");
    setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
  };
}

/* ===================== SALA 5 — TOKENIZACIÓN =====================
   "Solo posiciones en pantalla": los 3 receptáculos (tokenhub) quedan en un
   ORDEN FIJO (utilidad, activo real, gobernanza) — la lógica no se baraja.
   Lo único aleatorio es la posición en pantalla donde aparecen las fichas
   (token-chip) al abrir la bóveda, vía gridPositions(). */
let room5Initialized = false;
let room5CrateOpened = false;
let room5ReaderTaken = false;
let room5VaultOpen = false;
const room5Types = [
  {id:"util", icon:"💱", chipIcon:"💱", label:"Token de utilidad", short:"Utilidad", examine:"Sirve para pagar comisiones o acceder a un servicio dentro de la red.", examples:"BNB · FIL"},
  {id:"asset", icon:"🏠", chipIcon:"🏠", label:"Token de activo real", short:"Activo real", examine:"Representa la propiedad de un bien físico, como un inmueble, tokenizado en la blockchain.", examples:"RealT · PAX Gold"},
  {id:"gov", icon:"🗳️", chipIcon:"🗳️", label:"Token de gobernanza", short:"Gobernanza", examine:"Otorga derecho a voto sobre las decisiones de una organización descentralizada (DAO).", examples:"Uniswap (UNI) · MakerDAO (MKR)"}
];

function enterRoom5(){
  currentRoomKey = 5;
  showScene("scn-room5");
  setObjective("Sala 5 · Tokenización — Examina la caja sellada.");
  pulse("#hs-crate");
  if(!room5Initialized){
    room5Initialized = true;
    showRoomIntro(5);
    buildRoom5QrPattern();
    buildRoom5Hubs();
    setTimeout(()=> subtitle("ARCA","Esa caja parece sellada con un lector. Tal vez se pueda escanear.",3600), 600);
  }
}
$("#backToHall5").onclick = ()=> showScene("scn-hallway");

function buildRoom5QrPattern(){
  const grid = $("#qrPattern");
  grid.innerHTML = "";
  for(let i=0;i<16;i++){
    const s = document.createElement("span");
    grid.appendChild(s);
  }
}
function buildRoom5Hubs(){
  const hubs = $("#tokenSlots");
  hubs.innerHTML = "";
  room5Types.forEach((t,i)=>{
    const d = document.createElement("div");
    d.className = "tokenhub"; d.dataset.slot = i;
    d.innerHTML = `<div class="hubicon">🔒</div><span class="hubexamples">${t.examples}</span>`;
    hubs.appendChild(d);
  });
}

$("#hs-crate").onclick = ()=>{
  if(room5CrateOpened) return;
  room5CrateOpened = true;
  unpulse("#hs-crate");
  const spans = $("#qrPattern").querySelectorAll("span");
  let i = 0;
  const lightUp = setInterval(()=>{
    if(i>0) spans[i-1] && spans[i-1].classList.remove("on");
    if(i < spans.length){
      spans[i].classList.add("on");
      i++;
    } else {
      clearInterval(lightUp);
      spans.forEach(s=> s.classList.remove("on"));
      addItem("reader5","📡","Lector de tokens");
      subtitle("ARCA","La caja liberó un lector de tokens. Selecciónalo y úsalo sobre la bóveda.",4000);
      setObjective("Usa el lector sobre la puerta de la bóveda.");
      pulse("#vaultDoor");
    }
  }, 110);
};

$("#vaultDoor").onclick = ()=>{
  if(room5VaultOpen) return;
  if(selectedInvId !== "reader5"){
    subtitle("ARCA","La puerta necesita el lector de tokens.",2600);
    return;
  }
  room5VaultOpen = true;
  removeItem("reader5");
  unpulse("#vaultDoor");
  $("#vaultDoor").classList.add("open");
  subtitle("ARCA","Bóveda abierta. Coloca cada ficha en el receptáculo que le corresponde.",4200);
  setObjective("Coloca cada token en el receptáculo correcto según su función.");
  buildRoom5TokenPuzzle();
};

function buildRoom5TokenPuzzle(){
  const cards = room5Types.map((t,i)=> ({id:t.id, cls:"t"+i, label:t.chipIcon, name:t.short, examine:t.examine}));
  const puzzle = createDragPuzzle({
    id:"r5", scene:"#scn-room5", slotSelector:"#tokenSlots .tokenhub", cardClass:"token-chip",
    cards, zone:{xMin:8,xMax:92,yMin:58,yMax:74}, slotsCount:3,
    checkFn: (slots)=> room5Types.every((t,idx)=> slots[idx]===t.id),
    onSolved: ()=> unlockRoom5(),
    onWrong: ()=>{
      $("#tokenSlots").classList.add("shake");
      setTimeout(()=> $("#tokenSlots").classList.remove("shake"), 450);
      subtitle("ARCA","Esa ficha no corresponde a ese receptáculo. Vuelve a intentarlo.",2800);
    }
  });
  puzzle.spawn();
}
function unlockRoom5(){
  const letter = roomLetterAssignment[5];
  subtitle("ARCA","¡Tokens asignados correctamente! Un fragmento se liberó.",3400);
  setObjective("Recoge el fragmento de letra liberado.");
  const frag = document.createElement("div");
  frag.className = "fragmentGlow show";
  frag.id = "fragmentRoom5"; frag.textContent = letter;
  frag.style.left = "50%"; frag.style.top = "8%";
  $("#scn-room5").appendChild(frag);
  frag.onclick = (e)=>{
    e.stopPropagation();
    addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
    frag.remove();
    subtitle("ARCA","Fragmento "+letter+" recuperado.",3000);
    doorMeta[4].status = "solved";
    unlockNextDoor(5);
    setObjective("Vuelve al pasillo. Un nuevo sector está disponible.");
    setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
  };
}

/* ===================== SALA 6 — NFTs =====================
   "Solo posiciones en pantalla": el hash original (certificado) es siempre
   el mismo dato lógico. Lo único aleatorio es CUÁL de los 6 bloques en
   pantalla contiene la copia auténtica — las otras 5 son alteraciones de
   1 carácter, generadas y posicionadas al azar cada partida. */
let room6Initialized = false;
let room6Solved = false;
const room6BaseHash = "0x4F2A9D31";

function room6Altered(base){
  const hexChars = "0123456789ABCDEF";
  const arr = base.split("");
  const pos = 2 + Math.floor(Math.random()*(arr.length-2)); // evita tocar "0x"
  let newChar;
  do { newChar = hexChars[Math.floor(Math.random()*16)]; } while(newChar === arr[pos].toUpperCase());
  arr[pos] = newChar;
  return arr.join("");
}

function enterRoom6(){
  currentRoomKey = 6;
  showScene("scn-room6");
  setObjective("Sala 6 · NFTs — Compara el certificado con los bloques de hash.");
  pulse("#hashGrid");
  if(!room6Initialized){
    room6Initialized = true;
    showRoomIntro(6);
    $("#hashRefValue").textContent = room6BaseHash;
    buildRoom6Grid();
    setTimeout(()=> subtitle("ARCA","Un NFT es un certificado de propiedad digital único: un código (hash) que identifica exactamente a esa pieza, sin que existan dos iguales. Si alguien altera un solo carácter del archivo original, el hash cambia por completo y deja de coincidir.",5600), 600);
    setTimeout(()=> subtitle("ARCA","Solo una de estas copias coincide exactamente con el certificado original. Las demás fueron alteradas.",4200), 6300);
  }
}
$("#backToHall6").onclick = ()=> showScene("scn-hallway");

function buildRoom6Grid(){
  const altered = new Set();
  while(altered.size < 5){
    altered.add(room6Altered(room6BaseHash));
  }
  const values = [room6BaseHash, ...altered];
  for(let i=values.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [values[i],values[j]] = [values[j],values[i]];
  }
  const grid = $("#hashGrid");
  grid.innerHTML = "";
  values.forEach(v=>{
    const d = document.createElement("div");
    d.className = "hashblock";
    d.textContent = v;
    d.dataset.value = v;
    d.onclick = ()=> handleRoom6Pick(d, v);
    grid.appendChild(d);
  });
}
function handleRoom6Pick(el, value){
  if(room6Solved) return;
  if(el.classList.contains("wrong-pick")) return;
  if(value === room6BaseHash){
    room6Solved = true;
    el.classList.add("correct-pick");
    unpulse("#hashGrid");
    unlockRoom6();
  } else {
    el.classList.add("wrong-pick");
    loseLife();
    subtitle("ARCA","Esa copia fue alterada — no coincide con el certificado. Vuelve a comparar con cuidado.",3200);
    setTimeout(()=> el.classList.remove("wrong-pick"), 700);
  }
}
function unlockRoom6(){
  const letter = roomLetterAssignment[6];
  subtitle("ARCA","¡Certificado verificado! Un fragmento se liberó.",3400);
  setObjective("Recoge el fragmento de letra liberado.");
  const frag = document.createElement("div");
  frag.className = "fragmentGlow show";
  frag.id = "fragmentRoom6"; frag.textContent = letter;
  frag.style.left = "50%"; frag.style.top = "82%";
  $("#scn-room6").appendChild(frag);
  frag.onclick = (e)=>{
    e.stopPropagation();
    addItem("frag"+letter, "🔠"+letter, "Fragmento "+letter);
    frag.remove();
    subtitle("ARCA","Fragmento "+letter+" recuperado. ¡Has reunido toda la palabra!",3200);
    doorMeta[5].status = "solved";
    setObjective("Vuelve al pasillo. Has completado todos los sectores.");
    setTimeout(()=>{ showScene("scn-hallway"); renderDoors(); checkGameComplete(); }, 1800);
  };
}

/* ===================== UI WIRING ===================== */
$("#btnPlay").onclick = ()=>{
  $("#ov-title").classList.add("hidden");
  $("#ov-name").classList.remove("hidden");
};
$("#btnStart").onclick = ()=>{
  const name = $("#introName").value.trim();
  if(name.length < 3){
    $("#introName").classList.add("invalid");
    $("#introNameError").classList.add("show");
    $("#introName").focus();
    return;
  }
  $("#introName").classList.remove("invalid");
  $("#introNameError").classList.remove("show");
  playerName = name;
  assignRoomLetters();
  $("#ov-name").classList.add("hidden");
  showScene("scn-hallway");
  renderDoors();
  setObjective("Explora el pasillo. El sector 1 está activo, el resto sigue bloqueado.");
  startGameTimer();
};
$("#introName").addEventListener("input", ()=>{
  $("#introName").classList.remove("invalid");
  $("#introNameError").classList.remove("show");
});
$("#introName").addEventListener("keydown",(e)=>{
  if(e.key==="Enter"){ e.preventDefault(); $("#btnStart").click(); }
});
/* ===================== GLOSARIO ===================== */
const glossaryTerms = [
  {term:"Blockchain", def:"Una cadena de bloques de datos enlazados criptográficamente, distribuida entre muchos nodos, donde la información ya escrita no se puede alterar."},
  {term:"Nodo", def:"Cada computadora conectada a la red blockchain que guarda una copia de la cadena y ayuda a validarla."},
  {term:"Web 1.0", def:"Primera etapa de Internet: páginas estáticas, de solo lectura, sin interacción del usuario (ej: Geocities)."},
  {term:"Web 2.0", def:"Etapa de Internet con redes sociales y contenido generado por los usuarios (ej: Facebook, YouTube)."},
  {term:"Web 3.0", def:"Etapa descentralizada de Internet basada en blockchain, donde el usuario controla sus propios datos (ej: Bitcoin, Ethereum)."},
  {term:"Transacción", def:"Un registro de movimiento de valor o información entre dos partes dentro de una blockchain."},
  {term:"Validación", def:"Proceso por el cual los nodos de la red comprueban que una transacción es legítima antes de aceptarla."},
  {term:"Empaquetado", def:"Agrupar varias transacciones validadas en un solo bloque antes de minarlo."},
  {term:"Minería", def:"Proceso computacional mediante el cual se resuelve un problema matemático para poder añadir un nuevo bloque a la cadena."},
  {term:"Bloque", def:"Un paquete de transacciones validadas que se enlaza de forma permanente a la cadena anterior."},
  {term:"Hash", def:"Un código único generado a partir de los datos de un bloque o archivo; si el contenido cambia, el hash cambia por completo."},
  {term:"Blockchain pública", def:"Red abierta donde cualquier persona puede unirse, leer y validar transacciones (ej: Bitcoin, Ethereum)."},
  {term:"Blockchain privada", def:"Red restringida a un grupo autorizado, controlada por una organización (ej: Hyperledger Fabric)."},
  {term:"Blockchain híbrida", def:"Red que combina partes públicas y partes privadas según la necesidad (ej: IBM Food Trust)."},
  {term:"Descentralización", def:"Característica por la cual el control de un sistema no depende de una sola entidad central, sino de muchos participantes."},
  {term:"Consenso", def:"Mecanismo mediante el cual los nodos de una red se ponen de acuerdo sobre qué transacciones son válidas."},
  {term:"Contrato inteligente", def:"Programa que se ejecuta automáticamente en la blockchain cuando se cumplen ciertas condiciones, sin intermediarios (ej: Uniswap)."},
  {term:"DApp", def:"Aplicación descentralizada construida sobre uno o más contratos inteligentes (ej: OpenSea, Aave)."},
  {term:"Oráculo", def:"Servicio que conecta un contrato inteligente con datos del mundo real, como precios o el clima."},
  {term:"Tokenización", def:"Proceso de representar un activo (real o digital) como un token dentro de una blockchain."},
  {term:"Token de utilidad", def:"Token que da acceso a un servicio dentro de una plataforma (ej: BNB, FIL)."},
  {term:"Token de activo real", def:"Token que representa la propiedad de algo tangible, como bienes raíces u oro (ej: RealT, PAXG)."},
  {term:"Token de gobernanza", def:"Token que otorga derecho a votar decisiones sobre un proyecto (ej: UNI, MKR)."},
  {term:"DAO", def:"Organización Autónoma Descentralizada: un grupo gobernado por votación de tokens, sin jerarquía tradicional."},
  {term:"NFT", def:"Token No Fungible: certificado único e irrepetible de propiedad digital, identificado por un hash distinto (ej: CryptoPunks)."}
];
function renderGlossary(filter){
  const list = $("#glossaryList");
  const f = (filter||"").trim().toLowerCase();
  const filtered = glossaryTerms.filter(g => !f || g.term.toLowerCase().includes(f) || g.def.toLowerCase().includes(f));
  if(filtered.length===0){
    list.innerHTML = '<div class="glossaryEmpty">No se encontraron términos que coincidan.</div>';
    return;
  }
  list.innerHTML = filtered.map(g =>
    `<div class="glossaryTerm"><span class="gTitle">${g.term}</span><span class="gDef">${g.def}</span></div>`
  ).join("");
}
$("#hudGlossary").onclick = ()=>{
  $("#glossarySearch").value = "";
  renderGlossary("");
  $("#ov-glossary").classList.remove("hidden");
  $("#glossarySearch").focus();
};
$("#btnGlossaryClose").onclick = ()=>{
  $("#ov-glossary").classList.add("hidden");
};
$("#glossarySearch").addEventListener("input", (e)=>{
  renderGlossary(e.target.value);
});
$("#hudHistory").onclick = ()=>{
  renderHistory();
  $("#ov-history").classList.remove("hidden");
  $("#hudHistory").classList.remove("has-hint");
};
$("#btnHistoryClose").onclick = ()=>{
  $("#ov-history").classList.add("hidden");
};
$("#hintBtn").onclick = ()=>{
  showPuzzleHint();
};

/* ===================== CRONÓMETRO (informativo, sin penalización) ===================== */
let gameStartTime = null, timerInterval = null;
function startGameTimer(){
  if(timerInterval) return;
  gameStartTime = Date.now();
  timerInterval = setInterval(()=>{
    const elapsed = Math.floor((Date.now()-gameStartTime)/1000);
    const mm = String(Math.floor(elapsed/60)).padStart(2,"0");
    const ss = String(elapsed%60).padStart(2,"0");
    $("#hudTimer").textContent = mm+":"+ss;
  }, 1000);
}

renderLives();
renderInventory();

/* ===================== MODO DEMO (solo para revisión docente) =====================
   Abre el archivo y agrega #demo al final de la dirección (ej: archivo.html#demo)
   para mostrar este panel. Los estudiantes nunca verán esto si abren el archivo normal. */
function initDemoMode(){
  if(!location.hash.toLowerCase().includes("demo")) return;
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;top:8px;left:8px;z-index:99999;background:rgba(10,8,6,.92);"
    + "border:1px solid #8c7c6a;border-radius:8px;padding:10px;font-family:'Segoe UI',sans-serif;"
    + "font-size:.72rem;color:#d9d2c2;display:flex;flex-direction:column;gap:5px;max-width:170px;";
  panel.innerHTML = '<div style="font-weight:bold;color:#e0c878;margin-bottom:4px;">🛠 MODO DEMO</div>';

  function goToRoom(n){
    $("#ov-title").classList.add("hidden");
    $("#ov-name").classList.add("hidden");
    $("#ov-final").classList.add("hidden");
    if(!playerName) playerName = "Demo";
    assignRoomLetters();
    gameCompleteShown = false;
    startGameTimer();
    doorMeta.forEach(d=>{
      if(d.n < n) d.status = "solved";
      else if(d.n === n) d.status = "active";
      else d.status = "locked";
    });
    renderDoors();
    [enterRoom1, enterRoom2, enterRoom3, enterRoom4, enterRoom5, enterRoom6][n-1]();
  }

  for(let n=1;n<=6;n++){
    const b = document.createElement("button");
    b.textContent = "Ir a Sala " + n;
    b.style.cssText = "background:#1a1713;border:1px solid #8c7c6a;color:#d9d2c2;border-radius:4px;"
      + "padding:5px 8px;cursor:pointer;font-size:.72rem;";
    b.onclick = ()=> goToRoom(n);
    panel.appendChild(b);
  }

  const finalBtn = document.createElement("button");
  finalBtn.textContent = "Ver pantalla final";
  finalBtn.style.cssText = "background:#2e2410;border:1px solid #e0c878;color:#e0c878;border-radius:4px;"
    + "padding:5px 8px;cursor:pointer;font-size:.72rem;margin-top:4px;";
  finalBtn.onclick = ()=>{
    $("#ov-title").classList.add("hidden");
    $("#ov-name").classList.add("hidden");
    if(!playerName) playerName = "Demo";
    assignRoomLetters();
    doorMeta.forEach(d=> d.status = "solved");
    // El puzzle final consume los fragmentos del inventario real; en modo demo
    // los agregamos aquí por si el profesor salta directo sin jugar las salas.
    finalLetters.forEach(l=>{
      if(!inventory.find(i=>i.id===l.fragId)) addItem(l.fragId, "🔠"+l.letter, "Fragmento "+l.letter);
    });
    gameCompleteShown = false;
    checkGameComplete();
  };
  panel.appendChild(finalBtn);

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "↺ Reiniciar juego";
  resetBtn.style.cssText = "background:#1a1713;border:1px solid #5b5144;color:#a89c8a;border-radius:4px;"
    + "padding:5px 8px;cursor:pointer;font-size:.72rem;margin-top:8px;";
  resetBtn.onclick = ()=> location.reload();
  panel.appendChild(resetBtn);

  document.body.appendChild(panel);
}
initDemoMode();
