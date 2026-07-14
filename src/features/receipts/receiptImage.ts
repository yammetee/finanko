const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 2_400_000;
const MAX_IMAGE_SIDE = 2400;
const ANALYSIS_SIDE = 360;

interface DocumentGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("unsupported_image"));
    image.src = url;
  });
}

function colorDistance(left: readonly number[], right: readonly number[]) {
  return Math.sqrt(
    (left[0] - right[0]) ** 2 +
      (left[1] - right[1]) ** 2 +
      (left[2] - right[2]) ** 2,
  );
}

function detectDocumentGeometry(canvas: HTMLCanvasElement): DocumentGeometry | null {
  const width = Math.max(1, Math.round(canvas.width * Math.min(1, ANALYSIS_SIDE / Math.max(canvas.width, canvas.height))));
  const height = Math.max(1, Math.round(canvas.height * Math.min(1, ANALYSIS_SIDE / Math.max(canvas.width, canvas.height))));
  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const context = sample.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(canvas, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const cornerSize = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const cornerColors: number[][] = [];

  for (const [startX, startY] of [[0, 0], [width - cornerSize, 0], [0, height - cornerSize], [width - cornerSize, height - cornerSize]]) {
    const color = [0, 0, 0];
    let count = 0;
    for (let y = startY; y < startY + cornerSize; y += 1) {
      for (let x = startX; x < startX + cornerSize; x += 1) {
        const offset = (y * width + x) * 4;
        color[0] += pixels[offset];
        color[1] += pixels[offset + 1];
        color[2] += pixels[offset + 2];
        count += 1;
      }
    }
    cornerColors.push(color.map((value) => value / count));
  }

  const background = [0, 1, 2].map((channel) =>
    cornerColors.reduce((sum, color) => sum + color[channel], 0) / cornerColors.length,
  );
  if (cornerColors.some((color) => colorDistance(color, background) > 42)) return null;

  const points: Array<[number, number]> = [];
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const offset = (y * width + x) * 4;
      const color = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      if (colorDistance(color, background) < 48) continue;
      points.push([x, y]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (points.length < (width * height) / 80 || maxX <= minX || maxY <= minY) return null;
  const boxWidth = maxX - minX + 1;
  const boxHeight = maxY - minY + 1;
  if (boxWidth < width * 0.35 || boxHeight < height * 0.35) return null;

  const meanX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;
  points.forEach(([x, y]) => {
    const dx = x - meanX;
    const dy = y - meanY;
    covarianceXX += dx * dx;
    covarianceYY += dy * dy;
    covarianceXY += dx * dy;
  });
  const principalAngle = 0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY) * 180 / Math.PI;
  const documentAngle = boxHeight >= boxWidth
    ? principalAngle >= 0 ? principalAngle - 90 : principalAngle + 90
    : principalAngle;
  const angle = Math.abs(documentAngle) >= 0.7 && Math.abs(documentAngle) <= 8 ? -documentAngle : 0;
  const padding = Math.round(Math.min(width, height) * 0.025);
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;

  return {
    x: Math.max(0, minX - padding) * scaleX,
    y: Math.max(0, minY - padding) * scaleY,
    width: Math.min(width, maxX + padding) * scaleX - Math.max(0, minX - padding) * scaleX,
    height: Math.min(height, maxY + padding) * scaleY - Math.max(0, minY - padding) * scaleY,
    angle,
  };
}

function renderPreparedImage(image: HTMLImageElement) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const source = document.createElement("canvas");
  source.width = Math.max(1, Math.round(image.naturalWidth * scale));
  source.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("image_processing_failed");
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(image, 0, 0, source.width, source.height);

  const geometry = detectDocumentGeometry(source) ?? {
    x: 0,
    y: 0,
    width: source.width,
    height: source.height,
    angle: 0,
  };
  const radians = geometry.angle * Math.PI / 180;
  const outputWidth = Math.max(1, Math.round(Math.abs(geometry.width * Math.cos(radians)) + Math.abs(geometry.height * Math.sin(radians))));
  const outputHeight = Math.max(1, Math.round(Math.abs(geometry.width * Math.sin(radians)) + Math.abs(geometry.height * Math.cos(radians))));
  const output = document.createElement("canvas");
  output.width = outputWidth;
  output.height = outputHeight;
  const context = output.getContext("2d");
  if (!context) throw new Error("image_processing_failed");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.filter = "contrast(1.12) brightness(1.03) saturate(0.88)";
  context.translate(outputWidth / 2, outputHeight / 2);
  context.rotate(radians);
  context.drawImage(
    source,
    geometry.x,
    geometry.y,
    geometry.width,
    geometry.height,
    -geometry.width / 2,
    -geometry.height / 2,
    geometry.width,
    geometry.height,
  );
  return output;
}

export async function prepareReceiptImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("unsupported_file");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("file_too_large");
  const url = URL.createObjectURL(file);
  try {
    const prepared = renderPreparedImage(await loadImage(url));
    let width = prepared.width;
    let height = prepared.height;
    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56]) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image_processing_failed");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(prepared, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
    throw new Error("compressed_file_too_large");
  } finally {
    URL.revokeObjectURL(url);
  }
}
