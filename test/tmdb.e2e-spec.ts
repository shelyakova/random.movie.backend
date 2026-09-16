import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { vi } from 'vitest';
import { AuthModule } from '../src/auth/auth.module.js';
import { TmdbModule } from '../src/tmdb/tmdb.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import * as pactum from 'pactum';

// TMDB entity ids used across the mocked fetch fixtures below.
const MOVIE_ID = 100;
const MOVIE_NOT_FOUND_ID = 404404;
const TV_FINISHED_ID = 200;
const TV_AIRING_ID = 201;

const searchFixture = {
    results: [
        {
            id: MOVIE_ID,
            media_type: 'movie',
            title: 'The Gray Man',
            release_date: '2022-07-15',
            poster_path: '/poster.jpg',
        },
        {
            id: TV_FINISHED_ID,
            media_type: 'tv',
            name: 'Severance',
            first_air_date: '2022-02-18',
            poster_path: null,
        },
        {
            id: 999,
            media_type: 'person',
            name: 'Some Actor',
            poster_path: null,
        },
    ],
};

const movieDetailsFixture = {
    id: MOVIE_ID,
    title: 'The Gray Man',
    overview: 'A CIA agent uncovers dark secrets within the agency.',
    release_date: '2022-07-15',
    runtime: 129,
    vote_average: 6.912,
    poster_path: '/poster.jpg',
    genres: [{ id: 28, name: 'Action' }],
};

const movieNotFoundErrorBody = {
    status_message: 'The resource you requested could not be found.',
    status_code: 34,
};

const tvFinishedFixture = {
    id: TV_FINISHED_ID,
    name: 'Severance',
    overview: 'A team of employees at a mysterious company undergo a procedure.',
    first_air_date: '2022-02-18',
    number_of_seasons: 2,
    number_of_episodes: 19,
    episode_run_time: [55],
    vote_average: 8.432,
    poster_path: '/severance.jpg',
    genres: [{ id: 18, name: 'Drama' }],
    next_episode_to_air: null,
    last_episode_to_air: null,
};

const finishedSeasonFixture = {
    episodes: [
        { episode_number: 1, air_date: '2025-01-17' },
        { episode_number: 2, air_date: '2025-01-24' },
        { episode_number: 3, air_date: '2025-03-21' },
    ],
};

const tvAiringFixture = {
    id: TV_AIRING_ID,
    name: 'Ongoing Show',
    overview: 'A show that is still airing.',
    first_air_date: '2025-06-01',
    number_of_seasons: 1,
    number_of_episodes: 10,
    episode_run_time: [45],
    vote_average: 7.1,
    poster_path: null,
    genres: [],
    next_episode_to_air: { air_date: '2026-10-01' },
    last_episode_to_air: null,
};

const airingSeasonFixture = {
    episodes: [
        { episode_number: 1, air_date: '2026-06-01' },
        { episode_number: 2, air_date: '2026-07-01' },
        { episode_number: 3, air_date: '2099-10-15' },
    ],
};

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as Response;
}

async function fetchMockImpl(input: unknown): Promise<Response> {
    const url = String(input);

    if (url.includes('/search/multi')) return jsonResponse(200, searchFixture);
    if (url.includes(`/movie/${MOVIE_NOT_FOUND_ID}`)) return jsonResponse(404, movieNotFoundErrorBody);
    if (url.includes(`/movie/${MOVIE_ID}`)) return jsonResponse(200, movieDetailsFixture);
    if (url.includes(`/tv/${TV_FINISHED_ID}/season/`)) return jsonResponse(200, finishedSeasonFixture);
    if (url.includes(`/tv/${TV_FINISHED_ID}`)) return jsonResponse(200, tvFinishedFixture);
    if (url.includes(`/tv/${TV_AIRING_ID}/season/`)) return jsonResponse(200, airingSeasonFixture);
    if (url.includes(`/tv/${TV_AIRING_ID}`)) return jsonResponse(200, tvAiringFixture);

    throw new Error(`Unexpected fetch call to ${url} in tmdb e2e test`);
}

describe('TmdbController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const user: AuthDto = {
        username: 'tmdb-owner',
        password: '123456',
    };

    beforeAll(async () => {
        // Never hit the real TMDB API from e2e tests - mock global fetch with
        // fixed fixtures for every scenario the suite below exercises.
        vi.spyOn(global, 'fetch').mockImplementation(fetchMockImpl as typeof fetch);

        // Built from AppModule's own imports rather than AppModule itself, so
        // that the global ThrottlerGuard (5 req/60s, registered as APP_GUARD
        // in AppModule's `providers`) never gets wired up at all. See the
        // other e2e specs for the full rationale.
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                PrismaModule,
                AuthModule,
                TmdbModule,
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
            }),
        );
        await app.init();
        await app.listen(3336);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3336',
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

    describe('GET /tmdb/search', () => {
        it('should throw 401 without an Authorization header', () => {
            return pactum
                .spec()
                .get('/tmdb/search')
                .withQueryParams('query', 'gray man')
                .expectStatus(401);
        });

        it('should throw 400 when the query is empty', () => {
            return pactum
                .spec()
                .get('/tmdb/search')
                .withQueryParams('query', '')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(400);
        });

        it('should return the mapped search results', () => {
            return pactum
                .spec()
                .get('/tmdb/search')
                .withQueryParams('query', 'gray man')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJson([
                    {
                        tmdbId: MOVIE_ID,
                        type: 'movie',
                        name: 'The Gray Man',
                        year: 2022,
                    },
                    {
                        tmdbId: TV_FINISHED_ID,
                        type: 'tv',
                        name: 'Severance',
                        year: 2022,
                    },
                ]);
        });
    });

    describe('GET /tmdb/details/:type/:id', () => {
        it('should throw 401 without an Authorization header', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/movie/${MOVIE_ID}`)
                .expectStatus(401);
        });

        it('should throw 400 for an invalid type', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/song/${MOVIE_ID}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(400);
        });

        it('should return the full mapped movie details', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/movie/${MOVIE_ID}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJson({
                    tmdbId: MOVIE_ID,
                    type: 'movie',
                    name: 'The Gray Man',
                    description: 'A CIA agent uncovers dark secrets within the agency.',
                    year: 2022,
                    duration: 129,
                    seasons: null,
                    episodes: null,
                    newSeason: null,
                    latestEpisode: null,
                    mark: 6.91,
                    posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
                });
        });

        it('should return 404 when the mocked TMDB response is a 404', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/movie/${MOVIE_NOT_FOUND_ID}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should return the full mapped tv details for a finished season, with latestEpisode populated', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/tv/${TV_FINISHED_ID}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJson({
                    tmdbId: TV_FINISHED_ID,
                    type: 'tv',
                    name: 'Severance',
                    description: 'A team of employees at a mysterious company undergo a procedure.',
                    year: 2022,
                    duration: 55,
                    seasons: 2,
                    episodes: 19,
                    newSeason: '2025-01-17',
                    latestEpisode: '2025-03-21',
                    mark: 8.43,
                    posterUrl: 'https://image.tmdb.org/t/p/w500/severance.jpg',
                });
        });

        it('should return the full mapped tv details for a currently-airing season, with latestEpisode null', () => {
            return pactum
                .spec()
                .get(`/tmdb/details/tv/${TV_AIRING_ID}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .expectJson({
                    tmdbId: TV_AIRING_ID,
                    type: 'tv',
                    name: 'Ongoing Show',
                    description: 'A show that is still airing.',
                    year: 2025,
                    duration: 45,
                    seasons: 1,
                    episodes: 10,
                    newSeason: '2026-06-01',
                    latestEpisode: null,
                    mark: 7.1,
                    posterUrl: null,
                });
        });
    });
});
