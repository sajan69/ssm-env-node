# Portfolio evidence and learning guide

## Readiness

The bounded offline implementation is complete and suitable as a clearly labelled portfolio demonstration for software engineer and cloud/security analyst applications. It is not evidence of production usage, a live AWS/Vercel deployment, automatic rotation or real-world incident prevention. Before using first-person resume claims, run the demo, review the code, make your own changes and be ready to explain them.

AI assistance: implementation, tests and documentation in this iteration were generated and checked with an AI coding assistant under Sajan Adhikari's direction. Local tests were actually executed; account-specific AWS/OIDC validation was not. Describe this contribution honestly in interviews rather than presenting it as unaided authorship.

## Evidence

On 23 October 2026, Node v24.19.0 on Linux x64 passed 24 tests, the HTTP demo and npm's production-dependency audit (0 reported vulnerabilities at that time). The GitHub CI workflow also runs tests, demo, evaluation and audit on Node 22/24; inspect the actual run before claiming either CI job passed. Audit results change and are not a guarantee of security.

Run:

```sh
npm ci --ignore-scripts
npm test
npm run demo
npm run evaluate
```

The controlled evaluation uses 300 configuration requests in three waves of 100, at simulated times 0, 100 and 60,000 ms. The baseline constructs an isolated loader for every request; the comparison shares one loader with a 60-second TTL. Mock SSM calls were 300 versus 2, a 99.33% reduction in this workload only. The cached waves made 1, 0 and 1 calls. See [recorded output](evaluation.json). This is a synthetic API-call-count comparison, not a measured latency, AWS bill or production throughput improvement. A fresh run may report a different Node/platform field while preserving deterministic counts.

The offline HTTP demo verifies startup before listening, 200 readiness, 405 on writes, 503 after an expired-cache outage, and recovery to 200. The expected `configuration_unavailable` log during its injected outage is deliberate and contains no secret values.

## Resume bullet candidates

Adapt these only after personally reviewing and reproducing the work. Keep the project labelled AI-assisted where appropriate; do not claim live deployment or business adoption.

- Software engineering: Built and tested an AI-assisted Node.js configuration service with immutable validation, concurrent-request coalescing and fail-closed startup; verified 24 automated tests and a credential-free HTTP demo.
- Cloud security: Implemented exact-resource IAM examples, SecureString upload/read validation and an optional Vercel OIDC adapter, separating provisioner and runtime access; documented threat boundaries and live-validation gaps.
- Performance evidence: Reduced mock SSM calls from 300 to 2 across a reproducible 300-request, single-process workload using TTL caching and request coalescing; published the evaluation method and limitations.

## Interview walkthrough

1. Explain the problem: a Node service should retrieve centrally stored config without needing AWS compute or long-lived credentials on the hosting platform.
2. Trace input to output: ENV.example.txt -> ignored ENV.txt -> explicit uploader -> three SecureString parameters -> loader -> immutable config -> readiness-only HTTP response.
3. Explain identity: local SSO/default chain versus Vercel OIDC/STS; exact-resource read policy versus a separate uploader policy. Show why authorized malicious runtime code remains a risk.
4. Demonstrate failure behavior: startup refusal, expiry, unavailable SSM, sanitized 503, then recovery. Distinguish mock SDK failures from a live IAM denial.
5. Explain the measured result: three 100-request waves and two shared-loader reads. Discuss multiple instances, cold starts, retry amplification and why lower mock call counts do not prove lower latency.
6. Discuss tradeoffs: 60 seconds of potential stale secrets, no atomic multi-key update, no automatic rotation, no database connectivity check, and no arbitrary hierarchy discovery.

## Learn and modify

Read `src/env-file.js`, `src/upload.js`, `src/config.js`, `src/local-server.js`, then `src/aws.js` and `api/index.js`. Trace one failure test in each matching test file. Run the offline commands above and explain every result before editing the code.

Suggested personal exercises: add one non-secret application setting and update validation, fixtures, IAM resource lists and tests; change the TTL in the evaluator and predict the call counts; add a test demonstrating a newly identified failure mode. For a live demo, follow the optional verification section in [SECURITY.md](SECURITY.md) using synthetic values and a separate development prefix. Capture only sanitized outputs.
