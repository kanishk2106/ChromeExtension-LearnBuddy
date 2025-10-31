/**
 * AI Diagnostics Tool
 * Run this in the console to check Chrome AI status
 */

export async function diagnoseAI() {
  console.log('=== Chrome AI Diagnostics ===\n');

  // 1. Check API availability
  console.log('1. Checking LanguageModel API...');
  if (typeof LanguageModel === 'undefined') {
    console.error('❌ LanguageModel API not available');
    console.log('   → Enable at: chrome://flags/#prompt-api-for-gemini-nano');
    console.log('   → Requires: Chrome 127+ or Chrome Dev/Canary 128+');
    return;
  }
  console.log('✅ LanguageModel API available\n');

  // 2. Check AI model status
  console.log('2. Checking AI model status...');
  try {
    const availability = await Promise.race([
      LanguageModel.availability(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);

    if (availability === 'readily') {
      console.log('✅ AI model ready!');
    } else if (availability === 'after-download') {
      console.error('❌ AI model downloading');
      console.log('   → Check progress: chrome://components');
      console.log('   → Look for: "Optimization Guide On Device Model"');
      console.log('   → Wait 5-10 minutes, then try again');
      return;
    } else if (availability === 'no') {
      console.error('❌ AI model not available');
      console.log('   → Device may not meet requirements (8GB+ RAM)');
      console.log('   → Check: chrome://components');
      return;
    } else {
      console.warn('⚠️ Unknown availability status:', availability);
    }
  } catch (err) {
    console.error('❌ Failed to check availability:', err.message);
    return;
  }
  console.log('');

  // 3. Test session creation
  console.log('3. Testing session creation...');
  let session;
  try {
    const start = Date.now();
    session = await Promise.race([
      LanguageModel.create({
        systemPrompt: 'You are helpful.',
        maxOutputTokens: 20
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
    ]);
    const elapsed = Date.now() - start;
    console.log(`✅ Session created in ${elapsed}ms`);

    if (elapsed > 10000) {
      console.warn(`⚠️ Slow session creation (${elapsed}ms). First run is always slow.`);
    }
  } catch (err) {
    console.error('❌ Session creation failed:', err.message);
    if (err.message === 'timeout') {
      console.log('   → Session creation timed out (15s)');
      console.log('   → Model may be initializing - try again in 30s');
    }
    return;
  }
  console.log('');

  // 4. Test prompt
  console.log('4. Testing prompt execution...');
  try {
    const start = Date.now();
    const result = await Promise.race([
      session.prompt('Say "test" in 1 word'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20000))
    ]);
    const elapsed = Date.now() - start;
    console.log(`✅ AI responded in ${elapsed}ms`);
    console.log(`   Response: "${result}"`);

    if (elapsed > 10000) {
      console.warn(`⚠️ Slow response (${elapsed}ms). Close other tabs for better performance.`);
    }
  } catch (err) {
    console.error('❌ Prompt failed:', err.message);
    if (err.message === 'timeout') {
      console.log('   → Prompt timed out (20s)');
      console.log('   → AI model is busy or stuck');
      console.log('   → Try: Restart Chrome, close tabs');
    }
  } finally {
    session?.destroy?.();
  }
  console.log('');

  // 5. Summary
  console.log('=== Summary ===');
  console.log('✅ Chrome AI is working!');
  console.log('   Next: Try the Focus Coach AI button');
  console.log('   Note: First click is slow (5-30s), subsequent clicks are faster');
}

// Auto-run diagnostics when imported in console
if (typeof window !== 'undefined') {
  window.diagnoseAI = diagnoseAI;
  console.log('💡 Run: diagnoseAI() to check Chrome AI status');
}
