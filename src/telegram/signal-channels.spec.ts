import { activeSignalChannels, badChatId, normaliseTelegramBody, signalChannels } from './signal-channels';

describe('signal channels', () => {
  it('falls back to the single legacy channel in the analysis language', () => {
    expect(signalChannels({ channelId: ' @sig ', channels: [] }, 'ru')).toEqual([{ key: 'main', name: '@sig', chatId: '@sig', language: 'ru', enabled: true }]);
    expect(signalChannels({ channelId: '', channels: [] }, 'ru')).toEqual([]);
  });

  it('cleans the list: trims, drops rows without chat id or with a duplicate key, unknown language → en', () => {
    const list = signalChannels(
      {
        channelId: '@old',
        channels: [
          { key: 'en', name: ' EN ', chatId: ' -1001 ', language: 'en', enabled: true },
          { key: 'en', name: 'dup', chatId: '-1002', language: 'ru', enabled: true },
          { key: 'hy', name: '', chatId: '-1003', language: 'hy', enabled: 'false' },
          { key: 'x', name: 'no chat', chatId: '', language: 'ru' },
          { key: 'zz', chatId: '-1004', language: 'de' },
        ],
      },
      'ru',
    );
    expect(list).toEqual([
      { key: 'en', name: 'EN', chatId: '-1001', language: 'en', enabled: true },
      { key: 'hy', name: '-1003', chatId: '-1003', language: 'hy', enabled: false },
      { key: 'zz', name: '-1004', chatId: '-1004', language: 'en', enabled: true },
    ]);
    expect(activeSignalChannels({ channelId: '', channels: list }, 'en').map((c) => c.key)).toEqual(['en', 'zz']);
  });

  it('rejects ids that cannot be channels and syncs channelId to the first active channel', () => {
    expect(badChatId('https://t.me/x')).toMatch(/link/);
    expect(badChatId('12345')).toMatch(/personal/);
    expect(badChatId('-12345')).toMatch(/-100/);
    expect(badChatId('-10012345')).toBeNull();
    const body: Record<string, unknown> = { channels: [{ key: 'a', chatId: '-1001', enabled: false }, { key: 'b', chatId: '@ru', language: 'ru' }] };
    normaliseTelegramBody(body, 'en');
    expect(body.channelId).toBe('@ru');
    expect(() => normaliseTelegramBody({ channels: [{ key: 'a', chatId: '777' }] }, 'en')).toThrow(/personal/);
  });
});
