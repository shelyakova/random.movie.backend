import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
    ExtractJwt,
    Strategy,
} from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(
    Strategy,
    'jwt',
) {
    constructor(
        config: ConfigService,
        private prisma: PrismaService,
    ) {

        const jwtSecret = config.get<string>('JWT_SECRET');

        if (!jwtSecret) {
            throw new Error('JWT_SECRET is not defined in environment variables');
        }

        super({
            jwtFromRequest:
                ExtractJwt.fromAuthHeaderAsBearerToken(),
            secretOrKey: jwtSecret,
        });
    }

    async validate(payload: {
        sub: number;
        username: string;
    }) {
        const user =
            await this.prisma.user.findUnique({
                where: {
                    id: payload.sub,
                },
                select: {
                    id: true,
                    username: true,
                    createdAt: true,
                }
            });

        if (!user) {
            throw new UnauthorizedException();
        }
        return user;
    }
}