# Kubernetes deploy and run commands

All commands target the local `docker-desktop` context. The committed CronJobs
ship in `--dry-run`, so everything below is safe and needs no secrets.

## 0. Prerequisites

Enable Kubernetes in Docker Desktop (Settings -> Kubernetes -> Enable Kubernetes),
then confirm the context and that the image exists locally:

```sh
kubectl config use-context docker-desktop
kubectl get nodes
docker build -t lead-engine-k8s:0.1.0 .
```

The CronJobs use `imagePullPolicy: IfNotPresent`, so they run the locally built
image without a registry.

## 1. Apply the manifests

Apply in order (namespace, then config, then the CronJobs):

```sh
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/10-configmap.yaml
kubectl apply -f k8s/20-cronjob-naples.yaml
kubectl apply -f k8s/21-cronjob-fortmyers.yaml
```

Confirm:

```sh
kubectl get cronjobs -n lead-engine
# NAME                     SCHEDULE    TIMEZONE           SUSPEND   ACTIVE
# lead-engine-fort-myers   0 6 * * 1   America/New_York   False     0
# lead-engine-naples       0 0 * * 1   America/New_York   False     0
```

## 2. Trigger a manual run (dry-run, in-cluster)

You do not have to wait until Monday. Create a one-off Job from a CronJob:

```sh
kubectl create job --from=cronjob/lead-engine-naples test-run -n lead-engine
kubectl wait --for=condition=complete job/test-run -n lead-engine --timeout=120s
kubectl logs job/test-run -n lead-engine
```

Same for the other region:

```sh
kubectl create job --from=cronjob/lead-engine-fort-myers test-run-fm -n lead-engine
kubectl wait --for=condition=complete job/test-run-fm -n lead-engine --timeout=120s
kubectl logs job/test-run-fm -n lead-engine
```

Clean up the manual Jobs:

```sh
kubectl delete job test-run test-run-fm -n lead-engine
```

## 3. Going live (optional)

Live runs need real credentials and the `--dry-run` arg removed.

1. Create the Secret from your gitignored `.env` (never committed):

   ```sh
   # Windows
   ./scripts/create-secret.ps1
   # Linux / macOS
   ./scripts/create-secret.sh
   ```

2. Remove `"--dry-run"` from the `args` list in both CronJob manifests, then
   re-apply them.

3. Update `k8s/10-configmap.yaml` (`GOOGLE_SHEET_ID`, notify addresses) and the
   per-region segment lists to your real values, then re-apply.

## 4. Teardown

```sh
kubectl delete namespace lead-engine
```

This removes the CronJobs, ConfigMaps, Secret, and any Jobs in one step.
