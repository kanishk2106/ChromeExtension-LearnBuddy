# Few-Shot Prompting Implementation

## Overview

Replaced the previous prompt system with **few-shot prompting** approach for more consistent, structured output.

## What is Few-Shot Prompting?

Few-shot prompting provides the AI with **concrete examples** of exactly what you want, rather than just describing it. This dramatically improves consistency and quality.

### Before (Instruction-Based)
```
You are an analyst. Compare prices and state facts. No tasks. Use specific numbers...
```

### After (Few-Shot with Examples)
```
Here are 3 examples of exactly what I want:

Example 1:
Input: [specific input]
Output: [exact desired format]

Example 2:
Input: [specific input]
Output: [exact desired format]

Now do the same for my data.
```

---

## New Output Format

### Structure

```
Category – Product Name & Product Name

• Fact about product 1
• Fact about product 2
• Fact about specs/pricing
• Pros: [advantages from text only]
• Cons: [disadvantages from text only]
• Cheaper item: Product A at $X (vs $Y)
```

### Key Features

1. **Category Classification**: Shopping, Review, Docs, News, Other
2. **Canonical Names**: "Apple iPhone 15 & 15 Plus" not "iPhone at store"
3. **Bullet Facts**: 2-3 concrete facts with numbers
4. **Pros/Cons**: Derived strictly from provided text
5. **Cheaper Item**: Automatic callout for best deal

---

## Input Format

### What AI Receives

```
Activities: **<activity 1>**; **<activity 2>**; **<activity 3>** | Generate 2-3 factual statements
```

### How It's Built (utils/ai.js:491-559)

Products are converted to activities:

```javascript
// Example for iPhone
"Apple iPhone 15 128GB at bestbuy.com priced at $629.99 128GB storage 856 reviews"

// Formatted as:
"**Apple iPhone 15 128GB at bestbuy.com priced at $629.99 128GB storage 856 reviews.**"
```

---

## Example 1: Phones (Different Storage)

### Input Data
```javascript
products: [
  {
    title: "iPhone 15 Plus 128GB",
    price: 379,
    source: "totalwireless.com",
    reviewCount: 45
  },
  {
    title: "iPhone 15 128GB (Black, Unlocked)",
    price: 629.99,
    source: "bestbuy.com",
    reviewCount: 856
  }
]
```

### Prompt Sent to AI
```
Activities: **iPhone 15 Plus 128GB at totalwireless.com priced at $379 128GB storage 45 reviews.**; **iPhone 15 128GB (Black, Unlocked) at bestbuy.com priced at $629.99 128GB storage 856 reviews.** | Generate 2-3 factual statements
```

### Expected AI Output
```
Shopping – Apple iPhone 15 & 15 Plus

• Total Wireless lists iPhone 15 Plus 128GB at $379.
• Best Buy lists iPhone 15 128GB (Black, Unlocked) at $629.99.
• Total Wireless offers $250 savings with a 3-month plan.
• Pros: 0% APR and plan savings available (Total Wireless); unlocked option at Best Buy.
• Cons: Savings require a 3-month plan (carrier); Best Buy price is higher.
• Cheaper item: iPhone 15 Plus at $379 (vs $629.99).
```

---

## Example 2: Shoes (Material Comparison)

### Input Data
```javascript
products: [
  {
    title: "Jordan Retro 3 Men's",
    price: 205,
    source: "footlocker.com",
    reviewCount: 342
  },
  {
    title: "adidas Ultraboost Light Men's",
    price: 180,
    source: "adidas.com",
    reviewCount: 523
  }
]
```

### Prompt Sent to AI
```
Activities: **Jordan Retro 3 Men's at footlocker.com priced at $205 342 reviews.**; **adidas Ultraboost Light Men's at adidas.com priced at $180 523 reviews.** | Generate 2-3 factual statements
```

### Expected AI Output
```
Shopping – Jordan Retro 3 & adidas Ultraboost Light (Men's)

• Foot Locker lists Jordan Retro 3 at $205.00 with interest-free payments.
• Ultraboost Light is priced at $180.00 with an occasional $20 coupon.
• Pros: Interest-free installments (Jordan); lower base price and coupon potential (Ultraboost).
• Cons: Jordan price is higher than Ultraboost; coupon timing not guaranteed (Ultraboost).
• Cheaper item: adidas Ultraboost Light at $180 (vs $205).
```

---

## Example 3: Reviews (Headphones)

### Input Data
```javascript
products: [
  {
    title: "Sony WH-1000XM5",
    price: 399,
    rating: "4.5",
    source: "sony.com",
    reviewCount: 1247
  },
  {
    title: "Bose QC Ultra",
    price: 399,
    rating: "4.0",
    source: "bose.com",
    reviewCount: 856
  }
]
```

### Prompt Sent to AI
```
Activities: **Sony WH-1000XM5 at sony.com priced at $399 4.5★ rating 1247 reviews.**; **Bose QC Ultra at bose.com priced at $399 4.0★ rating 856 reviews.** | Generate 2-3 factual statements
```

### Expected AI Output
```
Review – Sony WH-1000XM5 & Bose QC Ultra

• XM5 rated 4.5/5 with strong ANC and comfort; list price $399, common deals ~$349.
• QC Ultra rated 4/5; emphasizes call quality; similar price range.
• Pros: XM5—top-tier ANC/comfort; QC Ultra—call quality focus.
• Cons: XM5—higher list price than sale price; QC Ultra—slightly lower rating than XM5.
```

---

## Advantages Over Previous Approach

### 1. Consistent Format
- **Before**: AI sometimes used bold, sometimes numbered lists, inconsistent structure
- **After**: Always uses bullet points, category headings, pros/cons format

### 2. Better Categorization
- **Before**: Always "Shopping - [Product]"
- **After**: Classifies as Shopping, Review, Docs, News, or Other

### 3. Pros/Cons Analysis
- **Before**: Just stated facts
- **After**: Explicitly lists advantages and disadvantages

### 4. Cheaper Item Callout
- **Before**: Buried in facts
- **After**: Clear "Cheaper item: X at $Y (vs $Z)" line

### 5. Canonical Names
- **Before**: "iPhone at Best Buy", "iPhone at Total Wireless"
- **After**: "Apple iPhone 15 & 15 Plus"

### 6. No Hallucination
- **Before**: Sometimes added assumptions
- **After**: Strictly derives from provided text only

---

## Prompt Structure (utils/ai_prompts.js:61-128)

### System Prompt Components

1. **Task Definition** (lines 66-76)
   - Parse activities
   - Classify category
   - Group comparable items
   - Output concise bullets

2. **Output Format** (lines 83-92)
   - Exact format specification
   - When to include Pros/Cons
   - When to add "Cheaper item"

3. **Few-Shot Examples** (lines 96-127)
   - Example 1: Phones with financing
   - Example 2: Shoes with pricing
   - Example 3: Reviews with ratings

### Input Builder (utils/ai.js:491-559)

Converts product data to activities format:

```javascript
// For each product:
parts.push(p.title);                    // Product name
parts.push(`at ${p.source}`);            // Website
if (p.price) parts.push(`priced at $${p.price}`);  // Price
if (storageMatch) parts.push(`${storage} storage`); // Specs
if (p.reviewCount) parts.push(`${count} reviews`);  // Reviews

// Combine: "iPhone 15 128GB at bestbuy.com priced at $629.99 128GB storage 856 reviews"
// Wrap: "**[activity].**"
// Join: "**activity1.**; **activity2.**; **activity3.**"
```

---

## Why This Works Better

### Pattern Learning
The AI learns the exact pattern from examples:
- Input format: `Activities: **X**; **Y**`
- Output format: `Category – Names\n• fact\n• Pros: ...\n• Cheaper item: ...`

### Constraint Enforcement
Few-shot examples show what NOT to do:
- No prefaces like "Here are..."
- No extra commentary
- Facts only, no hallucination

### Format Consistency
With 3 examples, AI has enough context to maintain format across edge cases:
- Different product types (phones, shoes, headphones)
- Different categories (Shopping, Review)
- Different price points and features

---

## Files Modified

- ✅ `utils/ai_prompts.js` (lines 61-129) - Complete prompt rewrite with few-shot examples
- ✅ `utils/ai.js` (lines 491-559) - Input format updated to Activities pattern

---

## Testing

### To See the Prompt
1. Open console (F12)
2. Look for: `[AI] Full prompt: Activities: **...**`

### Example Console Output
```
[AI] Full prompt: Activities: **iPhone 15 Plus 128GB at totalwireless.com priced at $379 128GB storage 45 reviews.**; **iPhone 15 128GB at bestbuy.com priced at $629.99 128GB storage 856 reviews.** | Generate 2-3 factual statements
```

### Expected Improvements
✅ Consistent bullet format
✅ Category classification (Shopping/Review/etc.)
✅ Pros/Cons bullets
✅ "Cheaper item" callout
✅ No task suggestions
✅ Canonical product names
✅ No hallucination

---

## Future Enhancements

1. **Add More Examples**: Can add examples for Docs, News, Other categories
2. **Dynamic Examples**: Show relevant examples based on detected category
3. **Chain-of-Thought**: Ask AI to reason before outputting
4. **Spec Extraction**: Improve automatic spec detection from titles
