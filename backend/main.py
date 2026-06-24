import os
import json
import uuid
import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import io
import pandas as pd

from backend.config import settings
from backend.schemas import QueryRequest, QueryResponse
from backend.vectorstore import ingest_document, search_context, CHROMA_AVAILABLE
from backend.agents import analyze_document, run_query, reset_live_pipeline

try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

app = FastAPI(
    title="AutoDocIQ Backend",
    description="Autonomous Document Intelligence System Backend APIs",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_doc_meta_path(doc_id: str) -> str:
    return os.path.join(settings.UPLOAD_DIR, f"{doc_id}_meta.json")

def get_doc_content_path(doc_id: str) -> str:
    return os.path.join(settings.UPLOAD_DIR, f"{doc_id}_content.txt")

def read_document_content(doc_id: str) -> str:
    path = get_doc_content_path(doc_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Document content not found")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def list_documents_meta() -> list:
    docs = []
    for file in os.listdir(settings.UPLOAD_DIR):
        if file.endswith("_meta.json"):
            try:
                with open(os.path.join(settings.UPLOAD_DIR, file), "r", encoding="utf-8") as f:
                    docs.append(json.load(f))
            except Exception:
                pass
    docs.sort(key=lambda x: x.get("upload_time", ""), reverse=True)
    return docs

def extract_text_from_pdf(file_bytes: bytes) -> str:
    if not HAS_PYPDF:
        return "Error: PyPDF is not installed on this system. Unable to extract text from PDF."
    
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text.append(f"--- Page {i+1} ---\n{page_text}")
        return "\n\n".join(text)
    except Exception as e:
        return f"Error extracting PDF content: {str(e)}"


@app.get("/api/health")
def health_check():
    api_key_masked = ""
    if settings.OPENAI_API_KEY:
        key = settings.OPENAI_API_KEY
        api_key_masked = f"sk-...{key[-4:]}" if len(key) > 8 else "present"
    return {
        "status": "healthy",
        "mock_mode": settings.MOCK_MODE,
        "chroma_available": CHROMA_AVAILABLE,
        "has_api_key": bool(settings.OPENAI_API_KEY),
        "api_key_masked": api_key_masked,
        "timestamp": datetime.datetime.now().isoformat()
    }

@app.post("/api/settings")
def update_settings(payload: dict = Body(...)):
    """Updates OpenAI API key and Mock/Live Mode in config and triggers reset."""
    api_key = payload.get("openai_api_key", settings.OPENAI_API_KEY).strip()
    mock_mode = payload.get("mock_mode", settings.MOCK_MODE)
    
    settings.save_settings(api_key, mock_mode)
    reset_live_pipeline()
    
    api_key_masked = ""
    if settings.OPENAI_API_KEY:
        key = settings.OPENAI_API_KEY
        api_key_masked = f"sk-...{key[-4:]}" if len(key) > 8 else "present"
        
    return {
        "status": "success",
        "mock_mode": settings.MOCK_MODE,
        "chroma_available": CHROMA_AVAILABLE,
        "has_api_key": bool(settings.OPENAI_API_KEY),
        "api_key_masked": api_key_masked
    }


@app.get("/api/documents")
def get_documents():
    """Lists all uploaded documents."""
    return list_documents_meta()

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    """Handles PDF and text file uploads, processes chunks and runs agents."""
    filename = file.filename
    filename_lower = filename.lower()
    content_bytes = await file.read()
    if filename_lower.endswith(".pdf"):
        file_type = "pdf"
        content = extract_text_from_pdf(content_bytes)
        if content.startswith("Error:"):
            raise HTTPException(status_code=400, detail=content)
    elif filename_lower.endswith((".txt", ".md", ".json", ".csv")):
        file_type = filename_lower.split(".")[-1]
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                content = content_bytes.decode("latin-1")
            except Exception:
                raise HTTPException(status_code=400, detail="Unable to decode file content as text.")
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, TXT, MD, CSV, or JSON.")

    if not content.strip():
        raise HTTPException(status_code=400, detail="The uploaded document is empty.")

    doc_id = str(uuid.uuid4())
    
    chunk_count = ingest_document(doc_id, content, filename)
    
    analysis = analyze_document(doc_id, content, file_type)
    
    with open(get_doc_content_path(doc_id), "w", encoding="utf-8") as f:
        f.write(content)
        
    meta = {
        "document_id": doc_id,
        "filename": filename,
        "file_type": file_type,
        "status": "processed",
        "chunk_count": chunk_count,
        "upload_time": datetime.datetime.now().isoformat(),
        "summary": analysis["summary"],
        "entities": analysis["entities"],
        "clauses": analysis["clauses"],
        "agent_logs": analysis["logs"]
    }
    
    with open(get_doc_meta_path(doc_id), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    return meta

@app.get("/api/documents/{doc_id}")
def get_document_details(doc_id: str):
    """Retrieves metadata, structured entities, clauses and logs for a document."""
    meta_path = get_doc_meta_path(doc_id)
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Document not found")
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)

@app.delete("/api/documents/{doc_id}")
def delete_document(doc_id: str):
    """Deletes a document metadata, content, and its vector embeddings."""
    meta_path = get_doc_meta_path(doc_id)
    content_path = get_doc_content_path(doc_id)
    
    deleted_any = False
    
    if os.path.exists(meta_path):
        try:
            os.remove(meta_path)
            deleted_any = True
        except Exception as e:
            print(f"Error removing metadata file {meta_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete metadata: {str(e)}")
            
    if os.path.exists(content_path):
        try:
            os.remove(content_path)
            deleted_any = True
        except Exception as e:
            print(f"Error removing content file {content_path}: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to delete content: {str(e)}")
            
    try:
        from backend.vectorstore import delete_document_vectors
        delete_document_vectors(doc_id)
    except Exception as e:
        print(f"Error deleting vectors for {doc_id}: {e}")
        
    if not deleted_any:
        raise HTTPException(status_code=404, detail="Document not found on disk")
        
    return {"status": "success", "message": f"Document {doc_id} and its vector indices deleted successfully."}


@app.post("/api/documents/{doc_id}/query", response_model=QueryResponse)
def query_document(doc_id: str, request: QueryRequest):
    """Runs a semantic query using vector search and the LangChain pipeline."""
    meta_path = get_doc_meta_path(doc_id)
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    content = read_document_content(doc_id)
    result = run_query(doc_id, request.question, content)
    
    return QueryResponse(
        answer=result["answer"],
        context_chunks=result["context_chunks"],
        agent_logs=result["agent_logs"]
    )

@app.get("/api/documents/{doc_id}/export")
def export_document_data(doc_id: str, format: str = "json"):
    """Exports structured document analysis as JSON or CSV."""
    meta_path = get_doc_meta_path(doc_id)
    if not os.path.exists(meta_path):
        raise HTTPException(status_code=404, detail="Document not found")
        
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
        
    entities = meta.get("entities", {}).get("data", {})
    clauses = meta.get("clauses", [])
    
    if format == "csv":
        output = io.StringIO()
        
        if meta.get("entities", {}).get("schema_type") == "invoice":
            df_items = pd.DataFrame(entities.get("line_items", []))
            df_items["invoice_number"] = entities.get("invoice_number", "")
            df_items["supplier"] = entities.get("supplier", "")
            df_items["buyer"] = entities.get("buyer", "")
            df_items["total_amount"] = entities.get("total_amount", "")
            df_items.to_csv(output, index=False)
            filename = f"autodociq_{doc_id}_invoice_items.csv"
        else:
            df_clauses = pd.DataFrame(clauses)
            df_clauses["document"] = meta["filename"]
            df_clauses.to_csv(output, index=False)
            filename = f"autodociq_{doc_id}_clauses.csv"
            
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        return JSONResponse(
            content=meta,
            headers={"Content-Disposition": f"attachment; filename=autodociq_{doc_id}_meta.json"}
        )


SAMPLE_NDA_TEXT = """MUTUAL NON-DISCLOSURE AGREEMENT
This Mutual Non-Disclosure Agreement ("Agreement") is made and entered into as of May 10, 2026 ("Effective Date"), by and between TechNexus Solutions Inc., a Delaware corporation, and AeroSpace Global Corp., a California corporation.

1. Purpose. The parties wish to evaluate a potential business relationship concerning enterprise cloud integration ("Purpose"). In connection with the Purpose, each party may disclose to the other party certain proprietary and confidential information.

2. Confidential Information. "Confidential Information" means any information disclosed by a disclosing party to a receiving party that is marked as confidential or that should reasonably be understood to be confidential, including without limitation non-public source code, machine learning parameters, database configuration profiles, and customer lists.

3. Obligations. The receiving party shall hold all Confidential Information in strict confidence and shall not disclose it to any third party. The receiving party shall use the Confidential Information solely for the Purpose.

4. Exclusions. Confidential Information does not include information that: (a) is or becomes publicly known through no breach of this Agreement; (b) was already in the receiving party's possession; or (c) is independently developed without reference to the disclosing party's Confidential Information.

5. Indemnification & Liability. Each party agrees to indemnify and hold harmless the other party from any damages arising from a breach of this Agreement. Under no circumstances shall either party's aggregate liability under this agreement exceed Five Hundred Thousand Dollars ($500,000).

6. Term and Termination. This Agreement shall expire one (1) year from the Effective Date. The obligations of confidentiality hereunder shall survive for a period of three (3) years post-termination of this Agreement. Either party may terminate this agreement without cause upon thirty (30) business days written notice.

7. Governing Law. This Agreement shall be governed by, and construed in accordance with, the laws of the State of California, exclusive of its choice of law rules. Exclusive jurisdiction for any disputes shall reside in the state and federal courts located in San Francisco County, California.
"""

SAMPLE_INVOICE_TEXT = """INVOICE
Alpha Cloud Solutions LLC
100 Tech Venture Way, Suite 400
Austin, TX 78701
Email: billing@alphacloud.com

BILL TO:
Apex Global Enterprises Inc
Attn: Accounts Payable
500 Financial Plaza
New York, NY 10005

Invoice Number: INV-2026-904
Issue Date: 2026-06-15
Due Date: 2026-07-15
Currency: USD

LINE ITEMS:
-------------------------------------------------------------------------------------
1. Premium Enterprise API Deployment (Quantity: 1) - Unit Price: $12,500.00 - Amount: $12,500.00
2. Dedicated Vector Node Hosting - ChromaDB Cluster (Quantity: 1) - Unit Price: $2,500.00 - Amount: $2,500.00
3. Custom Multi-Agent Orchestrator Maintenance (Quantity: 1) - Unit Price: $850.00 - Amount: $850.00
-------------------------------------------------------------------------------------

Subtotal: $15,850.00
Tax (8%): $1,268.00
Total Amount Due: $17,118.00

Thank you for your business. Payment terms are Net 30 days. Late payments are subject to a 1.5% monthly interest fee.
"""

@app.on_event("startup")
def seed_sample_data():
    """Seeds sample documents in the uploads directory on system startup."""
    existing_docs = list_documents_meta()
    
    if not any(d["filename"] == "sample_nda.txt" for d in existing_docs):
        print("Seeding sample_nda.txt...")
        doc_id = "sample-nda-uuid-2026"
        chunk_count = ingest_document(doc_id, SAMPLE_NDA_TEXT, "sample_nda.txt")
        analysis = analyze_document(doc_id, SAMPLE_NDA_TEXT, "txt")
        
        with open(get_doc_content_path(doc_id), "w", encoding="utf-8") as f:
            f.write(SAMPLE_NDA_TEXT)
            
        meta = {
            "document_id": doc_id,
            "filename": "sample_nda.txt",
            "file_type": "txt",
            "status": "processed",
            "chunk_count": chunk_count,
            "upload_time": datetime.datetime.now().isoformat(),
            "summary": analysis["summary"],
            "entities": analysis["entities"],
            "clauses": analysis["clauses"],
            "agent_logs": analysis["logs"]
        }
        with open(get_doc_meta_path(doc_id), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    if not any(d["filename"] == "sample_invoice.txt" for d in existing_docs):
        print("Seeding sample_invoice.txt...")
        doc_id = "sample-invoice-uuid-2026"
        chunk_count = ingest_document(doc_id, SAMPLE_INVOICE_TEXT, "sample_invoice.txt")
        analysis = analyze_document(doc_id, SAMPLE_INVOICE_TEXT, "txt")
        
        with open(get_doc_content_path(doc_id), "w", encoding="utf-8") as f:
            f.write(SAMPLE_INVOICE_TEXT)
            
        meta = {
            "document_id": doc_id,
            "filename": "sample_invoice.txt",
            "file_type": "txt",
            "status": "processed",
            "chunk_count": chunk_count,
            "upload_time": (datetime.datetime.now() + datetime.timedelta(seconds=1)).isoformat(),
            "summary": analysis["summary"],
            "entities": analysis["entities"],
            "clauses": analysis["clauses"],
            "agent_logs": analysis["logs"]
        }
        with open(get_doc_meta_path(doc_id), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)


os.makedirs(os.path.join(settings.BASE_DIR, "frontend"), exist_ok=True)

app.mount("/", StaticFiles(directory=os.path.join(settings.BASE_DIR, "frontend"), html=True), name="frontend")
