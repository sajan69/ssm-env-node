# Project progress

Status: offline implementation complete. Live AWS/Vercel access requires account-specific verification.

## Implemented

- [x] Node.js service, Vercel OIDC adapter and exact-resource IAM examples.
- [x] Ignored local ENV files and a clearly named dummy template.
- [x] Dry-run uploader with explicit apply/overwrite controls and partial-failure handling.
- [x] Encrypted SSM response validation, schema checks and cache boundary handling.
- [x] Configuration validation before the local server listens.
- [x] Credential-free HTTP demo with outage and recovery scenarios.
- [x] Reproducible cache evaluation and CI on Node 22/24.
- [x] Security model, setup instructions and technical limitations.

## Verification

24 tests cover configuration, upload controls, response validation and HTTP behavior.
The offline demo checks 200 readiness, 405 on unsupported methods, 503 during an expired-cache outage, and recovery to 200.
The controlled evaluation made 2 mock SSM calls versus 300 isolated-loader calls across 300 configuration requests.
See the [evaluation method](README.md#cache-evaluation), [recorded output](docs/evaluation.json) and [CI](https://github.com/sajan69/ssm-env-node/actions/workflows/ci.yml).

## Optional integration checks

- Validate edited IAM and custom KMS policies in a development account.
- Verify actual Vercel OIDC issuer, audience and subject claims.
- Confirm environment isolation and runtime read-only permissions.

Automatic rotation, database pool management and a general-purpose secrets platform are outside the current scope.
