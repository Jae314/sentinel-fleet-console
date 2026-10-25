import { describe, expect, it } from "vitest";
import { MockDataSource } from "./MockDataSource";
import { detectionSchema } from "./fileSchemas";

describe("nullable detection proposals", () => {
  it("seeds exactly two no-action detections without linked actions", async () => {
    const mock = new MockDataSource(0);
    const detections = (await mock.getDetections()).filter((d) => d.proposedAction === null);
    expect(detections).toHaveLength(2);
    const actions = await mock.getActions();
    for (const detection of detections) {
      expect(detection.actionId).toBeUndefined();
      expect(actions.some((a) => a.detectionId === detection.id)).toBe(false);
      await expect(mock.requestAction(detection.id)).rejects.toThrow("No action proposed");
    }
  });
  it("accepts explicit null but not missing or malformed proposals in files", async () => {
    const detection = (await new MockDataSource(0).getDetections())[0];
    if (!detection) throw new Error("Missing detection");
    expect(detectionSchema.safeParse({ ...detection, proposedAction: null }).success).toBe(true);
    expect(detectionSchema.safeParse({ ...detection, proposedAction: undefined }).success).toBe(false);
    expect(detectionSchema.safeParse({ ...detection, proposedAction: {} }).success).toBe(false);
  });
});