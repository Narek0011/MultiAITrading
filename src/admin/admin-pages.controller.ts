import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService, SESSION_COOKIE } from './auth.service';

@Controller('admin')
export class AdminPagesController {
  constructor(private readonly auth: AuthService) {}

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

  @Get('logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.redirect('/admin/login');
  }
}
