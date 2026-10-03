// Browsers only allow audio after a user gesture, so the context is created
// and resumed from the first tap/keypress anywhere in the app.
let ctx = null;
let osc = null;
let gain = null;
let timer = null;

export function unlockAudio(onReady) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "running") {
      onReady?.(true);
      return;
    }
    ctx.resume().then(() => onReady?.(ctx.state === "running")).catch(() => onReady?.(false));
  } catch {
    onReady?.(false);
  }
}

export function isAudioRunning() {
  return !!ctx && ctx.state === "running";
}

function sweep(now) {
  osc.frequency.cancelScheduledValues(now);
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.linearRampToValueAtTime(1400, now + 0.5);
  osc.frequency.linearRampToValueAtTime(700, now + 1);
}

export function startSiren() {
  if (!isAudioRunning() || osc) return;
  osc = ctx.createOscillator();
  osc.type = "sawtooth";
  gain = ctx.createGain();
  gain.gain.value = 0.12;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  sweep(ctx.currentTime);
  timer = setInterval(() => sweep(ctx.currentTime), 1000);
}

export function stopSiren() {
  clearInterval(timer);
  timer = null;
  if (osc) {
    try {
      osc.stop();
    } catch {
      // already stopped
    }
    osc.disconnect();
    osc = null;
  }
  if (gain) {
    gain.disconnect();
    gain = null;
  }
}
