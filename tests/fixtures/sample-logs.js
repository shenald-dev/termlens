export const JEST_NOISY_FIXTURE = `
  PASS  src/utils/math.test.ts (1.24s)
  PASS  src/utils/string.test.ts (0.85s)
  PASS  src/utils/array.test.ts (0.42s)
  PASS  src/utils/crypto.test.ts (1.10s)
  PASS  src/utils/date.test.ts (0.64s)
  PASS  src/auth/hash.test.ts (2.10s)
  PASS  src/auth/session.test.ts (1.45s)
  PASS  src/auth/permissions.test.ts (0.95s)
  PASS  src/auth/rbac.test.ts (1.30s)
  PASS  src/database/client.test.ts (3.40s)
  PASS  src/database/pool.test.ts (2.15s)
  PASS  src/database/migrations.test.ts (1.80s)
  PASS  src/services/email.test.ts (1.12s)
  PASS  src/services/sms.test.ts (0.88s)
  PASS  src/services/billing.test.ts (2.05s)
  PASS  src/services/stripe.test.ts (1.67s)
  PASS  src/services/invoicing.test.ts (1.22s)
  PASS  src/api/health.test.ts (0.42s)
  PASS  src/api/metrics.test.ts (0.55s)
  PASS  src/api/users.test.ts (1.89s)
  PASS  src/api/profiles.test.ts (1.15s)
  PASS  src/api/products.test.ts (2.15s)
  PASS  src/api/categories.test.ts (0.75s)
  PASS  src/api/orders.test.ts (3.01s)
  PASS  src/api/checkout.test.ts (2.44s)
  PASS  src/api/webhooks.test.ts (1.92s)
  PASS  src/middleware/auth.test.ts (0.91s)
  PASS  src/middleware/cors.test.ts (0.35s)
  PASS  src/middleware/rate-limit.test.ts (1.15s)
  PASS  src/middleware/logging.test.ts (0.48s)
  FAIL  src/auth/jwt.test.ts (4.15s)
  ● AuthModule › JWT Verification › should reject expired token signature

    expect(received).toBe(expected) // Object.is equality

    Expected: 401
    Received: 200

      40 |     const expiredToken = createTestToken({ exp: Date.now() - 10000 });
      41 |     const response = await request(app).get('/api/protected').set('Authorization', expiredToken);
    > 42 |     expect(response.status).toBe(401);
         |                             ^
      43 |     expect(response.body.error).toMatch(/expired/i);
      44 |   });
      45 | });

      at Object.<anonymous> (src/auth/jwt.test.ts:42:29)
      at Promise.then.completed (node_modules/jest-circus/build/utils.js:298:28)
      at new Promise (<anonymous>)
      at callAsyncCircusFn (node_modules/jest-circus/build/utils.js:231:10)
      at _callCircusTest (node_modules/jest-circus/build/run.js:316:40)
      at processTicksAndRejections (node:internal/process/task_queues:95:5)
      at _runTest (node_modules/jest-circus/build/run.js:252:3)
      at _runTestsForTestFile (node_modules/jest-circus/build/run.js:141:13)
      at _recursivelyProcessTestFiles (node_modules/jest-circus/build/run.js:77:9)
      at runAndTransformResultsToJestFormat (node_modules/jest-circus/build/legacy-code-todo-rewrite/jestAdapterInit.js:122:21)

Test Suites: 1 failed, 10 passed, 11 total
Tests:       1 failed, 84 passed, 85 total
Snapshots:   0 total
Time:        12.452 s
Ran all test suites.
`;

export const TSC_NOISY_FIXTURE = `
src/server/auth.ts(45,12): error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
src/server/auth.ts(88,5): error TS2322: Type 'number' is not assignable to type 'string'.
src/database/schema.ts(120,18): error TS2554: Expected 3 arguments, but got 2.
src/services/payment.ts(14,9): error TS2304: Cannot find name 'StripeClient'.
`;

export const PYTEST_NOISY_FIXTURE = `
============================= test session starts =============================
platform win32 -- Python 3.11.0, pytest-7.4.0, pluggy-1.2.0
rootdir: D:\\projects\\backend
collected 42 items

tests/test_health.py ....                                                [  9%]
tests/test_users.py ...........                                          [ 35%]
tests/test_auth.py ..F.......                                            [ 59%]
tests/test_db.py .................                                       [100%]

================================== FAILURES ===================================
_________________________ test_token_expiration __________________________

    def test_token_expiration():
        token = generate_expired_token()
>       res = verify_token(token)
E       assert 401 == 200
E        +  where 401 = <Response [401]>.status_code

tests/test_auth.py:48: AssertionError
=========================== short test summary info ===========================
FAILED tests/test_auth.py::test_token_expiration - AssertionError: assert 401 == 200
======================== 1 failed, 41 passed in 2.34s =========================
`;

export const DOCKER_NOISY_FIXTURE = `
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 542B done
#2 [internal] load metadata for docker.io/library/node:20-alpine
#3 [internal] load .dockerignore
#3 transferring context: 2B done
#4 [1/4] FROM docker.io/library/node:20-alpine
#5 [2/4] WORKDIR /app
#6 [3/4] COPY package*.json ./
#7 [4/4] RUN npm ci --omit=dev
#7 4.123 npm ERR! code ERESOLVE
#7 4.124 npm ERR! ERESOLVE unable to resolve dependency tree
#7 4.125 npm ERR! Found: react@19.0.0
#7 4.125 npm ERR! node_modules/react
#7 4.126 npm ERR! Could not resolve dependency:
#7 4.126 npm ERR! peer react@"^18.0.0" from react-dom-confetti@0.0.1
------
 > [4/4] RUN npm ci --omit=dev:
4.123 npm ERR! code ERESOLVE
4.124 npm ERR! ERESOLVE unable to resolve dependency tree
------
Dockerfile:14
--------------------
  12 |     COPY package*.json ./
  13 |     
  14 | >>> RUN npm ci --omit=dev
  15 |     COPY . .
  16 |     EXPOSE 3000
--------------------
ERROR: failed to solve: process "/bin/sh -c npm ci --omit=dev" did not complete successfully: exit code: 1
`;
