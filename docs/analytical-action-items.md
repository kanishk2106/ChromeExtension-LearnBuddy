# Analytical Action Items - Product Comparison

## Changes Made

Updated the Focus Coach AI to act as an **analytical comparison expert** instead of a generic task lister.

### Key Updates

1. **Enhanced Prompt (ai_prompts.js)**
   - Changed from "productivity coach" to "analytical productivity coach and comparison expert"
   - Added explicit instructions to ANALYZE and COMPARE data
   - Required concrete numbers in all comparisons
   - Must calculate price differences and savings
   - Must compare review counts (more reviews = more reliable)
   - Must make definitive recommendations

2. **Product Data Collection (ai.js)**
   - Now extracts full product details including:
     - Title, price, currency
     - Rating and **review count**
     - Availability
     - Source website
   - Formats product data for comparison in the prompt
   - Adds instruction: "ANALYZE and COMPARE the products listed above. Calculate price differences, compare review counts, and recommend the best option with specific numbers."

3. **Review Count Extraction (content.js)**
   - Updated `toProduct()` to extract `reviewCount` from JSON-LD structured data
   - Enhanced `scrapeProductCards()` to extract review counts from visible text
   - Supports formats: "1,234 ratings", "45 reviews", "5 stars"

## Example Output

### Before (Generic Tasks)
```
1. Check Availability & Sizes: Visit Nike.com to confirm availability
2. Compare Pricing & Options: Visit Finish Line to compare prices
3. Decide & Purchase: Based on availability, decide which to buy
```

### After (Simple Conversational Format)
```
Shopping - Air Jordan 1 Mid SE

1. Nike.com has lower price at $130 comparing to Finish Line at $140, save $10
2. Nike.com has 1,247 reviews while Finish Line has 48 reviews, more reliable data on Nike
3. Most people prefer Nike.com for better return policy and authentic guarantee
```

### Another Example (iPhone)
```
Shopping - iPhone 15

1. iPhone in Amazon has lower price of $505 but it is refurbished comparing to Apple website at $629
2. Many people said refurbished is better option by being cautious about seller reputation
3. Amazon has 1,200 reviews while Apple website has 45 reviews, more reliable data on Amazon
```

## Prompt Structure

The AI now receives structured data like:

```
User clicked: Add to Cart, Buy Now |
Products to compare: Air Jordan 1 Mid SE at nike.com: $130, 1247 reviews |
Air Jordan Retro 1 Mid SE at finishline.com: $140, 48 reviews |
ANALYZE and COMPARE the products listed above. Calculate price differences,
compare review counts, and recommend the best option with specific numbers.
```

## Key Features

✅ **Price Comparison** - Calculates exact savings
✅ **Review Analysis** - Compares review counts and reliability
✅ **Clear Recommendations** - Makes definitive suggestions with reasoning
✅ **Concrete Numbers** - Always includes prices, savings, review counts
✅ **Size Consideration** - Accounts for availability if mentioned
✅ **Actionable Steps** - Specific next actions, not generic tasks

## Testing

1. Visit a product comparison page (Amazon search results, Google Shopping, etc.)
2. Click on product links or "Add to Cart" buttons
3. Open Focus Coach dashboard
4. Click "Generate AI Summary"
5. Should see detailed price/review comparison with specific numbers and recommendations

## Files Modified

- `content.js` (lines 337-388) - Added reviewCount extraction
- `utils/ai.js` (lines 444-540) - Enhanced product data collection and prompt
- `utils/ai_prompts.js` (lines 61-87) - Rewrote prompt for analytical comparison
