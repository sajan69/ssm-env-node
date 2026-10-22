# SSM ENV Node

Small Node.js service for local development and Vercel. Application configuration lives in SSM Parameter Store; Vercel authenticates with OIDC and a read-only IAM role. No EC2, Lambda, S3, or SSM agent required. IAM, STS (OIDC), and KMS support authentication and encryption.

## Layout

- `ENV.example.txt`: committed dummy template.
- `ENV.txt`: ignored local values uploaded to SSM (`ENV.local.txt` is also ignored for migration).
- `.env.example`: bootstrap configuration; copy to ignored `.env.local`.
- `scripts/push-env.js`: explicit, dry-run-first uploader.
- `src/config.js`: batched retrieval, validation, bounded requests, in-memory TTL cache and concurrent request deduplication.
- `api/index.js`: Vercel Node function at `/api`.
- `infra/`: exact-resource IAM policy templates; replace account, region, paths, team and project placeholders.
- `test/`: credential-free tests using injected clients.

## Credential-free demo

```sh
npm ci
npm run demo
```

This runs a real local HTTP server on an ephemeral loopback port with an explicitly injected mock SSM client, asserts 200/405/503/recovery behavior and exits. It needs no AWS account or `.env.local` and never contacts AWS. This mock is available only in the separate demo entry point; the real service never silently falls back to it.

## Local setup (Node 22 or 24)

```sh
npm ci
cp .env.example .env.local
cp ENV.example.txt ENV.txt
```

Edit `.env.local` with your development AWS profile, SSM region and prefix. Edit `ENV.txt` with your own configuration. Authenticate with AWS CLI SSO, for example `aws sso login --profile myapp-development`. Configure the SSO profile first with `aws configure sso` if necessary. Do not use production credentials for development.

The ENV format is one KEY=value per line. Blank lines and full-line comments are accepted. Double-quoted values use JSON escaping. No interpolation, inline comments, multiline strings, shell execution or unknown keys. Do not `source` this file. Add application keys explicitly in `src/env-file.js` and update IAM resource lists when extending the example.

## Upload to Parameter Store

Use a separate provisioner identity with `infra/upload-policy.json`, adjusted to your development path. The runtime role does not need write permission. All uploaded values use SecureString and the default `aws/ssm` key unless `SSM_KMS_KEY_ID` is set.

```sh
npm run env:push
npm run env:push -- --apply
# Explicit replacement of existing parameters:
npm run env:push -- --apply --overwrite
```

Dry run validates locally and makes no AWS requests. Unknown/duplicate flags are rejected; `--overwrite` requires `--apply`. For an existing local file use `npm run env:push -- --file ENV.local.txt`. Existing parameters are not overwritten by default. Writes are sequential and not transactional: a failed upload can leave partial updates. For coordinated multi-value changes, create a new versioned prefix, upload fully, validate, then switch the deployment's prefix. Remove local plaintext values when no longer needed.

A custom KMS key additionally requires appropriately scoped `kms:Encrypt` (upload) and `kms:Decrypt` (runtime), and an authorizing key policy; supplied IAM templates assume the default key. Never give runtime the provisioner's permissions.

```sh
npm start
# In a second terminal:
curl http://localhost:3000/api
```

Local startup validates required SSM values before listening. `PORT` defaults to 3000; later refresh failures return 503. Vercel initializes on the first request and returns a sanitized 503 if configuration fails.

Expected: `{"status":"ok","configurationLoaded":true}`. No secret or app configuration values are returned. The example validates credentials/configuration but does not actually connect to a database or external API.

## Vercel OIDC setup

1. Import this repository as a Vercel project (Other framework; no build command required).
2. Enable/verify Vercel OIDC with **Team issuer mode**. In AWS IAM create an OIDC provider with issuer `https://oidc.vercel.com/TEAM_SLUG` and audience `https://vercel.com/TEAM_SLUG`. If the provider already exists, reuse it.
3. Create a role using the edited `infra/trust-policy.json`. Exact `aud` and `sub` conditions bind it to your team, project and **production** environment. Verify actual Vercel claims match the policy; global issuer mode requires different issuer/condition keys.
4. Attach the edited `infra/read-policy.json` to that role. Upload the production parameters separately with a provisioner identity.
5. Set only these bootstrap variables in Vercel's **Production** environment:

```dotenv
SSM_REGION=ap-southeast-2
SSM_PREFIX=/myapp/production
AWS_ROLE_ARN=arn:aws:iam::123456789012:role/myapp-production
```

6. Deploy, then request `/api`. Do not add permanent AWS access keys to Vercel. Code explicitly selects the Vercel OIDC provider when running there. `SSM_REGION` deliberately avoids Vercel's automatically assigned `AWS_REGION`.
7. Create separate prefixes and roles for preview/development; never broaden production trust to all previews. Local Node uses your SDK credential chain, not the production Vercel role.

## Runtime behavior and limitations

- One GetParameters call loads the three named SecureString values; plaintext, duplicate, foreign or missing parameters fail closed. There is no hierarchy listing or pagination with this fixed schema (GetParameters accepts up to 10 names). When extending beyond 10 keys, implement explicit batching and update the IAM policy/tests first. Values are returned as an immutable config object, not assigned to global `process.env`.
- Cached for 60 seconds per warm process using a monotonic clock. Prefixes are limited to 512 characters and 14 levels, excluding reserved namespaces and dot segments. Each cold instance fetches independently. Failed refreshes return 503 rather than stale secrets.
- SDK attempts are bounded to three, with connection/request timeouts and an 8-second SSM operation abort signal. Credential acquisition involves additional OIDC/STS work and the SSM signal is not a universal deadline for that exchange. Configure the Vercel function duration for your application.
- Rotated secrets can remain cached until expiry. Existing database pools may also need reconnection; this demo does not manage pools or perform rotation.
- No values are logged, returned, bundled into frontend code, or exported via an endpoint. Never add `NEXT_PUBLIC_`/`VITE_` secret exports.
- Use Secrets Manager if automatic rotation is required. Enable AWS audit monitoring according to your account policies. Secret storage does not protect against code already authorized to read the secrets being compromised.

## Verification

```sh
npm test
npm audit --omit=dev --audit-level=high
```

Tests cover parsing, literal values, validation, concurrency, cache expiry, refresh failures/recovery, missing parameters and sanitized HTTP responses. CI runs on Node 22 and 24 without AWS credentials. Live AWS permissions, Vercel OIDC and connectivity must be verified after configuring your accounts; offline tests do not prove those integrations.

## References

- https://vercel.com/docs/oidc/aws
- https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
- https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/ssm/

