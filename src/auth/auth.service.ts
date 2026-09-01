import {
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthDto } from './dto/auth.dto.js';
import * as argon from '@node-rs/argon2';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

@Injectable()
export class AuthService {
    private readonly dummyHashPromise = argon
        .hash('dummy-password-for-timing-safety')
        .catch(() => 'dummy-hash-fallback');

    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private config: ConfigService,
    ) { }

    async register(dto: AuthDto) {
        const hash = await argon.hash(dto.password);

        try {
            const user = await this.prisma.user.create({
                data: {
                    username: dto.username,
                    hash,
                },
            });

            return this.signToken(user.id, user.username);
        } catch (error) {
            if (
                error instanceof
                PrismaClientKnownRequestError
            ) {
                if (error.code === 'P2002') {
                    throw new ForbiddenException(
                        'Credentials taken',
                    );
                }
            }
            throw error;
        }
    }

    async login(dto: AuthDto) {
        const user =
            await this.prisma.user.findUnique({
                where: {
                    username: dto.username,
                },
            });
        const hashToCompare = user?.hash ?? await this.dummyHashPromise;
        const passwordMatches = await argon.verify(hashToCompare, dto.password);

        if (!user || !passwordMatches) {
            throw new ForbiddenException('Credentials incorrect');
        }

        return this.signToken(user.id, user.username);
    }

    async signToken(
        userId: number,
        username: string,
    ): Promise<{ access_token: string }> {
        const payload = {
            sub: userId,
            username,
        };
        const secret = this.config.get('JWT_SECRET');

        const token = await this.jwt.signAsync(
            payload,
            {
                expiresIn: '60m',
                secret: secret,
            },
        );

        return {
            access_token: token,
        };
    }
}