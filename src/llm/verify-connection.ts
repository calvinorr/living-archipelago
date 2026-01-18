/**
 * Verify Gemini LLM Connection
 * Run with: npx tsx src/llm/verify-connection.ts
 */

import { LLMClient, LLMError } from './client.js';

async function verifyConnection(): Promise<void> {
  console.log('=== Gemini LLM Connection Test ===\n');

  // Check for API key
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY environment variable not set');
    console.log('\nTo set it:');
    console.log('  export GEMINI_API_KEY=your-api-key-here');
    console.log('\nOr create a .env file with:');
    console.log('  GEMINI_API_KEY=your-api-key-here');
    process.exit(1);
  }

  console.log('API Key: Found (starts with', apiKey.slice(0, 8) + '...)');
  console.log('');

  try {
    // Create client
    const client = new LLMClient();
    console.log('Client: Created successfully');
    console.log('Model: gemini-1.5-flash');
    console.log('');

    // Test basic completion
    console.log('Testing basic completion...');
    const response = await client.complete(
      'Respond with exactly: "Connection successful!" Nothing else.'
    );
    console.log('Response:', response.text.trim());
    console.log('Finish reason:', response.finishReason);
    if (response.tokenCount) {
      console.log('Tokens:', response.tokenCount);
    }
    console.log('');

    // Test JSON completion
    console.log('Testing JSON completion...');
    const jsonResponse = await client.completeJSON<{ status: string; message: string }>(
      'Respond with valid JSON: {"status": "ok", "message": "JSON parsing works"}'
    );
    console.log('Parsed JSON:', jsonResponse);
    console.log('');

    // Test trader-style prompt
    console.log('Testing trader agent prompt...');
    const traderPrompt = `You are a trading agent in an island archipelago simulation.

Current state:
- Location: Shoalhold (fishing island)
- Fish price here: 6 coins
- Fish price at Greenbarrow: 12 coins
- Your cargo capacity: 100 units
- Your cash: 500 coins

Respond with a JSON trading decision:
{
  "action": "buy" or "sail" or "wait",
  "good": "fish" or null,
  "quantity": number or null,
  "destination": "island name" or null,
  "reasoning": "brief explanation"
}`;

    const traderResponse = await client.completeJSON<{
      action: string;
      good: string | null;
      quantity: number | null;
      destination: string | null;
      reasoning: string;
    }>(traderPrompt);
    console.log('Trader decision:', JSON.stringify(traderResponse, null, 2));
    console.log('');

    console.log('=== All tests passed! ===');
    console.log('LLM calls made:', client.getCallCount());

  } catch (error) {
    if (error instanceof LLMError) {
      console.error('\nLLM Error:', error.message);
      console.error('Code:', error.code);
      if (error.code === 'AUTH_ERROR') {
        console.log('\nCheck that your API key is valid at:');
        console.log('https://aistudio.google.com/app/apikey');
      }
    } else {
      console.error('\nUnexpected error:', error);
    }
    process.exit(1);
  }
}

verifyConnection();
