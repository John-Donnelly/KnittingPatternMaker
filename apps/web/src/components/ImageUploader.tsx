import { useCallback, useRef, useState, type DragEvent } from 'react';

interface Props {
  onImageSelected: (file: File) => void;
}

const ACCEPTED_TYPES = ['image/'];

export function ImageUploader({ onImageSelected }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.some((prefix) => file.type.startsWith(prefix))) return;
      onImageSelected(file);
    },
    [onImageSelected],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    handleFiles(event.dataTransfer.files);
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
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <p className="uploader__title">Drop an image here, or click to choose a file</p>
      <p className="uploader__hint">
        Photo, drawing, or existing pixel art — any common image format.
      </p>
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
