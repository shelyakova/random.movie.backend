import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { ForbiddenException } from '@nestjs/common';

vi.mock('@node-rs/argon2', () => ({
  hash: vi.fn().mockResolvedValue('fake-hashed-password'),
  verify: vi.fn().mockResolvedValue(true),
}));

const argon = await import('@node-rs/argon2');

describe('AuthService', () => {
  let authService: AuthService;
  let prismaMock: any;

  beforeEach(() => {
    vi.mocked(argon.verify).mockReset().mockResolvedValue(true);
    vi.mocked(argon.hash).mockReset().mockResolvedValue('fake-hashed-password');

    prismaMock = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
    };
    authService = new AuthService(
      prismaMock,
      new JwtService({}),
      new ConfigService({ JWT_SECRET: 'test-secret' }),
    );
  });

  describe('register', () => {
    it('hashes the password and creates the user', async () => {
      prismaMock.user.create.mockResolvedValue({ id: 1, username: 'test' });

      const result = await authService.register({ username: 'test', password: '123456' });

      expect(argon.hash).toHaveBeenCalledWith('123456');
      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: { username: 'test', hash: 'fake-hashed-password' },
      });
      expect(result).toEqual({ access_token: expect.any(String) });
    });

    it('should throw ForbiddenException on duplicate username', async () => {
      prismaMock.user.create.mockRejectedValue(
        new PrismaClientKnownRequestError('...', { code: 'P2002', clientVersion: '...' }),
      );

      await expect(authService.register({ username: 'test', password: '123456' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rethrows unrelated prisma errors', async () => {
      const error = new PrismaClientKnownRequestError('...', { code: 'P2003', clientVersion: '...' });
      prismaMock.user.create.mockRejectedValue(error);

      await expect(authService.register({ username: 'test', password: '123456' })).rejects.toBe(error);
    });

    it('rethrows non-prisma errors', async () => {
      const error = new Error('unexpected');
      prismaMock.user.create.mockRejectedValue(error);

      await expect(authService.register({ username: 'test', password: '123456' })).rejects.toBe(error);
    });
  });

  describe('login', () => {
    it('returns a token when credentials are correct', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, username: 'test', hash: 'stored-hash' });
      vi.mocked(argon.verify).mockResolvedValue(true);

      const result = await authService.login({ username: 'test', password: '123456' });

      expect(argon.verify).toHaveBeenCalledWith('stored-hash', '123456');
      expect(result).toEqual({ access_token: expect.any(String) });
    });

    it('should return same-timing response for non-existent user', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(authService.login({ username: 'ghost', password: 'anything' })).rejects.toThrow(
        'Credentials incorrect',
      );
    });

    it('throws ForbiddenException when the password does not match', async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 1, username: 'test', hash: 'stored-hash' });
      vi.mocked(argon.verify).mockResolvedValue(false);

      await expect(authService.login({ username: 'test', password: 'wrong' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('compares against the dummy hash for a non-existent user, never short-circuiting', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(authService.login({ username: 'ghost', password: 'anything' })).rejects.toThrow(
        ForbiddenException,
      );
      expect(argon.verify).toHaveBeenCalledWith('fake-hashed-password', 'anything');
    });
  });

  describe('signToken', () => {
    it('signs a payload containing the user id and username', async () => {
      const jwt = new JwtService({});
      const signSpy = vi.spyOn(jwt, 'signAsync');
      const service = new AuthService(prismaMock, jwt, new ConfigService({ JWT_SECRET: 'test-secret' }));

      await service.signToken(42, 'test');

      expect(signSpy).toHaveBeenCalledWith(
        { sub: 42, username: 'test' },
        { expiresIn: '60m', secret: 'test-secret' },
      );
    });
  });
});
