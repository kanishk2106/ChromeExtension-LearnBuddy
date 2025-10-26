# Chrome AI Setup Instructions

## The Problem
When you see "AI is not available", it's usually due to one or more of these issues:

1. **Chrome flags not enabled**
2. **Gemini Nano model not downloaded**
3. **Chrome version too old**
4. **System requirements not met**
5. **User activation not triggered**

---

## Step-by-Step Setup Guide

### 1. Check Chrome Version
You need **Chrome 138 or higher** (preferably Chrome 140+).

**How to check:**
1. Open Chrome
2. Go to `chrome://version`
3. Look for the version number at the top

If you're on an older version, update Chrome:
- Go to `chrome://settings/help`
- Chrome will auto-update

---

### 2. Enable Required Flags

**CRITICAL:** You must enable this flag:

1. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
2. Set to **"Enabled"**
3. Click **"Relaunch"** at the bottom

**Alternative flags to try if the above doesn't work:**
- `chrome://flags/#optimization-guide-on-device-model`
- `chrome://flags/#summarization-api-for-gemini-nano`

---

### 3. Check System Requirements

Your system MUST meet these requirements:

| Requirement | Minimum |
|------------|---------|
| **Disk Space** | 22 GB free |
| **RAM** | 16 GB |
| **CPU Cores** | 4+ |
| **GPU VRAM** | 4+ GB |
| **macOS** | 13+ (you have macOS 25.0.0 ✅) |

**How to check disk space:**
```bash
df -h ~
```

---

### 4. Trigger Model Download

The Gemini Nano model downloads automatically on first use, BUT it requires **direct user interaction** (click, tap, or keypress).

**How to trigger download:**

1. **Open your extension popup** (click the extension icon)
2. **Wait for the AI status to show** (you should see one of these):
   - 🟢 "Chrome AI active" → Already working!
   - 🟡 "Ready to download on first use" → Click "Try Chrome AI now"
   - 🔴 Any error message → See troubleshooting below

3. **Click "Try Chrome AI now"** button
   - This triggers the model download
   - You'll see download progress: "Downloading on-device model… 0%"
   - Download can take 5-30 minutes depending on your internet speed

---

### 5. Verify Model Download Status

**Option A: Check chrome://on-device-internals**
1. Go to `chrome://on-device-internals`
2. Click the **"Model Status"** tab
3. Look for "Gemini Nano" status:
   - ✅ "Ready" = Model downloaded and working
   - ⏳ "Downloading" = Download in progress
   - ❌ "Not Available" = See troubleshooting

**Option B: Use DevTools Console**
1. Right-click your extension popup
2. Select "Inspect"
3. Go to the **Console** tab
4. Run this command:
   ```javascript
   await ai.languageModel.capabilities()
   ```
5. Look for the response:
   - `available: "readily"` → Working! ✅
   - `available: "after-download"` → Needs download
   - `available: "no"` → Not available (check flags/requirements)

---

### 6. Debug with Your Extension

I've added comprehensive debug logging to your code. To see what's happening:

1. **Open the extension popup**
2. **Right-click and select "Inspect"**
3. **Go to the Console tab**
4. You'll see debug output like:
   ```
   === Chrome AI Availability Debug ===
   Chrome version: Mozilla/5.0...
   self.ai exists: true
   self.ai.languageModel exists: true
   Language Model capabilities: {available: "readily", ...}
   User activation: {isActive: true, hasBeenActive: true}
   === End Debug ===
   ```

**What to look for:**
- ❌ `self.ai exists: false` → Flags not enabled
- ❌ `self.ai.languageModel exists: false` → Flags not enabled
- ❌ `available: "no"` → System requirements not met
- ❌ `User activation: {isActive: false}` → Click something first!

---

## Troubleshooting

### Issue: "self.ai is undefined"
**Solution:** Enable the Chrome flag (Step 2)

### Issue: "available: 'no'"
**Possible causes:**
1. System requirements not met (check Step 3)
2. Model not supported in your region
3. Chrome version too old (update to 140+)

### Issue: "User activation required"
**Solution:** The AI APIs require a user gesture (click/tap/keypress). Make sure you're clicking the "Try Chrome AI now" button rather than having the code run automatically.

### Issue: Download stuck or fails
**Solutions:**
1. Check internet connection (must be unmetered)
2. Ensure 22+ GB free disk space
3. Restart Chrome
4. Clear Chrome cache: `chrome://settings/clearBrowserData`
5. Try again in a few hours (Google's servers might be busy)

### Issue: "Model Status" shows errors
**Solutions:**
1. Go to `chrome://on-device-internals`
2. Click "Model Status" tab
3. If you see errors, try:
   - Click "Delete Model"
   - Restart Chrome
   - Re-trigger download

---

## Testing Your Setup

Once everything is set up, test with this code in your DevTools console:

```javascript
// Test Language Model
const session = await ai.languageModel.create();
const response = await session.prompt("Say hello!");
console.log(response);
session.destroy();

// Test Summarizer
const summarizer = await ai.summarizer.create();
const summary = await summarizer.summarize("This is a long text that needs to be summarized. It has multiple sentences and should be condensed into key points.");
console.log(summary);
summarizer.destroy();
```

If both work, your Chrome AI is fully operational! 🎉

---

## Quick Checklist

- [ ] Chrome version 138+ (preferably 140+)
- [ ] Flag enabled: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
- [ ] Chrome restarted after enabling flag
- [ ] 22+ GB free disk space
- [ ] 16+ GB RAM
- [ ] Clicked "Try Chrome AI now" button in extension popup
- [ ] Model downloaded (check `chrome://on-device-internals`)
- [ ] Test commands work in DevTools console

---

## Additional Resources

- [Chrome AI Built-in APIs Documentation](https://developer.chrome.com/docs/ai/built-in-apis)
- [Chrome AI Get Started Guide](https://developer.chrome.com/docs/ai/get-started)
- [Model Management](https://developer.chrome.com/docs/ai/understand-built-in-model-management)
- [Your extension's debug logs] - Open popup → Right-click → Inspect → Console

---

## Notes

- **Download happens ONCE** - After the model is downloaded, it persists across browser sessions
- **User activation is required** - The APIs won't work without a user click/tap/keypress
- **Your code already has download monitoring** - Check popup.js:223-253 for download progress tracking
- **Battery saver mode** - Your code skips AI when battery < 25% (ai.js:14-25)
