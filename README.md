# k8s-azure-demo

A minimal Node.js REST API to practice end-to-end **Kubernetes** deployments with an **Azure DevOps** CI/CD pipeline.

---

## Project structure

```
.
├── src/
│   ├── app.js           # Express API (endpoints + health probes)
│   ├── db/itemsDb.js    # PostgreSQL-backed data access layer
│   └── app.test.js      # Jest unit tests
├── k8s/
│   ├── base/            # Shared Kubernetes manifests
│   └── overlays/
│       ├── dev/         # Development-specific patches
│       └── prod/        # Production-specific patches
├── Dockerfile           # Multi-stage build (non-root user)
├── docker-compose.yml   # Local app + PostgreSQL stack
├── .dockerignore
├── azure-pipelines.yml  # CI → build/test → push to ACR → deploy to AKS
├── package.json
└── .gitignore
```

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js 20+ | Run the app locally |
| Docker | Build and run the container — install on both Ubuntu nodes |
| kubectl | Apply Kubernetes manifests — install on master node |
| kubeadm | Used to bootstrap the cluster (1 master + 1 worker, Ubuntu) |
| A container registry | Store Docker images — Docker Hub, GitHub Container Registry, or a self-hosted registry |
| Azure DevOps project | Run the pipeline |
| Azure Pipelines self-hosted agent | Install on the master node (or a third Ubuntu machine) so the pipeline can reach your cluster |

### Cluster setup reminder (kubeadm on Ubuntu)

```bash
# On both nodes — install container runtime + kubeadm/kubelet/kubectl
sudo apt-get update && sudo apt-get install -y docker.io kubeadm kubelet kubectl

# On master only — bootstrap the control plane
sudo kubeadm init --pod-network-cidr=192.168.0.0/16
mkdir -p $HOME/.kube && sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config

# Install a CNI (e.g. Calico)
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml

# On worker only — join the cluster (use the token printed by kubeadm init)
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

---

## Run locally

```bash
npm install
npm start
# API available at http://localhost:3000
```

### Database configuration

- The API supports two database modes via `DB_PROVIDER`:
  - `postgres` (recommended for local/dev/prod)
  - `memory` (used by tests and safe fallback mode)
- PostgreSQL connection variables:
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- The app auto-creates and seeds the `items` table on startup if it is empty.

### Run with Docker Compose (app + PostgreSQL)

```bash
docker compose up --build

# API
curl http://localhost:3000/health
curl http://localhost:3000/api/items
```

To stop and remove containers:

```bash
docker compose down
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe |
| GET | `/api/items` | List all items |
| GET | `/api/items/:id` | Get item by id |
| POST | `/api/items` | Create an item `{ name, price }` |

---

## Run tests

```bash
npm test
```

---

## Build & run with Docker

```bash
# Build
docker build -t k8s-azure-demo:local .

# Run
docker run -p 3000:3000 k8s-azure-demo:local

# Verify
curl http://localhost:3000/health
```

---

## Deploy to Kubernetes (on-premise cluster)

> For local manual deploys, use overlays with Kustomize.

```bash
# Deploy prod overlay
kubectl apply -k k8s/overlays/prod

# Deploy dev overlay
# kubectl apply -k k8s/overlays/dev

# Watch rollout
kubectl rollout status deployment/k8s-azure-demo -n k8s-azure-demo

# Access via NodePort — find your worker node IP first
kubectl get nodes -o wide
# Then open: http://<worker-node-ip>:30080/health
# Ingress is included in the overlay manifests
```

---

## Azure Pipelines setup (on-premise cluster)

### 1. Install a self-hosted agent on your master node

```bash
# On the master Ubuntu node
mkdir myagent && cd myagent
curl -O https://vstsagentpackage.azureedge.net/agent/3.x.x/vsts-agent-linux-x64-3.x.x.tar.gz
tar zxvf vsts-agent-linux-x64-*.tar.gz
./config.sh   # follow prompts: DevOps org URL, PAT token, pool name "on-premise-agents"
sudo ./svc.sh install && sudo ./svc.sh start
```

### 2. Create a Variable Group named `k8s-azure-demo-vars` in *Pipelines → Library*:
- `ACR_NAME` — your registry host (e.g. `docker.io/myuser` or `myregistry.example.com`)
- `ACR_REPO` — `k8s-azure-demo`
- `DB_USER` — PostgreSQL user (mark this variable as secret)
- `DB_PASSWORD` — PostgreSQL password (mark this variable as secret)

### 3. Create two Service Connections in *Project Settings → Service connections*:
- **`ACR_SERVICE_CONNECTION`** — Docker Registry type → point to your registry
- **`K8S_SERVICE_CONNECTION`** — Kubernetes type → choose **KubeConfig** → paste the contents of `~/.kube/config` from your master node

### 4. Create a new Pipeline pointing to `azure-pipelines.yml`.

### 5. *(Optional)* Add an **approval gate** to the `production` environment in *Pipelines → Environments*.

### Pipeline stages

```
Push to main
    │
    ▼
[CI Stage]  — runs on self-hosted agent (master node)
  ├─ Install Node.js & run Jest tests
  ├─ Publish test & coverage results
  └─ Docker build + push to registry (tagged with Build.BuildId)
    │
    ▼
[Deploy Stage]  ← manual approval gate (optional)
  ├─ Apply namespace + DB secret
  ├─ Deploy prod overlay (app + postgres resources, image tag injected)
  └─ Patch deployment annotation (audit trail)
```

### Manual Kubernetes secret setup

If you deploy with `kubectl apply -k ...` manually, create the database credentials secret first:

```bash
kubectl create secret generic k8s-azure-demo-secrets \
  --from-literal=DB_USER='postgres' \
  --from-literal=DB_PASSWORD='<your-postgres-password>' \
  -n k8s-azure-demo \
  --dry-run=client -o yaml | kubectl apply -f -
```

---

## Things to practice

- [ ] Scale the deployment: `kubectl scale deployment k8s-azure-demo --replicas=4 -n k8s-azure-demo`
- [ ] Trigger a rolling update by bumping `APP_VERSION` and pushing to `main`
- [ ] Add a Kubernetes `HorizontalPodAutoscaler` in `k8s/`
- [ ] Add a `Secret` for a database password and mount it as an env var
- [ ] Add a staging environment stage to `azure-pipelines.yml`
- [ ] Set up branch protection + PR checks using the `pr:` trigger
- [ ] Enable `imagePullSecrets` in the deployment to pull from a private ACR
