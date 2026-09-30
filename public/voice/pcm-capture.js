// AudioWorklet: turns microphone audio into 16 kHz mono 16-bit PCM frames of 20 ms for
// the local voice server.
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.pos = 0;
    this.frame = new Int16Array(320); // 20 ms at 16 kHz
    this.filled = 0;
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    // Linear-interpolation resampling from the device rate down to 16 kHz.
    for (; this.pos < input.length; this.pos += this.ratio) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const next = i + 1 < input.length ? input[i + 1] : input[i];
      const s = Math.max(-1, Math.min(1, input[i] + (next - input[i]) * frac));
      this.frame[this.filled++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.filled === this.frame.length) {
        this.port.postMessage(this.frame.buffer.slice(0));
        this.filled = 0;
      }
    }
    this.pos -= input.length;
    return true;
  }
}

registerProcessor("pcm-capture", PcmCapture);
