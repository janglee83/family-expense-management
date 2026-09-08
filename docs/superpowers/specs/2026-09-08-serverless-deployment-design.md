# Serverless Deployment Architecture — Design Spec

Date: 2026-09-08
Branch: `feature/serverless-deployment` (to be created)

## Context

The app needs to go live for a small, real user base (~10 family members) with genuinely low, sporadic traffic — not a 24/7 always-busy workload. An earlier exploration compared always-on compute options (AWS EC2 with self-hosted or managed Postgres, Google Cloud Compute Engine, Hetzner, DigitalOcean, Oracle Cloud Free Tier) and found every always-on option lands somewhere in the $8-30/month range, because the dominant cost driver is paying for a server to sit idle most of the day, not actual usage. Since this app's real traffic pattern doesn't need constant uptime, a scale-to-zero serverless architecture fits far better and can bring the ongoing cost close to $0/month.

This phase replaces the Docker Compose-based always-on stack (`postgres`, `redis`, `backend`, `worker`, `frontend` containers) with AWS Lambda + managed serverless SaaS backends, keeping the application code itself essentially unchanged.

A prior exploration also considered Google Cloud (Compute Engine + Cloud SQL/self-hosted + Firebase Hosting) and found it lands at a similar cost to the AWS self-hosted option (~$9-12/month) with no meaningful price advantage for this scale, except Firebase Hosting's free built-in HTTPS — a benefit AWS's own S3+CloudFront combination also provides. Google Sheets as a database backend was explicitly considered and rejected: the app's financial-integrity requirements (integer money, `CHECK`/`UNIQUE`/FK constraints, atomic multi-row updates) require a real relational database with transactions, which Sheets cannot provide without effectively rebuilding the backend from scratch and accepting real data-integrity risk.

## Goals

- Ongoing infrastructure cost of roughly **$0-3/month** for the current ~10-user, low-traffic scale, by using services that scale to zero or have a permanent free tier at this volume.
- The existing FastAPI application code runs on AWS Lambda **without a rewrite** — no route logic changes, no ORM/model changes.
- Keep a real, ACID-compliant PostgreSQL database (via Neon.tech) — no compromise on the data-integrity guarantees every phase so far has depended on.
- Keep the existing login rate-limiting behavior (Redis-backed, Phase 2) working, backed by a serverless-compatible Redis (Upstash) instead of an always-on Redis container.
- Frontend served over HTTPS via CloudFront, with the origin (S3) kept private — no public S3 website bucket.
- Everything provisionable via Terraform (`infra/`), continuing the IaC direction already started, rather than manual console clicking.

## Non-goals (explicitly deferred)

- **Any background/async job processing.** The receipt-upload flow's Celery task is removed entirely, not replaced with a serverless equivalent (SQS + a second Lambda) — the task currently does no real work (OCR was abandoned in a prior phase), so there's nothing to run asynchronously. If a future phase reintroduces genuinely heavy background work (e.g., real OCR), that phase should design its own async pipeline at that time — SQS + a dedicated Lambda is the natural fit then, but building it now with nothing to process would be premature.
- **Custom domain / ACM certificate provisioning.** The design supports adding one later (CloudFront + ACM in `us-east-1`), but this phase ships on the default CloudFront/API Gateway-issued endpoints.
- **Multi-region, high-availability, or auto-scaling tuning beyond Lambda's own defaults.** Not warranted at this scale.
- **VPC networking for Lambda.** Neon and Upstash are both reached over the public internet (both require TLS, both are designed for exactly this access pattern) — no VPC, no NAT gateway (NAT gateways have a real hourly cost that would undermine the whole point of this phase).
- **Blue/green or canary Lambda deployments.** A single `update-function-code` per deploy is enough at this scale; if a bad deploy ships, roll back by redeploying the previous image tag.

## Decided design

### Architecture overview

| Component | Before (Docker Compose) | After (serverless) |
|---|---|---|
| Backend (FastAPI) | `backend` container, Uvicorn | AWS Lambda (container image, via Lambda Web Adapter) behind API Gateway (HTTP API) |
| Receipt-upload processing | `worker` container + Celery + Redis broker | Removed — status update happens synchronously in the request handler |
| Database | `postgres` container | Neon.tech (serverless Postgres, pooled connection) |
| Login rate-limiting store | `redis` container | Upstash Redis (serverless, TLS) |
| Receipt image storage | MinIO (already disabled in the current compose file) | S3 (private bucket) |
| Frontend | `frontend` container (Vite dev server) | Static build, S3 (private) + CloudFront |

Nothing in this architecture runs continuously except the data stored in S3/Neon/Upstash — Lambda, API Gateway, and CloudFront all bill per-request/per-use, and Neon/Upstash both scale their own compute to zero when idle.

### Backend changes

- **Lambda Web Adapter**: a new `backend/Dockerfile.lambda` (separate from the existing dev-focused `backend/Dockerfile`, mirroring how Phase 6 already established a separate `Dockerfile.ocr-worker` for a different runtime target) copies the [AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) binary into the image as a Lambda extension and keeps the existing `uvicorn app.main:app` command as the container's `CMD`. The adapter translates API Gateway HTTP events into real HTTP requests against the app's Uvicorn server running inside the Lambda execution environment, and translates the response back — the FastAPI route code itself needs zero changes.
- **Remove Celery entirely**: delete `backend/app/worker.py`; remove `celery` from `backend/pyproject.toml`'s dependencies; remove the `worker` service from `docker-compose.yml`. In `backend/app/api/v1/receipts.py`, the `await run_in_threadpool(process_receipt.delay, str(receipt.id))` call is replaced with setting `receipt.status = ReceiptStatus.PROCESSING.value` directly in the same request/transaction that creates the receipt row — no separate task, no queue.
- **Database connection**: `DATABASE_URL` points at Neon's **pooled** connection string (the `-pooler` hostname variant Neon provides), not the direct connection string — Lambda's per-invocation connection pattern can otherwise exhaust Postgres's connection limit quickly. No other code change; the app already uses `postgresql+psycopg://`, which Neon supports directly (TLS is on by default in Neon's connection string).
- **Redis connection**: `REDIS_URL` points at Upstash's `rediss://` (TLS) endpoint. `redis-py` (already the underlying client) supports `rediss://` natively — no code change.
- **Storage (`backend/app/core/storage.py`)**: `MinioReceiptStorage`'s constructor currently always takes an explicit `endpoint_url`. Add a code path where, in production, `endpoint_url` is `None`/omitted so `boto3` resolves AWS's real S3 endpoint for the configured region, rather than pointing at a MinIO-style custom endpoint. Also make `_ensure_bucket()`'s automatic `create_bucket` call skip/no-op when the bucket already exists and the caller lacks `s3:CreateBucket` permission (in production, the bucket is created by Terraform ahead of time; the Lambda execution role is granted only scoped read/write/delete on that specific bucket, not account-wide bucket-creation rights — least privilege).

### Frontend

Built as static files (`pnpm run build`, unchanged), stored in a **private** S3 bucket, served through CloudFront using Origin Access Control (OAC) — CloudFront is the only principal allowed to read the bucket; there is no public bucket policy. This is both more secure and gives free HTTPS via CloudFront's default domain, without needing S3's own static-website-hosting feature (which cannot serve HTTPS at all).

### Infrastructure (Terraform, `infra/`)

The existing EC2-oriented files are superseded:
- `compute.tf` (EC2 instance, its security group's SSH/8000 ingress rules, the EC2 IAM role) is removed — there's no EC2 instance to secure or manage anymore.
- `storage.tf` keeps the receipts bucket as-is. The frontend bucket's configuration changes from "public website hosting with a public-read bucket policy" to a private bucket with an OAC-scoped policy restricting reads to the CloudFront distribution's ARN.
- A new `lambda.tf` adds: an `aws_ecr_repository` for the Lambda container image; an `aws_iam_role` for Lambda execution (CloudWatch Logs write access + read/write/delete scoped to the receipts S3 bucket only); an `aws_lambda_function` with `package_type = "Image"`; an `aws_apigatewayv2_api` (HTTP API, cheaper than the older REST API type) with a catch-all `$default` route forwarding every request to the Lambda (FastAPI already does its own internal routing, so API Gateway doesn't need per-route configuration); an `aws_lambda_permission` allowing API Gateway to invoke the function.
- A new `cdn.tf` adds the CloudFront distribution (OAC-based S3 origin) for the frontend bucket.

**Bootstrap ordering constraint, called out explicitly so it isn't a surprise mid-deploy:** `aws_lambda_function` with `package_type = "Image"` requires the referenced ECR image to already exist at `terraform apply` time — Terraform can create the empty ECR repository, but the very first image push has to happen (manually, or via a one-off CI run) *before* the Lambda function resource itself can be created. Every deploy after that first one is a normal `update-function-code` against the already-existing function.

### CI/CD

A new GitHub Actions workflow, `.github/workflows/deploy.yml`, triggered on push to `main`:
1. Build the backend's Lambda container image (`docker build -f backend/Dockerfile.lambda`) and push it to ECR (AWS auth via GitHub's OIDC federation to an IAM role scoped to this pipeline — no long-lived AWS access keys stored as secrets).
2. Point the Lambda function at the new image (`aws lambda update-function-code`).
3. Run `alembic upgrade head` against Neon directly from the CI runner (Neon is reachable over the public internet; the connection string is a GitHub Actions secret).
4. Build the frontend (`pnpm run build`), sync the output to the frontend S3 bucket (`aws s3 sync`), and invalidate the CloudFront distribution's cache so the new build is served immediately rather than waiting out the CDN's TTL.

## Cost estimate

At the current ~10-user, low-traffic scale, using each service's free tier:

| Component | Free tier | Expected cost |
|---|---|---|
| AWS Lambda | 1M requests + 400,000 GB-seconds/month, permanent | $0 |
| API Gateway (HTTP API) | 1M requests/month free for the first 12 months only; $1.00/million after | $0 for 12 months, then a few cents/month |
| Neon.tech | 0.5GB storage + ~190 compute-hours/month, permanent free tier | $0 |
| Upstash Redis | 10,000 commands/day, permanent free tier | $0 |
| S3 (receipts + frontend) | 5GB + request allowance free for 12 months | $0 for 12 months, then ~$0-1/month |
| CloudFront | 1TB transfer/month free for 12 months; cheap per-GB after | $0 for 12 months, then likely still ~$0 at this traffic |
| **Total** | | **~$0-2/month now, ~$0-3/month after the 12-month mark** |

If usage grows well beyond 10 users, every one of these components scales its cost with actual usage rather than jumping to a fixed higher tier — there's no cliff to plan around the way there was with an always-on EC2+RDS setup.

## Security invariants

- The Lambda execution role is scoped to exactly what it needs: CloudWatch Logs write access and read/write/delete on the receipts S3 bucket only — no broader S3, no other AWS service access.
- The frontend S3 bucket has no public access of any kind; only CloudFront (via OAC) can read from it.
- Both external data stores (Neon, Upstash) are accessed exclusively over TLS (`postgresql+psycopg://...?sslmode=require` via the pooled connection string; `rediss://`) — credentials for both live only as Lambda environment variables / GitHub Actions secrets, never in code or Terraform state committed to the repo.
- CI/CD authenticates to AWS via OIDC-federated short-lived credentials, not static access keys.

## Testing / verification plan

- After the backend changes (Celery removal, storage.py's production/dev endpoint split) land, the existing backend test suite (unit + integration, run against Docker Compose's Postgres/Redis as today) must still pass unchanged — this phase changes *deployment*, not application behavior, so no test's expected behavior should change. The one exception: any test that asserted `process_receipt.delay(...)` was called on upload must be updated to assert the synchronous status update instead.
- A manual smoke test against the deployed Lambda (via its API Gateway URL) covering: register, log in, create a family, create an expense, upload a receipt — confirms the Lambda Web Adapter round-trip, the Neon pooled connection, and S3 access all work together in the real deployed environment, not just locally.
- `terraform plan` reviewed before every `terraform apply` on the real AWS account, as with any infrastructure change.

## Acceptance criteria

- The app is reachable at a public API Gateway URL and a public CloudFront URL, both serving real traffic end-to-end (register → log in → use the app), with no server process required to be running when nobody is using it.
- `docker-compose.yml` no longer has a `worker` service; `backend/app/worker.py` no longer exists; the `celery` dependency is gone from `backend/pyproject.toml`.
- The backend test suite passes unchanged (aside from the one Celery-call assertion update noted above).
- AWS Console/CloudWatch shows the Lambda function's concurrent executions and duration drop to zero between periods of use — no fixed always-on cost is being incurred.
- `infra/` provisions the full stack (ECR, Lambda, API Gateway, S3 buckets, CloudFront, IAM roles) via `terraform apply` from a clean AWS account, modulo the documented first-image-push bootstrap step.
