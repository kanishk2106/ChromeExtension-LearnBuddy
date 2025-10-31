const queue = [];
let running = false;

export function enqueue(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const { task, resolve, reject } = queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    }
    await sleep(100);
  }
  running = false;
}

export function aiWithTimeout(fn, label, tabId) {
  // Different timeouts for different operations
  // Note: generateFocusCoachSummary has granular internal timeouts (5s+15s+20s=40s)
  // so we set a higher safety timeout here to avoid double-timeout
  const timeouts = {
    'generateFocusCoachSummary': 60000,  // 60 seconds safety timeout (internal has 40s already)
    'generateOneLiner': 25000,           // 25 seconds for short one-liner
    'default': 35000                     // 35 seconds default
  };

  const timeout = timeouts[label] || timeouts['default'];

  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => {
      const error = new Error(`AI_TIMEOUT: ${label} (${timeout}ms) - This is a safety timeout, check if internal timeouts fired first`);
      console.error('AI failure', error, { label, tabId });
      reject(error);
    }, timeout))
  ]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
