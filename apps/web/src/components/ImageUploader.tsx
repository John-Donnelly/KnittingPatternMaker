import { useCallback, useRef, useState, type DragEvent, type MouseEvent } from 'react';

interface Props {
  onImageSelected: (file: File) => void;
}

/** Bundled starter motifs so visitors can try the product without hunting for an image. */
const SAMPLES = [
  { name: 'Heart', url: '/samples/heart.png' },
  { name: 'Fox', url: '/samples/fox.png' },
  { name: 'Snowflake', url: '/samples/snowflake.png' },
];

export function ImageUploader({ onImageSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setRejection(
          `"${file.name}" doesn't look like an image. Drop a JPG, PNG, or WebP file instead.`,
        );
        return;
      }
      setRejection(null);
      onImageSelected(file);
    },
    [onImageSelected],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const loadSample = async (event: MouseEvent, sample: (typeof SAMPLES)[number]) => {
    event.stopPropagation(); // don't also open the file picker
    setRejection(null);
    try {
      const res = await fetch(sample.url);
      if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`);
      const blob = await res.blob();
      onImageSelected(new File([blob], `${sample.name.toLowerCase()}.png`, { type: 'image/png' }));
    } catch {
      setRejection('Could not load the sample image — please try again.');
    }
  };

  return (
    <div
      className={`uploader${isDragOver ? ' uploader--active' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      aria-label="Choose or drop an image to convert into a knitting pattern"
      onKeyDown={(e) => {
        // Only when the container ITSELF is focused — Enter/Space on the sample buttons
        // inside must activate those buttons, not hijack into the file picker.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // Space must not scroll the page
          inputRef.current?.click();
        }
      }}
    >
      <p className="uploader__title">Drop an image here, or click to choose a file</p>
      <p className="uploader__hint">Photo, drawing, or pixel art — JPG, PNG, or WebP.</p>
      {/* Not role="alert": this <p> sits inside the role="button" dropzone, where a live region
          would corrupt the button's accessible name and not announce reliably. It's a visible,
          in-context validation hint; the API/decode error surfaces with role="alert" in App. */}
      {rejection && <p className="error uploader__error">{rejection}</p>}
      <div className="uploader__samples">
        <span className="uploader__samples-label">No image handy? Try a sample:</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample.name}
            type="button"
            className="uploader__sample"
            onClick={(e) => void loadSample(e, sample)}
          >
            <img src={sample.url} alt={`${sample.name} sample motif`} />
            <span>{sample.name}</span>
          </button>
        ))}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="uploader__input"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
