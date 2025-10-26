# ActionSense

ActionSense helps summarize the active tab, surface next actions, and keep you focused. The project now prioritizes Chrome's on-device AI while guaranteeing a working fallback for every demo run.

**Built-in AI Usage (Primary Path)**
This extension uses Chrome’s **built-in Prompt API** (`ai.languageModel`) to run **Gemini Nano on-device**. We implement and surface the recommended availability states: **`readily`**, **`after-download`** (first-use download), and **`downloading`** (with progress).

**Graceful Fallbacks**
If on-device is not exposed on a given machine, we automatically fall back to **`window.ai`** (when available) and finally to a **cloud proxy**. No API keys are bundled in the extension; the proxy stores keys as server-side secrets.

**Tester Setup**
Use **Chrome Canary**. Enable at least:
`chrome://flags/#prompt-api-for-gemini-nano`, `chrome://flags/#optimization-guide-on-device-model` (plus any Summarizer/Writer/Rewriter flags if present). Relaunch.
To verify model state: run `await ai.languageModel.capabilities()` in DevTools Console.
