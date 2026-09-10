import { convertToWebp } from "../ingest-images-io"
import {
  ingestImageUrls,
  ingestManyUrls,
  isMedusaHostedUrl,
  stripQuery,
  webpFilenameFor,
} from "../ingest-images"
import sharp from "sharp"

const TEMP_DASHBOARD =
  "http://127.0.0.1:9002/printo/stores/1/products/18/images/abc.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=7200&X-Amz-Signature=deadbeef"

describe("ingest-images", () => {
  it("treats presigned dashboard URLs as remote", () => {
    expect(isMedusaHostedUrl(TEMP_DASHBOARD, "http://localhost:9000")).toBe(
      false
    )
  })

  it("keeps files already on the Medusa host", () => {
    expect(
      isMedusaHostedUrl(
        "http://localhost:9000/static/delegat-abc.webp",
        "http://localhost:9000"
      )
    ).toBe(true)
  })

  it("strips the signature so the same object reuses a filename", () => {
    const a = webpFilenameFor(TEMP_DASHBOARD)
    const b = webpFilenameFor(stripQuery(TEMP_DASHBOARD) + "?X-Amz-Signature=other")
    expect(a).toBe(b)
    expect(a.endsWith(".webp")).toBe(true)
  })

  it("downloads, converts to webp, and uploads remote photos", async () => {
    const download = jest.fn(async () => Buffer.from("jpeg-bytes"))
    const convert = jest.fn(async () => Buffer.from("webp-bytes"))
    const upload = jest.fn(async () => "http://localhost:9000/static/delegat-1.webp")

    const urls = await ingestImageUrls([TEMP_DASHBOARD], {
      download,
      convert,
      upload,
      backendUrl: "http://localhost:9000",
    })

    expect(download).toHaveBeenCalledWith(TEMP_DASHBOARD)
    expect(convert).toHaveBeenCalledWith(Buffer.from("jpeg-bytes"))
    expect(upload).toHaveBeenCalledWith(
      webpFilenameFor(TEMP_DASHBOARD),
      "image/webp",
      Buffer.from("webp-bytes")
    )
    expect(urls).toEqual(["http://localhost:9000/static/delegat-1.webp"])
  })

  it("downloads a repeated remote url once across a batch", async () => {
    const download = jest.fn(async () => Buffer.from("jpeg-bytes"))
    const convert = jest.fn(async () => Buffer.from("webp-bytes"))
    const upload = jest.fn(async () => "http://localhost:9000/static/delegat-1.webp")
    const hosted = "http://localhost:9000/static/already.webp"
    const map = await ingestManyUrls([TEMP_DASHBOARD, hosted, TEMP_DASHBOARD], {
      download,
      convert,
      upload,
      backendUrl: "http://localhost:9000",
    })
    expect(download).toHaveBeenCalledTimes(1)
    expect(map.get(TEMP_DASHBOARD)).toBe("http://localhost:9000/static/delegat-1.webp")
    expect(map.get(hosted)).toBe(hosted)
  })

  it("reuses a previously ingested file without downloading", async () => {
    const download = jest.fn()
    const existing = "http://localhost:9000/static/delegat-abc.webp"
    const urls = await ingestImageUrls([TEMP_DASHBOARD], {
      download,
      convert: async (b) => b,
      upload: async () => "nope",
      existingUrl: (filename) =>
        filename === webpFilenameFor(TEMP_DASHBOARD) ? existing : null,
      backendUrl: "http://localhost:9000",
    })
    expect(download).not.toHaveBeenCalled()
    expect(urls).toEqual([existing])
  })

  it("does not re-download a Medusa-hosted url", async () => {
    const download = jest.fn()
    const hosted = "http://localhost:9000/static/already.webp"
    const urls = await ingestImageUrls([hosted], {
      download,
      convert: async (b) => b,
      upload: async () => "nope",
      backendUrl: "http://localhost:9000",
    })
    expect(download).not.toHaveBeenCalled()
    expect(urls).toEqual([hosted])
  })

  it("convertToWebp matches 2webp (sharp webp q80)", async () => {
    const png = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer()
    const webp = await convertToWebp(png)
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF")
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP")
  })

  it("skips a photo that fails to download", async () => {
    const urls = await ingestImageUrls(
      [TEMP_DASHBOARD, "http://localhost:9000/static/ok.webp"],
      {
        download: async () => {
          throw new Error("expired")
        },
        convert: async (b) => b,
        upload: async () => "nope",
        backendUrl: "http://localhost:9000",
      }
    )
    expect(urls).toEqual(["http://localhost:9000/static/ok.webp"])
  })
})
