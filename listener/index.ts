import 'dotenv/config';
import { startDiscordListener } from './discord';

async function main() {
  console.log('🚀 Starting Social Media Listeners...');
  
  // Start Discord Listener
  startDiscordListener();

  // Add Twitter listener here later when API keys are available
}

main().catch(console.error);
