import { fetchJson } from './client';

const SYNAPSE_EXTENSION_ID = 'neaficlfbibdhlhkjjakoiijdlfollna';

function buildPrompt(chat, memories) {
  const memoryContext = memories.length
    ? memories.map((memory) => `- [${memory.memory_type}] ${memory.content}`).join('\n')
    : '- No relevant persistent memories were found for this conversation.';

  return `Use only the relevant Synapse memories below when they help answer the next request. Do not assume unrelated details or reproduce the archived conversation.

Relevant memories:
${memoryContext}
`;
}

export async function extractConversation(chat) {
  return fetchJson('/memories/extract', {
    method: 'POST',
    body: JSON.stringify({ chat_id: chat.id, limit: 12 }),
  });
}

export async function pushConversationPrompt(chat, memories) {
  if (!globalThis.chrome?.runtime?.sendMessage) {
    throw new Error('Synapse extension is not available in this browser.');
  }

  const response = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      SYNAPSE_EXTENSION_ID,
      {
        type: 'PUSH_PROMPT_TO_ACTIVE_AI',
        text: buildPrompt(chat, memories || []),
      },
      (result) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(result);
      }
    );
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Could not store the prompt in the extension.');
  }

}