/**
 * VAD AudioWorklet Processor
 * Processes 20ms audio frames (320 samples at 16kHz).
 * Modes: 'listening' (normal speech threshold) | 'speaking' (lower barge-in threshold)
 */
class VadProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._mode = 'listening';         // 'listening' | 'speaking'
    this._speechThreshold = 0.03;     // updated after calibration
    this._ambientRms = 0.01;
    this._calibrationFrames = [];
    this._calibrating = true;
    this._calibrationTarget = 75;     // 1.5s at 20ms frames
    this._speechCount = 0;            // consecutive frames above threshold
    this._silenceCount = 0;           // consecutive frames below threshold
    this._isSpeaking = false;
    this._silenceFramesNeeded = 40;   // 800ms at 20ms frames
    this._buffer = [];

    this.port.onmessage = (e) => {
      if (e.data.type === 'set_mode') {
        this._mode = e.data.mode;
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
    // Accumulate to 320 samples (20ms at 16kHz)
    for (let i = 0; i < samples.length; i++) {
      this._buffer.push(samples[i]);
    }

    if (this._buffer.length < 320) return true;

    const frame = new Float32Array(this._buffer.splice(0, 320));

    // Calibration phase: collect ambient noise for 1.5s
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
    // Voice has both energy (RMS) and zero-crossings in voice frequency range
    const isVoice = rms > this._speechThreshold && zcr > 0.05;

    const threshold = this._mode === 'speaking'
      ? this._speechThreshold * 0.5
      : this._speechThreshold;

    const aboveThreshold = rms > threshold && (this._mode === 'speaking' || isVoice);

    if (aboveThreshold) {
      this._silenceCount = 0;
      this._speechCount++;

      if (!this._isSpeaking && this._speechCount >= 3) {
        this._isSpeaking = true;
        this.port.postMessage({ type: 'speech_start' });
      }

      if (this._isSpeaking) {
        // Send PCM chunk to main thread
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);
      }
    } else {
      this._speechCount = 0;
      if (this._isSpeaking) {
        this._silenceCount++;
        // Still send frames during silence (so backend gets the tail)
        const int16 = this._toInt16(frame);
        this.port.postMessage({ type: 'chunk', data: int16.buffer }, [int16.buffer]);

        if (this._silenceCount >= this._silenceFramesNeeded) {
          this._isSpeaking = false;
          this._silenceCount = 0;
          this.port.postMessage({ type: 'end_of_speech' });
        }
      }
    }

    return true; // keep processor alive
  }
}

registerProcessor('vad-processor', VadProcessor);
