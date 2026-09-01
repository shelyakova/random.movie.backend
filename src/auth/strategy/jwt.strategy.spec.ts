import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy.js';

describe('JwtStrategy', () => {
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: vi.fn(),
      },
    };
  });

  it('throws when JWT_SECRET is not configured', () => {
    expect(
      () => new JwtStrategy(new ConfigService({}), prismaMock),
    ).toThrow('JWT_SECRET is not defined in environment variables');
  });

  describe('validate', () => {
    it('returns the user for a payload with a known sub', async () => {
      const strategy = new JwtStrategy(new ConfigService({ JWT_SECRET: 'secret' }), prismaMock);
      const user = { id: 1, username: 'test', createdAt: new Date() };
      prismaMock.user.findUnique.mockResolvedValue(user);

      const result = await strategy.validate({ sub: 1, username: 'test' });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { id: true, username: true, createdAt: true },
      });
      expect(result).toEqual(user);
    });

    it('throws UnauthorizedException when the user no longer exists', async () => {
      const strategy = new JwtStrategy(new ConfigService({ JWT_SECRET: 'secret' }), prismaMock);
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate({ sub: 99, username: 'ghost' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
