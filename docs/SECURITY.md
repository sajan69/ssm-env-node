# Security model and architecture

This document describes the configuration service's trust boundaries, access controls, failure behavior and limitations. Live AWS/Vercel integration requires account-specific verification.

## Data flow and boundaries

| Boundary | Data and control |
| --- | --- |
| Local operator to SSM | Ignored `ENV.txt` is parsed as literal data, validated against three keys, then uploaded only with `--apply`. A separate provisioner has exact-resource PutParameter access. |
| Runtime to AWS | Local execution uses the standard SDK credential chain, preferably SSO/temporary credentials. Vercel explicitly uses its OIDC provider and an environment-specific role. |
| SSM to application | Exact-name GetParameters retrieves decrypted SecureString values. Schema/type/name checks produce an immutable object. No global process.env mutation is needed. |
| Application to HTTP client | `/api` exposes readiness only. It never returns the config object. Unsupported methods receive 405, unknown local routes 404, and config failures 503. |

The application uses SSM without requiring EC2, Lambda, an SSM agent or S3. IAM and KMS remain part of AWS access/encryption; Vercel OIDC uses STS. This is not independence from every AWS service.

## Threats and mitigations

| Threat | Implemented mitigation | Residual risk |
| --- | --- | --- |
| Secrets accidentally committed | Clearly named dummy template; real ENV.txt and .env files ignored | Ignore rules are not secret scanning. Force-add, shell history, old commits and backups can still leak data. |
| Unsafe bulk replacement | Dry-run default, explicit apply/overwrite, allowlisted keys, unknown flags rejected | Writes are sequential, not atomic. A timeout may leave a write completed remotely without acknowledgement. |
| Overbroad runtime access | Runtime policy lists three exact resource ARNs and GetParameters only | IAM/key policies must be edited and tested in the real account. The default KMS key has different isolation properties from a customer-managed key. |
| Unexpected plaintext or schema drift | Reject non-SecureString, duplicates, foreign names and missing/invalid values | A principal allowed to overwrite these exact values can still supply malicious but schema-valid values. |
| Credential exposure on host | Prefer temporary credentials; production OIDC role is environment-scoped | Compromised application code can read the secrets it is legitimately authorized to use. Storage encryption cannot prevent this. |
| SSM outage or removed access | Bounded SDK attempts/timeouts, single in-flight read, fail before local listen, fail closed after expiry | OIDC/STS credential acquisition is additional work; the SSM abort signal is not an end-to-end credential deadline. Availability is traded for avoiding stale secrets. |
| Rotation delay | 60-second per-process TTL with monotonic expiry | Cold instances cache independently. This demo does not rotate credentials or reconnect database pools. |

## Key design decisions

- Exact-name reads fit the fixed three-key schema and least-privilege IAM. GetParameters supports up to 10 names and is not paginated. GetParametersByPath is intentionally not used; AWS warns that recursive parent-path access exposes descendants even with a child deny.
- The cache is one loader per warm process, not distributed storage. Concurrent cold requests share a pending promise. Failed reads clear the pending operation for retry; expired secrets are not served on refresh failure.
- Public errors/logs use fixed messages. Internal upload errors retain only the acknowledged-write count. Do not serialize config objects or AWS error causes when extending the demo.
- The offline demo injects its fake client through a separate entry point. There is no production environment variable that silently enables mock fallback.
- A versioned prefix is the documented migration strategy for coordinated multi-value changes. Automatic rollback, refresh notifications and automatic credential rotation are outside scope.

## Optional live verification

Use a dedicated development account/prefix and synthetic values. Verify the edited runtime role can read only the three intended parameters, cannot write, and cannot access another environment. Verify the provisioner cannot be used by the running service. For Vercel, confirm actual issuer, audience and subject claims, and that preview deployments cannot assume the production role. Check custom KMS permissions separately when used. Remove temporary data after testing. None of these account-specific checks were performed by the offline suite.

## Primary references, reviewed 23 October 2026

- [AWS GetParameters contract](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParameters.html)
- [AWS GetParametersByPath recursive-access warning](https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_GetParametersByPath.html)
- [AWS Node.js credential chain and short-term credential guidance](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html)
- [Vercel AWS OIDC integration](https://vercel.com/docs/oidc/aws)
- [AWS secrets security-posture recommendations, 1 October 2026](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-secrets-manager-security-posture-recommendations/): current context for improving secrets hygiene; this SSM demo does not implement that Secrets Manager feature.
