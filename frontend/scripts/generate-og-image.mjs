import { deflateSync } from 'node:zlib'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = join(here, '..', 'public', 'og.png')

const WIDTH = 1200
const HEIGHT = 630

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crcBuffer])
}

function encodePng(width, height, rgb) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t)
}

function inRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius)
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius)
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= radius * radius
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const sign = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
  const d1 = sign(px, py, ax, ay, bx, by)
  const d2 = sign(px, py, bx, by, cx, cy)
  const d3 = sign(px, py, cx, cy, ax, ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

async function main() {
  const rgb = Buffer.alloc(WIDTH * HEIGHT * 3)

  const top = [0x16, 0xa3, 0x4a]
  const bottom = [0x05, 0x2e, 0x16]
  const white = [0xff, 0xff, 0xff]
  const green = [0x16, 0xa3, 0x4a]

  const bubble = { x0: 400, y0: 170, x1: 800, y1: 390, radius: 64 }
  const tail = [452, 375, 452, 468, 552, 375]
  const dots = [
    { cx: 522, cy: 280, r: 20 },
    { cx: 600, cy: 280, r: 20 },
    { cx: 678, cy: 280, r: 20 },
  ]

  for (let y = 0; y < HEIGHT; y++) {
    const t = y / (HEIGHT - 1)
    for (let x = 0; x < WIDTH; x++) {
      let colour = [lerp(top[0], bottom[0], t), lerp(top[1], bottom[1], t), lerp(top[2], bottom[2], t)]

      const inBubble = inRoundedRect(x, y, bubble.x0, bubble.y0, bubble.x1, bubble.y1, bubble.radius)
      const inTail = inTriangle(x, y, tail[0], tail[1], tail[2], tail[3], tail[4], tail[5])

      if (inBubble || inTail) {
        colour = white
        for (const dot of dots) {
          const dx = x - dot.cx
          const dy = y - dot.cy
          if (dx * dx + dy * dy <= dot.r * dot.r) {
            colour = green
          }
        }
      }

      const offset = (y * WIDTH + x) * 3
      rgb[offset] = colour[0]
      rgb[offset + 1] = colour[1]
      rgb[offset + 2] = colour[2]
    }
  }

  const png = encodePng(WIDTH, HEIGHT, rgb)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, png)
  process.stdout.write(`[og-image] wrote ${outFile} (${WIDTH}x${HEIGHT}, ${png.length} bytes)\n`)
}

main().catch((error) => {
  process.stderr.write(`[og-image] failed: ${error?.stack || error}\n`)
  process.exit(1)
})
