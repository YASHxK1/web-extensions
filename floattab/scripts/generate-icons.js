"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const sizes = [16, 32, 48, 128];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return output;
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const nearestX = Math.max(left + radius, Math.min(x, left + width - radius));
  const nearestY = Math.max(top + radius, Math.min(y, top + height - radius));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function mix(a, b, amount) {
  return Math.round(a + (b - a) * amount);
}

function blend(base, overlay, alpha) {
  return [
    mix(base[0], overlay[0], alpha),
    mix(base[1], overlay[1], alpha),
    mix(base[2], overlay[2], alpha),
    255,
  ];
}

function sample(nx, ny) {
  let color = [0, 0, 0, 0];
  if (!insideRoundedRect(nx, ny, 0.03, 0.03, 0.94, 0.94, 0.23)) {
    return color;
  }

  const progress = Math.min(1, Math.max(0, (nx + ny) / 2));
  const top = progress < 0.5 ? [165, 180, 252] : [99, 102, 241];
  const bottom = progress < 0.5 ? [99, 102, 241] : [49, 46, 129];
  const local = progress < 0.5 ? progress * 2 : (progress - 0.5) * 2;
  color = [
    mix(top[0], bottom[0], local),
    mix(top[1], bottom[1], local),
    mix(top[2], bottom[2], local),
    255,
  ];

  if (insideRoundedRect(nx, ny, 0.2, 0.24, 0.51, 0.41, 0.11)) {
    color = blend(color, [255, 255, 255], 0.55);
  }
  if (insideRoundedRect(nx, ny, 0.33, 0.35, 0.51, 0.41, 0.11)) {
    color = [255, 255, 255, 255];
  }

  const lineWidth = 0.045;
  const horizontal =
    nx >= 0.615 && nx <= 0.735 && Math.abs(ny - 0.46) <= lineWidth / 2;
  const vertical =
    ny >= 0.46 && ny <= 0.575 && Math.abs(nx - 0.735) <= lineWidth / 2;
  if (horizontal || vertical) {
    color = [67, 56, 202, 255];
  }

  return color;
}

function render(size) {
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const samples = 4;

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * (size * 4 + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < size; x += 1) {
      const total = [0, 0, 0, 0];
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const color = sample(
            (x + (sx + 0.5) / samples) / size,
            (y + (sy + 0.5) / samples) / size
          );
          for (let channel = 0; channel < 4; channel += 1) {
            total[channel] += color[channel];
          }
        }
      }

      const pixelOffset = rowOffset + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        rows[pixelOffset + channel] = Math.round(
          total[channel] / (samples * samples)
        );
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of sizes) {
  const target = path.join(root, "icons", `icon${size}.png`);
  fs.writeFileSync(target, render(size));
  console.log(`Generated ${path.relative(root, target)}`);
}
