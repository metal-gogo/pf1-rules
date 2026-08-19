DROP INDEX "ingestion_queue_entity_name_site_id_key";

CREATE UNIQUE INDEX "ingestion_queue_entity_name_site_id_catalog_id_key"
ON "ingestion_queue"("entity_name", "site_id", "catalog_id");
