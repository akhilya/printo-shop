import { decodeReviewImageBase64, MAX_BYTES } from "../review-image"

describe("decodeReviewImageBase64", () => {
  it("accepts a data URL and returns bytes", () => {
    const buf = decodeReviewImageBase64("data:image/png;base64,aGVsbG8=")
    expect(buf.toString("utf8")).toBe("hello")
  })

  it("rejects an oversized payload", () => {
    const big = Buffer.alloc(MAX_BYTES + 8, 1).toString("base64")
    expect(() => decodeReviewImageBase64(big)).toThrow("too_large")
  })

  it("rejects a huge string before decoding", () => {
    expect(() => decodeReviewImageBase64("a".repeat(MAX_BYTES * 2 + 1))).toThrow(
      "too_large"
    )
  })
})
