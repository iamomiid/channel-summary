import { gramjsClient } from './gramjs-client';
import { telegrafBot } from './telegraf-bot';
import { CronScheduler } from './cron-scheduler';

async function main() {
  console.log('Starting Telegram Summary Bot...');
  console.log(`Timezone: ${process.env.TZ || 'UTC'}`);

  try {
    console.log('[1/5] Connecting GramJS client...');
    await gramjsClient.connect();
    console.log('[2/5] Initializing scheduler...');
    const scheduler = new CronScheduler(telegrafBot);
    console.log('[3/5] Starting scheduler...');
    scheduler.start();
    console.log('[4/5] Starting Telegraf bot (non-blocking)...');
    telegrafBot.start();
    console.log('[5/5] Bot setup complete');

    console.log('✅ Bot is running!');
    console.log(`Summary will be sent to: ${process.env.SUMMARY_DESTINATION}`);
    console.log(`Cron schedule: ${process.env.SUMMARY_CRON_EXPRESSION}`);

    process.on('SIGINT', async () => {
      console.log('\nShutting down gracefully...');
      scheduler.stop();
      await telegrafBot.stop();
      await gramjsClient.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down gracefully...');
      scheduler.stop();
      await telegrafBot.stop();
      await gramjsClient.disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error in main:', error);
  process.exit(1);
});
