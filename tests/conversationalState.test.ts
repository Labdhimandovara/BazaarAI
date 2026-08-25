import { parseIntentFromConversation, ChatMessage } from "../src/services/intent";

describe("Conversational State and Budget Inheritance Tests", () => {
  // Test 1
  test("Test 1: Headphones under 2000 -> Find me a laptop -> laptop with null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I need headphones under ₹2,000" },
      { role: "assistant", content: "I found Boat Rockerz headphones for you." }
    ];
    const res = await parseIntentFromConversation("Find me a laptop", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 2
  test("Test 2: Headphones under 2000 -> Find me a laptop under 60000 -> laptop with 60000 budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I need headphones under ₹2,000" },
      { role: "assistant", content: "Here are headphones under 2000." }
    ];
    const res = await parseIntentFromConversation("Find me a laptop under ₹60,000", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });

  // Test 3
  test("Test 3: Find me a laptop -> under 60000 -> laptop with 60000 budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop" },
      { role: "assistant", content: "What is your budget for the laptop?" }
    ];
    const res = await parseIntentFromConversation("under ₹60,000", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });

  // Test 4
  test("Test 4: Laptop under 60000 -> Find me a phone -> phone with null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop under ₹60,000" },
      { role: "assistant", content: "Here is a Lenovo ThinkPad for ₹44,100." }
    ];
    const res = await parseIntentFromConversation("Find me a phone", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 5
  test("Test 5: Laptop under 60000 -> make it cheaper -> laptop with 60000 budget, cheapest objective", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop under ₹60,000" },
      { role: "assistant", content: "Here is a laptop." }
    ];
    const res = await parseIntentFromConversation("make it cheaper", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
    expect(res.extractedIntent?.objective).toBe("cheapest");
  });

  // Test 6
  test("Test 6: Find me a laptop -> under 60000 -> actually under 40000 -> laptop with 40000 budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop" },
      { role: "assistant", content: "Sure." },
      { role: "user", content: "under ₹60,000" },
      { role: "assistant", content: "Here is one." }
    ];
    const res = await parseIntentFromConversation("actually under ₹40,000", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(4000000);
  });

  // Test 7
  test("Test 7: Headphones under 2000 -> Find me a laptop -> under 60000 -> laptop with 60000 budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me headphones under ₹2,000" },
      { role: "assistant", content: "Okay." },
      { role: "user", content: "Find me a laptop" },
      { role: "assistant", content: "Okay." }
    ];
    const res = await parseIntentFromConversation("under ₹60,000", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });

  // Test 8
  test("Test 8: Laptop under 60000 -> Find me headphones -> headphones with null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop under ₹60,000" },
      { role: "assistant", content: "Okay." }
    ];
    const res = await parseIntentFromConversation("Find me headphones", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("headphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 9
  test("Test 9: Laptop -> delivery tomorrow -> laptop, delivery tomorrow, null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I need a laptop" },
      { role: "assistant", content: "Okay." }
    ];
    const res = await parseIntentFromConversation("delivery tomorrow", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
    expect(res.extractedIntent?.maxDeliveryDays).toBe(1);
  });

  // Test 10
  test("Test 10: Laptop under 60000 -> Find me a phone -> phone, null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "I need a laptop under ₹60,000" },
      { role: "assistant", content: "Okay." }
    ];
    const res = await parseIntentFromConversation("Find me a phone", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 11 (Section 11 Test 1): Find me a chess set under ₹500 -> Find me a laptop -> laptop with null budget
  test("Test 11: Find me a chess set under ₹500 -> Find me a laptop -> laptop with null budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a chess set under ₹500" },
      { role: "assistant", content: "Here is a chess set." }
    ];
    const res = await parseIntentFromConversation("Find me a laptop", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 12 (Section 11 Test 5): Find me a laptop -> Find me a phone under ₹20,000 -> phone with 20000 budget
  test("Test 12: Find me a laptop -> Find me a phone under ₹20,000 -> phone with 20000 budget", async () => {
    const history: ChatMessage[] = [
      { role: "user", content: "Find me a laptop" },
      { role: "assistant", content: "Here is a laptop." }
    ];
    const res = await parseIntentFromConversation("Find me a phone under ₹20,000", history);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("smartphones");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(2000000);
  });

  // Test 13 (Section 11 Test 6): Fresh conversation: Find me a laptop -> maxBudgetPaise = null
  test("Test 13: Fresh conversation: Find me a laptop -> maxBudgetPaise = null", async () => {
    const res = await parseIntentFromConversation("Find me a laptop", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBeNull();
  });

  // Test 14 (Section 11 Test 7): Fresh conversation: Find me a laptop under ₹60,000 -> maxBudgetPaise = 6000000
  test("Test 14: Fresh conversation: Find me a laptop under ₹60,000 -> maxBudgetPaise = 6000000", async () => {
    const res = await parseIntentFromConversation("Find me a laptop under ₹60,000", []);
    expect(res.isComplete).toBe(true);
    expect(res.extractedIntent?.subcategory).toBe("laptops");
    expect(res.extractedIntent?.maxBudgetPaise).toBe(6000000);
  });
});
