export interface NodeRuntimeStatus {
  status: "idle" | "installing" | "success" | "error";
  ready: boolean;
  shellReady?: boolean;
  supported: boolean;
  version?: string;
  npmVersion?: string;
  installVersion: string;
  message?: string;
}
