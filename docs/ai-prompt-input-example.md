# AI Prompt Input Examples

This document shows the **exact input** that gets sent to the AI when you click "Generate AI Summary".

## How It Works

### Step 1: Data Collection (content.js)
The content script extracts product data from the page:

```javascript
{
  title: "Air Jordan 1 Mid SE Men's Shoes",
  url: "https://www.nike.com/...",
  products: [
    {
      title: "Air Jordan 1 Mid SE Men's Shoes Size 11",
      price: "130",
      currency: "$",
      rating: "4.5",
      reviewCount: "1247",
      availability: "InStock"
    }
  ],
  signals: {
    clickedActionItems: [
      { text: "Add to Cart", verb: "add", timestamp: 1234567890 }
    ],
    actionItems: [
      { text: "Buy Now", verb: "buy" },
      { text: "Add to Favorites", verb: "add" }
    ]
  }
}
```

### Step 2: Browsing History Collection (dashboard.js)
When you open Focus Coach, it gathers recent pages:

```javascript
browsingHistory: [
  {
    title: "Air Jordan 1 Mid SE - Nike",
    url: "https://www.nike.com/...",
    signals: {
      products: [...],
      clickedActionItems: [...]
    }
  },
  {
    title: "Air Jordan Retro 1 Mid SE - Finish Line",
    url: "https://www.finishline.com/...",
    signals: {
      products: [...],
      clickedActionItems: [...]
    }
  }
]
```

### Step 3: Prompt Building (utils/ai.js)
The code processes this data and builds a structured prompt.

---

## Example 1: Shoes (Nike vs Finish Line)

### Input Data
```javascript
browsingHistory: [
  {
    title: "Air Jordan 1 Mid SE - Nike",
    url: "https://www.nike.com/t/air-jordan-1-mid-se",
    signals: {
      products: [
        {
          title: "Air Jordan 1 Mid SE Men's Shoes",
          price: 130,
          currency: "$",
          rating: "4.5",
          reviewCount: 1247,
          availability: "InStock"
        }
      ],
      clickedActionItems: [
        { text: "Add to Cart", verb: "add" }
      ]
    }
  },
  {
    title: "Air Jordan Retro 1 Mid SE - Finish Line",
    url: "https://www.finishline.com/store/product/mens-air-jordan-retro-1",
    signals: {
      products: [
        {
          title: "Men's Air Jordan Retro 1 Mid SE Casual Shoes",
          price: 140,
          currency: "$",
          rating: "4.3",
          reviewCount: 48,
          availability: "InStock"
        }
      ]
    }
  }
]
```

### Prompt Sent to AI
```
User clicked: Add to Cart |
Products: Air Jordan 1 Mid SE Men's Shoes at nike.com: $130, new, 1247 reviews | Men's Air Jordan Retro 1 Mid SE Casual Shoes at finishline.com: $140, new, 48 reviews |
STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

### AI Output
```
Shopping - Air Jordan 1 Mid SE

1. Nike.com has lower price at $130 comparing to Finish Line at $140, save $10
2. Nike.com offers genuine leather while Finish Line has synthetic material, better durability on Nike
3. Nike.com has 1,247 reviews while Finish Line has 48 reviews, 26x more feedback for reliability
```

---

## Example 2: Phone (Amazon vs Best Buy)

### Input Data
```javascript
browsingHistory: [
  {
    title: "Apple iPhone 15 128GB - Amazon",
    url: "https://www.amazon.com/Apple-iPhone-15-128GB/dp/...",
    signals: {
      products: [
        {
          title: "Apple iPhone 15 128GB (Renewed)",
          price: 505,
          currency: "$",
          rating: "4.2",
          reviewCount: 1200,
          availability: "Renewed"
        }
      ],
      clickedActionItems: [
        { text: "Add to Cart", verb: "add" }
      ]
    }
  },
  {
    title: "Apple iPhone 15 - Best Buy",
    url: "https://www.bestbuy.com/site/apple-iphone-15/...",
    signals: {
      products: [
        {
          title: "Apple iPhone 15 128GB",
          price: 629.99,
          currency: "$",
          rating: "4.6",
          reviewCount: 856,
          availability: "InStock"
        }
      ]
    }
  }
]
```

### Prompt Sent to AI
```
User clicked: Add to Cart |
Products: Apple iPhone 15 128GB (Renewed) at amazon.com: $505, refurbished, 128GB, 1200 reviews | Apple iPhone 15 128GB at bestbuy.com: $629.99, new, 128GB, 856 reviews |
STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

### AI Output
```
Shopping - iPhone 15

1. Amazon has lower price at $505 for refurbished comparing to Best Buy at $629 for new, save $124
2. Both models have same 128GB storage, Amazon offers refurbished while Best Buy is new
3. Amazon has 1,200 reviews while Best Buy has 856 reviews, more feedback data on Amazon
```

---

## Example 3: Phone with Different Storage (Total Wireless vs Best Buy)

### Input Data
```javascript
browsingHistory: [
  {
    title: "iPhone 15 64GB - Total Wireless",
    url: "https://www.totalwireless.com/shop/phones/iphone-15",
    signals: {
      products: [
        {
          title: "Apple iPhone 15 64GB with Total 5G+ Unlimited plan",
          price: 400,
          currency: "$",
          rating: "4.1",
          reviewCount: 45,
          availability: "InStock"
        }
      ],
      clickedActionItems: [
        { text: "Buy Now", verb: "buy" }
      ]
    }
  },
  {
    title: "iPhone 15 128GB - Best Buy",
    url: "https://www.bestbuy.com/site/apple-iphone-15-128gb/...",
    signals: {
      products: [
        {
          title: "Apple iPhone 15 128GB",
          price: 500,
          currency: "$",
          rating: "4.6",
          reviewCount: 856,
          availability: "InStock"
        }
      ]
    }
  }
]
```

### Prompt Sent to AI
```
User clicked: Buy Now |
Products: Apple iPhone 15 64GB with Total 5G+ Unlimited plan at totalwireless.com: $400, new, 64GB, 45 reviews | Apple iPhone 15 128GB at bestbuy.com: $500, new, 128GB, 856 reviews |
STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

### AI Output
```
Shopping - iPhone 15

1. Total Wireless has lower price at $400 for 64GB comparing to Best Buy at $500 for 128GB
2. Best Buy model offers 128GB storage while Total Wireless has 64GB, double the space for apps and photos
3. Best Buy has 856 reviews while Total Wireless has 45 reviews, more reliable customer feedback
```

---

## Example 4: Laptop (Best Buy vs Apple Store)

### Input Data
```javascript
browsingHistory: [
  {
    title: "MacBook Air M2 - Best Buy",
    url: "https://www.bestbuy.com/site/macbook-air-m2/...",
    signals: {
      products: [
        {
          title: "Apple MacBook Air 13.6-inch M2 256GB",
          price: 1099,
          currency: "$",
          rating: "4.8",
          reviewCount: 723,
          availability: "InStock"
        }
      ],
      clickedActionItems: [
        { text: "Add to Cart", verb: "add" }
      ]
    }
  },
  {
    title: "MacBook Air M2 - Apple Store",
    url: "https://www.apple.com/shop/buy-mac/macbook-air/...",
    signals: {
      products: [
        {
          title: "MacBook Air 13-inch with M2 chip - 256GB",
          price: 1199,
          currency: "$",
          rating: "4.6",
          reviewCount: 234,
          availability: "InStock"
        }
      ]
    }
  }
]
```

### Prompt Sent to AI
```
User clicked: Add to Cart |
Products: Apple MacBook Air 13.6-inch M2 256GB at bestbuy.com: $1099, new, 13.6-inch, 723 reviews | MacBook Air 13-inch with M2 chip - 256GB at apple.com: $1199, new, 13-inch, 234 reviews |
STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

### AI Output
```
Shopping - MacBook Air M2

1. Best Buy offers MacBook at $1,099 comparing to Apple Store at $1,199, save $100
2. Both models have same 256GB storage and 13-inch screen, Best Buy has student discount
3. Best Buy has 723 reviews with 4.8 rating while Apple has 234 reviews with 4.6 rating
```

---

## Prompt Structure Breakdown

The prompt is built in this order:

```
[User Clicks] | [Product Data] | [Activities] | [Categories] | [Due Dates] | [Instruction]
```

### Components:

1. **User clicked**: `User clicked: Add to Cart, Buy Now`
2. **Products**: `Products: [Product] at [website]: $[price], [condition], [specs], [reviews]`
3. **Activities**: `Activities: Shopping for sneakers; Browsing laptops`
4. **Categories**: `Categories: shopping(3), learning(1)`
5. **Due dates**: `Due: Feb 15: Assignment submission`
6. **Instruction**: `STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.`

---

## System Prompt (Always Sent)

The AI also receives this system prompt (from `focusCoachPrompt()`):

```
You are an UNBIASED DATA ANALYST comparing products. You ANALYZE data and STATE FACTS, not give tasks.
The user provides product data: prices, specs, reviews, websites.

YOUR ROLE: Compare and analyze the data objectively. DO NOT tell user what to do.

FORMAT REQUIREMENTS (CRITICAL - FOLLOW EXACTLY):
- First line: "Shopping - [Product Name]"
- Then provide 2-3 numbered points stating FACTS and COMPARISONS
- NO bold text, NO asterisks, NO special formatting
- NO tasks like "Check", "Compare", "Review", "Go to"
- NO instructions or suggestions - only state facts

[... examples and detailed requirements ...]
```

---

## How to See This in Action

1. Open browser console (F12)
2. Reload the extension
3. Visit product pages and click buttons
4. Open Focus Coach dashboard
5. Click "Generate AI Summary"
6. Look for console logs: `[AI] Prompt preview: ...`

You'll see the exact prompt being sent!

---

## Key Takeaways

- **User clicks** are prioritized first
- **Product specs** are auto-extracted (storage, screen size)
- **Condition** (new/refurbished) is detected automatically
- **Review counts** are included for reliability comparison
- **Prompt is concise** - only essential data
- **AI is instructed** to STATE FACTS, not give tasks
