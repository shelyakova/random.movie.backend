import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module.js';
import { CategoryModule } from '../src/category/category.module.js';
import { FilmModule } from '../src/film/film.module.js';
import { CloudinaryModule } from '../src/cloudinary/cloudinary.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import { CategoryDto } from '../src/category/dto/category.dto.js';
import { CreateFilmDto, EditFilmDto } from '../src/film/dto/film.dto.js';
import * as pactum from 'pactum';
import * as path from 'path';

const posterFixturePath = path.join(process.cwd(), 'test', 'fixtures', 'test-poster.png');

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
                CloudinaryModule,
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

        it('should convert newSeason and latestEpisode to full ISO datetime strings', () => {
            const dto: CreateFilmDto = {
                name: 'Dated Show',
                link: 'https://example.com/dated-show',
                newSeason: '2027-07-20',
                latestEpisode: '2027-07-20',
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
                    newSeason: new Date(dto.newSeason as string).toISOString(),
                    latestEpisode: new Date(dto.latestEpisode as string).toISOString(),
                });
        });

        it('should throw 400 when newSeason is not a valid date string', () => {
            return pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: 'Invalid Date Show',
                    link: 'https://example.com/invalid-date-show',
                    newSeason: 'not-a-date',
                })
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

    describe('Get films - date filters', () => {
        const filmAName = 'Date Filter Past Season Film';
        const filmBName = 'Date Filter Future Season Film';
        const filmCName = 'Date Filter Latest Episode Film';

        let filmAId: number;
        let filmBId: number;
        let filmCId: number;

        beforeAll(async () => {
            filmAId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: filmAName,
                    link: 'https://example.com/date-filter-past-season',
                    newSeason: '2024-01-15',
                })
                .expectStatus(201)
                .returns('id');

            filmBId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: filmBName,
                    link: 'https://example.com/date-filter-future-season',
                    newSeason: '2030-01-15',
                })
                .expectStatus(201)
                .returns('id');

            filmCId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: filmCName,
                    link: 'https://example.com/date-filter-latest-episode',
                    latestEpisode: '2025-06-01',
                })
                .expectStatus(201)
                .returns('id');
        });

        afterAll(async () => {
            await pactum
                .spec()
                .delete(`/film/${filmAId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);

            await pactum
                .spec()
                .delete(`/film/${filmBId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);

            await pactum
                .spec()
                .delete(`/film/${filmCId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);
        });

        it('should return only films whose newSeason is due when newSeasonOut=true', async () => {
            const response = await pactum
                .spec()
                .get('/film')
                .withQueryParams('newSeasonOut', true)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.some((film) => film.name === filmAName)).toBe(true);
            expect(films.some((film) => film.name === filmBName)).toBe(false);
            expect(films.some((film) => film.name === filmCName)).toBe(false);
        });

        it('should return only films with a latestEpisode set when hasLatestEpisode=true', async () => {
            const response = await pactum
                .spec()
                .get('/film')
                .withQueryParams('hasLatestEpisode', true)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.some((film) => film.name === filmCName)).toBe(true);
            expect(films.some((film) => film.name === filmAName)).toBe(false);
            expect(films.some((film) => film.name === filmBName)).toBe(false);
        });

        it('should return all three films when no date filters are applied', async () => {
            const response = await pactum
                .spec()
                .get('/film')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.some((film) => film.name === filmAName)).toBe(true);
            expect(films.some((film) => film.name === filmBName)).toBe(true);
            expect(films.some((film) => film.name === filmCName)).toBe(true);
        });

        it('should combine newSeasonOut with search to return only the matching film', async () => {
            const response = await pactum
                .spec()
                .get('/film')
                .withQueryParams({ newSeasonOut: true, search: filmAName })
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const films = response as Array<{ name: string }>;
            expect(films.some((film) => film.name === filmAName)).toBe(true);
            expect(films.some((film) => film.name === filmBName)).toBe(false);
            expect(films.some((film) => film.name === filmCName)).toBe(false);
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

        it('should update only newSeason when editing just that field', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Season Editable Show', link: 'https://example.com/season-editable' })
                .expectStatus(201)
                .returns('id');

            const editDto: EditFilmDto = { newSeason: '2027-07-20' };

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
                    name: 'Season Editable Show',
                    link: 'https://example.com/season-editable',
                    newSeason: new Date(editDto.newSeason as string).toISOString(),
                    latestEpisode: null,
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

    describe('Upload poster', () => {
        it('should upload a poster image and return a Cloudinary posterUrl', async () => {
            const created = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Poster Film', link: 'https://example.com/poster-film' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${created}/poster`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withFile('poster', posterFixturePath)
                .expectStatus(201)
                .expectJsonLike({
                    id: created,
                    posterUrl: /^https:\/\/res\.cloudinary\.com\//,
                });
        });

        it('should throw 404 when uploading a poster to another user\'s film', async () => {
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
                .withBody({ name: 'Intruder Poster Film', link: 'https://example.com/intruder-poster' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .post(`/film/${otherFilmId}/poster`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withFile('poster', posterFixturePath)
                .expectStatus(404);
        });
    });

    describe('Get random film', () => {
        it('should return one of the unwatched films matching the filter', async () => {
            const categoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Random Pick Category' })
                .expectStatus(201)
                .returns('id');

            const firstId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: 'Random Pick Film One',
                    link: 'https://example.com/random-pick-one',
                    categoryIds: [categoryId],
                })
                .expectStatus(201)
                .returns('id');

            const secondId = await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: 'Random Pick Film Two',
                    link: 'https://example.com/random-pick-two',
                    categoryIds: [categoryId],
                })
                .expectStatus(201)
                .returns('id');

            const response = await pactum
                .spec()
                .get('/film/random')
                .withQueryParams('categoryIds', categoryId)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const result = response as { id: number };
            expect([firstId, secondId]).toContain(result.id);
        });

        it('should throw 404 when all matching films are watched', async () => {
            const categoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Random Watched Category' })
                .expectStatus(201)
                .returns('id');

            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({
                    name: 'Random Watched Film',
                    link: 'https://example.com/random-watched',
                    isWatched: true,
                    categoryIds: [categoryId],
                })
                .expectStatus(201);

            return pactum
                .spec()
                .get('/film/random')
                .withQueryParams('categoryIds', categoryId)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        describe('date filters', () => {
            const filmAName = 'Random Filter Past Season Film';
            const filmBName = 'Random Filter Future Season Film';
            const filmCName = 'Random Filter Latest Episode Film';

            let categoryId: number;
            let filmAId: number;
            let filmBId: number;
            let filmCId: number;

            beforeAll(async () => {
                categoryId = await pactum
                    .spec()
                    .post('/category/create')
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .withBody({ name: 'Random Date Filter Category' })
                    .expectStatus(201)
                    .returns('id');

                filmAId = await pactum
                    .spec()
                    .post('/film/create')
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .withBody({
                        name: filmAName,
                        link: 'https://example.com/random-filter-past-season',
                        newSeason: '2024-01-15',
                        categoryIds: [categoryId],
                    })
                    .expectStatus(201)
                    .returns('id');

                filmBId = await pactum
                    .spec()
                    .post('/film/create')
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .withBody({
                        name: filmBName,
                        link: 'https://example.com/random-filter-future-season',
                        newSeason: '2030-01-15',
                        categoryIds: [categoryId],
                    })
                    .expectStatus(201)
                    .returns('id');

                filmCId = await pactum
                    .spec()
                    .post('/film/create')
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .withBody({
                        name: filmCName,
                        link: 'https://example.com/random-filter-latest-episode',
                        latestEpisode: '2025-06-01',
                        categoryIds: [categoryId],
                    })
                    .expectStatus(201)
                    .returns('id');
            });

            afterAll(async () => {
                await pactum
                    .spec()
                    .delete(`/film/${filmAId}`)
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(200);

                await pactum
                    .spec()
                    .delete(`/film/${filmBId}`)
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(200);

                await pactum
                    .spec()
                    .delete(`/film/${filmCId}`)
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(200);
            });

            it('should always return Film A when newSeasonOut=true', async () => {
                const response = await pactum
                    .spec()
                    .get('/film/random')
                    .withQueryParams({ newSeasonOut: true, categoryIds: categoryId })
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(200)
                    .returns('.');

                const result = response as { id: number };
                expect(result.id).toBe(filmAId);
            });

            it('should always return Film C when hasLatestEpisode=true', async () => {
                const response = await pactum
                    .spec()
                    .get('/film/random')
                    .withQueryParams({ hasLatestEpisode: true, categoryIds: categoryId })
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(200)
                    .returns('.');

                const result = response as { id: number };
                expect(result.id).toBe(filmCId);
            });

            it('should throw 404 when no film matches both newSeasonOut and hasLatestEpisode', () => {
                return pactum
                    .spec()
                    .get('/film/random')
                    .withQueryParams({ newSeasonOut: true, hasLatestEpisode: true, categoryIds: categoryId })
                    .withHeaders({
                        Authorization: 'Bearer $S{userToken}',
                    })
                    .expectStatus(404);
            });
        });
    });

    describe('Pagination', () => {
        it('should return a different film on page 2 than on page 1', async () => {
            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Pagination Film Alpha', link: 'https://example.com/pagination-alpha' })
                .expectStatus(201);

            await pactum
                .spec()
                .post('/film/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Pagination Film Beta', link: 'https://example.com/pagination-beta' })
                .expectStatus(201);

            const firstPage = await pactum
                .spec()
                .get('/film')
                .withQueryParams({ search: 'Pagination Film', page: 1, limit: 1 })
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const secondPage = await pactum
                .spec()
                .get('/film')
                .withQueryParams({ search: 'Pagination Film', page: 2, limit: 1 })
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const firstPageFilms = firstPage as Array<{ id: number }>;
            const secondPageFilms = secondPage as Array<{ id: number }>;
            expect(firstPageFilms.length).toBe(1);
            expect(secondPageFilms.length).toBe(1);
            expect(firstPageFilms[0].id).not.toBe(secondPageFilms[0].id);
        });
    });
});
