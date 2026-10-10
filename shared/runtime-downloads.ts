export interface RuntimeStatus {
  status: "idle" | "installing" | "success" | "error";
  ready: boolean;
  supported: boolean;
  version?: string;
  message?: string;
}

export interface NodeRuntimeStatus extends RuntimeStatus {
  shellReady?: boolean;
  npmVersion?: string;
  installVersion: string;
}

export interface GitRuntimeStatus extends RuntimeStatus {
  method: string;
}
