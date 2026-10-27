import { chunkPlan, chunkRanges, friendlyTikTokError, TikTokApiError, TikTokClient } from './tiktok.client';
import { joinCaption, parseIdeas, parsePost, parseSlide } from './tiktok-writer';

const MB = 1024 * 1024;

/** Fake fetch that records requests and answers from a queue. */
function fakeFetch(...replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; init: any }[] = [];
  const fn = (async (url: string, init: any) => {
    calls.push({ url, init });
    const r = replies.shift() ?? { body: {} };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as any;
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('TikTok video chunks', () => {
  it('sends files up to 64 MB in one piece', () => {
    expect(chunkPlan(3 * MB)).toEqual({ chunkSize: 3 * MB, total: 1 });
    expect(chunkPlan(64 * MB)).toEqual({ chunkSize: 64 * MB, total: 1 });
    expect(chunkRanges(12 * MB)).toEqual([[0, 12 * MB - 1]]);
  });

  it('splits bigger files into 10 MB chunks, the last one taking the rest', () => {
    const size = 130 * MB + 123;
    expect(chunkPlan(size)).toEqual({ chunkSize: 10 * MB, total: 13 });
    const ranges = chunkRanges(size);
    expect(ranges).toHaveLength(13);
    expect(ranges[0]).toEqual([0, 10 * MB - 1]);
    expect(ranges[12]).toEqual([120 * MB, size - 1]);
    // no gaps, no overlaps
    ranges.slice(1).forEach(([start], i) => expect(start).toBe(ranges[i][1] + 1));
    expect(() => chunkPlan(0)).toThrow();
  });
});

describe('TikTokClient', () => {
  it('builds the authorize URL with scopes and state', () => {
    const url = new URL(new TikTokClient('key123', 'secret').authUrl('https://site.com/admin/tiktok/callback', 'st8'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_key: 'key123', response_type: 'code', scope: 'user.info.basic,video.publish,video.upload', redirect_uri: 'https://site.com/admin/tiktok/callback', state: 'st8',
    });
  });

  it('exchanges the code for tokens', async () => {
    const { fn, calls } = fakeFetch({ body: { access_token: 'at', refresh_token: 'rt', expires_in: 86400, refresh_expires_in: 1000, open_id: 'oid' } });
    const before = Date.now();
    const t = await new TikTokClient('k', 's', fn).exchangeCode('c0de', 'https://x/cb');
    expect(t).toMatchObject({ accessToken: 'at', refreshToken: 'rt', openId: 'oid' });
    expect(t.tokenExpiresAt).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/oauth/token/');
    expect(Object.fromEntries(calls[0].init.body)).toEqual({ client_key: 'k', client_secret: 's', grant_type: 'authorization_code', code: 'c0de', redirect_uri: 'https://x/cb' });
  });

  it('reports token errors in plain words', async () => {
    const { fn } = fakeFetch({ status: 400, body: { error: 'invalid_grant', error_description: 'Authorization code is expired.' } });
    await expect(new TikTokClient('k', 's', fn).exchangeCode('c', 'u')).rejects.toThrow('TikTok: Authorization code is expired.');
  });

  it('starts a direct video post with the user choices', async () => {
    const { fn, calls } = fakeFetch({ body: { data: { publish_id: 'p1', upload_url: 'https://up' }, error: { code: 'ok' } } });
    const r = await new TikTokClient('k', 's', fn).initVideo('tok', 'direct', 3 * MB, {
      title: 'Hi #forex', privacy: 'SELF_ONLY', allowComments: true, allowDuet: false, allowStitch: true, brandContent: false, brandOrganic: true,
    });
    expect(r).toEqual({ publishId: 'p1', uploadUrl: 'https://up' });
    expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/');
    expect(calls[0].init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].init.body)).toEqual({
      post_info: { title: 'Hi #forex', privacy_level: 'SELF_ONLY', disable_comment: false, disable_duet: true, disable_stitch: false, brand_content_toggle: false, brand_organic_toggle: true },
      source_info: { source: 'FILE_UPLOAD', video_size: 3 * MB, chunk_size: 3 * MB, total_chunk_count: 1 },
    });
  });

  it('sends a video draft to the inbox endpoint without post info', async () => {
    const { fn, calls } = fakeFetch({ body: { data: { publish_id: 'p2', upload_url: 'u' }, error: { code: 'ok' } } });
    await new TikTokClient('k', 's', fn).initVideo('tok', 'draft', 100 * MB);
    expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
    expect(JSON.parse(calls[0].init.body)).toEqual({ source_info: { source: 'FILE_UPLOAD', video_size: 100 * MB, chunk_size: 10 * MB, total_chunk_count: 10 } });
  });

  it('uploads chunks with Content-Range', async () => {
    const size = 70 * MB; // → 7 chunks of 10 MB
    const reads: [number, number][] = [];
    const f2 = fakeFetch(...Array.from({ length: 7 }, () => ({ body: {} })));
    await new TikTokClient('k', 's', f2.fn).uploadVideo('https://up', size, 'video/mp4', async (start, length) => {
      reads.push([start, length]);
      return Buffer.alloc(length);
    });
    expect(f2.calls).toHaveLength(7);
    expect(f2.calls[0].init.method).toBe('PUT');
    expect(f2.calls[0].init.headers['Content-Range']).toBe(`bytes 0-${10 * MB - 1}/${size}`);
    expect(f2.calls[6].init.headers['Content-Range']).toBe(`bytes ${60 * MB}-${size - 1}/${size}`);
    expect(reads[6]).toEqual([60 * MB, 10 * MB]);
  });

  it('starts a photo post that TikTok pulls from our URLs', async () => {
    const { fn, calls } = fakeFetch({ body: { data: { publish_id: 'ph' }, error: { code: 'ok' } } });
    await new TikTokClient('k', 's', fn).initPhotos('tok', 'draft', ['https://s/1.jpg', 'https://s/2.jpg'], {
      title: 'T', description: 'D', privacy: 'PUBLIC_TO_EVERYONE', allowComments: true, allowDuet: true, allowStitch: true, brandContent: false, brandOrganic: false,
    });
    expect(calls[0].url).toBe('https://open.tiktokapis.com/v2/post/publish/content/init/');
    expect(JSON.parse(calls[0].init.body)).toEqual({
      post_info: { title: 'T', description: 'D', auto_add_music: true },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: ['https://s/1.jpg', 'https://s/2.jpg'] },
      post_mode: 'MEDIA_UPLOAD',
      media_type: 'PHOTO',
    });
  });

  it('turns API errors into helpful messages', async () => {
    const { fn } = fakeFetch({ status: 403, body: { error: { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review' } } });
    const err = await new TikTokClient('k', 's', fn).creatorInfo('tok').catch((e) => e);
    expect(err).toBeInstanceOf(TikTokApiError);
    expect(err.code).toBe('unaudited_client_can_only_post_to_private_accounts');
    expect(err.message).toMatch(/^Until TikTok approves the app/);
    expect(friendlyTikTokError('weird', '')).toBe('TikTok: weird');
  });

  it('reads creator info and publish status', async () => {
    const { fn } = fakeFetch(
      { body: { data: { creator_nickname: 'MultiAI', creator_username: 'multiai', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, max_video_post_duration_sec: 600 }, error: { code: 'ok' } } },
      { body: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [123] }, error: { code: 'ok' } } },
    );
    const c = new TikTokClient('k', 's', fn);
    expect(await c.creatorInfo('t')).toMatchObject({ nickname: 'MultiAI', privacyOptions: ['SELF_ONLY'], commentDisabled: true, duetDisabled: false, maxVideoSeconds: 600 });
    expect(await c.status('t', 'p')).toEqual({ status: 'PUBLISH_COMPLETE', failReason: '', postIds: ['123'] });
  });
});

describe('TikTok AI replies', () => {
  it('cleans ideas', () => {
    expect(parseIdeas({ ideas: [{ title: 'Hook [x](https://a.b)', angle: 'see https://t.co/x' }, { title: '', angle: 'no title' }] })).toEqual([{ title: 'Hook x', angle: 'see' }]);
    expect(parseIdeas(null)).toEqual([]);
  });

  it('joins caption and hashtags', () => {
    expect(joinCaption('Line one\nLine two', ['#forex', 'trading ai', ''])).toBe('Line one\nLine two\n\n#forex #tradingai');
  });

  it('parses a photo post with slides and falls back on bad values', () => {
    const post = parsePost({
      title: 'x'.repeat(120),
      caption: 'Caption',
      hashtags: ['forex'],
      slides: [{ kind: 'nope', kicker: 'A', headline: 'H', text: 'T', bullets: ['1', '', '2'], stat: '', pair: '' }, { kind: 'chart', pair: 'BTC/USD', headline: 'C', text: '', bullets: [], stat: '', kicker: '' }],
    }, 'photo');
    expect(post.title).toHaveLength(90);
    expect(post.caption).toBe('Caption\n\n#forex');
    expect(post.slides[0]).toMatchObject({ kind: 'points', bullets: ['1', '2'] });
    expect(post.slides[1]).toMatchObject({ kind: 'chart', pair: 'EUR/USD' });
    expect(parsePost({ caption: 'c', slides: [{ kind: 'cover' }] }, 'video').slides).toEqual([]);
    expect(() => parsePost({ caption: '' }, 'photo')).toThrow();
    expect(parseSlide({ kind: 'stat', stat: '1234567890' }).stat).toBe('12345678');
  });
});
