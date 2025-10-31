# Click Tracking for Personalized Action Items

## Problem
The Focus Coach was generating generic action items based on all content from web pages, not personalized to what the user actually clicked or interacted with.

Example: On an Amazon sneaker page, it would suggest checking Nike.com, Amazon shipping, reading reviews, etc. - basically everything on the page.

## Solution
Implemented **click tracking** to capture user interactions and generate action items based on what they actually clicked.

### How It Works

1. **Click Tracking (content.js)**
   - Listens for clicks on interactive elements (buttons, links, forms)
   - Identifies action-oriented clicks using verb matching (buy, add, download, etc.)
   - Stores clicked items with timestamp and context
   - Keeps last 20 clicked items per page

2. **Signal Storage**
   - Clicked action items are stored in `signals.clickedActionItems`
   - Includes: text, verb, timestamp, URL
   - Persisted across page updates

3. **AI Prioritization (ai.js)**
   - `generateFocusCoachSummary` now prioritizes clicked items
   - Prompt structure:
     ```
     User clicked: [clicked items] | Activities: [browsing] | Due: [deadlines] | Generate 3-5 action items
     ```
   - Falls back to page signals if no clicks detected

4. **Prompt Updates (ai_prompts.js)**
   - Updated `focusCoachPrompt` to emphasize clicked items
   - Instructions to AI: "CRITICAL: Prioritize clicked items - these show real user intent!"

### Example Flow

**Before:**
```
User visits Amazon sneaker page
→ AI sees ALL page content
→ Suggests: Check Nike.com, review shipping, compare prices, read reviews...
```

**After:**
```
User visits Amazon sneaker page
→ User clicks "Add to Cart" button
→ AI sees: User clicked "Add to Cart"
→ Suggests: Complete checkout, apply discount code, track order...
```

### Testing

1. Visit a product page (e.g., Amazon)
2. Click on specific buttons like "Add to Cart", "Buy Now", etc.
3. Open the Focus Coach dashboard
4. Click "Generate AI Summary"
5. Action items should now be based on what you clicked!

### Files Modified

- `content.js` - Added click event listener and tracking
- `utils/ai.js` - Updated `generateFocusCoachSummary` to prioritize clicks
- `utils/ai_prompts.js` - Updated prompt to emphasize clicked items

### Future Improvements

- Track click patterns over time
- Identify abandoned actions (clicked but didn't complete)
- Smart suggestions based on click history
- Cross-page action tracking
