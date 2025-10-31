# Unbiased Data Analyst Mode

## Problem
The AI was giving **task-oriented suggestions** like "Compare offers", "Check website", "Review details" instead of **stating facts** about the products.

### Example of Wrong Output
```
1. Compare Total Wireless & Best Buy offers to see which is better
2. Check Total Wireless plan details on their website
3. Review specifications before making a decision
```

## Solution
Changed the AI from a "task suggester" to an **UNBIASED DATA ANALYST** that states facts and comparisons.

### Example of Correct Output
```
Shopping - iPhone 15

1. Total Wireless has lower price at $400 for new phone comparing to Best Buy at $500 with financing
2. Best Buy model offers 128GB storage while Total Wireless has 64GB, double the space
3. Best Buy has 856 reviews while Total Wireless has 45 reviews, more reliable customer feedback
```

## Key Changes

### 1. Prompt Rewrite (utils/ai_prompts.js:61-128)

**New Role Definition:**
```
You are an UNBIASED DATA ANALYST comparing products.
You ANALYZE data and STATE FACTS, not give tasks.
YOUR ROLE: Compare and analyze the data objectively. DO NOT tell user what to do.
```

**Forbidden Phrases:**
- ❌ "Check", "Compare", "Review", "Go to", "Visit"
- ❌ "Consider", "Evaluate", "Assess", "Decide"
- ❌ Any action verbs or suggestions

**Required Style:**
- ✅ "has/offers/provides" (state facts)
- ✅ Include specific numbers
- ✅ Direct comparisons with data
- ✅ Mention condition (new/refurbished)

### 2. Product-Specific Comparisons

**For Phones/Laptops/Electronics:**
- Storage size (64GB vs 128GB vs 256GB)
- Screen size (6.1-inch vs 6.7-inch)
- Model differences (iPhone 15 vs 15 Pro)
- Processor/RAM if available

**For Shoes/Clothing:**
- Material (genuine leather vs synthetic)
- Size availability
- Color options
- Build quality indicators

**For All Products:**
- Price comparison with exact numbers
- Condition (new/refurbished/renewed)
- Review counts (reliability indicator)
- Rating differences

### 3. Spec Extraction (utils/ai.js:500-533)

Now extracts specs from product titles:
- **Storage**: Matches "64GB", "128GB", "256GB", "1TB", etc.
- **Screen**: Matches "6.1-inch", "6.7 inch", "15.6-inch", etc.
- **Condition**: Detects "refurbished", "renewed" in title or availability
- **Reviews**: Includes review count for reliability comparison

**Example Prompt Data:**
```
Products: iPhone 15 128GB at Best Buy: $500, new, 128GB, 856 reviews |
iPhone 15 64GB at Total Wireless: $400, new, 64GB, 45 reviews
```

## Examples by Product Type

### Phones
```
Shopping - iPhone 15

1. Total Wireless offers iPhone 15 at $400 with 64GB storage comparing to Best Buy at $500 with 128GB
2. Best Buy model has double storage at 128GB while Total Wireless has 64GB, better for apps and photos
3. Best Buy has 856 reviews while Total Wireless has 45 reviews, more reliable customer feedback
```

### Shoes
```
Shopping - Air Jordan 1 Mid SE

1. Nike.com has lower price at $130 comparing to Finish Line at $140, save $10
2. Nike.com offers genuine leather material while Finish Line has synthetic, better durability on Nike
3. Nike.com has 1,247 reviews while Finish Line has 48 reviews, 26x more feedback for reliability
```

### Laptops
```
Shopping - MacBook Air M2

1. Best Buy offers MacBook at $1,099 with student discount comparing to Apple Store at $1,199, save $100
2. Best Buy model has 256GB storage while Apple base model has 256GB, same storage capacity
3. Best Buy has 723 reviews with 4.8 rating while Apple has 234 reviews with 4.6 rating
```

### Refurbished Items
```
Shopping - iPhone 15

1. Amazon has lower price at $505 for refurbished comparing to Apple website at $629 for new, save $124
2. Many people said refurbished is better option by being cautious about seller reputation
3. Amazon has 1,200 reviews while Apple website has 45 reviews, more reliable data on Amazon
```

## What Changed

### Before (Task-Oriented)
- "Compare offers and decide which is better"
- "Check website for plan details"
- "Review specifications before purchasing"
- "Go to Nike.com to verify availability"

### After (Fact-Oriented)
- "Nike.com has lower price at $130 comparing to Finish Line at $140"
- "Best Buy model offers 128GB storage while Total Wireless has 64GB"
- "Nike.com offers genuine leather while Finish Line has synthetic material"
- "Amazon has 1,200 reviews while Apple has 45 reviews"

## Testing

1. Visit product comparison pages (Amazon search, Google Shopping)
2. Click on product buttons
3. Open Focus Coach dashboard
4. Click "Generate AI Summary"
5. Should see **factual comparisons** with:
   - Exact prices and price differences
   - Spec comparisons (storage, screen, material)
   - Review count comparisons
   - NO task suggestions or action items

## Files Modified

- `utils/ai_prompts.js` (lines 61-128) - Complete rewrite as data analyst
- `utils/ai.js` (lines 500-533) - Enhanced spec extraction
- `utils/ai.js` (lines 556-563) - Updated instruction to emphasize facts

## Key Features

✅ States facts, never suggests tasks
✅ Compares specs (storage, screen, material)
✅ Calculates price differences
✅ Analyzes review reliability
✅ Works for phones, shoes, laptops, all products
✅ Detects refurbished vs new condition
✅ Extracts specs from product titles
✅ Unbiased, data-driven analysis
