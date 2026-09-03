import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module.js';
import { CategoryModule } from '../src/category/category.module.js';
import { FilmModule } from '../src/film/film.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import { CategoryDto } from '../src/category/dto/category.dto.js';
import { CreateFilmDto, EditFilmDto } from '../src/film/dto/film.dto.js';
import * as pactum from 'pactum';

describe('FilmController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const user: AuthDto = {
        username: 'film-owner',
        password: '123456',
    };
    const otherUser: AuthDto = {
        username: 'film-intruder',
        password: '123456',
    };

    beforeAll(async () => {
        // Built from AppModule's own imports rather than AppModule itself, so
        // that the global ThrottlerGuard (5 req/60s, registered as APP_GUARD
        // in AppModule's `providers`) never gets wired up at all. This suite
        // bootstraps a single app instance and reuses it (and one logged-in
        // user) across every test below, issuing far more than 5 requests
        // overall - overriding APP_GUARD/ThrottlerGuard via the testing
        // module builder does not actually disable it for this Nest version,
        // so the only reliable option is to not register it in the first
        // place. Production `AppModule` (and its guard) is untouched.
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                AuthModule,
                CategoryModule,
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
        await app.listen(3335);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3335',
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
        await app.close();
    });

    describe('Create film', () => {
        it('should create a film with categoryIds and include the connected categories', async () => {
            const categoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Action Film Category' })
                .expectStatus(201)
                .returns('id');

            const dto: CreateFilmDto = {
                name: 'Mad Max',
                link: 'https://example.com/mad-max',
                categoryIds: [categoryId],
            };

            return pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(dto)
                .expectStatus(201)
                .expectJsonLike({
                    name: dto.name,
                    link: dto.link,
                    categories: [{ id: categoryId, name: 'Action Film Category' }],
                });
        });

        it('should throw 400 when the required link field is missing', () => {
            return pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'No Link Film' })
                .expectStatus(400);
        });
    });

    describe('Get films', () => {
        it('should throw 401 without an Authorization header', () => {
            return pactum
                .spec()
                .get('/film')
                .expectStatus(401);
        });

        it('should return only this user\'s films', async () => {
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

            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: `Bearer ${otherLogin}`,
                })
                .withBody({ name: 'Intruder Only Film', link: 'https://example.com/intruder' })
                .expectStatus(201);

            const response = await pactum
                .spec()
                .get('/film')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(
                films.some((film) => film.name === 'Intruder Only Film'),
            ).toBe(false);
            expect(films.length).toBeGreaterThan(0);
        });

        it('should filter by name search case-insensitively', async () => {
            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Interstellar Journey', link: 'https://example.com/interstellar' })
                .expectStatus(201);

            const response = await pactum
                .spec()
                .get('/film')
                .withQueryParams('search', 'interstellar')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.length).toBeGreaterThan(0);
            expect(
                films.every((film) => film.name.toLowerCase().includes('interstellar')),
            ).toBe(true);
        });

        it('should filter by isWatched status', async () => {
            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Watched Film', link: 'https://example.com/watched', isWatched: true })
                .expectStatus(201);

            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Unwatched Film', link: 'https://example.com/unwatched', isWatched: false })
                .expectStatus(201);

            const response = await pactum
                .spec()
                .get('/film')
                .withQueryParams('isWatched', true)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string; isWatched: boolean }>;
            expect(films.length).toBeGreaterThan(0);
            expect(films.every((film) => film.isWatched === true)).toBe(true);
            expect(films.some((film) => film.name === 'Unwatched Film')).toBe(false);
        });

        it('should return only films that have ALL specified categories', async () => {
            const categoryOneId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Filter Category One' })
                .expectStatus(201)
                .returns('id');

            const categoryTwoId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Filter Category Two' })
                .expectStatus(201)
                .returns('id');

            const bothCategoriesFilmName = 'Both Categories Film';
            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: bothCategoriesFilmName,
                    link: 'https://example.com/both-categories',
                    categoryIds: [categoryOneId, categoryTwoId],
                })
                .expectStatus(201);

            const oneCategoryFilmName = 'One Category Film';
            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: oneCategoryFilmName,
                    link: 'https://example.com/one-category',
                    categoryIds: [categoryOneId],
                })
                .expectStatus(201);

            const response = await pactum
                .spec()
                .get(`/film?categoryIds=${categoryOneId}&categoryIds=${categoryTwoId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.some((film) => film.name === bothCategoriesFilmName)).toBe(true);
            expect(films.some((film) => film.name === oneCategoryFilmName)).toBe(false);
        });
    });

    describe('Get film by id', () => {
        it('should return a film', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Fetchable Film', link: 'https://example.com/fetchable' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .get(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    name: 'Fetchable Film',
                });
        });

        it('should throw 404 for a non-existent film id', () => {
            return pactum
                .spec()
                .get('/film/999999')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should throw 404 for another user\'s film id', async () => {
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
                .withBody({ name: 'Intruder Fetchable Film', link: 'https://example.com/intruder-fetch' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .get(`/film/${otherFilmId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });
    });

    describe('Edit film', () => {
        it('should edit a film with a partial update', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Editable Film', link: 'https://example.com/editable' })
                .expectStatus(201)
                .returns('id');

            const editDto: EditFilmDto = { name: 'Editable Film Updated' };

            return pactum
                .spec()
                .patch(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(editDto)
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    name: editDto.name,
                    link: 'https://example.com/editable',
                });
        });

        it('should throw 404 when editing a non-existent film id', () => {
            return pactum
                .spec()
                .patch('/film/999999')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Does not matter' })
                .expectStatus(404);
        });

        it('should throw 404 when editing another user\'s film id', async () => {
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
                .withBody({ name: 'Intruder Editable Film', link: 'https://example.com/intruder-edit' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .patch(`/film/${otherFilmId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Hijacked' })
                .expectStatus(404);
        });
    });

    describe('Delete film', () => {
        it('should delete a film', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Deletable Film', link: 'https://example.com/deletable' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);
        });

        it('should throw 404 when deleting an already-deleted film id', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Twice Deleted Film', link: 'https://example.com/twice-deleted' })
                .expectStatus(201)
                .returns('id');

            await pactum
                .spec()
                .delete(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);

            return pactum
                .spec()
                .delete(`/film/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should throw 404 when deleting another user\'s film id', async () => {
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
                .withBody({ name: 'Intruder Deletable Film', link: 'https://example.com/intruder-delete' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/film/${otherFilmId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });
    });

    describe('Delete category attached to a film', () => {
        it('should throw 403 when the category is still attached to an existing film', async () => {
            const categoryDto: CategoryDto = { name: 'Category With Film' };
            const categoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(categoryDto)
                .expectStatus(201)
                .returns('id');

            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: 'Film With Category',
                    link: 'https://example.com/with-category',
                    categoryIds: [categoryId],
                })
                .expectStatus(201);

            return pactum
                .spec()
                .delete(`/category/${categoryId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(403);
        });
    });
});
