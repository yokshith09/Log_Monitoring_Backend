# Deploying Vantage to Cloud Run

One Cloud Run service serves the API and the built UI from the same origin. That
is deliberate: the frontend and backend are separate code with no cross-imports,
but `web/src/lib/contracts.ts` is a hard contract against `api/server.js`, and
shipping them as one revision makes a version mismatch structurally impossible.

StaySync is a **separate** service in its own repository. Vantage monitors it, so
co-deploying them would mean Vantage's own request logs landing in the telemetry
it is supposed to be reading.

## One-time setup

Set your project and region:

```bash
export PROJECT_ID=your-project-id
export REGION=asia-south1
gcloud config set project $PROJECT_ID
```

Enable the APIs this uses:

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

Create the image repository:

```bash
gcloud artifacts repositories create vantage --repository-format=docker --location=$REGION
```

Create the runtime service account. This is the identity the **running service**
uses, and it is read-only by design — Vantage never writes to the project it
watches:

```bash
gcloud iam service-accounts create vantage-run --display-name="Vantage runtime"

for ROLE in roles/logging.viewer roles/monitoring.viewer; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:vantage-run@$PROJECT_ID.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

Let Cloud Build deploy to Cloud Run and act as that service account:

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
BUILD_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$BUILD_SA" --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
  vantage-run@$PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:$BUILD_SA" --role="roles/iam.serviceAccountUser"
```

## Deploy

Manually, from a clean checkout:

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=SHORT_SHA=$(git rev-parse --short HEAD)
```

`SHORT_SHA` is set automatically when Cloud Build is triggered by a push, so it
only needs passing for a manual run.

## Automate it

Connect the repository once, then every push to `master` deploys:

```bash
gcloud builds triggers create github \
  --name=vantage-master \
  --repo-name=OPS_MIND --repo-owner=yokshith09 \
  --branch-pattern='^master$' \
  --build-config=cloudbuild.yaml
```

## Verify

```bash
URL=$(gcloud run services describe vantage --region=$REGION --format='value(status.url)')
curl -s "$URL/api/meta" | head -c 200     # the service answers
curl -s -o /dev/null -w '%{http_code}\n' "$URL/"   # the UI is served
```

The pipeline already runs a smoke test against `/api/meta` inside Cloud Build, so
a container that builds but does not boot never reaches a revision.

## Rollback

Every revision is suffixed with its commit SHA:

```bash
gcloud run revisions list --service=vantage --region=$REGION
gcloud run services update-traffic vantage --region=$REGION --to-revisions=vantage-<sha>=100
```

## Cost

| Piece | Cost |
|---|---|
| Cloud Run | Free tier: 2M requests, 180k vCPU-sec, 360k GiB-sec per month |
| Artifact Registry | Free under 0.5 GB; this image is well under that |
| Cloud Build | 120 free build-minutes per day |

`--min-instances=0` means an idle service costs nothing between demos. There is
no Cloud SQL instance and no load balancer, which are the two pieces of a GCP
stack that have no free tier.

## Security notes

- `--allow-unauthenticated` makes the dashboard publicly reachable, which a demo
  needs. To restrict it instead, drop that flag from `cloudbuild.yaml` and grant
  `roles/run.invoker` to the accounts that should have access.
- The runtime service account holds **viewer roles only**. Nothing in Vantage
  mutates a cloud resource.
- No secrets are baked into the image. When the live Cloud Logging adapter is
  wired up, credentials come from Secret Manager at runtime via
  `--set-secrets`, never from an environment variable in this file.
- `VANTAGE_SOURCE=sample` is the current source. Switching to live telemetry is
  a change to that one variable plus the adapter behind `api/source.js`.
