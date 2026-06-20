import { useRef, useCallback, useEffect } from "react";
import { UseAudioPlayerResult } from "./useAudioPlayer.interface";

export function useAudioPlayer(): UseAudioPlayerResult {
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const scheduledNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);

  const initPlayer = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      gainNodeRef.current = gain;
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch((err) => {
        console.error("Failed to resume AudioContext:", err);
      });
    }
  }, []);

  const playChunk = useCallback((base64Audio: string) => {
    // Ensure the AudioContext is initialized and running
    initPlayer();
    const ctx = audioContextRef.current;
    if (!ctx) return;

    try {
      // 1. Decode base64 to Float32Array (24kHz 16-bit LE PCM mono)
      const binary = window.atob(base64Audio);
      const len = binary.length;
      const buffer = new ArrayBuffer(len);
      const view = new DataView(buffer);
      for (let i = 0; i < len; i++) {
        view.setUint8(i, binary.charCodeAt(i));
      }
      const int16Samples = new Int16Array(buffer);
      const float32Samples = new Float32Array(int16Samples.length);
      for (let i = 0; i < int16Samples.length; i++) {
        float32Samples[i] = int16Samples[i] / 32768.0;
      }

      // 2. Create audio buffer
      const sampleRate = 24000; // Gemini output is 24kHz PCM mono
      const audioBuffer = ctx.createBuffer(1, float32Samples.length, sampleRate);
      audioBuffer.copyToChannel(float32Samples, 0);

      // 3. Schedule playback
      const sourceNode = ctx.createBufferSource();
      sourceNode.buffer = audioBuffer;
      
      if (gainNodeRef.current) {
        sourceNode.connect(gainNodeRef.current);
      } else {
        sourceNode.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      let startTime = nextPlayTimeRef.current;

      // If we fall behind or starting fresh, schedule slightly in the future (gapless lookahead)
      if (startTime < now) {
        startTime = now + 0.05; // 50ms lookahead scheduling window
      }

      sourceNode.start(startTime);
      nextPlayTimeRef.current = startTime + audioBuffer.duration;

      // Track source node for interruption / cleanup
      scheduledNodesRef.current.push(sourceNode);
      sourceNode.onended = () => {
        scheduledNodesRef.current = scheduledNodesRef.current.filter((node) => node !== sourceNode);
      };
    } catch (err) {
      console.error("Failed to decode and play audio chunk:", err);
    }
  }, [initPlayer]);

  const stop = useCallback(() => {
    // Cancel all scheduled node playbacks
    scheduledNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch (err) {
        // Ignore if already ended or not started yet
      }
      try {
        node.disconnect();
      } catch (err) {
        // Ignore disconnect errors
      }
    });
    scheduledNodesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  // Cleanup AudioContext on unmount
  useEffect(() => {
    return () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((err) => {
          console.error("Error closing AudioContext:", err);
        });
        audioContextRef.current = null;
      }
      gainNodeRef.current = null;
    };
  }, [stop]);

  return {
    playChunk,
    stop,
    initPlayer,
  };
}
