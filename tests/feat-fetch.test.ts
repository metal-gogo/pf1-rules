import { expect, test, vi } from "vitest";
import { fetchFeat } from "../src/ingestion/ingest-d20-feat-comparison-pilot.js";
import { writeCapturedArtifact } from "../src/ingestion/artifact-store.js";

vi.mock("../src/ingestion/artifact-store.js", async (original) => ({
  ...await original<typeof import("../src/ingestion/artifact-store.js")>(),
  readCapturedArtifact: vi.fn(() => null),
  writeCapturedArtifact: vi.fn(),
}));

test("feat capture retries temporary failures but never caches exhausted or permanent errors", async () => {
  vi.useFakeTimers();
  const network = vi.spyOn(globalThis, "fetch");
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  const feat = { entityId: "feat.example", name: "Example", url: "https://www.d20pfsrd.com/feats/general-feats/example/" };
  try {
    network.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockResolvedValueOnce(new Response("Feat rules"));
    const recovered = expect(fetchFeat(feat)).resolves.toMatchObject({ body: "Feat rules" });
    await vi.runAllTimersAsync();
    await recovered;
    expect(network).toHaveBeenCalledTimes(3);
    expect(writeCapturedArtifact).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeCapturedArtifact).mock.calls[0]![1]).toBe("Feat rules");

    network.mockReset().mockImplementation(async () => new Response("Bad gateway", { status: 502 }));
    vi.mocked(writeCapturedArtifact).mockClear();
    const exhausted = expect(fetchFeat(feat)).rejects.toThrow("HTTP 502");
    await vi.runAllTimersAsync();
    await exhausted;
    expect(network).toHaveBeenCalledTimes(3);
    expect(writeCapturedArtifact).not.toHaveBeenCalled();

    network.mockReset().mockResolvedValue(new Response("Forbidden", { status: 403 }));
    const forbidden = expect(fetchFeat(feat)).rejects.toThrow("HTTP 403");
    await vi.runAllTimersAsync();
    await forbidden;
    expect(network).toHaveBeenCalledTimes(1);
    expect(writeCapturedArtifact).not.toHaveBeenCalled();

    network.mockReset().mockResolvedValue(new Response("Missing", { status: 404 }));
    const missing = expect(fetchFeat(feat, undefined, true)).resolves.toMatchObject({ metadata: { http_status: 404 } });
    await vi.runAllTimersAsync();
    await missing;
    expect(network).toHaveBeenCalledTimes(1);
    expect(writeCapturedArtifact).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
    network.mockRestore();
    warnings.mockRestore();
  }
});
