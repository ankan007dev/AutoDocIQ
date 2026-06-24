# AutoDocIQ — Autonomous Document Intelligence System

AutoDocIQ is a high-performance, container-free multi-agent document intelligence system built to ingest, analyze, extract, classify, and query business and legal documents. It features an advanced pipeline orchestrator powered by FastAPI, LangChain, Pydantic, and ChromaDB, offering dynamic execution in both **Online Mode** (Live AI via GPT-4o) and **Offline Mode** (Local Heuristics/Regex and TF-IDF fallbacks).

The frontend features a stunning, state-of-the-art **Glassmorphic Slate-Navy Dark Theme** built with Vanilla HTML/CSS/JS, incorporating a virtual log shell to view agent actions in real-time, interactive extraction schema viewers, and full-featured query search and compliance CSV/JSON exports.

---

## Key Features

1. **Dual Vector Store Architecture**: Uses persistent ChromaDB for high-fidelity semantic embeddings, with an automatic fallback to a custom in-memory TF-IDF and Jaccard similarity matcher for environment compatibility.
2. **Cooperative Multi-Agent Pipeline**:
   - **RouterAgent**: Evaluates query intent and dynamically routes tasks to the correct expert agent.
   - **ExtractionAgent**: Leverages strict Pydantic schemas (`InvoiceEntitySchema` and `ContractEntitySchema`) to validate and output structured document metadata.
   - **ClassificationAgent**: Scans document paragraphs to detect legal clauses (Confidentiality, Indemnification, Governing Law, etc.), assess risk levels (Low, Medium, High), and provide legal reasoning.
   - **SemanticQ&AAgent**: Connects context search results with source chunks to synthesize accurate, cited answers.
3. **Graceful Offline Mode**: Run the system immediately out-of-the-box without an OpenAI API Key. Heuristic engines simulate logs and parse properties locally.
4. **Dynamic Log Virtual Terminal**: Simulates real-time system logs directly on the frontend dashboard to track agent execution.
5. **Data Portability**: Clean downloads of structured compliance outputs in CSV and JSON formats.

---

## 📂 Repository Structure

```text
AutoDocIQ/
├── backend/
│   ├── agents.py        # LangChain LLM orchestrator & local mock agents
│   ├── config.py        # Persistent configuration load/save (settings.json)
│   ├── main.py          # FastAPI application server, API endpoints, static assets mount
│   ├── schemas.py       # Pydantic data schemas (Invoices, Contracts, Queries)
│   └── vectorstore.py   # Vector Ingestion & Querying (ChromaDB + InMemory store fallback)
├── data/                # Local data store directory (Ignored by Git)
│   ├── chroma/          # Persistent ChromaDB sqlite database
│   ├── uploads/         # Saved raw documents (*_content.txt) and summaries (*_meta.json)
│   └── settings.json    # Local config store (API Keys, Mode settings)
├── frontend/
│   ├── app.js           # Dynamic UI Controller, API Client, and Log simulator
│   ├── index.html       # Single-page HTML structure
│   └── style.css        # Premium Glassmorphism Dark Theme design stylesheet
├── requirements.txt     # Python dependency list
├── run.py               # Dependency checker and backend Uvicorn runner
└── README.md            # Repository documentation
```

---

## Technical System Architecture

```text
   [ Frontend SPA ] <---> [ FastAPI Server (Port 8000) ]
                                  |
            +---------------------+---------------------+
            |                                           |
    [ Ingestion Pipeline ]                      [ Agent Orchestration ]
            |                                           |
      ChromaDB Vector Store                      LangChain & GPT-4o
      (Fallback: InMemory Store)                 (Fallback: Heuristic Mocks)
            |                                           |
     +------+------+                            +-------+-------+
     |             |                            |               |
   NDA/Contract  Invoice                     Router     Extract / Classify
   Vectors       Vectors                      Agent      QA / Compliance
```

### 1. Document Ingestion Pipeline
1. Uploaded files (PDFs, TXT, MD, CSV, JSON) are parsed natively. PDFs use `pypdf` extraction.
2. The parsed document is split into 1000-character chunks with a 150-character overlap using LangChain's `RecursiveCharacterTextSplitter`.
3. Chunks are converted to embeddings and stored in ChromaDB (or indexed in `InMemoryVectorStore` via term frequencies if ChromaDB bindings are unavailable).

### 2. Multi-Agent Orchestration Flow
- **Ingestion Analysis**: Upon upload, the document is sent to `analyze_document` which triggers:
  - **ExtractionAgent** to run structured extraction according to document domain and schema requirements.
  - **ClassificationAgent** to segment clauses and determine legal risks.
- **RAG Chat Mode**: When a user queries the document:
  - **RouterAgent** intercepts and routes the query to `extraction`, `classification`, or `qa`.
  - The mapped agent evaluates the document content (or executes vector search context retrieval) and synthesizes the response, complete with citation references.

---

## Getting Started

### Prerequisites
Ensure you have **Python 3.8+** installed on your system.

### Running the System

To run the application, execute the unified launcher `run.py` in your terminal:

```bash
python run.py
```

#### What `run.py` does:
1. Performs a pre-flight check of all required dependencies (`fastapi`, `uvicorn`, `langchain`, `langchain-openai`, `pydantic`, `chromadb`, `python-multipart`, `pandas`, `pypdf`).
2. Installs any missing dependencies automatically using `pip`.
3. Launches the FastAPI server via Uvicorn on **`http://localhost:8000`** with automatic code-reloads enabled.

Open `http://localhost:8000` in your web browser to access the dashboard.

---

## Mode Settings (Online / Offline)
- By default, the system boots into **Offline Heuristic Mode** if no OpenAI API Key is configured.
- Click the **API Configuration** (gear icon) in the UI to add your OpenAI API Key and toggle **Live AI Mode** to leverage GPT-4o for live multi-agent reasoning, semantic Q&A citations, and risk modeling.
- Settings are saved locally to `data/settings.json`.

---

## License
This project is licensed under the MIT License.
