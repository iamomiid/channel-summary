import { Telegraf, Context } from 'telegraf';
import { appConfig, isAuthorizedUser } from './config';
import { messageStore } from './message-store';
import { summarizeMessages } from './openrouter-summarizer';

export class TelegrafBot {
  private bot: Telegraf<Context>;
  private isRunning: boolean = false;

  constructor() {
    this.bot = new Telegraf(appConfig.telegram.botToken);
    this.setupCommands();
  }

  private setupCommands(): void {
    this.bot.command('start', async (ctx) => {
      await ctx.reply(
        'Welcome to Telegram Summary Bot!\n\n' +
        'Available commands:\n' +
        '/summarize - Generate summary of recent messages (authorized users only)\n' +
        '/status - Check bot status and message count\n' +
        '/stored - Show message counts (authorized users only, debug)'
      );
    });

    this.bot.command('status', async (ctx) => {
      const channels = messageStore.getChannels();
      const messageCount = messageStore.getMessageCount();
      const lastSummary = messageStore.getLastSummaryTime();

      await ctx.reply(
        `📊 Bot Status:\n\n` +
        `Monitored channels: ${channels.length}\n` +
        `Messages stored: ${messageCount}\n` +
        `Last summary: ${lastSummary.toISOString()}`
      );
    });

    this.bot.command('stored', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId || !isAuthorizedUser(userId)) {
        await ctx.reply('⛔ You are not authorized to use this command.');
        return;
      }

      const messages = messageStore.getAllMessages();
      
      if (messages.length === 0) {
        await ctx.reply('📭 No messages stored in memory.');
        return;
      }

      // Group messages by channel
      const messagesByChannel = new Map<string, typeof messages>();
      for (const msg of messages) {
        const channelName = msg.channelName || msg.channelId;
        if (!messagesByChannel.has(channelName)) {
          messagesByChannel.set(channelName, []);
        }
        messagesByChannel.get(channelName)!.push(msg);
      }

      // Build response showing only counts with 10-char previews
      let response = `📊 *Stored Messages: ${messages.length} total*\n\n`;
      
      for (const [channelName, channelMessages] of messagesByChannel) {
        response += `📁 *${channelName}*\n`;
        response += `Count: ${channelMessages.length}\n`;
        
        // Show brief preview of each message (max 10 chars)
        for (let i = 0; i < channelMessages.length; i++) {
          const msg = channelMessages[i];
          const mediaNote = msg.hasMedia ? '📷 ' : '';
          const preview = msg.text.substring(0, 10);
          const truncated = msg.text.length > 10 ? '...' : '';
          
          response += `${i + 1}. ${mediaNote}${preview}${truncated}\n`;
        }
        
        response += '\n';
      }

      // Split if too long and send
      if (response.length > 4096) {
        const parts = this.splitMessage(response, 4096);
        for (const part of parts) {
          await ctx.reply(part, { parse_mode: 'Markdown' });
        }
      } else {
        await ctx.reply(response, { parse_mode: 'Markdown' });
      }
    });

    this.bot.command('summarize', async (ctx) => {
      const userId = ctx.from?.id;
      if (!userId || !isAuthorizedUser(userId)) {
        await ctx.reply('⛔ You are not authorized to use this command.');
        return;
      }

      await ctx.reply('🔄 Generating summary...');

      try {
        await this.generateAndSendSummary();
        await ctx.reply('✅ Summary sent successfully!');
      } catch (error) {
        console.error('Error generating summary:', error);
        await ctx.reply('❌ Failed to generate summary. Check logs for details.');
      }
    });

    this.bot.on('text', async (ctx) => {
      console.log(`Received message from bot: ${ctx.message.text}`);
    });
  }

  async start(): Promise<void> {
    console.log('[BOT] start() called, isRunning:', this.isRunning);
    if (this.isRunning) return;

    console.log('[BOT] Setting up commands...');
    // Register commands for autocomplete menu
    console.log('[BOT] About to call setMyCommands...');
    await this.bot.telegram.setMyCommands([
      { command: 'start', description: 'Show welcome message and available commands' },
      { command: 'status', description: 'Check bot status and message count' },
      { command: 'summarize', description: 'Generate summary of recent messages' },
      { command: 'stored', description: 'Show message counts per channel (debug)' },
    ]);
    console.log('[BOT] Commands set up, launching bot...');
    console.log('[BOT] About to call bot.launch()...');

    // bot.launch() starts long-polling - use callback to know when ready
    // but don't await it since it blocks indefinitely
    this.bot.launch(() => {
      console.log('[BOT] Bot is now listening for messages');
      this.isRunning = true;
    });

    console.log('Telegraf bot started (long-polling active)');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.bot.stop('SIGTERM');
    this.isRunning = false;
    console.log('Telegraf bot stopped');
  }

  async sendSummary(summary: string): Promise<void> {
    const destination = appConfig.summary.destination;
    
    const fullMessage = summary;

    if (fullMessage.length <= 4096) {
      await this.bot.telegram.sendMessage(destination, fullMessage, {
        parse_mode: 'Markdown',
      });
    } else {
      const parts = this.splitMessage(fullMessage, 4096);
      for (let i = 0; i < parts.length; i++) {
        await this.bot.telegram.sendMessage(destination, parts[i], {
          parse_mode: 'Markdown',
        });
      }
    }
  }

  private splitMessage(message: string, maxLength: number): string[] {
    const parts: string[] = [];
    let currentPart = '';
    const lines = message.split('\n');

    for (const line of lines) {
      if ((currentPart + line + '\n').length <= maxLength) {
        currentPart += line + '\n';
      } else {
        if (currentPart) {
          parts.push(currentPart.trim());
        }
        currentPart = line + '\n';
      }
    }

    if (currentPart) {
      parts.push(currentPart.trim());
    }

    return parts;
  }

  async generateAndSendSummary(): Promise<void> {
    const messages = messageStore.getAllMessages();
    const lastSummaryTime = messageStore.getLastSummaryTime();
    const period = lastSummaryTime.toISOString();

    console.log(`Generating summary for ${messages.length} messages...`);

    const summary = await summarizeMessages(messages, period);
    await this.sendSummary(summary);

    messageStore.clear();
    console.log('Summary sent and message store cleared');
  }

  getBot(): Telegraf<Context> {
    return this.bot;
  }
}

export const telegrafBot = new TelegrafBot();
