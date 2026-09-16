import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { vi } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { FilmModule } from '../src/film/film.module.js';
import { CloudinaryModule } from '../src/cloudinary/cloudinary.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import * as pactum from 'pactum';

// Never hit the real Cloudinary API from e2e tests - mock the SDK at module
// level with a fixed secure_url fixture for every uploadImageFromUrl call.
const { MOCKED_SECURE_URL } = vi.hoisted(() => ({
    MOCKED_SECURE_URL: 'https://res.cloudinary.com/mocked/image/upload/mock-poster-from-url.png',
}));

vi.mock('cloudinary', () => ({
    v2: {
        config: vi.fn(),
        uploader: {
            upload: vi.fn().mockResolvedValue({ secure_url: MOCKED_SECURE_URL }),
            upload_stream: vi.fn(),
        },
    },
}));

describe('FilmController - poster-from-url (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const user: AuthDto = {
        username: 'poster-url-owner',
        password: '123456',
    };
    const otherUser: AuthDto = {
        username: 'poster-url-intruder',
        password: '123456',
    };

    beforeAll(async () => {
        // Built from AppModule's own imports rather than AppModule itself, so
        // that the global ThrottlerGuard (5 req/60s, registered as APP_GUARD
        // in AppModule's `providers`) never gets wired up at all. See the
        // other e2e specs for the full rationale.
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                CloudinaryModule,
                AuthModule,
                FilmModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
            }),
        );
        await app.init();
        await app.listen(3337);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3337',
        );

        await pactum
            .spec()
            .post('/auth/register')
            .withBody(user)
            .expectStatus(201);

        await pactum
            .spec()
            .post('/auth/login')
            .withBody(user)
            .expectStatus(201)
            .expectJsonLike({
                access_token: /.+/,
            })
            .stores('userToken', 'access_token');
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        await app.close();
    });

    describe('POST /film/:id/poster-from-url', () => {
        it('should throw 401 without an Authorization header', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Unauth Poster Url Film', link: 'https://example.com/unauth-poster-url' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${created}/poster-from-url`)
                .withBody({ posterUrl: 'https://example.com/source-poster.png' })
                .expectStatus(401);
        });

        it('should throw 400 when posterUrl is missing', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Missing Poster Url Film', link: 'https://example.com/missing-poster-url' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${created}/poster-from-url`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({})
                .expectStatus(400);
        });

        it('should throw 400 when posterUrl is not a valid URL', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Invalid Poster Url Film', link: 'https://example.com/invalid-poster-url' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${created}/poster-from-url`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ posterUrl: 'not-a-valid-url' })
                .expectStatus(400);
        });

        it('should throw 404 when the film does not exist', () => {
            return pactum
                .spec()
                .post('/film/999999/poster-from-url')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ posterUrl: 'https://example.com/source-poster.png' })
                .expectStatus(404);
        });

        it('should throw 404 when uploading a poster-from-url to another user\'s film', async () => {
            await pactum
                .spec()
                .post('/auth/register')
                .withBody(otherUser)
                .expectStatus(201);

            const otherLogin = await pactum
                .spec()
                .post('/auth/login')
                .withBody(otherUser)
                .expectStatus(201)
                .returns('access_token');

            const otherFilmId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: `Bearer ${otherLogin}`,
                })
                .withBody({ name: 'Intruder Poster Url Film', link: 'https://example.com/intruder-poster-url' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${otherFilmId}/poster-from-url`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ posterUrl: 'https://example.com/source-poster.png' })
                .expectStatus(404);
        });

        it('should upload a poster from a URL and persist the returned Cloudinary posterUrl', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Poster From Url Film', link: 'https://example.com/poster-from-url-film' })
                .expectStatus(201)
                .returns('id');

            await pactum
                .spec()
                .post(`/film/${created}/poster-from-url`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ posterUrl: 'https://example.com/source-poster.png' })
                .expectStatus(201)
                .expectJsonLike({
                    id: created,
                    posterUrl: MOCKED_SECURE_URL,
                });

            return pactum
                .spec()
                .get(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    posterUrl: MOCKED_SECURE_URL,
                });
        });
    });
});
