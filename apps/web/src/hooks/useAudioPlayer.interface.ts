export interface UseAudioPlayerResult {
  playChunk: (base64Audio: string) => void;
  stop: () => void;
  initPlayer: () => void;
  isSpeaking: boolean;
}
