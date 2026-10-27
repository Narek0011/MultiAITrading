const API = 'https://open.tiktokapis.com';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
/** Basic profile, direct posting and sending drafts to the TikTok inbox. */
export const TIKTOK_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

const MB = 1024 * 1024;
/** TikTok takes a file up to 64 MB in one piece; bigger ones go in 5–64 MB chunks, the last taking the remainder. */
const SINGLE_MAX = 64 * MB;
const CHUNK = 10 * MB;

export type PostMode = 'direct' | 'draft';
export type Privacy = 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';

export interface TikTokTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  refreshExpiresAt: number;
  openId: string;
}

export interface CreatorInfo {
  nickname: string;
  username: string;
  avatarUrl: string;
  privacyOptions: Privacy[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoSeconds: number;
}

/** What the post form sends with a direct post (TikTok requires these to be chosen by the user). */
export interface PostInfo {
  title: string;
  description?: string;
  privacy: Privacy;
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Paid partnership promoting another brand. */
  brandContent: boolean;
  /** Promoting your own business. */
  brandOrganic: boolean;
}

export class TikTokApiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

/** Chunk plan for a video upload: equal chunks, the last one absorbs the remainder. */
export function chunkPlan(size: number) {
  if (size <= 0) throw new Error('The video file is empty');
  if (size <= SINGLE_MAX) return { chunkSize: size, total: 1 };
  const total = Math.floor(size / CHUNK);
  return { chunkSize: CHUNK, total };
}

/** Byte ranges for each chunk of `size` bytes: [start, endInclusive]. */
export function chunkRanges(size: number): [number, number][] {
  const { chunkSize, total } = chunkPlan(size);
  return Array.from({ length: total }, (_, i) => [i * chunkSize, i === total - 1 ? size - 1 : (i + 1) * chunkSize - 1]);
}

/** Short explanation in front of TikTok's own error. */
export function friendlyTikTokError(code: string, message: string) {
  const hints: Record<string, string> = {
    access_token_invalid: 'The TikTok connection expired — press "Connect TikTok" again.',
    scope_not_authorized: 'The TikTok app is missing a permission (video.publish / video.upload) — add it in the developer portal and connect again.',
    unaudited_client_can_only_post_to_private_accounts: 'Until TikTok approves the app, posts must be private ("Only me") — pick that privacy level.',
    url_ownership_unverified: 'TikTok cannot pull the images: verify your website domain in the TikTok developer portal (URL properties).',
    spam_risk_too_many_posts: 'TikTok limits how many posts an account can make per day — try again later.',
    spam_risk_user_banned_from_posting: 'TikTok has blocked this account from posting through the API.',
    privacy_level_option_mismatch: 'That privacy level is not allowed for this account — pick one from the list.',
    rate_limit_exceeded: 'Too many requests to TikTok — wait a minute and try again.',
  };
  return hints[code] ? `${hints[code]} (${message || code})` : `TikTok: ${message || code}`;
}

/** Raw TikTok API calls. `fetchFn` is injectable for tests. */
export class TikTokClient {
  constructor(
    private readonly clientKey: string,
    private readonly clientSecret: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  authUrl(redirectUri: string, state: string) {
    const q = new URLSearchParams({ client_key: this.clientKey, response_type: 'code', scope: TIKTOK_SCOPES.join(','), redirect_uri: redirectUri, state });
    return `${AUTH_URL}?${q}`;
  }

  exchangeCode(code: string, redirectUri: string) {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  }

  refresh(refreshToken: string) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  private async token(params: Record<string, string>): Promise<TikTokTokens> {
    const res = await this.fetchFn(`${API}/v2/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: this.clientKey, client_secret: this.clientSecret, ...params }),
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!data.access_token) throw new TikTokApiError(friendlyTikTokError(data.error ?? `http_${res.status}`, data.error_description ?? ''), data.error ?? 'token');
    const now = Date.now();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: now + Number(data.expires_in ?? 86_400) * 1000,
      refreshExpiresAt: now + Number(data.refresh_expires_in ?? 31_536_000) * 1000,
      openId: data.open_id ?? '',
    };
  }

  async userInfo(accessToken: string) {
    const data = await this.call(accessToken, 'GET', '/v2/user/info/?fields=open_id,avatar_url,display_name');
    return { displayName: String(data.user?.display_name ?? ''), avatarUrl: String(data.user?.avatar_url ?? '') };
  }

  async creatorInfo(accessToken: string): Promise<CreatorInfo> {
    const d = await this.call(accessToken, 'POST', '/v2/post/publish/creator_info/query/', {});
    return {
      nickname: d.creator_nickname ?? '',
      username: d.creator_username ?? '',
      avatarUrl: d.creator_avatar_url ?? '',
      privacyOptions: d.privacy_level_options ?? [],
      commentDisabled: !!d.comment_disabled,
      duetDisabled: !!d.duet_disabled,
      stitchDisabled: !!d.stitch_disabled,
      maxVideoSeconds: Number(d.max_video_post_duration_sec ?? 0),
    };
  }

  /** Starts a video upload; returns where to PUT the chunks. */
  async initVideo(accessToken: string, mode: PostMode, size: number, info?: PostInfo): Promise<{ publishId: string; uploadUrl: string }> {
    const { chunkSize, total } = chunkPlan(size);
    const source_info = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: total };
    const body =
      mode === 'draft'
        ? { source_info }
        : {
            post_info: {
              title: info!.title,
              privacy_level: info!.privacy,
              disable_comment: !info!.allowComments,
              disable_duet: !info!.allowDuet,
              disable_stitch: !info!.allowStitch,
              brand_content_toggle: info!.brandContent,
              brand_organic_toggle: info!.brandOrganic,
            },
            source_info,
          };
    const d = await this.call(accessToken, 'POST', mode === 'draft' ? '/v2/post/publish/inbox/video/init/' : '/v2/post/publish/video/init/', body);
    return { publishId: d.publish_id, uploadUrl: d.upload_url };
  }

  /** Uploads the file to `uploadUrl` in the chunks announced by initVideo; `read` returns bytes [start, start+length). */
  async uploadVideo(uploadUrl: string, size: number, mime: string, read: (start: number, length: number) => Promise<Buffer>, onChunk?: (i: number, total: number) => void) {
    const ranges = chunkRanges(size);
    for (let i = 0; i < ranges.length; i++) {
      const [start, end] = ranges[i];
      onChunk?.(i + 1, ranges.length);
      const res = await this.fetchFn(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
        body: new Uint8Array(await read(start, end - start + 1)),
        signal: AbortSignal.timeout(300_000),
      });
      if (!res.ok) throw new TikTokApiError(`TikTok rejected video chunk ${i + 1}/${ranges.length} (HTTP ${res.status})`, 'upload');
    }
  }

  /** Photo post: TikTok downloads the images itself from `urls` (the domain must be verified in the portal). */
  async initPhotos(accessToken: string, mode: PostMode, urls: string[], info: PostInfo): Promise<{ publishId: string }> {
    const post_info: Record<string, unknown> = { title: info.title, description: info.description ?? '', auto_add_music: true };
    if (mode === 'direct') {
      Object.assign(post_info, {
        privacy_level: info.privacy,
        disable_comment: !info.allowComments,
        brand_content_toggle: info.brandContent,
        brand_organic_toggle: info.brandOrganic,
      });
    }
    const d = await this.call(accessToken, 'POST', '/v2/post/publish/content/init/', {
      post_info,
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: urls },
      post_mode: mode === 'draft' ? 'MEDIA_UPLOAD' : 'DIRECT_POST',
      media_type: 'PHOTO',
    });
    return { publishId: d.publish_id };
  }

  async status(accessToken: string, publishId: string): Promise<{ status: string; failReason: string; postIds: string[] }> {
    const d = await this.call(accessToken, 'POST', '/v2/post/publish/status/fetch/', { publish_id: publishId });
    return { status: d.status ?? '', failReason: d.fail_reason ?? '', postIds: (d.publicaly_available_post_id ?? []).map(String) };
  }

  private async call(accessToken: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<any> {
    const res = await this.fetchFn(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json; charset=UTF-8' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json().catch(() => ({}));
    const code = data.error?.code ?? (res.ok ? 'ok' : `http_${res.status}`);
    if (code !== 'ok') throw new TikTokApiError(friendlyTikTokError(code, data.error?.message ?? ''), code);
    return data.data ?? {};
  }
}
