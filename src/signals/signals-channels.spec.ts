import { DEFAULT_SETTINGS } from '../settings/settings.defaults';
import { SignalsService } from './signals.service';

/** SignalsService with fakes; `failChat` makes Telegram reject that chat. */
function setup(failChat?: string) {
  const settings = structuredClone(DEFAULT_SETTINGS) as any;
  settings.general.signalStyle = 'expiry';
  settings.general.expiryMinutes = 5;
  settings.telegram.channels = [
    { key: 'en', name: 'EN', chatId: '-1001', language: 'en', enabled: true },
    { key: 'ru', name: 'RU', chatId: '-1002', language: 'ru', enabled: true },
    { key: 'hy', name: 'HY', chatId: '-1003', language: 'hy', enabled: true },
    { key: 'es', name: 'ES', chatId: '-1004', language: 'es', enabled: false },
  ];
  const sent: { chatId: string; caption: string }[] = [];
  const sender = {
    sendPhoto: async (_img: Buffer, caption: string, chatId: string) => {
      if (chatId === failChat) throw new Error('chat not found');
      sent.push({ chatId, caption });
      return sent.length;
    },
  };
  const svc = new SignalsService(
    { create: (x: any) => x } as any,
    { get: (g: string) => settings[g] } as any,
    { enabled: async () => [{ symbol: 'GBP/CAD' }] } as any,
    {} as any,
    {} as any,
    sender as any,
    {} as any,
    { add: () => undefined } as any,
    {} as any,
  );
  return { svc, sent };
}

describe('posting to several channels', () => {
  it('sends one signal to every active channel, each in its language', async () => {
    const { svc, sent } = setup();
    const res = await svc.sendTest();
    expect(sent.map((s) => s.chatId)).toEqual(['-1001', '-1002', '-1003']);
    expect(sent[0].caption).toContain('Expiration: 05:00');
    expect(sent[1].caption).toContain('Экспирация:');
    expect(sent[2].caption).toContain('Գործարքի տևողություն՝');
    expect(res.sent).toEqual(['en (en)', 'ru (ru)', 'hy (hy)']);
    expect(res.failed).toEqual([]);
  });

  it('keeps posting to the other channels when one fails', async () => {
    const { svc, sent } = setup('-1002');
    const res = await svc.sendTest();
    expect(sent.map((s) => s.chatId)).toEqual(['-1001', '-1003']);
    expect(res.failed).toEqual(['ru: chat not found']);
  });
});
