export interface HealthStatus {
  status: "ok";
  commit: string;
  isPreview: boolean;
  service: string;
}
