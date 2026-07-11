const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 2_400_000;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("unsupported_image"));
    image.src = url;
  });
}

export async function prepareReceiptImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("unsupported_file");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("file_too_large");
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    for (const quality of [0.86, 0.78, 0.7, 0.62, 0.54]) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("image_processing_failed");
      context.drawImage(image, 0, 0, width, height);
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
