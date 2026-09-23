# SUNWAI (सुनवाई) — Next-Gen AI Civic Governance Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](docker-compose.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg)](https://fastapi.tiangolo.com)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Civic%20Detector-FF6F00.svg)](https://ultralytics.com)

**SUNWAI** is a full-stack, production-grade civic grievance redressal and municipal governance platform. It pairs a **zero-dependency Node.js core server** with a **fine-tuned YOLOv8 visual AI microservice** to deliver instant grievance reporting, automated severity triage, geospatial deduplication, and citizen-verified issue resolution.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |            Citizen Client             |
                                  |   (GPS Pinning, Photo Upload, Map)    |
                                  +-------------------+-------------------+
                                                      |
                                                      v HTTP / REST
+---------------------------------------------------------------------------------------------------------+
|                                        SUNWAI Core Node.js Engine                                       |
|                                                                                                         |
|  +-----------------------+     +-----------------------+     +-----------------------+                  |
|  |   Raycast Ward GIS    |     | Proximity Duplicate   |     |      Trust Loop       |                  |
|  |      Detection        |     |  Aggregation (50m)    |     |  Verification Engine  |                  |
|  +-----------------------+     +-----------------------+     +-----------------------+                  |
|                                                                                                         |
|  +-----------------------+     +-----------------------+     +-----------------------+                  |
|  |     Municipal SLA     |     |  Greedy Dispatcher    |     |  Civic Health Score   |                  |
|  |     Monitor (60s)     |     |   Clusters (200m)     |     |      Aggregator       |                  |
|  +-----------------------+     +-----------------------+     +-----------------------+                  |
+-------------------+-------------------------------------------------+-----------------------------------+
                    |                                                 |
         POST /predict (Base64)                             Dual-Storage Pipeline
                    |                                                 |
                    v                                                 v
+---------------------------------------+         +---------------------------------------+
|        SUNWAI AI Microservice         |         |          Storage Adapters             |
|   (FastAPI + Fine-Tuned YOLOv8)       |         |                                       |
|  - Category Classification            |         |  [Primary] Supabase PostgreSQL        |
|  - Confidence Scoring (>70% threshold)|         |  [Fallback] Local JSON Engine         |
|  - Multi-Object Bounding Boxes        |         |  [Media] Local / Cloud Object Storage |
+---------------------------------------+         +---------------------------------------+
```

---

## 🌟 Key Features

| Capability | Technical Implementation |
|---|---|
| **30-Second Reporting** | Instant grievance lodging with GPS auto-coordinates, category selection, and photo upload. |
| **Real YOLOv8 AI Auto-Triage** | Dedicated FastAPI microservice recognizes `pothole`, `streetlight`, `garbage`, `water_leakage`, and `broken_infrastructure` with localized visual bounding boxes. |
| **Dynamic API Dataset Streaming** | Zero local repository bloat. Streams training datasets on-the-fly via REST, Roboflow Universe, or cloud APIs with auto-purging ephemeral cache. |
| **Autonomous Continuous Learning** | Closed-loop feedback from resolved tickets and citizen verifications triggers automated background fine-tuning and zero-downtime hot-reloads. |
| **Smart Duplicate Engine** | Merges duplicate grievances within **50 meters** into a single canonical issue, preventing department spam while accumulating unique citizen votes and escalating priority. |
| **Geo-Clustered Dispatch** | Groups open issues within **200 meters** using a greedy spatial clustering algorithm (`/api/clusters`) for optimal municipal crew dispatch. |
| **Citizen Trust Loop** | When field workers mark an issue resolved with proof photos, the issue remains in `pending verification` until the citizen confirms resolution. |
| **Civic Health Score** | Ward scores are calculated solely from verified closed tickets, preventing municipal departments from inflating their own resolution metrics. |
| **Tri-Portal Interface** | Dedicated, optimized web interfaces for **Citizens**, **Municipal Administrators**, and **Field Crew** on mobile. |
| **Zero-Lockin Storage** | Dual-mode persistence: works out-of-the-box with local JSON storage (`data/db.json`) and connects seamlessly to **Supabase** when configured. |

---

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       └── ci.yml              # Automated GitHub Actions CI pipeline
├── ai_service/                 # FastAPI + YOLOv8 AI Microservice
│   ├── auto_trainer.py         # Autonomous continual learning & hot-reloading loop
│   ├── civic_detector.py       # Multi-tier visual detection & zero-downtime hot-reloading
│   ├── civic_yolo.pt           # Fine-tuned civic model weights (6.2 MB)
│   ├── dataset_api_client.py   # Remote API dataset streaming client (Roboflow / REST)
│   ├── Dockerfile              # Container definition for AI microservice
│   ├── models/                 # Model checkpoints & training history telemetry
│   ├── requirements.txt        # Python dependencies
│   ├── server.py               # FastAPI inference, feedback & auto-train endpoints
│   └── yolov8n.pt              # Base YOLOv8 weights (6.5 MB)
├── data/
│   ├── db.json                 # Default local seed database
│   └── wards.geojson           # Municipal ward boundary geometries
├── lib/
│   ├── api-sync.js             # Dynamic external API complaint ingestion & stream handler
│   ├── classifier.js           # Resilient AI microservice client with fallback & feedback
│   ├── geo.js                  # Haversine distance, Ray-casting Ward GIS, Greedy Clustering
│   ├── supabase.js             # Native Node.js Supabase REST client
│   └── ward-extractor.js       # Ward boundary detection helper
├── public/                     # Frontend Client Portals
│   ├── admin.html              # Municipal Command Dashboard with AI Learning Hub
│   ├── app.js                  # Shared client logic & map controllers
│   ├── field.html              # Mobile Field Worker Resolution Portal
│   ├── index.html              # Citizen Grievance Portal & Live City Map
│   ├── login.html              # Staff Authentication Portal
│   ├── style.css               # Shared design system styling
│   ├── thankyou.html           # Post-submission confirmation
│   └── vendor/                 # Offline libraries (html2pdf)
├── tests/
│   ├── test_ai_and_duplicates.js             # End-to-end integration test suite
│   └── test_api_streaming_and_learning.js    # API streaming & continual learning test suite
├── .dockerignore
├── .env.example                # Sample environment variables
├── .gitattributes              # Cross-platform line ending normalization
├── .gitignore                  # Git ignore rules
├── CONTRIBUTING.md             # Developer contribution guide
├── docker-compose.yml          # Full-stack multi-container orchestration
├── Dockerfile                  # Core Node.js container definition
├── LICENSE                     # MIT License
├── package.json                # Project manifest & npm scripts
├── Procfile                    # Cloud process declaration (Railway / Heroku / Render)
├── README.md                   # Project documentation
├── render.yaml                 # 1-Click Render deployment blueprint
└── server.js                   # Main Node.js HTTP server & API routes
```

---

## 🚀 Quick Start

### Option 1: Run with Docker Compose (Recommended)

Run the full stack (Node.js web app + FastAPI YOLO AI microservice) with a single command:

```bash
docker compose up --build
```

- **Citizen Portal**: [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- **Field Worker View**: [http://localhost:3000/field.html](http://localhost:3000/field.html)
- **AI Microservice Docs**: [http://localhost:5001/docs](http://localhost:5001/docs)

---

### Option 2: Local Standalone Node.js (Zero Dependencies)

The core SUNWAI platform runs with **pure Node.js** (no `npm install` needed).

```bash
# 1. Start the server
node server.js

# 2. Open in your browser
# http://localhost:3000
```

> **Note**: In standalone mode without the AI service, SUNWAI operates in **manual triage mode**, letting citizens select categories directly with 100% functionality.

---

### Option 3: Full-Stack Local Development with AI

To enable local YOLOv8 visual inference:

**Terminal 1 (AI Microservice):**
```bash
# Navigate to AI service and install dependencies
cd ai_service
pip install -r requirements.txt

# Start the FastAPI service
python server.py --port 5001
```

**Terminal 2 (Web Server):**
```bash
npm start
```

---

## 🧪 Running Tests

Execute the automated test suite verifying health, duplicates, clustering, and the Trust Loop:

```bash
# Ensure server is running (npm start), then in a separate terminal:
npm test
```

---

## 🌐 Cloud Deployment

### Deploy to Render

1. Fork or push this repository to GitHub.
2. In Render, select **New > Blueprint**.
3. Connect your repository. Render will automatically read [`render.yaml`](render.yaml) and configure the web service.

### Deploy to Railway / Heroku

1. Connect your GitHub repository to Railway or Heroku.
2. The included [`Procfile`](Procfile) will automatically start `node server.js`.
3. Set your environment variables (e.g. `PORT=3000`).

### Deploy with Docker

```bash
docker build -t sunwai:latest .
docker run -p 3000:3000 sunwai:latest
```

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` to configure your environment:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for the Node.js server |
| `AI_SERVICE_URL` | `http://127.0.0.1:5001` | URL for the YOLOv8 FastAPI microservice |
| `AI_CONFIDENCE_THRESHOLD` | `0.70` | Confidence cut-off for automated triage |
| `SUPABASE_URL` | _None_ | (Optional) Supabase project URL |
| `SUPABASE_ANON_KEY` | _None_ | (Optional) Supabase anonymous public API key |

---

## 📡 REST API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `GET` | `/api/reports` | List all filed grievances (supports `?wardId=` and `?sortBy=`) |
| `POST` | `/api/reports` | Submit a new grievance (with auto-deduplication & AI triage) |
| `GET` | `/api/reports/:id` | Fetch details for a specific ticket |
| `PATCH` | `/api/reports/:id/status`| Update status (`open` -> `in_progress` -> `resolved`) |
| `POST` | `/api/reports/:id/verify`| Trust Loop citizen confirmation or dispute |
| `POST` | `/api/reports/:id/upvote`| Upvote an existing public issue |
| `GET` | `/api/nearby` | Find issues within 50m radius |
| `GET` | `/api/clusters` | Geo-clustered dispatch groups (200m radius) |
| `GET` | `/api/monthly-report` | Municipal performance summary & SLA metrics |
| `GET` | `/api/ai/status` | Check AI microservice connectivity |
| `POST` | `/api/ai/analyze` | Run standalone visual inference on base64 image |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
