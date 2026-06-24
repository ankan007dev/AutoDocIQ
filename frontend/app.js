

const API_BASE = "/api";


const state = {
  documents: [],
  activeDocId: null,
  activeDocData: null,
  chatHistories: {}, 
  settings: {
    mock_mode: false,
    has_api_key: false,
    api_key_masked: ""
  },
  deleteTargetId: null
};


const DOM = {
  statusIndicator: document.getElementById("statusIndicator"),
  uploadZone: document.getElementById("uploadZone"),
  fileInput: document.getElementById("fileInput"),
  uploadBtn: document.getElementById("uploadBtn"),
  uploadProgress: document.getElementById("uploadProgress"),
  
  docCount: document.getElementById("docCount"),
  docList: document.getElementById("docList"),
  
  welcomeScreen: document.getElementById("welcomeScreen"),
  dashboardWrapper: document.getElementById("dashboardWrapper"),
  
  activeDocName: document.getElementById("activeDocName"),
  activeDocMeta: document.getElementById("activeDocMeta"),
  headerActions: document.getElementById("headerActions"),
  metaId: document.getElementById("metaId"),
  metaChunks: document.getElementById("metaChunks"),
  metaType: document.getElementById("metaType"),
  
  btnExportJson: document.getElementById("btnExportJson"),
  btnExportCsv: document.getElementById("btnExportCsv"),
  summaryText: document.getElementById("summaryText"),
  
  tabBtns: document.querySelectorAll(".tab-btn"),
  tabPanes: document.querySelectorAll(".tab-pane"),
  
  
  nodeRouter: document.getElementById("node-router"),
  nodeExtract: document.getElementById("node-extract"),
  nodeClassify: document.getElementById("node-classify"),
  nodeQA: document.getElementById("node-qa"),
  terminalLogs: document.getElementById("terminalLogs"),
  btnClearLogs: document.getElementById("btnClearLogs"),
  
  
  entitySchemaLabel: document.getElementById("entitySchemaLabel"),
  entityFieldsContainer: document.getElementById("entityFieldsContainer"),
  rawJsonCode: document.getElementById("rawJsonCode"),
  
  
  clausesContainer: document.getElementById("clausesContainer"),
  
  
  chatHistory: document.getElementById("chatHistory"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  citationCount: document.getElementById("citationCount"),
  citationsContainer: document.getElementById("citationsContainer"),

  
  btnSettingsToggle: document.getElementById("btnSettingsToggle"),
  settingsModal: document.getElementById("settingsModal"),
  btnSettingsClose: document.getElementById("btnSettingsClose"),
  btnSettingsCancel: document.getElementById("btnSettingsCancel"),
  btnSettingsSave: document.getElementById("btnSettingsSave"),
  inputApiKey: document.getElementById("inputApiKey"),
  btnToggleKeyVisibility: document.getElementById("btnToggleKeyVisibility"),
  modeLive: document.getElementById("modeLive"),
  modeMock: document.getElementById("modeMock"),
  modeLiveLabel: document.getElementById("modeLiveLabel"),
  modeMockLabel: document.getElementById("modeMockLabel"),
  statusApiKeyVal: document.getElementById("statusApiKeyVal"),
  statusChromaVal: document.getElementById("statusChromaVal"),

  
  deleteConfirmModal: document.getElementById("deleteConfirmModal"),
  btnDeleteConfirmClose: document.getElementById("btnDeleteConfirmClose"),
  btnDeleteConfirmCancel: document.getElementById("btnDeleteConfirmCancel"),
  btnDeleteConfirmProceed: document.getElementById("btnDeleteConfirmProceed"),
  deleteTargetName: document.getElementById("deleteTargetName")
};


window.addEventListener("DOMContentLoaded", async () => {
  setupEventListeners();
  await checkHealth();
  await fetchDocuments();
});


async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    
    state.settings = {
      mock_mode: data.mock_mode,
      has_api_key: data.has_api_key,
      api_key_masked: data.api_key_masked
    };
    
    const dot = DOM.statusIndicator.querySelector(".pulse-dot");
    const text = DOM.statusIndicator.querySelector(".status-text");
    
    if (data.status === "healthy") {
      if (data.mock_mode) {
        dot.className = "pulse-dot orange";
        text.textContent = "OFFLINE MOCK MODE";
      } else {
        dot.className = "pulse-dot green";
        text.textContent = "LIVE AI MODE";
      }
    } else {
      dot.className = "pulse-dot orange";
      text.textContent = "DEGRADED STATE";
    }
    
    updateModalHealthDisplay(data);
  } catch (err) {
    console.error("Health check error:", err);
    const dot = DOM.statusIndicator.querySelector(".pulse-dot");
    const text = DOM.statusIndicator.querySelector(".status-text");
    dot.className = "pulse-dot red";
    text.textContent = "OFFLINE (NO BACKEND)";
  }
}

function updateModalHealthDisplay(data) {
  if (!DOM.statusApiKeyVal || !DOM.statusChromaVal) return;
  
  if (data.has_api_key) {
    DOM.statusApiKeyVal.innerHTML = `<span class="dot-indicator green"></span> Active (${data.api_key_masked})`;
  } else {
    DOM.statusApiKeyVal.innerHTML = `<span class="dot-indicator red"></span> Missing`;
  }
  
  if (data.chroma_available) {
    DOM.statusChromaVal.innerHTML = `<span class="dot-indicator green"></span> Available`;
  } else {
    DOM.statusChromaVal.innerHTML = `<span class="dot-indicator red"></span> Unavailable`;
  }
}

function openSettingsModal() {
  if (state.settings.mock_mode) {
    DOM.modeMock.checked = true;
    DOM.modeMockLabel.classList.add("selected");
    DOM.modeLiveLabel.classList.remove("selected");
  } else {
    DOM.modeLive.checked = true;
    DOM.modeLiveLabel.classList.add("selected");
    DOM.modeMockLabel.classList.remove("selected");
  }
  
  if (state.settings.has_api_key) {
    DOM.inputApiKey.value = "";
    DOM.inputApiKey.placeholder = `${state.settings.api_key_masked} (Saved)`;
  } else {
    DOM.inputApiKey.value = "";
    DOM.inputApiKey.placeholder = "sk-...";
  }
  
  DOM.settingsModal.classList.add("active");
}

function closeSettingsModal() {
  DOM.settingsModal.classList.remove("active");
  DOM.inputApiKey.type = "password";
  DOM.btnToggleKeyVisibility.querySelector("i").className = "bi bi-eye";
}

function toggleApiKeyVisibility() {
  const icon = DOM.btnToggleKeyVisibility.querySelector("i");
  if (DOM.inputApiKey.type === "password") {
    DOM.inputApiKey.type = "text";
    icon.className = "bi bi-eye-slash";
  } else {
    DOM.inputApiKey.type = "password";
    icon.className = "bi bi-eye";
  }
}

async function saveSettings() {
  const mockMode = DOM.modeMock.checked;
  const apiKey = DOM.inputApiKey.value.trim();
  
  if (!mockMode && !apiKey && !state.settings.has_api_key) {
    alert("Warning: OpenAI API Key is required to run in Online Live AI mode. Please provide an API key or switch to Offline Mode.");
    return;
  }
  
  printTerminalLog("[System] Saving configuration updates...", "info");
  
  try {
    const res = await fetch(`${API_BASE}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mock_mode: mockMode,
        openai_api_key: apiKey
      })
    });
    
    if (!res.ok) throw new Error("Failed to update settings");
    const data = await res.json();
    
    printTerminalLog(`[System] Configuration saved successfully. Active Mode: ${data.mock_mode ? 'OFFLINE MOCK' : 'LIVE AI'}`, "success");
    
    await checkHealth();
    closeSettingsModal();
  } catch (err) {
    console.error("Save settings error:", err);
    printTerminalLog(`[System Error] Failed to save settings: ${err.message}`, "warning");
    alert(`Failed to save settings: ${err.message}`);
  }
}


async function fetchDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`);
    const docs = await res.json();
    state.documents = docs;
    renderDocumentList();
  } catch (err) {
    console.error("Error fetching documents:", err);
    printTerminalLog("[System Error] Failed to fetch documents list.", "warning");
  }
}

function renderDocumentList() {
  DOM.docCount.textContent = state.documents.length;
  
  if (state.documents.length === 0) {
    DOM.docList.innerHTML = `
      <div class="doc-list-empty">
        <i class="bi bi-folder-x"></i>
        <p>No documents processed yet</p>
      </div>
    `;
    return;
  }
  
  DOM.docList.innerHTML = state.documents.map(doc => {
    const activeClass = state.activeDocId === doc.document_id ? "active" : "";
    const fileIcon = getFileIconClass(doc.file_type);
    const dateStr = new Date(doc.upload_time).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    return `
      <div class="doc-item ${activeClass}" data-id="${doc.document_id}">
        <i class="${fileIcon} doc-item-icon"></i>
        <div class="doc-item-details">
          <h4>${doc.filename}</h4>
          <p>${dateStr} &middot; Chunks: ${doc.chunk_count}</p>
        </div>
        <button class="btn-doc-delete" data-id="${doc.document_id}" data-name="${doc.filename}" title="Delete Document">
          <i class="bi bi-trash-fill"></i>
        </button>
      </div>
    `;
  }).join("");
  
  
  document.querySelectorAll(".doc-item").forEach(item => {
    item.addEventListener("click", () => {
      const docId = item.getAttribute("data-id");
      activateDocument(docId);
    });
  });

  
  document.querySelectorAll(".btn-doc-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); 
      const docId = btn.getAttribute("data-id");
      const docName = btn.getAttribute("data-name");
      openDeleteConfirmModal(docId, docName);
    });
  });
}

function getFileIconClass(fileType) {
  switch (fileType.toLowerCase()) {
    case 'pdf': return 'bi bi-file-earmark-pdf-fill';
    case 'csv': return 'bi bi-file-earmark-spreadsheet-fill';
    case 'json': return 'bi bi-filetype-json';
    case 'md': return 'bi bi-markdown-fill';
    default: return 'bi bi-file-earmark-text-fill';
  }
}


function setupEventListeners() {
  
  DOM.tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      DOM.tabBtns.forEach(b => b.classList.remove("active"));
      DOM.tabPanes.forEach(p => p.classList.remove("active"));
      
      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(tabId).classList.add("active");
    });
  });
  
  
  DOM.uploadBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    DOM.fileInput.click();
  });
  
  DOM.uploadZone.addEventListener("click", () => {
    DOM.fileInput.click();
  });
  
  // Stop click propagation on the file input to avoid triggering the parent's click handler and creating a loop
  DOM.fileInput.addEventListener("click", (e) => {
    e.stopPropagation();
  });
  
  DOM.fileInput.addEventListener("change", handleFileSelection);
  
  
  DOM.uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    DOM.uploadZone.style.borderColor = "var(--primary-accent)";
  });
  
  DOM.uploadZone.addEventListener("dragleave", () => {
    DOM.uploadZone.style.borderColor = "var(--border-color)";
  });
  
  DOM.uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    DOM.uploadZone.style.borderColor = "var(--border-color)";
    if (e.dataTransfer.files.length > 0) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  
  DOM.btnClearLogs.addEventListener("click", () => {
    DOM.terminalLogs.innerHTML = `<div class="log-line text-muted">[System] Log cleared. Waiting for actions...</div>`;
  });
  
  
  DOM.btnExportJson.addEventListener("click", () => {
    if (state.activeDocId) {
      window.open(`${API_BASE}/documents/${state.activeDocId}/export?format=json`, '_blank');
    }
  });
  DOM.btnExportCsv.addEventListener("click", () => {
    if (state.activeDocId) {
      window.open(`${API_BASE}/documents/${state.activeDocId}/export?format=csv`, '_blank');
    }
  });
  
  
  DOM.chatForm.addEventListener("submit", handleChatSubmit);

  
  DOM.btnSettingsToggle.addEventListener("click", openSettingsModal);
  DOM.statusIndicator.addEventListener("click", openSettingsModal);
  DOM.btnSettingsClose.addEventListener("click", closeSettingsModal);
  DOM.btnSettingsCancel.addEventListener("click", closeSettingsModal);
  DOM.btnSettingsSave.addEventListener("click", saveSettings);
  DOM.btnToggleKeyVisibility.addEventListener("click", toggleApiKeyVisibility);
  
  DOM.modeLive.addEventListener("change", () => {
    DOM.modeLiveLabel.classList.add("selected");
    DOM.modeMockLabel.classList.remove("selected");
  });
  DOM.modeMock.addEventListener("change", () => {
    DOM.modeMockLabel.classList.add("selected");
    DOM.modeLiveLabel.classList.remove("selected");
  });

  
  DOM.btnDeleteConfirmClose.addEventListener("click", closeDeleteConfirmModal);
  DOM.btnDeleteConfirmCancel.addEventListener("click", closeDeleteConfirmModal);
  DOM.btnDeleteConfirmProceed.addEventListener("click", proceedWithDelete);
}


function handleFileSelection(e) {
  if (e.target.files.length > 0) {
    uploadFile(e.target.files[0]);
    DOM.fileInput.value = ""; // Reset file input so that the same file can be uploaded again
  }
}

async function uploadFile(file) {
  DOM.uploadProgress.style.display = "block";
  const progressFill = DOM.uploadProgress.querySelector(".progress-fill");
  progressFill.style.width = "40%";
  
  const formData = new FormData();
  formData.append("file", file);
  
  printTerminalLog(`[System] Initializing upload for file: ${file.name}...`, "info");
  
  try {
    const response = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      body: formData
    });
    
    progressFill.style.width = "80%";
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Upload failed");
    }
    
    const docData = await response.json();
    progressFill.style.width = "100%";
    
    printTerminalLog(`[System] Upload completed. Document ID generated: ${docData.document_id}`, "success");
    
    
    await fetchDocuments();
    activateDocument(docData.document_id);
    
    setTimeout(() => {
      DOM.uploadProgress.style.display = "none";
      progressFill.style.width = "0%";
    }, 1500);
    
  } catch (err) {
    console.error("Upload error:", err);
    printTerminalLog(`[System Error] Upload failed: ${err.message}`, "warning");
    DOM.uploadProgress.style.display = "none";
    progressFill.style.width = "0%";
    alert(`Failed to upload document: ${err.message}`);
  }
}


function openDeleteConfirmModal(docId, docName) {
  state.deleteTargetId = docId;
  DOM.deleteTargetName.textContent = docName;
  DOM.deleteConfirmModal.classList.add("active");
}

function closeDeleteConfirmModal() {
  DOM.deleteConfirmModal.classList.remove("active");
  state.deleteTargetId = null;
}

async function proceedWithDelete() {
  const docId = state.deleteTargetId;
  if (!docId) return;
  
  printTerminalLog(`[System] Initializing deletion of document: ${docId}...`, "info");
  
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}`, {
      method: "DELETE"
    });
    
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.detail || "Delete failed");
    }
    
    printTerminalLog(`[System] Document successfully deleted from database and vector stores.`, "success");
    
    closeDeleteConfirmModal();
    
    
    await fetchDocuments();
    
    
    if (state.activeDocId === docId) {
      state.activeDocId = null;
      state.activeDocData = null;
      
      DOM.welcomeScreen.style.display = "flex";
      DOM.dashboardWrapper.style.display = "none";
      DOM.headerActions.style.display = "none";
      DOM.activeDocMeta.style.display = "none";
      DOM.activeDocName.textContent = "Select a document from the left";
      
      printTerminalLog(`[RouterAgent] Dashboard reset: active document was deleted.`, "info");
    }
  } catch (err) {
    console.error("Delete error:", err);
    printTerminalLog(`[System Error] Delete failed: ${err.message}`, "warning");
    alert(`Failed to delete document: ${err.message}`);
    closeDeleteConfirmModal();
  }
}


async function activateDocument(docId) {
  state.activeDocId = docId;
  
  
  document.querySelectorAll(".doc-item").forEach(item => {
    const itemDocId = item.getAttribute("data-id");
    item.classList.toggle("active", itemDocId === docId);
  });
  
  printTerminalLog(`[Orchestrator] Retrieving database record for document: ${docId}`, "info");
  
  try {
    const res = await fetch(`${API_BASE}/documents/${docId}`);
    if (!res.ok) throw new Error("Failed to load document details");
    const data = await res.json();
    state.activeDocData = data;
    
    
    DOM.welcomeScreen.style.display = "none";
    DOM.dashboardWrapper.style.display = "flex";
    DOM.headerActions.style.display = "flex";
    DOM.activeDocMeta.style.display = "flex";
    
    
    DOM.activeDocName.textContent = data.filename;
    DOM.metaId.textContent = `ID: ${data.document_id.substring(0, 8)}...`;
    DOM.metaChunks.innerHTML = `<i class="bi bi-grid-3x3-gap"></i> Chunks: ${data.chunk_count}`;
    DOM.metaType.innerHTML = `<i class="${getFileIconClass(data.file_type)}"></i> ${data.file_type.toUpperCase()}`;
    
    DOM.summaryText.textContent = data.summary;
    
    
    renderEntitiesTab(data.entities);
    renderClausesTab(data.clauses);
    resetChatWorkspace(docId);
    
    
    DOM.terminalLogs.innerHTML = "";
    simulateAgentLogs(data.agent_logs);
    
  } catch (err) {
    console.error(err);
    printTerminalLog(`[System Error] Failed to activate document: ${err.message}`, "warning");
  }
}


function printTerminalLog(text, type = "") {
  const line = document.createElement("div");
  line.className = `log-line ${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${text}`;
  
  DOM.terminalLogs.appendChild(line);
  DOM.terminalLogs.scrollTop = DOM.terminalLogs.scrollHeight;
}

function simulateAgentLogs(logs) {
  if (!logs || logs.length === 0) return;
  
  
  resetAgentFlowNodes();
  
  let i = 0;
  function printNext() {
    if (i >= logs.length) return;
    const log = logs[i];
    
    
    animateNodesFromLogLine(log);
    
    let type = "agent-step";
    if (log.includes("validated") || log.includes("successfully")) type = "success";
    if (log.includes("Error") || log.includes("WARNING")) type = "warning";
    if (log.includes("Router")) type = "info";
    
    printTerminalLog(log, type);
    i++;
    setTimeout(printNext, 180);
  }
  printNext();
}

function resetAgentFlowNodes() {
  DOM.nodeRouter.className = "flow-node";
  DOM.nodeExtract.className = "flow-node";
  DOM.nodeClassify.className = "flow-node";
  DOM.nodeQA.className = "flow-node";
}

function animateNodesFromLogLine(logLine) {
  if (logLine.includes("RouterAgent")) {
    resetAgentFlowNodes();
    DOM.nodeRouter.className = "flow-node active";
  } else if (logLine.includes("ExtractionAgent")) {
    DOM.nodeExtract.className = "flow-node active";
  } else if (logLine.includes("ClassificationAgent")) {
    DOM.nodeClassify.className = "flow-node active";
  } else if (logLine.includes("SemanticQ&AAgent")) {
    DOM.nodeQA.className = "flow-node active";
  }
}


function renderEntitiesTab(entities) {
  DOM.entitySchemaLabel.textContent = entities.schema_type === "invoice" ? "InvoiceEntitySchema" : "ContractEntitySchema";
  DOM.rawJsonCode.textContent = JSON.stringify(entities.data, null, 2);
  
  const container = DOM.entityFieldsContainer;
  container.innerHTML = "";
  
  const data = entities.data;
  
  if (entities.schema_type === "invoice") {
    
    container.innerHTML = `
      <div class="entities-form-wrapper">
        <div class="entity-fields">
          <div class="field-group">
            <label>Invoice Number</label>
            <div class="field-val-box">${data.invoice_number || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Supplier / Vendor</label>
            <div class="field-val-box">${data.supplier || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Buyer / Customer</label>
            <div class="field-val-box">${data.buyer || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Issue Date</label>
            <div class="field-val-box">${data.issue_date || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Due Date</label>
            <div class="field-val-box">${data.due_date || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Line Items</label>
            <table class="invoice-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${(data.line_items || []).map(item => `
                  <tr>
                    <td>${item.description}</td>
                    <td>${item.quantity ?? "N/A"}</td>
                    <td>$${(item.unit_price ?? 0).toFixed(2)}</td>
                    <td>$${(item.amount ?? 0).toFixed(2)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
          <div class="field-group">
            <label>Total Amount Due</label>
            <div class="field-val-box" style="font-size:16px; font-weight:700; color:var(--primary-accent)">
              $${(data.total_amount ?? 0).toLocaleString(undefined, {minimumFractionDigits: 2})} ${data.currency || "USD"}
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    
    const partiesList = (data.parties || []).map(p => `<span class="field-chip">${p}</span>`).join("");
    
    container.innerHTML = `
      <div class="entities-form-wrapper">
        <div class="entity-fields">
          <div class="field-group">
            <label>Contract Type</label>
            <div class="field-val-box">${data.contract_type || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Signatory Parties</label>
            <div class="field-chips">${partiesList || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Effective Date</label>
            <div class="field-val-box">${data.effective_date || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Expiration Date</label>
            <div class="field-val-box">${data.expiration_date || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Contract Value</label>
            <div class="field-val-box">${data.contract_value || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Governing Law & Jurisdiction</label>
            <div class="field-val-box">${data.governing_law || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Indemnity Limits</label>
            <div class="field-val-box">${data.indemnity_limit || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Termination Notice Period</label>
            <div class="field-val-box">${data.termination_notice_period || "N/A"}</div>
          </div>
          <div class="field-group">
            <label>Post-Termination Confidentiality</label>
            <div class="field-val-box">${data.confidentiality_duration || "N/A"}</div>
          </div>
        </div>
      </div>
    `;
  }
}


function renderClausesTab(clauses) {
  const container = DOM.clausesContainer;
  container.innerHTML = "";
  
  if (!clauses || clauses.length === 0) {
    container.innerHTML = `
      <div class="card" style="padding: 20px; text-align: center; color: var(--text-dark);">
        No legal clauses identified in this document.
      </div>
    `;
    return;
  }
  
  container.innerHTML = clauses.map(clause => {
    const riskBadge = getRiskBadge(clause.risk_level);
    const confidencePct = Math.round(clause.confidence * 100);
    
    return `
      <div class="card clause-card">
        <div class="clause-top">
          <span class="clause-title">${clause.clause_type}</span>
          <div class="clause-badges">
            <span class="badge badge-primary mono">Confidence: ${confidencePct}%</span>
            ${riskBadge}
          </div>
        </div>
        <p class="clause-text">"${clause.text_segment}"</p>
        <p class="clause-reason"><strong>Reasoning:</strong> ${clause.reasoning}</p>
      </div>
    `;
  }).join("");
}

function getRiskBadge(riskLevel) {
  switch ((riskLevel || "").toLowerCase()) {
    case 'high': return '<span class="badge badge-danger mono">HIGH RISK</span>';
    case 'medium': return '<span class="badge badge-warning mono">MEDIUM RISK</span>';
    default: return '<span class="badge badge-success mono">LOW RISK</span>';
  }
}


function resetChatWorkspace(docId) {
  DOM.chatHistory.innerHTML = "";
  DOM.citationsContainer.innerHTML = `
    <div class="citations-empty">
      <i class="bi bi-database-fill-exclamation"></i>
      <p>No queries executed yet. Submit a message in the chat box to view semantic vector search contexts.</p>
    </div>
  `;
  DOM.citationCount.textContent = "0 Chunks Selected";
  
  
  if (!state.chatHistories[docId]) {
    state.chatHistories[docId] = [
      {
        sender: "agent",
        text: "Hello! I am the **Semantic Q&A Agent**. I have indexed this document in **ChromaDB**. Ask me any question, and I'll perform semantic retrieval to formulate a context-aware response."
      }
    ];
  }
  
  state.chatHistories[docId].forEach(msg => {
    appendChatMessage(msg.sender, msg.text);
  });
}

function appendChatMessage(sender, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${sender}`;
  
  const content = document.createElement("div");
  content.className = "message-content";
  
  
  let renderedText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="mono">$1</code>')
    .replace(/\n/g, '<br/>');
    
  content.innerHTML = `<p>${renderedText}</p>`;
  wrapper.appendChild(content);
  DOM.chatHistory.appendChild(wrapper);
  
  DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
}

async function handleChatSubmit(e) {
  e.preventDefault();
  const input = DOM.chatInput.value.trim();
  if (!input || !state.activeDocId) return;
  
  DOM.chatInput.value = "";
  appendChatMessage("user", input);
  
  
  state.chatHistories[state.activeDocId].push({ sender: "user", text: input });
  
  
  resetAgentFlowNodes();
  DOM.nodeRouter.className = "flow-node active";
  
  printTerminalLog(`[RouterAgent] Triggered workflow route evaluation for user query.`, "info");
  
  
  const typingIndicator = document.createElement("div");
  typingIndicator.className = "chat-message agent typing";
  typingIndicator.innerHTML = `
    <div class="message-content">
      <span class="mono text-muted">Agent processing query...</span>
    </div>
  `;
  DOM.chatHistory.appendChild(typingIndicator);
  DOM.chatHistory.scrollTop = DOM.chatHistory.scrollHeight;
  
  try {
    const res = await fetch(`${API_BASE}/documents/${state.activeDocId}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: input })
    });
    
    
    DOM.chatHistory.removeChild(typingIndicator);
    
    if (!res.ok) throw new Error("Server query request failed");
    const data = await res.json();
    
    
    appendChatMessage("agent", data.answer);
    state.chatHistories[state.activeDocId].push({ sender: "agent", text: data.answer });
    
    
    simulateAgentLogs(data.agent_logs);
    
    
    renderCitations(data.context_chunks);
    
  } catch (err) {
    console.error(err);
    DOM.chatHistory.removeChild(typingIndicator);
    appendChatMessage("agent", "Error: I encountered a backend processing exception while executing that query.");
    printTerminalLog(`[System Error] Q&A request failed: ${err.message}`, "warning");
  }
}

function renderCitations(chunks) {
  const container = DOM.citationsContainer;
  container.innerHTML = "";
  
  if (!chunks || chunks.length === 0) {
    container.innerHTML = `
      <div class="citations-empty">
        <i class="bi bi-database-fill-exclamation"></i>
        <p>No document source chunks were loaded for this query type (e.g. non-semantic schema request).</p>
      </div>
    `;
    DOM.citationCount.textContent = "0 Chunks";
    return;
  }
  
  DOM.citationCount.textContent = `${chunks.length} Chunks Retrieved`;
  
  container.innerHTML = chunks.map((chunk, index) => {
    const scorePct = Math.round((1 - chunk.score) * 100);
    const scoreText = scorePct > 0 ? `Similarity: ${scorePct}%` : `Distance: ${chunk.score}`;
    
    return `
      <div class="citation-block">
        <div class="citation-top">
          <span class="mono">CHUNK ${index + 1} &middot; Index ${chunk.metadata?.chunk_index ?? index}</span>
          <span class="badge badge-success mono">${scoreText}</span>
        </div>
        <div class="citation-text">"${chunk.text}"</div>
      </div>
    `;
  }).join("");
}
