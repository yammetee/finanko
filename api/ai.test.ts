import { describe, expect, it, vi } from "vitest";
import handler from "./ai";

describe("AI serverless handler", () => {
  it("loads and answers preflight without external services", async () => {
    const response = {
      statusCode: 200,
      headers: new Map<string, string>(),
      payload: undefined as unknown,
      ended: false,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: unknown) {
        this.payload = payload;
      },
      setHeader(name: string, value: string) {
        this.headers.set(name, value);
      },
      end() {
        this.ended = true;
      },
    };
    const endSpy = vi.spyOn(response, "end");

    await handler({ method: "OPTIONS", headers: {} }, response);

    expect(response.statusCode).toBe(204);
    expect(response.headers.get("Allow")).toBe("POST, OPTIONS");
    expect(endSpy).toHaveBeenCalledOnce();
  });
});
