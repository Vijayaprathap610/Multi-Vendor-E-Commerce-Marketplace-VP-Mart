// Imported before helpers so Elasticsearch mode is configured when the app config loads.
process.env.ELASTICSEARCH_URL = 'http://127.0.0.1:19200';
process.env.ES_INDEX = 'vpmart_test_listings';
