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
// level with a fixed secure_url/public_id fixture for uploadImageFromUrl (used
// to seed a film with an existing poster) and a spy on destroy so the delete
// tests can assert whether Cloudinary was actually asked to remove anything.
const { MOCKED_SECURE_URL, MOCKED_PUBLIC_ID } = vi.hoisted(() => ({
    MOCKED_SECURE_URL: 'https://res.cloudinary.com/mocked/image/upload/mock-poster-to-delete.png',
    MOCKED_PUBLIC_ID: 'movie-list-posters/mock-poster-to-delete',
}));

vi.mock('cloudinary', () => ({
    v2: {
        config: vi.fn(),
        uploader: {
            upload: vi.fn().mockResolvedValue({ secure_url: MOCKED_SECURE_URL, public_id: MOCKED_PUBLIC_ID }),
            upload_stream: vi.fn(),
            destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
        },
    },
}));

describe('FilmController - poster deletion (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const user: AuthDto = {
        username: 'poster-delete-owner',
        password: '123456',
    };
    const otherUser: AuthDto = {
        username: 'poster-delete-intruder',
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
        await app.listen(3338);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3338',
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

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('DELETE /film/:id/poster', () => {
        it('should throw 401 without an Authorization header', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Unauth Delete Poster Film', link: 'https://example.com/unauth-delete-poster' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/film/${created}/poster`)
                .expectStatus(401);
        });

        it('should throw 404 when the film does not exist', () => {
            return pactum
                .spec()
                .delete('/film/999999/poster')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should throw 404 when removing a poster from another user\'s film', async () => {
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
                .withBody({ name: 'Intruder Delete Poster Film', link: 'https://example.com/intruder-delete-poster' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/film/${otherFilmId}/poster`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should remove an existing poster, clearing posterUrl and posterPublicId', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Poster To Delete Film', link: 'https://example.com/poster-to-delete-film' })
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
                    posterPublicId: MOCKED_PUBLIC_ID,
                });

            await pactum
                .spec()
                .delete(`/film/${created}/poster`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    posterUrl: null,
                    posterPublicId: null,
                });

            const film = await prisma.film.findUnique({ where: { id: created } });
            expect(film?.posterUrl).toBeNull();
            expect(film?.posterPublicId).toBeNull();

            return pactum
                .spec()
                .get(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    posterUrl: null,
                    posterPublicId: null,
                });
        });

        it('should succeed with no Cloudinary delete call when the film has no poster set', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'No Poster Film', link: 'https://example.com/no-poster-film' })
                .expectStatus(201)
                .returns('id');

            const { v2: cloudinary } = await import('cloudinary');

            await pactum
                .spec()
                .delete(`/film/${created}/poster`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    posterUrl: null,
                    posterPublicId: null,
                });

            expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
        });
    });
});
