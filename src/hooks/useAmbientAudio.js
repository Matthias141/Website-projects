import { useCallback, useRef, useState } from 'react';

// No audio file is loaded — a soft three-note drone is synthesized with the
// Web Audio API. `setModulation(rotationY, t)` is called every frame from
// the sculpture's own animation loop so the filter cutoff literally tracks
// the sculpture's motion on screen — ported 1:1 from the vanilla build.
export function useAmbientAudio() {
  const [soundOn, setSoundOn] = useState(false);
  const ctxRef = useRef(null);
  const masterGainRef = useRef(null);
  const voicesRef = useRef([]);

  const init = useCallback(() => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0; // starts silent, faded in on toggle
    masterGain.connect(audioCtx.destination);

    const freqs = [110, 164.81, 220]; // A2 / E3 / A3 — a quiet open fifth + octave
    const voices = freqs.map((f, i) => {
      const osc = audioCtx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;

      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;

      const voiceGain = audioCtx.createGain();
      voiceGain.gain.value = 0.22 / (i + 1);

      osc.connect(filter);
      filter.connect(voiceGain);
      voiceGain.connect(masterGain);
      osc.start();

      return { osc, filter };
    });

    ctxRef.current = audioCtx;
    masterGainRef.current = masterGain;
    voicesRef.current = voices;
    return audioCtx;
  }, []);

  const toggleSound = useCallback(() => {
    const audioCtx = ctxRef.current || init();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    setSoundOn((prev) => {
      const next = !prev;
      const now = audioCtx.currentTime;
      masterGainRef.current.gain.cancelScheduledValues(now);
      masterGainRef.current.gain.setTargetAtTime(next ? 0.45 : 0, now, 0.4);
      return next;
    });
  }, [init]);

  // Called from useFrame in Sculpture/App — cheap no-op when sound is off
  // or audio hasn't been initialized yet (before the first toggle).
  const setModulation = useCallback((rotationY, t) => {
    if (!soundOn || !ctxRef.current) return;
    const now = ctxRef.current.currentTime;
    voicesRef.current.forEach((v, i) => {
      const cutoff = 550 + Math.abs(rotationY) * 400 + Math.sin(t * 0.3 + i) * 150;
      v.filter.frequency.setTargetAtTime(cutoff, now, 0.4);
    });
  }, [soundOn]);

  return { soundOn, toggleSound, setModulation };
}
