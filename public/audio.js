// Synthesized sound effects via Web Audio — no asset files required.
let ctx = null;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  // Pre-build a 1s white-noise buffer for gunfire/explosions.
  const len = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

function resumeIfNeeded() {
  if (ctx && ctx.state === "suspended") ctx.resume();
}

function noise(duration, gainVal, filterFreq, filterType = "lowpass") {
  if (!ctx) return;
  resumeIfNeeded();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainVal, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  src.stop(ctx.currentTime + duration);
}

function tone(freq, duration, gainVal, type = "sine", slideTo = null) {
  if (!ctx) return;
  resumeIfNeeded();
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(gainVal, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

// Per-weapon gunfire flavor
export function playShot(weapon) {
  if (!ctx) return;
  switch (weapon) {
    case "awp":
      noise(0.35, 0.7, 1800); tone(90, 0.3, 0.5, "square", 40); break;
    case "ak47":
      noise(0.16, 0.55, 2600); tone(120, 0.1, 0.3, "square", 60); break;
    case "m16":
    case "m4":
      noise(0.12, 0.45, 3200); tone(160, 0.08, 0.25, "square", 80); break;
    case "pistol":
      noise(0.1, 0.4, 2400); break;
    case "knife":
      noise(0.08, 0.25, 5000, "highpass"); break;
    default:
      noise(0.12, 0.4, 3000);
  }
}

export function playReload() { tone(600, 0.05, 0.2, "square"); setTimeout(() => tone(400, 0.06, 0.2, "square"), 180); }
export function playHit() { noise(0.05, 0.3, 4000, "highpass"); }
export function playHitTaken() { tone(140, 0.25, 0.4, "sawtooth", 80); }
export function playExplosion() { noise(0.7, 0.9, 600); tone(60, 0.6, 0.6, "square", 30); }
export function playFootstep() { noise(0.05, 0.06, 900); }
export function playRoundStart() { tone(523, 0.12, 0.25); setTimeout(() => tone(784, 0.2, 0.25), 130); }
export function playWin() { tone(523, 0.15, 0.3); setTimeout(() => tone(659, 0.15, 0.3), 150); setTimeout(() => tone(784, 0.3, 0.3), 300); }
export function playLose() { tone(392, 0.2, 0.3); setTimeout(() => tone(294, 0.4, 0.3), 200); }
export function playBeep() { tone(880, 0.08, 0.25, "square"); }
export function playBuy() { tone(700, 0.06, 0.2, "sine"); setTimeout(() => tone(950, 0.08, 0.2, "sine"), 70); }
