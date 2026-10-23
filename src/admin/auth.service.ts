import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { AdminUser } from './admin-user.entity';

export const SESSION_COOKIE = 'mat_session';
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly attempts = new Map<string, { count: number; first: number }>();

  constructor(
    @InjectRepository(AdminUser) private readonly repo: Repository<AdminUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** The admin account always mirrors ADMIN_EMAIL / ADMIN_PASSWORD from .env. */
  async onModuleInit() {
    const email = this.config.get<string>('ADMIN_EMAIL')?.toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set — admin login disabled');
      return;
    }
    const existing = await this.repo.findOneBy({ email });
    if (existing && (await bcrypt.compare(password, existing.passwordHash))) return;
    await this.repo.clear();
    await this.repo.save({ email, passwordHash: await bcrypt.hash(password, 12) });
    this.logger.log(`Admin account ready: ${email}`);
  }

  async login(email: string, password: string, ip: string): Promise<string | null> {
    const now = Date.now();
    const a = this.attempts.get(ip);
    if (a && now - a.first < WINDOW_MS && a.count >= MAX_ATTEMPTS) throw new Error('Too many attempts. Try again in 15 minutes.');

    const user = await this.repo.findOneBy({ email: (email ?? '').toLowerCase().trim() });
    const ok = !!user && (await bcrypt.compare(password ?? '', user.passwordHash));
    if (!ok) {
      const fresh = !a || now - a.first >= WINDOW_MS;
      this.attempts.set(ip, fresh ? { count: 1, first: now } : { count: a.count + 1, first: a.first });
      return null;
    }
    this.attempts.delete(ip);
    return this.jwt.signAsync({ sub: user.id, email: user.email });
  }

  async verify(req: Request): Promise<boolean> {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return false;
    try {
      await this.jwt.verifyAsync(token);
      return true;
    } catch {
      return false;
    }
  }
}
