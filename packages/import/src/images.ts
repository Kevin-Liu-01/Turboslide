// Image dimensions from file headers (JPEG SOF, PNG IHDR), so the importer needs no image library.
import { readFileSync } from 'node:fs';

export function imageSize(path: string): [number, number] | undefined {
  const data = readFileSync(path);
  if (
    data.length > 24 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = data[i + 1] ?? 0;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const length = data.readUInt16BE(i + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return [data.readUInt16BE(i + 7), data.readUInt16BE(i + 5)];
      }
      i += 2 + length;
    }
  }
  return undefined;
}
