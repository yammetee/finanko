import { describe, expect, it } from "vitest";
import type { Category } from "../../shared/types/finance";
import { buildReceiptAiPayload } from "./aiParser";
import { normalizeParsedExpense, parseTextInputLocally } from "./expenseParser";

const categories: Category[] = [
  {
    id: "cat-food",
    portfolioId: "portfolio-1",
    name: "Food",
    type: "expense",
    color: "#70c1b3",
  },
];

describe("normalizeParsedExpense", () => {
  it("sends account currency only as a receipt fallback", () => {
    const payload = buildReceiptAiPayload({ fileName: "thai-receipt.jpg", currency: "GEL", categories });
    expect(payload).toMatchObject({ fallbackCurrency: "GEL" });
    expect(payload).not.toHaveProperty("currency");
  });

  it("rejects empty AI transaction payloads", () => {
    expect(
      normalizeParsedExpense(
        {
          fileName: "thai-receipt.jpg",
          currency: "USD",
          categories,
        },
        {
          kind: "transaction",
          description: null,
          currency: "USD",
          total: null,
          items: [],
        },
      ),
    ).toBeNull();
  });

  it("rejects an incomplete legacy receipt response instead of creating a wrong transaction", () => {
    expect(normalizeParsedExpense(
      { fileName: "thai-receipt.jpg", currency: "GEL", categories },
      {
        kind: "receipt",
        description: "CP ALL 7-Eleven",
        currency: "GEL",
        total: 9,
        items: [{ name: "Сигареты Cafe", amount: 9, quantity: 1, unitPrice: 9, categoryId: "Food", confidence: 0.32 }],
      },
    )).toBeNull();
  });

  it("repairs a false negative sign and converts Georgian receipt gram weights to kilograms", () => {
    const parsed = normalizeParsedExpense(
      { fileName: "georgian-receipt.jpg", currency: "GEL", categories },
      {
        kind: "transaction",
        description: "Покупки в магазине",
        currency: "GEL",
        total: 55.21,
        items: [
          { name: "Товар", amount: -1.25, quantity: 1, unitPrice: -1.25, categoryId: "Other", confidence: 0.6 },
          { name: "Весовой товар", amount: 1.27, quantity: 98, unitPrice: 0.0129591837, categoryId: "Other", confidence: 0.5 },
          { name: "Куриное филе", amount: 15.44, quantity: 336, unitPrice: 0.045952381, categoryId: "Other", confidence: 0.5 },
          { name: "Баклажанный рулет", amount: 3.83, quantity: 120, unitPrice: 0.0319166667, categoryId: "Other", confidence: 0.5 },
          { name: "Овощной салат", amount: 2.15, quantity: 108, unitPrice: 0.0199074074, categoryId: "Other", confidence: 0.5 },
          { name: "Куриная колбаса", amount: 2.18, quantity: 118, unitPrice: 0.0184745763, categoryId: "Other", confidence: 0.5 },
          { name: "Карнавали", amount: 2.99, quantity: 1, unitPrice: 2.99, categoryId: "Other", confidence: 0.5 },
          { name: "Биоразлагаемый пакет", amount: 0.2, quantity: 1, unitPrice: 0.2, categoryId: "Other", confidence: 0.5 },
          { name: "Салат Цезарь", amount: 25.9, quantity: 2, unitPrice: 12.95, categoryId: "Other", confidence: 0.5 },
        ],
      },
    );

    expect(parsed?.total).toBe(55.21);
    expect(parsed?.items[0]).toMatchObject({ amount: 1.25, unitPrice: 1.25 });
    expect(parsed?.items[2]).toMatchObject({ quantity: 0.336, unitPrice: 45.95, amount: 15.44 });
  });

  it("rejects receipt totals without line items", () => {
    expect(
      normalizeParsedExpense(
        {
          fileName: "thai-receipt.jpg",
          currency: "THB",
          categories,
        },
        {
          kind: "transaction",
          description: "ร้านค้า",
          currency: "THB",
          total: 245.5,
          items: [],
        },
      ),
    ).toBeNull();
  });

  it("uses receipt items rather than the largest AI number for total and description", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "thai-receipt.jpg",
        currency: "THB",
        categories,
      },
      {
        kind: "transaction",
        description: "Total 9999",
        currency: "THB",
        total: 9999,
        items: [
          { name: "milk", amount: 40, categoryId: "cat-food", confidence: 0.9 },
          { name: "bread", amount: 25.5, categoryId: "cat-food", confidence: 0.88 },
        ],
      },
    );

    expect(parsed).toMatchObject({
      description: "Молоко, Хлеб",
      total: 65.5,
      items: [
        { name: "Молоко", amount: 40 },
        { name: "Хлеб", amount: 25.5 },
      ],
    });
  });

  it("keeps receipt payable total by adding a negative discount item", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "thai-7-eleven.jpg",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "7-Eleven receipt",
        currency: "THB",
        total: 357,
        items: [
          {
            name: "sandwich",
            quantity: 1,
            unitPrice: 52,
            amount: 52,
            categoryId: "cat-food",
            confidence: 0.9,
          },
          {
            name: "coffee",
            quantity: 1,
            unitPrice: 314,
            amount: 314,
            categoryId: "cat-food",
            confidence: 0.9,
          },
        ],
      },
    );

    expect(parsed).toMatchObject({
      currency: "THB",
      total: 357,
      items: [
        { name: "Сэндвич", quantity: 1, unitPrice: 52, amount: 52 },
        { name: "Напитки", quantity: 1, unitPrice: 314, amount: 314 },
        { name: "Скидка/корректировка", quantity: 1, unitPrice: -9, amount: -9 },
      ],
    });
  });

  it("replaces Thai item names with Russian names from AI description", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "thai-7-eleven.jpg",
        currency: "THB",
        categories,
      },
      {
        kind: "transaction",
        description: "Хлеб, курица, напиток",
        currency: "THB",
        total: 120,
        items: [
          { name: "ขนมโรลบอลทานมีนา", amount: 52, quantity: 1, unitPrice: 52, categoryId: "cat-food", confidence: 0.25 },
          { name: "เปี๊ยะ ทรัช มะกอก", amount: 19, quantity: 1, unitPrice: 19, categoryId: "cat-food", confidence: 0.25 },
          { name: "มานสนูเทล่า เอสแอนด์", amount: 49, quantity: 1, unitPrice: 49, categoryId: "cat-food", confidence: 0.25 },
        ],
      },
    );

    expect(parsed).toMatchObject({
      description: "Хлеб, курица, напиток",
      items: [
        { name: "Хлеб", amount: 52 },
        { name: "курица", amount: 19 },
        { name: "напиток", amount: 49 },
      ],
    });
  });

  it("replaces untranslated English receipt rows with aligned Russian description names", () => {
    const parsed = normalizeParsedExpense(
      { fileName: "receipt.jpg", currency: "USD", categories },
      {
        kind: "transaction",
        description: "Молочный напиток, ореховый батончик",
        currency: "USD",
        total: 10,
        items: [
          { name: "Meiji milk drink", amount: 6, quantity: 1, unitPrice: 6, categoryId: "Food", confidence: 0.8 },
          { name: "Brand X nut bar", amount: 4, quantity: 1, unitPrice: 4, categoryId: "Food", confidence: 0.7 },
        ],
      },
    );
    expect(parsed?.items.map((item) => item.name)).toEqual(["Молочный напиток", "ореховый батончик"]);
  });

  it("does not use Thai receipt savings amount as total and infers THB from All Cafe", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "receipt.jpg",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "Салат, All Cafe",
        currency: "USD",
        total: 9,
        items: [
          { name: "Салат", amount: 52, quantity: 1, unitPrice: 52, categoryId: "Food", confidence: 0.3 },
          { name: "Лапша", amount: 111, quantity: 2, unitPrice: 22, categoryId: "Food", confidence: 0.2 },
          { name: "All Cafe", amount: 9, quantity: 1, unitPrice: 9, categoryId: "Food", confidence: 0.6 },
        ],
      },
    );

    expect(parsed).toMatchObject({
      currency: "THB",
      total: 65,
      items: [
        { name: "Салат", amount: 52, categoryId: "cat-food" },
        { name: "Лапша", amount: 22, unitPrice: 11, categoryId: "cat-food" },
        { name: "All Cafe", amount: -9, unitPrice: -9, categoryId: "cat-food" },
      ],
    });
  });

  it("treats 7-Eleven subtotal plus All Cafe discount as final net total", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "receipt.jpg",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "Покупки: рисовую лапшу, напиток, кофе, комплект и товары кафе",
        currency: "THB",
        total: 366,
        items: [
          { name: "ผัดโรสปัลลาเมน่า", amount: 52, quantity: 1, unitPrice: 52, categoryId: "Food", confidence: 0.35 },
          { name: "เปปซี่ ทารัก รสโค้ก", amount: 19, quantity: 1, unitPrice: 19, categoryId: "Food", confidence: 0.3 },
          { name: "มวนสเตร้ด เอส้นเน", amount: 49, quantity: 1, unitPrice: 49, categoryId: "Food", confidence: 0.3 },
          { name: "ไทชิพลูยากาเล่อซ์ชีส", amount: 22, quantity: 1, unitPrice: 22, categoryId: "Food", confidence: 0.2 },
          { name: "HyixDHC เบสตริว", amount: 15, quantity: 1, unitPrice: 15, categoryId: "Food", confidence: 0.2 },
          { name: "คาสครัฟพรีเมยส์เบรส", amount: 35, quantity: 1, unitPrice: 35, categoryId: "Food", confidence: 0.2 },
          { name: "เกาหลีชุดคู่ปุ่น", amount: 32, quantity: 1, unitPrice: 32, categoryId: "Food", confidence: 0.25 },
          { name: "เลออนมรกจั๊งค์เบิร์ส", amount: 32, quantity: 1, unitPrice: 32, categoryId: "Food", confidence: 0.2 },
          { name: "ไร้กิ้กสีป่นชีวิน", amount: 55, quantity: 1, unitPrice: 55, categoryId: "Food", confidence: 0.15 },
          { name: "มะพร้าวนมพุดดิ้ง", amount: 55, quantity: 1, unitPrice: 55, categoryId: "Food", confidence: 0.4 },
          { name: "ค่าน้ำALLCafe", amount: 9, quantity: 1, unitPrice: 9, categoryId: "Food", confidence: 0.25 },
        ],
      },
    );

    expect(parsed?.total).toBe(357);
    expect(parsed?.items[parsed.items.length - 1]).toMatchObject({
      name: "All Cafe",
      amount: -9,
      unitPrice: -9,
      categoryId: "cat-food",
    });
  });

  it("treats multiple Thai receipt discounts as negative items and keeps net total", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "receipt.jpg",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "Покупки: вода, овсянка, напиток, мороженое",
        currency: "THB",
        total: 436,
        items: [
          { name: "Вода", amount: 58, quantity: 1, unitPrice: 58, categoryId: "Food", confidence: 0.8 },
          { name: "Овсянка", amount: 79, quantity: 1, unitPrice: 79, categoryId: "Food", confidence: 0.8 },
          { name: "Напиток", amount: 66, quantity: 1, unitPrice: 66, categoryId: "Food", confidence: 0.8 },
          { name: "Мороженое", amount: 19, quantity: 1, unitPrice: 19, categoryId: "Food", confidence: 0.8 },
          { name: "Сэндвич", amount: 39, quantity: 1, unitPrice: 39, categoryId: "Food", confidence: 0.8 },
          { name: "Соус", amount: 10, quantity: 1, unitPrice: 10, categoryId: "Food", confidence: 0.8 },
          { name: "Бургер", amount: 55, quantity: 1, unitPrice: 55, categoryId: "Food", confidence: 0.8 },
          { name: "Хлеб", amount: 20, quantity: 1, unitPrice: 20, categoryId: "Food", confidence: 0.8 },
          { name: "Шампунь", amount: 40, quantity: 1, unitPrice: 40, categoryId: "Food", confidence: 0.8 },
          { name: "Печенье", amount: 30, quantity: 1, unitPrice: 30, categoryId: "Food", confidence: 0.8 },
          { name: "Крем", amount: 20, quantity: 1, unitPrice: 20, categoryId: "Food", confidence: 0.8 },
          { name: "ส่วนลด пицца", amount: 5, quantity: 1, unitPrice: 5, categoryId: "Food", confidence: 0.7 },
          { name: "Скидка на воду", amount: 7, quantity: 1, unitPrice: 7, categoryId: "Food", confidence: 0.7 },
          { name: "coupon cola", amount: 4, quantity: 1, unitPrice: 4, categoryId: "Food", confidence: 0.7 },
        ],
      },
    );

    expect(parsed?.total).toBe(420);
    expect(parsed?.items.slice(-3)).toMatchObject([
      { amount: -5, unitPrice: -5 },
      { amount: -7, unitPrice: -7 },
      { amount: -4, unitPrice: -4 },
    ]);
  });

  it("removes uncertainty words from recognized receipt item names", () => {
    const parsed = normalizeParsedExpense(
      {
        fileName: "receipt.jpg",
        currency: "THB",
        categories,
      },
      {
        kind: "transaction",
        description: "Покупки: вафли",
        currency: "THB",
        total: 58,
        items: [
          {
            name: "Около вафли (похоже на товар)",
            amount: 58,
            quantity: 1,
            unitPrice: 58,
            categoryId: "Food",
            confidence: 0.6,
          },
        ],
      },
    );

    expect(parsed?.items[0]?.name).toBe("вафли");
  });

  it("parses salary text as income with explicit currency", () => {
    const parsed = parseTextInputLocally({
      text: "зарплата 4000$",
      currency: "RUB",
      categories,
    });

    expect(parsed).toMatchObject({
      kind: "transaction",
      type: "income",
      currency: "USD",
      total: 4000,
      items: [{ amount: 4000 }],
    });
  });

  it("parses Russian baht aliases as THB without asking for currency", () => {
    const parsed = parseTextInputLocally({
      text: "завтрак и обед 500 бат",
      currency: "USD",
      categories,
    });

    expect(parsed).toMatchObject({
      kind: "transaction",
      type: "expense",
      currency: "THB",
      total: 500,
      description: "завтрак и обед",
      items: [{ name: "завтрак и обед", amount: 500 }],
    });
  });

  it("lets explicit baht in text override wrong AI currency", () => {
    const parsed = normalizeParsedExpense(
      {
        text: "завтрак и обед 500 бат",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "Завтрак и обед",
        currency: "USD",
        total: 500,
        items: [{ name: "Завтрак и обед", amount: 500, categoryId: "cat-food", confidence: 0.9 }],
      },
    );

    expect(parsed).toMatchObject({
      currency: "THB",
      total: 500,
      items: [{ name: "Завтрак и обед", amount: 500 }],
    });
  });

  it("parses Russian lari aliases as GEL without keeping default USD", () => {
    const parsed = parseTextInputLocally({
      text: "обед 25 лари",
      currency: "USD",
      categories,
    });

    expect(parsed).toMatchObject({
      kind: "transaction",
      type: "expense",
      currency: "GEL",
      total: 25,
      items: [{ name: "обед", amount: 25 }],
    });
  });

  it("parses multiple priced text items and sums them deterministically", () => {
    const parsed = parseTextInputLocally({
      text: "кофе 5, продукты 40 лари",
      currency: "USD",
      categories,
    });
    expect(parsed).toMatchObject({
      kind: "transaction",
      currency: "GEL",
      total: 45,
      items: [{ name: "кофе", amount: 5 }, { name: "продукты", amount: 40 }],
    });
  });

  it("lets explicit lari in text override wrong AI currency", () => {
    const parsed = normalizeParsedExpense(
      {
        text: "обед 25 лари",
        currency: "USD",
        categories,
      },
      {
        kind: "transaction",
        description: "Обед",
        currency: "USD",
        total: 25,
        items: [{ name: "Обед", amount: 25, categoryId: "Food", confidence: 0.9 }],
      },
    );

    expect(parsed).toMatchObject({
      currency: "GEL",
      total: 25,
      items: [{ name: "Обед", amount: 25, categoryId: "cat-food" }],
    });
  });

  it("parses Georgian lari account text as GEL", () => {
    const parsed = parseTextInputLocally({
      text: "кредит 1200 лари 12%",
      currency: "USD",
      categories,
    });

    expect(parsed).toMatchObject({
      kind: "account",
      currency: "GEL",
      initialBalance: 1200,
    });
  });
});
