# RITA Knowledge Base Maker (kb_maker_beta2)

Enterprise Knowledge Base generator and Databricks synchronization tool for RITA.

## Production Deployment (Google Cloud Run)

This repository is configured for automated container builds and deployment on Google Cloud Run using Next.js standalone mode.

### Directory Structure
- `kb_maker_beta2/`: Primary Next.js 16 application source code.
- `Dockerfile`: Multi-stage production container build (optimized for Cloud Run).
- `.dockerignore`: Exclusion rules for build artifacts and local secrets.
