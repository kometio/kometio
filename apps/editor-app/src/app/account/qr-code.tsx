import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export interface QrCodeProps {
  /** What the code says. */
  value: string;
  /** Read by a screen reader instead of the picture: what the code is for. */
  label: string;
}

/**
 * A QR code drawn as one SVG path, from the modules of the code. It is drawn
 * with its own colours (black on white, a four-module margin) and not the
 * theme's: a scanner needs the contrast the specification asks for, and a dark
 * theme's inverted code is read by some apps and not by others.
 */
export function QrCode({ value, label }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    const cells: string[] = [];
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) cells.push(`M${column},${row}h1v1h-1z`);
      }
    }
    return { size: count, path: cells.join('') };
  }, [value]);

  const margin = 4;
  const side = size + margin * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-margin} ${-margin} ${side} ${side}`}
      className="size-44 rounded-lg border bg-white"
      shapeRendering="crispEdges"
    >
      <rect x={-margin} y={-margin} width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
