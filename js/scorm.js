/* ============ SCORM 1.2 wrapper ============
   Cuando el juego se abre desde Moodle, window.API existe y este módulo
   se comunica con él para registrar puntaje, tiempo y estado.
   Cuando se abre fuera de Moodle (Render, local), todas las funciones
   son no-ops silenciosas — el juego funciona igual. */

const SCORM = (() => {
  let api = null;
  let startTime = Date.now();
  let initialized = false;

  function findAPI(win) {
    let attempts = 0;
    while (win.API == null && win.parent != null && win.parent !== win && attempts < 7) {
      win = win.parent;
      attempts++;
    }
    return win.API || null;
  }

  function init() {
    api = findAPI(window);
    if (!api) return false;
    const result = api.LMSInitialize("");
    initialized = result === "true" || result === true;
    return initialized;
  }

  function set(key, value) {
    if (!api || !initialized) return;
    api.LMSSetValue(key, String(value));
  }

  function commit() {
    if (!api || !initialized) return;
    api.LMSCommit("");
  }

  function finish() {
    if (!api || !initialized) return;
    api.LMSFinish("");
  }

  /* Convierte ms en formato HH:MM:SS que pide SCORM */
  function msToSCORMTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600).toString().padStart(2, "0");
    const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
    const s = (totalSec % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  /* Llamar al terminar el juego con los datos finales */
  function sendResult({ score, maxScore, lives, completed, studentName }) {
    if (!init()) return; // fuera de Moodle → no-op

    const elapsed = Date.now() - startTime;
    const scaled = Math.round((score / maxScore) * 100);
    const status = completed ? (scaled >= 70 ? "passed" : "failed") : "incomplete";

    set("cmi.core.student_name", studentName || "");
    set("cmi.core.score.raw", scaled);
    set("cmi.core.score.min", 0);
    set("cmi.core.score.max", 100);
    set("cmi.core.lesson_status", status);
    set("cmi.core.session_time", msToSCORMTime(elapsed));
    set("cmi.suspend_data", JSON.stringify({ score, lives, completed }));

    commit();
    finish();
  }

  return { sendResult };
})();
