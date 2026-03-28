import axios from 'axios';
import { appConfig } from './config';
import { StoredMessage } from './message-store';

interface OpenRouterResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export async function summarizeMessages(
  messages: StoredMessage[],
  period: string
): Promise<string> {
  if (messages.length === 0) {
    return `No messages to summarize for ${period}.`;
  }

  const messagesByChannel = new Map<string, StoredMessage[]>();
  for (const msg of messages) {
    const channelName = msg.channelName || msg.channelId;
    if (!messagesByChannel.has(channelName)) {
      messagesByChannel.set(channelName, []);
    }
    messagesByChannel.get(channelName)!.push(msg);
  }

  // Build messages text
  let messagesText = '';
  for (const [channelName, channelMessages] of messagesByChannel) {
    messagesText += `=== ${channelName} ===\n`;
    for (const msg of channelMessages) {
      const author = msg.author ? `[${msg.author}] ` : '';
      const mediaNote = msg.hasMedia ? '[Photo] ' : '';
      messagesText += `${author}${mediaNote}${msg.text}\n`;
    }
    messagesText += '\n';
  }

  // Build default prompt
  let prompt = `Please provide a concise summary of the key highlights from the following Telegram messages. Focus only on the most important points and overall themes.\n\n`;
  prompt += `Messages:\n\n${messagesText}`;

  // Append custom prompt if provided
  if (appConfig.openrouter.customPrompt) {
    prompt += '\n\n' + appConfig.openrouter.customPrompt
      .replace('{{period}}', period)
      .replace('{{messages}}', messagesText);
  }

  try {
    const response = await axios.post<OpenRouterResponse>(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: appConfig.openrouter.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes Telegram channel messages concisely and clearly.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      },
      {
        headers: {
          'Authorization': `Bearer ${appConfig.openrouter.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const summary = response.data.choices[0]?.message?.content;
    if (!summary) {
      throw new Error('No summary received from OpenRouter');
    }

    return summary;
  } catch (error) {
    console.error('Error calling OpenRouter:', error);
    throw new Error('Failed to generate summary');
  }
}
