import { writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const SIZE = 128;
const pixels = new Uint8Array(SIZE * SIZE * 3);

const COLORS = {
  bg: [13, 17, 23],
  grid: [48, 54, 61],
  green: [35, 134, 54],
  lightGreen: [63, 185, 80],
  white: [246, 248, 250]
};

const FONT = {
  G: [
    "11110",
    "10000",
    "10000",
    "10110",
    "10010",
    "10010",
    "11110"
  ],
  H: [
    "10010",
    "10010",
    "10010",
    "11110",
    "10010",
    "10010",
    "10010"
  ]
};

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) {
    return;
  }

  const offset = (y * SIZE + x) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
}

function fillRect(x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy += 1) {
    for (let xx = x; xx < x + width; xx += 1) {
      setPixel(xx, yy, color);
    }
  }
}

function drawLine(x1, y1, x2, y2, color) {
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;
  let x = x1;
  let y = y1;

  while (true) {
    setPixel(x, y, color);
    if (x === x2 && y === y2) {
      break;
    }

    const e2 = 2 * error;
    if (e2 >= dy) {
      error += dy;
      x += sx;
    }
    if (e2 <= dx) {
      error += dx;
      y += sy;
    }
  }
}

function drawGlyph(char, startX, startY, scale, color) {
  const glyph = FONT[char];
  for (let row = 0; row < glyph.length; row += 1) {
    for (let col = 0; col < glyph[row].length; col += 1) {
      if (glyph[row][col] === "1") {
        fillRect(startX + col * scale, startY + row * scale, scale - 1, scale - 1, color);
      }
    }
  }
}

function drawStar(cx, cy, outerRadius, innerRadius, color) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + i * Math.PI / 5;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    points.push([
      Math.round(cx + Math.cos(angle) * radius),
      Math.round(cy + Math.sin(angle) * radius)
    ]);
  }

  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    drawLine(x1, y1, x2, y2, color);
  }

  for (let y = cy - outerRadius; y <= cy + outerRadius; y += 1) {
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        intersections.push(Math.round(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length; i += 2) {
      fillRect(intersections[i], y, intersections[i + 1] - intersections[i] + 1, 1, color);
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function pngBuffer() {
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const raw = Buffer.alloc((SIZE * 3 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const rowStart = y * (SIZE * 3 + 1);
    raw[rowStart] = 0;
    pixels.copyWithin;
    for (let x = 0; x < SIZE * 3; x += 1) {
      raw[rowStart + 1 + x] = pixels[y * SIZE * 3 + x];
    }
  }

  return Buffer.concat([
    header,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

fillRect(0, 0, SIZE, SIZE, COLORS.bg);
for (let i = 0; i < SIZE; i += 16) {
  drawLine(i, 0, i, SIZE - 1, COLORS.grid);
  drawLine(0, i, SIZE - 1, i, COLORS.grid);
}
fillRect(0, 104, SIZE, 24, COLORS.green);
fillRect(0, 100, SIZE, 4, COLORS.lightGreen);
drawGlyph("G", 19, 28, 8, COLORS.white);
drawGlyph("H", 69, 28, 8, COLORS.white);
drawStar(102, 26, 12, 5, COLORS.lightGreen);

await writeFile(path.join(ROOT, "source/icon.png"), pngBuffer());
