# Enhanced Signal Extraction

## Overview

The extension now extracts **structured, meaningful signals** from web pages instead of dumping 8,000 characters of raw text. This makes AI-generated summaries more accurate and context-aware.

## What Gets Extracted

### 1. **Action Items**
Buttons, links, and forms with action verbs that suggest user actions.

**Action Verbs Detected:**
- Shopping: `buy`, `add`, `cart`, `checkout`, `purchase`, `order`
- Learning: `enroll`, `register`, `signup`, `join`, `subscribe`
- Submissions: `submit`, `send`, `post`, `download`, `install`
- Tasks: `apply`, `book`, `schedule`, `start`, `continue`

**Example Output:**
```javascript
{
  actionItems: [
    { text: "Add to Cart", verb: "add" },
    { text: "Enroll Now", verb: "enroll" },
    { text: "Download PDF", verb: "download" }
  ]
}
```

### 2. **Due Dates & Deadlines**
Dates near deadline keywords, extracted with surrounding context.

**Keywords Detected:**
`due`, `deadline`, `submit by`, `closes`, `expires`, `available until`

**Date Patterns Recognized:**
- `Jan 15, 2024` or `January 15, 2024`
- `01/15/2024` or `1-15-2024` or `01.15.2024`
- `2024-01-15` (ISO format)
- Relative: `today`, `tomorrow`, `next week`

**Example Output:**
```javascript
{
  dueDates: [
    {
      date: "Feb 15, 2024",
      context: "Assignment 3 is due Feb 15, 2024 at 11:59 PM"
    }
  ]
}
```

### 3. **Search Intent**
User's search query extracted from URL parameters or search box.

**Search Params Checked:**
`q`, `query`, `search`, `k`, `s`, `keyword`, `term`

**Example Output:**
```javascript
{
  searchIntent: {
    query: "wireless headphones under $100",
    source: "url"  // or "input"
  }
}
```

### 4. **Product Details**
Product information from structured data (JSON-LD, OpenGraph, microdata).

**Data Sources (in priority order):**
1. JSON-LD structured data (`@type: Product`)
2. OpenGraph meta tags
3. Microdata attributes
4. Visible DOM patterns

**Example Output:**
```javascript
{
  products: [
    {
      title: "Sony WH-1000XM5 Wireless Headphones",
      price: 399.99,
      currency: "USD",
      availability: "In Stock",
      brand: "Sony",
      rating: 4.7,
      source: "jsonld"
    }
  ]
}
```

### 5. **Task Platform Detection**
Identifies assignment/task management platforms.

**Platforms Detected:**
- **Canvas**: instructure.com, canvas LMS
- **Gradescope**: gradescope.com, autograder
- **GitHub**: github.com issues/PRs
- **Jira**: atlassian.net, sprints/tickets

**Example Output:**
```javascript
{
  taskPlatform: {
    platform: "canvas",
    confidence: 0.8,
    reason: "Detected 2 indicators for canvas"
  }
}
```

## How It Works

### Data Flow

```
Page Load
    ↓
content.js: extractAllSignals()
    ├─ extractActionItems()      → Scans buttons/links for action verbs
    ├─ extractDueDates()          → Walks DOM for dates near deadline keywords
    ├─ extractSearchIntent()      → Checks URL params + search inputs
    ├─ extractProductDetails()    → Parses JSON-LD, OG tags, microdata
    └─ detectTaskPlatform()       → Pattern matches against known platforms
    ↓
Structured signals attached to payload
    ↓
background.js stores in page snapshot
    ↓
popup.js passes signals to generateOneLiner()
    ↓
AI receives structured context instead of raw text
```

### Example AI Prompt (Before vs After)

#### **Before (Raw Text)**
```
Page: Python Tutorial
Category: Learning
Content snippet:
Python is a high-level programming language. In this tutorial,
you will learn Python basics, syntax, data types, loops, functions...
(500 chars of text)

One-liner:
```

#### **After (Structured Signals)**
```
Page: Canvas - Assignment 3
Category: Learning
Actions: Submit Assignment, Download Instructions, View Rubric
Due: Feb 15, 2024 (Assignment 3 is due Feb 15, 2024 at 11:59 PM)
Platform: canvas
Context: (200 chars minimal text)

One-liner:
```

**Result:** AI generates `"Reviewing assignment due Feb 15"` instead of generic `"Learning about assignments"`.

## Code Location

| Component | File | Lines |
|-----------|------|-------|
| Signal extraction functions | `content.js` | 351-460 |
| Signal integration in payload | `content.js` | 70-93 |
| AI prompt enhancement | `utils/ai_prompts.js` | 49-58 |
| AI generation with signals | `utils/ai.js` | 307-376 |
| Popup signal passing | `popup/popup.js` | 966 |

## Performance Considerations

### Extraction Limits
- **Action items**: Maximum 15 extracted
- **Due dates**: Maximum 10 extracted
- **Text snippet**: Reduced from 8,000 to 200 chars when signals present
- **Products**: Maximum 10 products

### Why Limits?
1. **Faster processing**: Less data to send to AI
2. **Better quality**: AI focuses on most relevant signals
3. **Token efficiency**: Reduces token usage by ~75%

## Example Scenarios

### Scenario 1: E-commerce Site (Amazon)
**Extracted Signals:**
```javascript
{
  products: [{ title: "Sony Headphones", price: 399.99, brand: "Sony" }],
  actionItems: [
    { text: "Add to Cart", verb: "add" },
    { text: "Buy Now", verb: "buy" }
  ],
  searchIntent: { query: "wireless headphones", source: "url" }
}
```
**Generated One-liner:** `"Shopping for Sony headphones"`

### Scenario 2: Canvas Assignment
**Extracted Signals:**
```javascript
{
  actionItems: [
    { text: "Submit Assignment", verb: "submit" },
    { text: "Download PDF", verb: "download" }
  ],
  dueDates: [{ date: "Feb 15, 2024", context: "Assignment due..." }],
  taskPlatform: { platform: "canvas", confidence: 1.0 }
}
```
**Generated One-liner:** `"Reviewing assignment due Feb 15"`

### Scenario 3: GitHub Issue
**Extracted Signals:**
```javascript
{
  actionItems: [
    { text: "Create issue", verb: "create" },
    { text: "Submit new issue", verb: "submit" }
  ],
  taskPlatform: { platform: "github", confidence: 1.0 }
}
```
**Generated One-liner:** `"Creating GitHub issue for bug fix"`

### Scenario 4: Google Search
**Extracted Signals:**
```javascript
{
  searchIntent: { query: "react hooks tutorial", source: "url" },
  actionItems: [{ text: "Search", verb: "search" }]
}
```
**Generated One-liner:** `"Searching for React hooks tutorial"`

## Benefits

### 1. **More Accurate Summaries**
AI understands user intent through structured context, not just keywords.

### 2. **Better Focus Coaching**
Coach can give specific advice: "You have 3 assignments due this week" vs generic "You visited learning sites".

### 3. **Reduced Token Usage**
Sending structured signals uses ~75% fewer tokens than 8,000 character text dumps.

### 4. **Actionable Insights**
Can detect patterns like:
- Multiple shopping carts not checked out
- Assignments viewed but not submitted
- Repeated searches (procrastination signal)

### 5. **Platform-Specific Features**
Future features can tailor UI based on detected platform (e.g., Canvas assignment tracker).

## Future Enhancements

### Planned Improvements
1. **Calendar integration**: Extract due dates to system calendar
2. **Smart notifications**: Alert before assignment deadlines
3. **Price tracking**: Monitor product price changes
4. **Task aggregation**: Unified view of assignments across platforms
5. **Shopping insights**: Track cart abandonment, price drops

### Extensibility
The `signal_extraction.js` utility module can be easily extended:
- Add new action verbs
- Support more task platforms
- Enhanced product extraction (reviews, specs)
- Social media signals (posts, comments, shares)

## Testing

To test signal extraction on a page:
1. Open browser DevTools console
2. Navigate to any page
3. Check the PAGE_INFO message payload in the Network tab
4. Look for `signals` object in the payload

Example test sites:
- **Amazon product page** → Should extract products, prices, "Add to Cart" actions
- **Canvas assignment** → Should detect platform, due dates, submission actions
- **Google search** → Should capture search query
- **GitHub issue** → Should identify platform, action items

## Backward Compatibility

The enhancement is **fully backward compatible**:
- Old textSnippet field still exists (for fallback)
- If signals extraction fails, AI uses text snippet
- No breaking changes to existing storage schema
- Gradual migration: pages update signals on next visit
