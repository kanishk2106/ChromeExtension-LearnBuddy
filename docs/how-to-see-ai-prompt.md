# How to See the AI Prompt Input

This guide shows you how to see the **exact input** being sent to the AI in real-time.

## Method 1: Browser Console (Recommended)

### Steps:

1. **Open Developer Console**
   - Press `F12` (Windows/Linux) or `Cmd+Option+I` (Mac)
   - Or right-click → "Inspect" → Go to "Console" tab

2. **Reload Extension**
   - Go to `chrome://extensions`
   - Click the reload button on your extension

3. **Visit Product Pages**
   - Go to Amazon, Best Buy, Nike.com, etc.
   - Click on product buttons ("Add to Cart", "Buy Now", etc.)

4. **Open Focus Coach Dashboard**
   - Click extension icon → "Open Dashboard"
   - Or go to extension options page

5. **Generate AI Summary**
   - Click "Generate AI Summary" button
   - Watch the console!

### What You'll See:

```
[AI] Checking availability...
[AI] LanguageModel.availability(): readily
[AI] Creating session...
[AI] Session created ✓
[AI] Prompting (length: 245)...
[AI] Full prompt: User clicked: Add to Cart | Products: Air Jordan 1 Mid SE Men's Shoes at nike.com: $130, new, 1247 reviews | Men's Air Jordan Retro 1 Mid SE Casual Shoes at finishline.com: $140, new, 48 reviews | STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
[AI] Prompt preview: User clicked: Add to Cart | Products: Air Jordan 1 Mid SE Men's Shoes at nike.com: $130, new, 1247 reviews | Men's Air Jordan Retro 1 Mid SE Ca...
[AI] Response received ✓ (length: 287 time: 2341 ms)
```

### Key Logs to Look For:

- **`[AI] Full prompt:`** - This is the COMPLETE input sent to AI
- **`[AI] Response received ✓`** - The AI's response
- **`[AI] Prompt preview:`** - First 150 characters of the prompt

---

## Method 2: Add Breakpoint (Advanced)

If you want to inspect the data structure:

1. **Open Developer Tools**
   - Press `F12`

2. **Go to Sources Tab**
   - Navigate to: `chrome-extension://[your-extension-id]/utils/ai.js`

3. **Set Breakpoint**
   - Find line 565: `const prompt = promptParts.join(' | ');`
   - Click on the line number to add a breakpoint

4. **Trigger AI Generation**
   - Click "Generate AI Summary"
   - Execution will pause at the breakpoint

5. **Inspect Variables**
   - Hover over `promptParts` to see array
   - Hover over `products` to see product data
   - Hover over `clickedItems` to see what user clicked
   - Type `prompt` in console to see full prompt

---

## Example Console Output

### For Shoes (Nike vs Finish Line)

```
[AI] Full prompt: User clicked: Add to Cart | Products: Air Jordan 1 Mid SE Men's Shoes at nike.com: $130, new, 1247 reviews | Men's Air Jordan Retro 1 Mid SE Casual Shoes at finishline.com: $140, new, 48 reviews | STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

**Breakdown:**
- `User clicked: Add to Cart` - User interaction
- `Products: [details]` - Product comparison data
- `STATE FACTS: ...` - Instruction to AI

### For Phone (Amazon vs Best Buy)

```
[AI] Full prompt: User clicked: Add to Cart, Buy Now | Products: Apple iPhone 15 128GB (Renewed) at amazon.com: $505, refurbished, 128GB, 1200 reviews | Apple iPhone 15 128GB at bestbuy.com: $629.99, new, 128GB, 856 reviews | STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

**Breakdown:**
- `User clicked: Add to Cart, Buy Now` - Multiple clicks tracked
- `$505, refurbished, 128GB` - Price, condition, storage
- `$629.99, new, 128GB` - Comparison data
- `1200 reviews` vs `856 reviews` - Reliability data

### For Laptop with Screen Size

```
[AI] Full prompt: Products: Apple MacBook Air 13.6-inch M2 256GB at bestbuy.com: $1099, new, 13.6-inch, 723 reviews | MacBook Air 13-inch with M2 chip - 256GB at apple.com: $1199, new, 13-inch, 234 reviews | STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```

**Breakdown:**
- `13.6-inch` vs `13-inch` - Screen size comparison
- `256GB` - Storage spec
- `$1099` vs `$1199` - Price comparison
- `723 reviews` vs `234 reviews` - Review data

---

## What Each Part Means

### User Clicked Section
```
User clicked: Add to Cart, Buy Now
```
- Shows what buttons the user actually clicked
- Indicates user intent (add to cart = ready to buy)
- AI prioritizes these items

### Products Section
```
Products: [Product Name] at [website]: $[price], [condition], [specs], [reviews]
```

Format breakdown:
- **Product Name**: Full product title
- **Website**: Domain name (nike.com, amazon.com)
- **Price**: Dollar amount with currency
- **Condition**: new/refurbished/renewed
- **Specs**: Storage (128GB), screen (13-inch)
- **Reviews**: Review count for reliability

### Activities Section (if present)
```
Activities: Shopping for sneakers; Browsing laptops
```
- Shows recent browsing activity
- Provides context for AI

### Categories Section (if present)
```
Categories: shopping(3), learning(1)
```
- Aggregated browsing categories
- Number shows visit count

### Due Dates Section (if present)
```
Due: Feb 15: Assignment submission deadline
```
- Extracted deadlines from pages
- Higher priority in AI response

### Instruction Section
```
STATE FACTS: Compare prices, specs (storage/screen/material), and review counts. NO tasks or suggestions.
```
- Final instruction to AI
- Emphasizes factual analysis
- Prohibits task suggestions

---

## Troubleshooting

### "Can't see logs"
- Make sure you're in the **Console** tab
- Filter by typing `[AI]` in console filter box
- Check that "Verbose" or "All levels" is selected

### "Prompt is empty"
- No products detected on page
- Try clicking product buttons first
- Visit product pages (not search results)

### "AI not responding"
- Check: `[AI] LanguageModel.availability()`
- Should say `readily` or `available`
- If says `no`, enable Chrome flags

---

## Tips

1. **Clear Console** before testing for clean output
2. **Copy Full Prompt** from console to see exact input
3. **Test Multiple Products** to see different prompt structures
4. **Compare Prompts** across different product types (phones vs shoes)
5. **Watch Response Time** in logs (should be 1-3 seconds)

---

## Files That Log Prompts

- `utils/ai.js` (line 568) - Logs full prompt
- `utils/ai.js` (line 569) - Logs prompt preview
- `utils/ai.js` (line 573) - Logs response time
