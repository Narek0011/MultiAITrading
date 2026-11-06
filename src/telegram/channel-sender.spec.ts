import { ChannelSender } from './channel-sender.service';
import { TelegramApiError } from './telegram.service';

function setup(opts: { active: boolean; userFails?: boolean; botRejectsEmoji?: boolean }) {
  const calls: string[] = [];
  const user = {
    active: opts.active,
    sendMessage: async (html: string) => {
      if (opts.userFails) throw new Error('CHAT_WRITE_FORBIDDEN');
      calls.push(`user:${html}`);
      return 1;
    },
  };
  const bot = {
    sendMessage: async (html: string) => {
      if (opts.botRejectsEmoji && html.includes('<tg-emoji')) throw new TelegramApiError('Telegram: Bad Request', 400);
      calls.push(`bot:${html}`);
      return 2;
    },
  };
  const settings = { get: () => ({ emojiMap: '✅ 222222' }) };
  const sender = new ChannelSender(settings as any, bot as any, user as any, { add: () => undefined } as any);
  return { sender, calls };
}

describe('channel sender', () => {
  it('posts from the account with the Premium emoji map applied', async () => {
    const { sender, calls } = setup({ active: true });
    await sender.sendMessage('✅ <b>WIN</b>', 5, '-1001');
    expect(calls).toEqual(['user:<tg-emoji emoji-id="222222">✅</tg-emoji> <b>WIN</b>']);
  });

  it('falls back to the bot (normal emoji) when the account cannot post', async () => {
    const { sender, calls } = setup({ active: true, userFails: true });
    expect(await sender.sendMessage('✅ <b>WIN</b>', 5, '-1001')).toBe(2);
    expect(calls).toEqual(['bot:✅ <b>WIN</b>']);
  });

  it('the bot retries without custom emoji when Telegram refuses them', async () => {
    const { sender, calls } = setup({ active: false, botRejectsEmoji: true });
    await sender.sendMessage('<tg-emoji emoji-id="1">📈</tg-emoji> BUY', undefined, '-1001');
    expect(calls).toEqual(['bot:📈 BUY']);
  });
});
