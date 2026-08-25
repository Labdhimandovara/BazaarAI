import { parseIntentFromConversation } from "../src/services/intent";

describe("Gemini Configuration and Fallback Regression Tests", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("Missing Gemini Key falls back to local parser", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = ""; // missing

    const res = await parseIntentFromConversation("chess board", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("chess");
  });

  test("Invalid/Unavailable Gemini configuration falls back to local parser", async () => {
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "invalid-key-value";

    const res = await parseIntentFromConversation("I need a laptop under ₹60,000", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });

  test("Local parser parses 'chess board' correctly", async () => {
    const res = await parseIntentFromConversation("chess board", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("chess");
  });

  test("Local parser parses phone with good battery under 20k correctly without cricket bat collision", async () => {
    const res = await parseIntentFromConversation("I need a phone with good battery under ₹20,000", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(2000000);
  });

  test("Local parser parses laptop under 60k correctly", async () => {
    const res = await parseIntentFromConversation("I need a laptop under ₹60,000", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });
});
