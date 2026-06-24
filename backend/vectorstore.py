import os
import uuid
import re
from typing import List, Dict, Any, Tuple
from backend.config import settings

try:
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    USE_LANGCHAIN_SPLITTER = True
except ImportError:
    USE_LANGCHAIN_SPLITTER = False

CHROMA_AVAILABLE = False
try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    CHROMA_AVAILABLE = True
except ImportError:
    print("ChromaDB library not installed. Falling back to built-in InMemoryVectorStore.")

class InMemoryVectorStore:
    """A clean, pure-Python fallback vector store that uses TF-IDF similarity.
    Ensures zero dependency failures on environment setups without ChromaDB binary bindings.
    """
    def __init__(self):
        self.documents: Dict[str, List[Dict[str, Any]]] = {}
        print("InMemoryVectorStore initialized.")

    def add_chunks(self, doc_id: str, chunks: List[str], filename: str):
        if doc_id not in self.documents:
            self.documents[doc_id] = []
        for i, chunk in enumerate(chunks):
            self.documents[doc_id].append({
                "id": f"{doc_id}_chunk_{i}",
                "text": chunk,
                "metadata": {"filename": filename, "chunk_index": i}
            })

    def query(self, doc_id: str, query_text: str, limit: int = 3) -> List[Dict[str, Any]]:
        if doc_id not in self.documents or not self.documents[doc_id]:
            return []
        
        chunks = self.documents[doc_id]
        def get_terms(text: str) -> set:
            return set(re.findall(r'\w+', text.lower()))

        q_terms = get_terms(query_text)
        if not q_terms:
            return chunks[:limit]

        scored_chunks = []
        for chunk in chunks:
            c_terms = get_terms(chunk["text"])
            intersection = q_terms.intersection(c_terms)
            union = q_terms.union(c_terms)
            score = len(intersection) / len(union) if union else 0.0
            scored_chunks.append((chunk, score))
        
        scored_chunks.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for chunk, score in scored_chunks[:limit]:
            results.append({
                "text": chunk["text"],
                "score": round(1.0 - score, 4),
                "metadata": chunk["metadata"]
            })
        return results


class ChromaVectorStore:
    """ChromaDB implementation of the vector store."""
    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.CHROMA_DIR)
        print(f"ChromaDB PersistentClient loaded at {settings.CHROMA_DIR}")

    def add_chunks(self, doc_id: str, chunks: List[str], filename: str):
        collection_name = f"doc_{doc_id.replace('-', '_')}"
        collection_name = re.sub(r'[^a-zA-Z0-9_]', '', collection_name)[:60]
        
        collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )
        
        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]
        metadatas = [{"filename": filename, "chunk_index": i} for i in range(len(chunks))]
        
        collection.add(
            documents=chunks,
            metadatas=metadatas,
            ids=ids
        )

    def query(self, doc_id: str, query_text: str, limit: int = 3) -> List[Dict[str, Any]]:
        collection_name = f"doc_{doc_id.replace('-', '_')}"
        collection_name = re.sub(r'[^a-zA-Z0-9_]', '', collection_name)[:60]
        try:
            collection = self.client.get_collection(name=collection_name)
            res = collection.query(
                query_texts=[query_text],
                n_results=limit
            )
            
            results = []
            if res and res["documents"] and len(res["documents"][0]) > 0:
                for i in range(len(res["documents"][0])):
                    results.append({
                        "text": res["documents"][0][i],
                        "score": round(res["distances"][0][i], 4) if "distances" in res and res["distances"] else 0.5,
                        "metadata": res["metadatas"][0][i] if "metadatas" in res and res["metadatas"] else {}
                    })
            return results
        except Exception as e:
            print(f"Error querying Chroma collection: {e}")
            return []

_in_memory_store = None
_chroma_store = None

def get_db_store():
    global _in_memory_store, _chroma_store
    if settings.MOCK_MODE or not CHROMA_AVAILABLE:
        if _in_memory_store is None:
            _in_memory_store = InMemoryVectorStore()
        return _in_memory_store
    else:
        if _chroma_store is None:
            try:
                _chroma_store = ChromaVectorStore()
            except Exception as e:
                print(f"Error initializing ChromaDB: {e}. Falling back to InMemoryVectorStore.")
                if _in_memory_store is None:
                    _in_memory_store = InMemoryVectorStore()
                return _in_memory_store
        return _chroma_store


def split_text(text: str) -> List[str]:
    """Helper to partition a document text into smaller chunks."""
    if USE_LANGCHAIN_SPLITTER:
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=150,
            length_function=len
        )
        return splitter.split_text(text)
    else:
        chunks = []
        words = text.split()
        current_chunk = []
        current_length = 0
        for word in words:
            current_chunk.append(word)
            current_length += len(word) + 1
            if current_length >= 900:
                chunks.append(" ".join(current_chunk))
                current_chunk = current_chunk[-15:]
                current_length = sum(len(w) + 1 for w in current_chunk)
        if current_chunk:
            chunks.append(" ".join(current_chunk))
        return chunks

def ingest_document(doc_id: str, content: str, filename: str) -> int:
    """Splits and indexes document content in the active vector store."""
    chunks = split_text(content)
    if not chunks:
        chunks = [content]
        
    global _in_memory_store
    if _in_memory_store is None:
        _in_memory_store = InMemoryVectorStore()
    _in_memory_store.add_chunks(doc_id, chunks, filename)
    
    if CHROMA_AVAILABLE:
        global _chroma_store
        if _chroma_store is None:
            try:
                _chroma_store = ChromaVectorStore()
            except Exception as err:
                print(f"Chroma init failed during ingest: {err}")
        if _chroma_store is not None:
            try:
                _chroma_store.add_chunks(doc_id, chunks, filename)
                print(f"Ingested document {doc_id} into ChromaDB collection.")
            except Exception as err:
                print(f"Chroma DB ingestion failed: {err}")
                
    return len(chunks)

def search_context(doc_id: str, query: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Performs similarity search in ChromaDB or InMemory store, with automatic fallbacks."""
    try:
        store = get_db_store()
        results = store.query(doc_id, query, limit=limit)
        
        if not results and isinstance(store, ChromaVectorStore):
            print("Chroma query returned no results. Falling back to InMemoryVectorStore...")
            global _in_memory_store
            if _in_memory_store is not None:
                results = _in_memory_store.query(doc_id, query, limit=limit)
        return results
    except Exception as e:
        print(f"Error querying vector store: {e}. Falling back to InMemoryVectorStore.")
        if _in_memory_store is not None:
            return _in_memory_store.query(doc_id, query, limit=limit)
        return []

def delete_document_vectors(doc_id: str):
    """Deletes document chunks from active vector stores."""
    global _in_memory_store
    if _in_memory_store is not None and doc_id in _in_memory_store.documents:
        del _in_memory_store.documents[doc_id]
        print(f"Deleted document {doc_id} from InMemoryVectorStore.")
        
    if CHROMA_AVAILABLE:
        global _chroma_store
        if _chroma_store is None:
            try:
                _chroma_store = ChromaVectorStore()
            except Exception as err:
                print(f"Chroma init failed during delete: {err}")
        if _chroma_store is not None:
            try:
                collection_name = f"doc_{doc_id.replace('-', '_')}"
                collection_name = re.sub(r'[^a-zA-Z0-9_]', '', collection_name)[:60]
                _chroma_store.client.delete_collection(name=collection_name)
                print(f"Deleted ChromaDB collection {collection_name} for document {doc_id}.")
            except Exception as err:
                print(f"Chroma DB collection deletion failed or did not exist: {err}")


