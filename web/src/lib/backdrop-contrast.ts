const GRID_WIDTH = 256;
const SAMPLES = 6;

export interface LightMap {
  width: number;
  height: number;
  data: Float32Array;
}

export async function lightMap(source: Blob | ImageBitmap): Promise<LightMap> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const width = Math.min(GRID_WIDTH, bitmap.width);
  const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
  const context = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, width, height);
  if (source instanceof Blob) bitmap.close();
  const pixels = context.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const offset = index * 4;
    data[index] = (0.2126 * pixels[offset]! + 0.7152 * pixels[offset + 1]! + 0.0722 * pixels[offset + 2]!) / 255;
  }
  return { width, height, data };
}

export function colorLight(color: string): number {
  const context = new OffscreenCanvas(1, 1).getContext("2d")!;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return (0.2126 * red! + 0.7152 * green! + 0.0722 * blue!) / 255;
}

export function regionLight(map: LightMap, area: DOMRect, cover: DOMRect): number {
  const scale = Math.max(cover.width / map.width, cover.height / map.height);
  const offsetX = cover.left + (cover.width - map.width * scale) / 2;
  const offsetY = cover.top + (cover.height - map.height * scale) / 2;
  let total = 0;
  for (let row = 0; row < SAMPLES; row++) {
    for (let column = 0; column < SAMPLES; column++) {
      const x = area.left + ((column + 0.5) / SAMPLES) * area.width;
      const y = area.top + ((row + 0.5) / SAMPLES) * area.height;
      const u = Math.min(map.width - 1, Math.max(0, Math.floor((x - offsetX) / scale)));
      const v = Math.min(map.height - 1, Math.max(0, Math.floor((y - offsetY) / scale)));
      total += map.data[v * map.width + u]!;
    }
  }
  return total / (SAMPLES * SAMPLES);
}
