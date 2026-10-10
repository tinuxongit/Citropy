import { startAsciiNoise } from "../../web/src/lib/ascii-noise.ts";

declare global {
  interface Window { paintArt(html: string): Promise<void> }
}

window.paintArt = async (html) => {
  document.body.innerHTML = html;
  await document.fonts.ready;
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>("canvas.ascii-field")) {
    const { color, star, center } = canvas.dataset;
    if (!color || !star || !center) throw new Error("An ASCII field needs data-color, data-star and data-center.");
    startAsciiNoise(canvas, { color, starColor: star, animate: false, stage: () => ({ left: 0, center: canvas.clientWidth * Number(center) }) });
  }
  await Promise.all([...document.images].map((image) => image.decode()));
};
