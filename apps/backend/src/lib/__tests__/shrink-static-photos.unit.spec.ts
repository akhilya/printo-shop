import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import sharp from "sharp"
import { shrinkOversizedStaticPhotos } from "../shrink-static-photos"

describe("shrinkOversizedStaticPhotos", () => {
  it("rewrites a 1600×2134 webp down to 1280 and leaves a small one", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "shop-photo-"))
    try {
      const big = await sharp({
        create: { width: 1600, height: 2134, channels: 3, background: "#cccccc" },
      })
        .webp()
        .toBuffer()
      const small = await sharp({
        create: { width: 400, height: 400, channels: 3, background: "#111111" },
      })
        .webp()
        .toBuffer()
      await writeFile(path.join(dir, "big.webp"), big)
      await writeFile(path.join(dir, "small.webp"), small)

      const result = await shrinkOversizedStaticPhotos(dir)
      expect(result.shrunk).toBe(1)
      expect(result.failed).toBe(0)

      const meta = await sharp(await readFile(path.join(dir, "big.webp"))).metadata()
      expect(meta.width).toBeLessThanOrEqual(1280)
      expect(meta.height).toBe(1280)
      const again = await shrinkOversizedStaticPhotos(dir)
      expect(again.shrunk).toBe(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
