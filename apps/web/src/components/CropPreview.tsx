import type { CropRect } from 'knitting-pattern-core';

interface Props {
  imageUrl: string;
  sourceWidth: number;
  sourceHeight: number;
  crop: CropRect;
}

export function CropPreview({ imageUrl, sourceWidth, sourceHeight, crop }: Props) {
  // Percentage-based sizing (rather than a fixed pixel display width) so the frame scales down
  // to fit narrow viewports instead of overflowing them.
  return (
    <div className="crop-preview">
      <div
        className="crop-preview__frame"
        style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}
      >
        <img src={imageUrl} alt="Uploaded source" />
        <div
          className="crop-preview__mask"
          style={{
            left: `${(crop.x / sourceWidth) * 100}%`,
            top: `${(crop.y / sourceHeight) * 100}%`,
            width: `${(crop.width / sourceWidth) * 100}%`,
            height: `${(crop.height / sourceHeight) * 100}%`,
          }}
        />
      </div>
      <p className="crop-preview__caption">
        The highlighted region is what will be pixelated ({crop.width}×{crop.height}px of the
        original {sourceWidth}×{sourceHeight}px image).
      </p>
    </div>
  );
}
