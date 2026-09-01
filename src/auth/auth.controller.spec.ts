import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import type { AuthDto } from './dto/auth.dto.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authServiceMock: { register: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn> };
  const dto: AuthDto = { username: 'test', password: '123456' };

  beforeEach(() => {
    authServiceMock = {
      register: vi.fn().mockResolvedValue({ access_token: 'register-token' }),
      login: vi.fn().mockResolvedValue({ access_token: 'login-token' }),
    };
    controller = new AuthController(authServiceMock as unknown as AuthService);
  });

  it('delegates register to AuthService and returns its result', async () => {
    const result = await controller.register(dto);

    expect(authServiceMock.register).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'register-token' });
  });

  it('delegates login to AuthService and returns its result', async () => {
    const result = await controller.login(dto);

    expect(authServiceMock.login).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ access_token: 'login-token' });
  });
});
