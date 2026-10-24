// npm run search:reindex : rebuilds the Elasticsearch index from MongoDB (needs ELASTICSEARCH_URL).
import { runScript } from './run.js';
import { reindexAll } from '../services/searchSync.js';

runScript(async () => {
  const r = await reindexAll();
  console.log(`Reindex complete: ${r.indexed} indexed, ${r.failed} failed.`);
  if (r.failed)
    throw new Error(
      'Some listings failed to index; see logs. They remain marked dirty and will be retried.',
    );
});
