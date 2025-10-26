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
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => {
      const error = new Error(`AI_TIMEOUT: ${label}`);
      console.error('AI failure', error, { label, tabId });
      reject(error);
    }, 30000)) // Increased to 30 seconds for Gemini Nano processing
  ]);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
