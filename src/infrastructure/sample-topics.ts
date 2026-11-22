import type { Topic } from '../domain/topic'

const createdAt = '2026-11-19T12:00:00.000Z'

function sample(id: string, title: string, description: string, content: string): Topic {
  return { id, title, description, content, createdAt, updatedAt: createdAt }
}


export const sampleTopics = [
  sample('data-engineering', 'Data Engineering', 'Design and operate reliable pipelines for collecting, processing, and serving data.',
    '## Pipeline design\n\nIdentify data owners, consumers, and freshness requirements before choosing ingestion and transformation tools.\n\n- Separate raw ingestion from curated models.\n- Make transformations reproducible and safe to rerun.\n- Assign an owner and define alerts for each production dataset.'),
  sample('cdc', 'Change Data Capture (CDC)', 'Capture database changes and publish them as events for downstream systems.',
    '## Objectives\n\n- [x] Replicate inserts, updates, and deletes with low latency.\n- [x] Preserve the order of changes for each record.\n- [x] Make downstream writes safe to replay.\n- [x] Monitor replication lag and schema changes.\n\n## Implementation guidelines\n\nRead committed changes from the database transaction log. Start with a consistent snapshot and continue from its corresponding log position. Use a stable record key and persist offsets after processing.\n\n```text\nSource:       PostgreSQL write-ahead log\nConnector:    Debezium\nTransport:    Kafka topics keyed by primary key\nConsumer:     Idempotent upserts and deletes\nMonitoring:   Replication lag and connector health\n```\n\n## Example event\n\n```json\n{\n  "operation": "update",\n  "key": { "orderId": 42 },\n  "after": { "status": "shipped" }\n}\n```'),
  sample('apache-kafka', 'Apache Kafka', 'A distributed event log for durable, partitioned streams.',
    '## Event streaming\n\nOrganize events into topics and choose a message key based on the ordering guarantees consumers need. Kafka preserves order within each partition.\n\n- Set retention for the expected replay window.\n- Monitor consumer lag and partition balance.\n- Define compatibility rules for event schemas.'),
  sample('lakehouse', 'Lakehouse Architecture', 'Combine object storage with managed tables for analytical workloads.',
    '## Table design\n\nUse a table format that tracks snapshots and supports atomic writes. Keep raw data available for replay and publish curated tables with documented contracts.\n\nSchedule compaction and snapshot retention around query patterns and recovery requirements.'),
  sample('data-quality', 'Data Quality', 'Define measurable checks for the accuracy, completeness, and freshness of datasets.',
    '## Quality checks\n\n| Check | Example |\n| --- | --- |\n| Uniqueness | One row per order ID |\n| Completeness | Every order has a status |\n| Freshness | Latest load is less than one hour old |\n\nAssign an owner to each check and record the response expected when it fails.'),
]
