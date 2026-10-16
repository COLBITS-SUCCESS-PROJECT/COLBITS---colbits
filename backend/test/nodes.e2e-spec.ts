import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import request from 'supertest';
import * as bcrypt from 'bcrypt';

const F10_TEST_PASSWORD = 'F10TestPassword2026!';

async function assertTestDatabase(dataSource: DataSource): Promise<void> {
    const result: Array<{ database_name: string }> =
        await dataSource.query(
            'SELECT current_database() AS database_name',
        );

    if (result[0]?.database_name !== 'colbits_f10_test') {
        throw new Error(
            'F-10 E2E tests must use the isolated colbits_f10_test database',
        );
    }
}

async function createF10Fixtures(dataSource: DataSource): Promise<void> {
    await assertTestDatabase(dataSource);

    const passwordHash = await bcrypt.hash(F10_TEST_PASSWORD, 10);

    const fixtures = [
        { username: 'f10-e2e-circuit1@test.local', circuitId: '1' },
        { username: 'f10-e2e-none@test.local', circuitId: null },
    ];

    for (const fixture of fixtures) {
        const users: Array<{ id: number }> = await dataSource.query(
            `INSERT INTO users (username, password_hash, role, is_active)
       VALUES ($1, $2, 'consultation user', TRUE)
       ON CONFLICT (username)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = EXCLUDED.is_active
       RETURNING id`,
            [fixture.username, passwordHash],
        );

        const userId = users[0].id;

        await dataSource.query(
            'DELETE FROM user_scopes WHERE user_id = $1',
            [userId],
        );

        if (fixture.circuitId !== null) {
            await dataSource.query(
                `INSERT INTO user_scopes (user_id, entity_type, entity_id)
         VALUES ($1, 'circuit', $2)`,
                [userId, fixture.circuitId],
            );
        }
    }
}

describe('F-10 Nodes API (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        // Refuse to start against the development database.
        if (process.env.DB_NAME !== 'colbits_f10_test') {
            throw new Error(
                'F-10 E2E tests require DB_NAME=colbits_f10_test',
            );
        }

        const moduleFixture: TestingModule =
            await Test.createTestingModule({
                imports: [AppModule],
            }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        // Verify which PostgreSQL database is actually connected.
        // Verify the actual database before any fixture writes.
        const dataSource = app.get(DataSource);

        try {
            await assertTestDatabase(dataSource);
            await createF10Fixtures(dataSource);
        } catch (error) {
            await app.close();
            throw error;
        }
    });

    afterAll(async () => {
        if (!app) return;

        try {
            const dataSource = app.get(DataSource);

            await assertTestDatabase(dataSource);

            await dataSource.query(
                `DELETE FROM users
       WHERE username IN ($1, $2)`,
                [
                    'f10-e2e-circuit1@test.local',
                    'f10-e2e-none@test.local',
                ],
            );
        } finally {
            await app.close();
        }
    });

    it('connects to the isolated F-10 database', async () => {
        const dataSource = app.get(DataSource);

        const result: Array<{ database_name: string }> =
            await dataSource.query(
                'SELECT current_database() AS database_name',
            );

        expect(result[0].database_name).toBe('colbits_f10_test');
    });


    it('returns only authorized Circuit 1 nodes and count', async () => {
        const loginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                username: 'f10-e2e-circuit1@test.local',
                password: F10_TEST_PASSWORD,
            })
            .expect(200);

        const token: string = loginResponse.body.access_token;

        expect(token).toBeTruthy();

        const response = await request(app.getHttpServer())
            .get('/nodes')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        const expected = [
            '0000100001',
            '0000100002',
            '0000100003',
        ];

        const actual = response.body.nodes.map(
            (node: { name: string }) => node.name,
        );

        expect(response.body.count).toBe(3);
        expect(actual).toEqual(expected);
    });


    it('returns no nodes for a consultation user without scopes', async () => {
        const loginResponse = await request(app.getHttpServer())
            .post('/auth/login')
            .send({
                username: 'f10-e2e-none@test.local',
                password: F10_TEST_PASSWORD,
            })
            .expect(200);

        const token: string = loginResponse.body.access_token;

        expect(token).toBeTruthy();

        const response = await request(app.getHttpServer())
            .get('/nodes')
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(response.body).toEqual({
            count: 0,
            nodes: [],
        });
    });


    it('rejects requests without an authentication token', async () => {
        const response = await request(app.getHttpServer())
            .get('/nodes')
            .expect(401);

        expect(response.body.statusCode).toBe(401);
        expect(response.body.message).toBe(
            'Token not found - Access Denied',
        );
    });
});
