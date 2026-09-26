import { testDatabaseUrl } from './test-database';

// Runs before each e2e file: the app under test (ConfigModule) sees the test database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.LOG_LEVEL = 'error';
