import { SSMClient } from '@aws-sdk/client-ssm';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { settings } from './env-file.js';

export function createClient(env = process.env) {
  const { region } = settings(env);
  return new SSMClient({
    region,
    maxAttempts: 3,
    requestHandler: new NodeHttpHandler({ connectionTimeout: 1500, requestTimeout: 3000 }),
    // Local development uses the SDK credential chain (e.g. AWS SSO).
    ...(env.VERCEL ? { credentials: awsCredentialsProvider({ roleArn: env.AWS_ROLE_ARN }) } : {}),
  });
}
