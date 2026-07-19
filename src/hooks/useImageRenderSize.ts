import { useState, useLayoutEffect, useRef } from 'react';

export interface ImageDimensions {
  height: number;
  width: number;
  offsetX?: number;
  offsetY?: number;
  containerWidth?: number;
  containerHeight?: number;
}

export interface RenderSize {
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
}

const DEFAULT_SIZE: RenderSize = { width: 0, height: 0, scale: 1, offsetX: 0, offsetY: 0 };

export const useImageRenderSize = (
  containerRef: React.RefObject<HTMLElement>,
  imageDimensions: ImageDimensions | null,
) => {
  const [renderSize, setRenderSize] = useState<RenderSize>(DEFAULT_SIZE);
  const imgWidth = imageDimensions?.width;
  const imgHeight = imageDimensions?.height;

  // Keep latest image dimensions in a ref so the ResizeObserver callback
  // never reads stale values between a prop change and the next effect run.
  const imageDimsRef = useRef({ imgWidth, imgHeight });
  imageDimsRef.current = { imgWidth, imgHeight };

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container || !imgWidth || !imgHeight) {
      setRenderSize(DEFAULT_SIZE);
      return;
    }

    const updateSize = () => {
      const { clientWidth: containerWidth, clientHeight: containerHeight } = container;
      const { imgWidth: currentImgWidth, imgHeight: currentImgHeight } = imageDimsRef.current;

      // Guard against zero or missing dimensions to prevent division by zero
      // and meaningless render sizes (e.g. scale of 0).
      if (!containerWidth || !containerHeight || !currentImgWidth || !currentImgHeight) {
        setRenderSize(DEFAULT_SIZE);
        return;
      }

      const imageAspectRatio = currentImgWidth / currentImgHeight;
      const containerAspectRatio = containerWidth / containerHeight;

      let width, height;
      if (imageAspectRatio > containerAspectRatio) {
        width = containerWidth;
        height = containerWidth / imageAspectRatio;
      } else {
        height = containerHeight;
        width = containerHeight * imageAspectRatio;
      }

      const offsetX = (containerWidth - width) / 2;
      const offsetY = (containerHeight - height) / 2;
      const scale = width / currentImgWidth;

      setRenderSize({ width, height, scale, offsetX, offsetY });
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [containerRef, imgWidth, imgHeight]);

  return renderSize;
};
