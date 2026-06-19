/**
 * AudioWorkletProcessor that downsamples microphone input to 16kHz mono PCM.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.targetSampleRate = 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // Accumulate the float samples from the mono channel
    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer.push(channelData[i]);
    }

    // Downsample and post messages in chunks of ~64ms of audio to minimize main-thread bridge overhead.
    // At 16kHz target rate, 1024 samples = 64ms.
    const chunkSize = Math.round((sampleRate / this.targetSampleRate) * 1024);
    if (this.buffer.length >= chunkSize) {
      const downsampled = this.downsample(this.buffer, sampleRate, this.targetSampleRate);
      this.port.postMessage(downsampled);
      this.buffer = [];
    }

    return true;
  }

  /**
   * Simple linear decimation/downsampling filter.
   */
  downsample(samples, fromRate, toRate) {
    if (fromRate === toRate) {
      return new Float32Array(samples);
    }
    const ratio = fromRate / toRate;
    const newLength = Math.round(samples.length / ratio);
    const result = new Float32Array(newLength);
    
    let offsetResult = 0;
    let offsetSource = 0;
    
    while (offsetResult < result.length) {
      const nextOffsetSource = Math.round((offsetResult + 1) * ratio);
      let accum = 0;
      let count = 0;
      
      for (let i = offsetSource; i < nextOffsetSource && i < samples.length; i++) {
        accum += samples[i];
        count++;
      }
      
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetSource = nextOffsetSource;
    }
    
    return result;
  }
}

registerProcessor("audio-processor", AudioProcessor);
