DROP INDEX "source_observations_site_id_entity_id_content_sha256_key";

CREATE UNIQUE INDEX "source_observations_site_id_entity_id_content_sha256_parser_name_parser_version_key"
ON "source_observations"("site_id", "entity_id", "content_sha256", "parser_name", "parser_version");
