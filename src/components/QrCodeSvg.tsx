import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeSvgProps {
  value: string;
  size?: number;
  label?: string;
}

export function QrCodeSvg({ value, size = 180, label = 'Session join QR code' }: QrCodeSvgProps) {
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    QRCode.toString(value, {
      type: 'svg',
      margin: 1,
      width: size,
      color: {
        dark: '#0B1120',
        light: '#FFFFFF',
      },
    })
      .then((svg) => {
        if (active) {
          setSvgMarkup(svg);
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => {
      active = false;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white text-xs text-slate-600 p-3 text-center"
      >
        QR unavailable
      </div>
    );
  }

  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-xl bg-white p-3 border border-slate-200 dark:border-slate-700">
      {svgMarkup ? (
        <div
          role="img"
          aria-label={label}
          className="leading-none [&>svg]:block"
          style={{ width: size, height: size }}
          // Safe: SVG generated deterministically by local qrcode library
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded bg-slate-100" />
      )}
    </div>
  );
}
