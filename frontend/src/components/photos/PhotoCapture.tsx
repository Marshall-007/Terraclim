import { useEffect, useRef, useState } from 'react';
import type { BlockPhoto } from '../../types/api';
import { uploadPhoto } from '../../services/api';
import { Icon } from '../layout/icons';
import { Spinner } from '../common/states';
import { color } from '../../theme/tokens';

type Phase = 'idle' | 'ready' | 'uploading' | 'error';

/**
 * Field photo capture (R17): camera input → preview → optional note → upload
 * with visible progress. `capture="environment"` opens the rear camera on
 * mobile; on desktop it falls back to a file picker.
 */
export function PhotoCapture({
  blockId,
  onUploaded,
}: {
  blockId: string;
  onUploaded: (photo: BlockPhoto) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setNote('');
    setPhase('idle');
    setProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const pick = (f: File | null) => {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase('ready');
    setProgress(0);
  };

  const upload = async () => {
    if (!file) return;
    setPhase('uploading');
    setProgress(0);
    try {
      const photo = await uploadPhoto(blockId, file, note, setProgress);
      onUploaded(photo);
      reset();
    } catch {
      setPhase('error');
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {phase === 'idle' && (
        <button className="btn-ghost w-full" onClick={() => inputRef.current?.click()}>
          <Icon name="camera" size={16} /> Capture canopy photo
        </button>
      )}

      {(phase === 'ready' || phase === 'uploading' || phase === 'error') && preview && (
        <div className="space-y-3 rounded-md border border-line bg-raised p-3">
          <img
            src={preview}
            alt="Canopy preview"
            className="max-h-52 w-full rounded-sm object-cover"
          />
          <input
            className="field"
            placeholder="Note (optional) — row, vine, what you see"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={phase === 'uploading'}
          />

          {phase === 'uploading' && (
            <div>
              <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line">
                <div
                  className="h-full rounded-pill transition-[width] duration-150"
                  style={{
                    width: `${Math.round(progress * 100)}%`,
                    background: color.bordeaux,
                  }}
                />
              </div>
              <p className="nums mt-1.5 text-xs text-ink-muted">
                Uploading… {Math.round(progress * 100)}%
              </p>
            </div>
          )}

          {phase === 'error' && (
            <p className="text-xs text-critical">
              Upload failed — check the connection and try again.
            </p>
          )}

          <div className="flex gap-2">
            <button
              className="btn-ghost flex-1"
              onClick={reset}
              disabled={phase === 'uploading'}
            >
              Discard
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() => void upload()}
              disabled={phase === 'uploading'}
            >
              {phase === 'uploading' ? (
                <Spinner className="border-paper/40 border-t-paper" />
              ) : phase === 'error' ? (
                'Retry upload'
              ) : (
                'Upload & analyse'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
