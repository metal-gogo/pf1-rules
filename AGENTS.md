# Feat ingestion

When running `scripts/run-qwen-feat-ingestion.sh <COUNT>` through a Bash tool,
set the tool's `timeout` argument to `7200000` milliseconds (two hours).
This is a tool argument, not a shell-script flag. Large batches can exceed
the default 30-minute tool limit while fetching source websites.

Run from the repository root. COUNT means the next COUNT feats. On failure,
report the error and the script's resume command; do not start a new batch.
The wrapper validates and signs its own batch commit. Never bypass Git signing.
