import { useEffect, useState } from 'react';

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Loads a File's natural pixel dimensions via an offscreen <img>, without a network round trip. */
export function useImageDimensions(imageUrl: string | null): ImageDimensions | null {
  const [dims, setDims] = useState<ImageDimensions | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setDims(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDims({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return dims;
}
