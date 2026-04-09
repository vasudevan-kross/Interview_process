/**
 * VAD AudioWorklet Processor
 * Processes 20ms audio frames at the actual AudioContext sample rate.
 * Modes: 'listening' (normal speech threshold) | 'speaking' (lower barge-in threshold)
 */
class VadProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._mode = 'listening';
    this._speechThreshold = 0.03;
    this._ambientRms = 0.01;
    this._calibrationFrames = [];
    this._calibrating = true;
    this._calibrationTarget = 75;     // 1.5s at 20ms frames
    this._speechCount = 0;
    this._silenceCount = 0;
    this._isSpeaking = false;
    // Sliding window for barge-in detection in 'speaking' mode.
    // Tracks the last N frames (1=above threshold, 0=below).
    this._recentFrames = [];
    this._bargeInWindowSize = 4;   // look at last 4 frames
    this._bargeInMinHits = 2;      // require 2 of 4 above threshold
    this._silenceFramesNeeded = 100;  // 2000ms at 20ms frames — gives natural thinking time
    this._buffer = [];
    // frameTarget is 20ms of samples at the actual sample rate.
    // Defaults to 320 (16kHz); updated via 'init' message for other rates.
    this._frameTarget = 320;

    this.port.onmessage = (e) => {
      if (e.data.type === 'set_mode') {
        this._mode = e.data.mode;
      } else if (e.data.type === 'init') {
        // Recalculate 20ms frame size for the actual hardware sample rate.
        // e.g. 44100 Hz → 882 samples; 48000 Hz → 960 samples; 16000 Hz → 320 samples.
        const sr = e.data.sampleRate || 16000;
        this._frameTarget = Math.round(sr * 0.02);
      }
    };
  }

  _rms(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  _zeroCrossingRate(samples) {
    let crossings = 0;
    for (let i = 1; i < samples.length; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
    }
    return crossings / samples.length;
  }

  _toInt16(samples) {
    const int16 = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const samples = input[0]; // Float32Array, 128 samples per quantum
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }

    if (this._buffer.length < this._frameTarget) return true;

    const frame = new Float32Array(this._buffer.splice(0, this._frameTarget));

    // Calibration phase: collect ambient noise for ~1.5s
    if (this._calibrating) {
      this._calibrationFrames.push(this._rms(frame));
      if (this._calibrationFrames.length >= this._calibrationTarget) {
        const avg = this._calibrationFrames.reduce((a, b) => a + b) / this._calibrationFrames.length;
        this._ambientRms = avg;
        this._speechThreshold = Math.max(0.02, avg * 3);
        this._calibrating = false;
        this.port.postMessage({ type: 'calibrated', threshold: this._speechThreshold });
      }
      return true;
    }

    const rms = this._rms(frame);
    const zcr = this._zeroCrossingRate(frame);
    const isVoice = rms > this._speechThreshold && zcr > 0.05;

    const threshold = this._mode === 'speaking'
      ? this._speechThreshold * 0.5
      : this._speechThreshold;

    const aboveThreshold = rms > threshold && (this._mode === 'speaking' || isVoice);

    if (aboveThreshold) {
      this._silenceCount = 0;
      this._speechCount++;

      if (!this._isSpeaking) {
        if (this._mode === 'speaking') {
          // Barge-in: use sliding window — 2 of last 4 frames above threshold
          this._recentFrames.push(1);
          if (this._recentFrames.length > this._bargeInWindowSize) this._recentFrames.shift();
          const hits = this._recentFrames.reduce((a, b) => a + b, 0);
          if (hits >= this._bargeInMinHits) {
            this._isSpeaking = true;
            this._recentFrames = [];
            this.port.postMessage({ type: 'speech_start' });
          }
        } else if (this._speechCount >= 3) {
          // Normal listening mode: 3 consecutive frames
          this._isSpeaking = true;
          this.port.postMessage({ type: 'speech_start' });
        }
      }

      if (this._isSpeaking) {
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);
      }
    } else {
      this._speechCount = 0;
      // In speaking mode, don't clear sliding window on a single quiet frame
      if (this._mode === 'speaking') {
        this._recentFrames.push(0);
        if (this._recentFrames.length > this._bargeInWindowSize) this._recentFrames.shift();
      }
      if (this._isSpeaking) {
        this._silenceCount++;
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);

        if (this._silenceCount >= this._silenceFramesNeeded) {
          this._isSpeaking = false;
          this._silenceCount = 0;
          this.port.postMessage({ type: 'end_of_speech' });
        }
      }
    }

    return true;
  }
}

registerProcessor('vad-processor', VadProcessor);
