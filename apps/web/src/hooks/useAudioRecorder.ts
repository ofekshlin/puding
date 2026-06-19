import { useRef, useState, useCallback } from "react";

interface UseAudioRecorderResult {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  audioLevel: number;
}

export function useAudioRecorder(onAudioData: (pcmBuffer: ArrayBuffer) => void): UseAudioRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Request audio capture with system echo cancellation and noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      // Handle standard vs webkit AudioContext
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      // Load downsampler AudioWorklet
      await audioContext.audioWorklet.addModule("/workers/audio-processor.js");

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const workletNode = new AudioWorkletNode(audioContext, "audio-processor");
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        const float32Samples = event.data as Float32Array;

        // Calculate simple volume level for UI feedback (Root-Mean-Square value)
        let sum = 0;
        for (let i = 0; i < float32Samples.length; i++) {
          sum += float32Samples[i] * float32Samples[i];
        }
        const rms = Math.sqrt(sum / float32Samples.length);
        // Normalize RMS to a 0-100 range
        setAudioLevel(Math.min(100, Math.round(rms * 250)));

        // Convert float array to 16-bit LE PCM binary
        const pcmBuffer = float32To16BitPCM(float32Samples);
        onAudioData(pcmBuffer);
      };

      sourceNode.connect(workletNode);
      workletNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start audio recording:", error);
      throw error;
    }
  }, [onAudioData]);

  const stopRecording = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsRecording(false);
    setAudioLevel(0);
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
    audioLevel,
  };
}

/**
 * Converts Float32Array PCM samples to a 16-bit signed Little-Endian PCM ArrayBuffer.
 */
function float32To16BitPCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    const intVal = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, intVal, true); // Little-Endian
  }
  return buffer;
}
