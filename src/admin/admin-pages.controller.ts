import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { TikTokService } from '../tiktok/tiktok.service';
import { AuthService, SESSION_COOKIE } from './auth.service';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Controller('admin')
export class AdminPagesController {
  constructor(
    private readonly auth: AuthService,
    private readonly tiktok: TikTokService,
  ) {}

  @Get()
  async dashboard(@Req() req: Request, @Res() res: Response) {
    if (!(await this.auth.verify(req))) return res.redirect('/admin/login');
    res.render('admin/dashboard', { layout: false });
  }

  @Get('login')
  async loginPage(@Req() req: Request, @Res() res: Response) {
    if (await this.auth.verify(req)) return res.redirect('/admin');
    res.render('admin/login', { layout: false });
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() req: Request, @Res() res: Response) {
    try {
      const token = await this.auth.login(body.email, body.password, req.ip ?? 'unknown');
      if (!token) return res.status(401).render('admin/login', { layout: false, error: 'Wrong email or password', email: body.email });
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: req.secure,
        maxAge: 7 * 24 * 3_600_000,
        path: '/',
      });
      res.redirect('/admin');
    } catch (err: any) {
      res.status(429).render('admin/login', { layout: false, error: err.message, email: body.email });
    }
  }

  /** Sends the admin to TikTok to allow posting; TikTok comes back to /admin/tiktok/callback. */
  @Get('tiktok/connect')
  async tiktokConnect(@Req() req: Request, @Res() res: Response) {
    if (!(await this.auth.verify(req))) return res.redirect('/admin/login');
    try {
      res.redirect(this.tiktok.connectUrl());
    } catch (err: any) {
      res.status(400).send(this.tiktokPage(false, err.message));
    }
  }

  /**
   * TikTok's redirect back. The admin cookie is SameSite=strict, so the browser doesn't send it on this cross-site
   * redirect; the one-time `state` from tiktokConnect proves the request started from a logged-in admin.
   */
  @Get('tiktok/callback')
  async tiktokCallback(@Query() q: { code?: string; state?: string; error?: string; error_description?: string }, @Res() res: Response) {
    if (q.error || !q.code || !q.state) return res.status(400).send(this.tiktokPage(false, q.error_description || q.error || 'TikTok did not return a code'));
    try {
      const user = await this.tiktok.finishConnect(q.code, q.state);
      res.send(this.tiktokPage(true, user.displayName ? `Connected as ${user.displayName}` : 'Connected'));
    } catch (err: any) {
      res.status(400).send(this.tiktokPage(false, err.message));
    }
  }

  /** Small result page; its link back to the admin is a same-site navigation, so the session cookie is sent again. */
  private tiktokPage(ok: boolean, message: string) {
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#060914;color:#e9edf8;font:16px Inter,system-ui,sans-serif}
.card{max-width:420px;padding:32px;border-radius:16px;background:#0c1222;border:1px solid rgba(255,255,255,.1);text-align:center}
h1{font-size:22px;margin:0 0 8px}p{color:#8f9ab6;margin:0 0 22px}a{display:inline-block;padding:11px 20px;border-radius:10px;background:#1f6bff;color:#fff;text-decoration:none;font-weight:600}</style></head>
<body><div class="card"><h1>${ok ? '✅ TikTok connected' : '⚠️ TikTok not connected'}</h1><p>${escapeHtml(message)}</p><a href="/admin#tiktok">Back to admin</a></div>
${ok ? '<script>setTimeout(function(){location.href="/admin#tiktok"},1500)</script>' : ''}</body></html>`;
  }

  @Get('logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect('/admin/login');
  }
}
