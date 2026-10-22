import { createClient } from '../src/aws.js';
import { createConfigLoader } from '../src/config.js';
import { settings } from '../src/env-file.js';
import { createHandler } from '../src/handler.js';

// Lazy initialization keeps configuration failures inside the sanitized handler.
let load;
export default createHandler(async () => {
  load ??= createConfigLoader({ client: createClient(), prefix: settings().prefix });
  return load();
});
