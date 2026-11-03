import { encode } from 'uqr';

/** QRコードの周りの余白（モジュール数）。規格で4以上が求められている */
const QUIET_ZONE = 4;

/**
 * text をQRコードにした画像。生成だけライブラリ（uqr）を使う（docs/spec.md「TOTPの仕様」）。
 * ダークモードでも読み取れるよう、色は白地に黒で固定する
 */
export function QrCode({ text, label }: { text: string; label: string }) {
  const { data, size } = encode(text, { ecc: 'M', border: QUIET_ZONE });
  // 黒いモジュールを1つのパスにまとめる。1つずつ要素にすると数千個になるため
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
