/** Campana audible para ofertas Transporte (sin archivo de audio). */
export function playTaxiOfferBell(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.45, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.36);
    o.onended = () => void ctx.close();
  } catch {
    /* noop */
  }
}

export function startTaxiOfferBellLoop(): { stop: () => void } {
  let stopped = false;
  playTaxiOfferBell();
  const id = window.setInterval(() => {
    if (stopped) return;
    playTaxiOfferBell();
  }, 900);
  return {
    stop: () => {
      stopped = true;
      window.clearInterval(id);
    },
  };
}
