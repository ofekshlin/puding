export interface SessionState {
  sessionId: string;
  status: "connected" | "disconnected";
  createdAt: Date;
  disconnectedAt?: Date;
  clientIp: string;
  tokens: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}
