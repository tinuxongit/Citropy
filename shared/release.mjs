import app from "../package.json" with { type: "json" };

export const appVersion = app.version;
export const appRepository = new URL(app.repository.url.replace(/^git\+/, "")).pathname.replace(/^\/|\.git$/g, "");
export const androidApkName = "Citropy-android.apk";
export const androidDownloadUrl = `https://github.com/${appRepository}/releases/latest/download/${androidApkName}`;
