import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.citropy.mobile",
  appName: "Citropy",
  webDir: "mobile/dist",
  android: {
    path: "mobile/android",
  },
  server: {
    cleartext: true,
    allowNavigation: ["*.ts.net", "10.*.*.*", "172.*.*.*", "192.168.*.*"],
    errorPath: "offline.html",
  },
  plugins: {
    SystemBars: {
      insetsHandling: "native",
      initialViewportFitValueHint: "cover",
    },
  },
};

export default config;
