import { ExternalLink } from 'lucide-react';

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
  const target = focusElement ? valid[0] : null;
  const left = target ? Math.max(0, target.x - 96) : 0;
  const top = target ? Math.max(0, target.y - 64) : 0;
  const right = target ? Math.min(width, target.x + target.width + 96) : width;
  const bottom = target ? Math.min(height, target.y + target.height + 64) : height;
  return (
    <figure className="capture-figure">
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
            <image href={src} width={width} height={height} />
            {valid.map((box, index) => (
              <g key={index} fill="none">
                <rect {...box} stroke="white" strokeWidth={5} vectorEffect="non-scaling-stroke" />
                <rect
                  {...box}
                  stroke="#1d4ed8"
                  strokeWidth={2.5}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </svg>
        ) : (
          <img src={src} alt={'Captured page evidence for ' + title} loading="lazy" />
        )}
      </div>
      <figcaption className="capture-caption">
        <span>
          {target ? 'Element in context' : 'Full page'}
          {afterScroll && ' · Captured after scrolling'}
        </span>
        <a className="text-link small" href={src} target="_blank" rel="noreferrer">
          Open full capture <ExternalLink size={13} aria-hidden="true" />
        </a>
      </figcaption>
    </figure>
  );
}
