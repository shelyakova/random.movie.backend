import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import * as pactum from 'pactum';

describe('AppController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeEach(async () => {
        const moduleRef =
            await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
            }),
        );
        await app.init();
        await app.listen(3333);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3333',
        );
    });

    describe('Auth', () => {
        const dto: AuthDto = {
            username: 'test',
            password: '123456',
        };
        describe('Register', () => {
            it('should throw if username empty', () => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody({
                        password: dto.password,
                    })
                    .expectStatus(400);
            });
            it('should throw if password empty', () => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody({
                        username: dto.username,
                    })
                    .expectStatus(400);
            });
            it('should throw if password is too short', () => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody({
                        username: dto.username,
                        password: '123',
                    })
                    .expectStatus(400);
            });
            it('should throw if no body provided', () => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .expectStatus(400);
            });
            it('should register a new user', () => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody(dto)
                    .expectStatus(201)
                    .expectJsonLike({
                        access_token: /.+/,
                    })
                    .stores('registerToken', 'access_token');
            });
            it('should throw on duplicate username', async () => {
                await pactum
                    .spec()
                    .post('/auth/register')
                    .withBody(dto)
                    .expectStatus(201);

                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody(dto)
                    .expectStatus(403);
            });
        });

        describe('Login', () => {
            beforeEach(() => {
                return pactum
                    .spec()
                    .post('/auth/register')
                    .withBody(dto)
                    .expectStatus(201);
            });

            it('should throw if username empty', () => {
                return pactum
                    .spec()
                    .post('/auth/login')
                    .withBody({
                        password: dto.password,
                    })
                    .expectStatus(400);
            });
            it('should throw if password empty', () => {
                return pactum
                    .spec()
                    .post('/auth/login')
                    .withBody({
                        username: dto.username,
                    })
                    .expectStatus(400);
            });
            it('should throw on wrong password', () => {
                return pactum
                    .spec()
                    .post('/auth/login')
                    .withBody({
                        username: dto.username,
                        password: 'wrong-password',
                    })
                    .expectStatus(403);
            });
            it('should throw for a non-existent user', () => {
                return pactum
                    .spec()
                    .post('/auth/login')
                    .withBody({
                        username: 'nobody',
                        password: dto.password,
                    })
                    .expectStatus(403);
            });
            it('should log in with correct credentials', () => {
                return pactum
                    .spec()
                    .post('/auth/login')
                    .withBody(dto)
                    .expectStatus(201)
                    .expectJsonLike({
                        access_token: /.+/,
                    });
            });
        });
    });

    afterEach(async () => {
        await app.close();
    });
});
