import { useEffect, useState } from 'react';
import { ExternalLink, ImageOff, Focus, Maximize2 } from 'lucide-react';
import { Button } from './ui/primitives';

type Dimensions = { width: number; height: number };
type Box = Dimensions & { x: number; y: number };

export function EvidenceCapture({
  src,
  title,
  dimensions,
  afterScroll,
  deviceScale,
  boxes,
  focusElement,
}: {
  src: string;
  title: string;
  dimensions?: Dimensions | null;
  afterScroll: boolean;
  deviceScale?: number;
  boxes: (Box | null | undefined)[];
  focusElement: boolean;
}) {
  const [fullPage, setFullPage] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFullPage(false);
    setFailed(false);
  }, [src]);
  const width = dimensions?.width ?? 0;
  const height = dimensions?.height ?? 0;
  const scale = afterScroll ? 1 : (deviceScale ?? 1);
  const valid = boxes
    .map(
      (box) =>
        box && {
          x: box.x * scale,
          y: box.y * scale,
          width: box.width * scale,
          height: box.height * scale,
        },
    )
    .filter(
      (box): box is Box =>
        !!box &&
        box.x >= 0 &&
        box.y >= 0 &&
        box.width > 0 &&
        box.height > 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height,
    );
  const target = focusElement && !fullPage ? valid[0] : null;
  const left = target ? Math.max(0, target.x - 96) : 0;
  const top = target ? Math.max(0, target.y - 64) : 0;
  const right = target ? Math.min(width, target.x + target.width + 96) : width;
  const bottom = target ? Math.min(height, target.y + target.height + 64) : height;
  return (
    <figure className="capture-figure">
      {focusElement && valid.length > 0 && !failed && (
        <div className="capture-controls" aria-label="Capture view">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={!fullPage}
            onClick={() => setFullPage(false)}
          >
            <Focus size={14} />
            Element
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-pressed={fullPage}
            onClick={() => setFullPage(true)}
          >
            <Maximize2 size={14} />
            Full page
          </Button>
        </div>
      )}
      {failed ? (
        <div className="evidence-empty" role="status">
          <ImageOff size={24} />
          <p>The saved capture could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => setFailed(false)}>
            Retry capture
          </Button>
        </div>
      ) : (
        <div className="screenshot" tabIndex={0} role="region" aria-label="Captured screenshot">
          {valid.length > 0 ? (
            <svg
              className={target ? 'capture-context' : undefined}
              viewBox={[left, top, right - left, bottom - top].join(' ')}
              role="img"
              aria-label={
                target
                  ? 'Highlighted element in the capture of ' + title
                  : 'Highlighted finding locations on ' + title
              }
            >
              <image href={src} width={width} height={height} onError={() => setFailed(true)} />
              {valid.map((box, index) => (
                <g key={index} fill="none">
                  <rect {...box} stroke="white" strokeWidth={5} vectorEffect="non-scaling-stroke" />
                  <rect
                    {...box}
                    className="capture-highlight"
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              ))}
            </svg>
          ) : (
            <img
              src={src}
              alt={'Captured page evidence for ' + title}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          )}
        </div>
      )}
      <figcaption className="capture-caption">
        <span>
          {failed ? 'Capture unavailable' : target ? 'Element in context' : 'Full page'}
          {afterScroll && ' · Captured after scrolling'}
        </span>
        <a className="text-link small" href={src} target="_blank" rel="noreferrer">
          Open full capture <ExternalLink size={13} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}
