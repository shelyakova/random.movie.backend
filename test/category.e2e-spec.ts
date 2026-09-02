import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module.js';
import { CategoryModule } from '../src/category/category.module.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AuthDto } from '../src/auth/dto/auth.dto.js';
import { CategoryDto } from '../src/category/dto/category.dto.js';
import * as pactum from 'pactum';

describe('CategoryController (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    const user: AuthDto = {
        username: 'category-owner',
        password: '123456',
    };
    const otherUser: AuthDto = {
        username: 'category-intruder',
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
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
            }),
        );
        await app.init();
        await app.listen(3334);

        prisma = app.get(PrismaService);
        await prisma.cleanDb();

        pactum.request.setBaseUrl(
            'http://localhost:3334',
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

    describe('Create category', () => {
        it('should create a category', () => {
            const dto: CategoryDto = { name: 'Action' };

            return pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(dto)
                .expectStatus(201)
                .expectJsonLike({
                    name: dto.name,
                });
        });

        it('should throw 403 when the category name already exists for this user', async () => {
            const dto: CategoryDto = { name: 'Comedy' };

            await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(dto)
                .expectStatus(201);

            return pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(dto)
                .expectStatus(403);
        });
    });

    describe('Get categories', () => {
        it('should throw 401 without an Authorization header', () => {
            return pactum
                .spec()
                .get('/category')
                .expectStatus(401);
        });

        it('should return only this user\'s categories', async () => {
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
                .post('/category/create')
                .withHeaders({
                    Authorization: `Bearer ${otherLogin}`,
                })
                .withBody({ name: 'Intruder Only Category' })
                .expectStatus(201);

            const response = await pactum
                .spec()
                .get('/category')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200)
                .returns('.');

            const categories = response as Array<{ name: string }>;
            expect(
                categories.some((category) => category.name === 'Intruder Only Category'),
            ).toBe(false);
            expect(categories.length).toBeGreaterThan(0);
        });
    });

    describe('Edit category', () => {
        it('should edit a category', async () => {
            const created = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Drama' })
                .expectStatus(201)
                .returns('id');

            const editDto: CategoryDto = { name: 'Drama Updated' };

            return pactum
                .spec()
                .patch(`/category/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody(editDto)
                .expectStatus(200)
                .expectJsonLike({
                    id: created,
                    name: editDto.name,
                });
        });

        it('should throw 404 when editing a non-existent category id', () => {
            return pactum
                .spec()
                .patch('/category/999999')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Does not matter' })
                .expectStatus(404);
        });

        it('should throw 404 when editing another user\'s category id', async () => {
            const otherLogin = await pactum
                .spec()
                .post('/auth/login')
                .withBody(otherUser)
                .expectStatus(201)
                .returns('access_token');

            const otherCategoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: `Bearer ${otherLogin}`,
                })
                .withBody({ name: 'Intruder Editable Category' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .patch(`/category/${otherCategoryId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Hijacked' })
                .expectStatus(404);
        });
    });

    describe('Delete category', () => {
        it('should delete a category with no films attached', async () => {
            const created = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Sci-Fi' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/category/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);
        });

        it('should throw 404 when deleting an already-deleted category id', async () => {
            const created = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .withBody({ name: 'Horror' })
                .expectStatus(201)
                .returns('id');

            await pactum
                .spec()
                .delete(`/category/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(200);

            return pactum
                .spec()
                .delete(`/category/${created}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });

        it('should throw 404 when deleting another user\'s category id', async () => {
            const otherLogin = await pactum
                .spec()
                .post('/auth/login')
                .withBody(otherUser)
                .expectStatus(201)
                .returns('access_token');

            const otherCategoryId = await pactum
                .spec()
                .post('/category/create')
                .withHeaders({
                    Authorization: `Bearer ${otherLogin}`,
                })
                .withBody({ name: 'Intruder Deletable Category' })
                .expectStatus(201)
                .returns('id');

            return pactum
                .spec()
                .delete(`/category/${otherCategoryId}`)
                .withHeaders({
                    Authorization: 'Bearer $S{userToken}',
                })
                .expectStatus(404);
        });
    });
});
