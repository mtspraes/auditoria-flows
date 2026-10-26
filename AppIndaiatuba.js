// ========================================================================
// AppIndaiatuba.js - Sistema de Alocação de Caminhões - Armazém Indaiatuba
// Produtos: Pó (ARG + PAR)
// Lógica: Posições (fator) + Peso
// ========================================================================

import { supabase, auth, ind_estoque, ind_contratos, ind_prioridades, ind_historico, ind_reference_table } from './supabaseClient.js';

// ========== CONSTANTES ==========

const IND_COUNTRIES = ['ARG', 'PAR'];
const IND_COUNTRY_NAMES = { 'ARG': 'Argentina', 'PAR': 'Paraguai' };
const MAX_POSITIONS_PER_TRUCK = 28;
const MAX_WEIGHT_PER_TRUCK = 27000; // PAR
const MAX_WEIGHT_ARG = 25000; // ARG — mesmo limite do Hub

// Prioridades: 4 níveis (mesma lógica do HUB)
const IND_PRIORITY_VALUES = {
  'baixa': 1, 'baixo': 1, 'low': 1, 'baja': 1, 'bajo': 1, 'normal': 1,
  'moderada': 2, 'moderado': 2, 'moderate': 2,
  'forte': 3, 'fuerte': 3, 'strong': 3,
  'extrema': 4, 'extremo': 4, 'extreme': 4
};
// Ocupação mínima padrão (pode ser alterada na aba Configurações)
const DEFAULT_MIN_OCCUPANCY = 90;

function getMinOccupancy() {
  const saved = localStorage.getItem('ind_minOccupancy');
  return saved ? parseFloat(saved) : DEFAULT_MIN_OCCUPANCY;
}

// Tabela de referência: SKU -> { fator, pesoPallet }
// fator = Nueva Cantidad Plt / Cantidad Plt (28)
// Quanto maior o fator, mais pallets cabem por posição
// posições_ocupadas = pallets / fator
const REFERENCE_TABLE = {
  '68863525': { fator: 1.1071, pesoPallet: 844.69 },
  '64854003': { fator: 1.1071, pesoPallet: 844.69 },
  '68860623': { fator: 1.1071, pesoPallet: 844.69 },
  '68860622': { fator: 1.1786, pesoPallet: 816.48 },
  '68860618': { fator: 1.1786, pesoPallet: 816.48 },
  '68860625': { fator: 1.1786, pesoPallet: 816.48 },
  '68860619': { fator: 1.2857, pesoPallet: 736 },
  '68860621': { fator: 1.2857, pesoPallet: 736 },
  '68860626': { fator: 1.2857, pesoPallet: 736 },
  '68860620': { fator: 1.1786, pesoPallet: 817.6 },
  '68863517': { fator: 1.0357, pesoPallet: 792.134 },
  '64854008': { fator: 1.0357, pesoPallet: 792.134 },
  '68863518': { fator: 1.0357, pesoPallet: 906.64 },
  '68863530': { fator: 1.0357, pesoPallet: 906.64 },
  '68863512': { fator: 1.6071, pesoPallet: 594.65 },
  '69762200': { fator: 1.6071, pesoPallet: 594.65 },
  '64940175': { fator: 1.6071, pesoPallet: 594.65 },
  '68863528': { fator: 1.0714, pesoPallet: 838.128 },
  '64854000': { fator: 1.0714, pesoPallet: 838.128 },
  '64854002': { fator: 1.0714, pesoPallet: 838.128 },
  '68863521': { fator: 1.0714, pesoPallet: 838.128 },
  '64834926': { fator: 1.25, pesoPallet: 749.856 },
  '64854004': { fator: 1.25, pesoPallet: 749.856 },
  '68863522': { fator: 1.25, pesoPallet: 749.856 },
  '64823301': { fator: 1.25, pesoPallet: 749.856 },
  '64854743': { fator: 1.25, pesoPallet: 749.856 },
  '68863520': { fator: 1.25, pesoPallet: 749.856 },
  '64861494': { fator: 1.0714, pesoPallet: 810 },
  '68863527': { fator: 1.0714, pesoPallet: 810 },
  '64312119': { fator: 1.1071, pesoPallet: 614.4 },
  '64312120': { fator: 1.25, pesoPallet: 768 },
};

// ========== CLASSE PRINCIPAL ==========

export class App {
  constructor(rootElement, user) {
    this.root = rootElement;
    this.user = user;
    this.userRole = null;

    this.state = {
      loading: false,
      estoque: [],
      allocationResult: null,
      error: null,
      activeTab: 'dashboard'
    };

    if (!window.isInRecoveryMode) {
      this.render(user);
    }
  }

  // ========== ROLES ==========

  async fetchUserRole() {
    if (!this.user) return 'analyst';
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', this.user.id)
        .single();
      if (error) return 'analyst';
      return data?.role || 'analyst';
    } catch { return 'analyst'; }
  }

  getUserRole() { return this.userRole || 'analyst'; }
  isAnalyst() { return this.getUserRole() === 'analyst'; }
  isPlanning() { return this.getUserRole() === 'planning'; }

  getUserRoleBadge() {
    const role = this.getUserRole();
    if (role === 'planning') {
      return `<div class="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        Planning</div>`;
    }
    return `<div class="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
      Analyst (Somente Leitura)</div>`;
  }

  // ========== STATE ==========

  setState(updates) {
    this.state = { ...this.state, ...updates };
  }

  // ========== RENDER PRINCIPAL ==========

  async render(user) {
    this.user = user;
    if (!user) {
      this.renderLoginScreen();
      return;
    }
    this.userRole = await this.fetchUserRole();
    this.renderDashboard();
  }

  // ========== LOGIN ==========

  renderLoginScreen() {
    this.root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
          <div class="text-center mb-8">
            <div class="w-20 h-20 bg-gradient-to-br from-green-500 to-green-700 rounded-full mx-auto mb-4 flex items-center justify-center">
              <i data-lucide="factory" class="w-10 h-10 text-white"></i>
            </div>
            <h1 class="text-3xl font-bold text-gray-800">Indaiatuba</h1>
            <p class="text-gray-600 mt-2">Sistema de Alocacao - Po</p>
          </div>
          <div id="loginError" class="hidden mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm"></div>
          <form id="loginForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" id="loginEmail" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Senha</label>
              <input type="password" id="loginPassword" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent">
            </div>
            <button type="submit" class="w-full bg-gradient-to-r from-green-500 to-green-700 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition">Entrar</button>
          </form>
        </div>
      </div>`;
    lucide.createIcons();
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const errDiv = document.getElementById('loginError');
      errDiv.classList.add('hidden');
      const { data, error } = await auth.signIn(email, password);
      if (error) {
        errDiv.textContent = error.message;
        errDiv.classList.remove('hidden');
      }
    });
  }

  showPasswordResetScreen() {
    this.root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
          <h2 class="text-2xl font-bold mb-4">Redefinir Senha</h2>
          <form id="resetForm" class="space-y-4">
            <input type="password" id="newPassword" placeholder="Nova senha (min 6 caracteres)" required minlength="6" class="w-full px-4 py-3 border rounded-lg">
            <button type="submit" class="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">Salvar Nova Senha</button>
          </form>
        </div>
      </div>`;
    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPw = document.getElementById('newPassword').value;
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) alert('Erro: ' + error.message);
    });
  }

  // ========== DASHBOARD ==========

  renderDashboard() {
    const tabs = [
      { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
      { id: 'import', label: 'Importar Dados', icon: 'upload' },
      { id: 'contracts', label: 'Contratos', icon: 'file-text' },
      { id: 'allocation', label: 'Alocar Caminhoes', icon: 'truck' },
      { id: 'history', label: 'Historico', icon: 'history' },
      { id: 'settings', label: 'Configuracoes', icon: 'settings' },
    ];

    this.root.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        <!-- Header -->
        <header class="bg-gradient-to-r from-green-600 to-green-800 text-white shadow-lg">
          <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <i data-lucide="factory" class="w-6 h-6"></i>
              </div>
              <div>
                <h1 class="text-xl font-bold">Indaiatuba - Po</h1>
                <p class="text-green-200 text-xs">ARG + PAR</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              ${this.getUserRoleBadge()}
              <span class="text-sm text-green-200">${this.user?.email || ''}</span>
              <button id="btnSwitchWarehouse" class="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition flex items-center gap-1">
                <i data-lucide="arrow-left-right" class="w-4 h-4"></i> Trocar Armazem
              </button>
              <button id="btnLogout" class="px-3 py-2 bg-red-500/80 hover:bg-red-600 rounded-lg text-sm transition">Sair</button>
            </div>
          </div>
          <!-- Tabs -->
          <div class="max-w-7xl mx-auto px-4">
            <nav class="flex gap-1 -mb-px">
              ${tabs.map(t => `
                <button class="tab-btn px-4 py-3 text-sm font-medium rounded-t-lg transition
                  ${this.state.activeTab === t.id ? 'bg-gray-50 text-green-700' : 'text-green-200 hover:text-white hover:bg-white/10'}"
                  data-tab="${t.id}">
                  <i data-lucide="${t.icon}" class="w-4 h-4 inline mr-1"></i>${t.label}
                </button>`).join('')}
            </nav>
          </div>
        </header>

        <!-- Content -->
        <main class="max-w-7xl mx-auto px-4 py-6">
          <div id="contentArea"></div>
        </main>
      </div>`;

    lucide.createIcons();

    // Event listeners
    document.getElementById('btnLogout').addEventListener('click', () => auth.signOut());
    document.getElementById('btnSwitchWarehouse').addEventListener('click', () => {
      sessionStorage.removeItem('selectedWarehouse');
      location.reload();
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    this.renderTabContent();
  }

  switchTab(tab) {
    this.setState({ activeTab: tab });
    // Update tab styling
    document.querySelectorAll('.tab-btn').forEach(btn => {
      if (btn.dataset.tab === tab) {
        btn.className = 'tab-btn px-4 py-3 text-sm font-medium rounded-t-lg transition bg-gray-50 text-green-700';
      } else {
        btn.className = 'tab-btn px-4 py-3 text-sm font-medium rounded-t-lg transition text-green-200 hover:text-white hover:bg-white/10';
      }
    });
    this.renderTabContent();
  }

  renderTabContent() {
    const area = document.getElementById('contentArea');
    if (!area) return;
    switch (this.state.activeTab) {
      case 'dashboard': this.renderDashboardTab(area); break;
      case 'import': this.renderImportTab(area); break;
      case 'contracts': this.renderContractsTab(area); break;
      case 'allocation': this.renderAllocationTab(area); break;
      case 'history': this.renderHistoryTab(area); break;
      case 'settings': this.renderSettingsTab(area); break;
    }
    lucide.createIcons();
  }

  // ========== DASHBOARD TAB ==========

  async renderDashboardTab(container) {
    container.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div class="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">SKUs no Estoque</p>
              <p id="statSkus" class="text-3xl font-bold text-gray-800">-</p>
            </div>
            <i data-lucide="package" class="w-8 h-8 text-green-500"></i>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Contratos Ativos</p>
              <p id="statContracts" class="text-3xl font-bold text-gray-800">-</p>
            </div>
            <i data-lucide="file-text" class="w-8 h-8 text-blue-500"></i>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-6 border-l-4 border-purple-500">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500">Tabela Referencia</p>
              <p class="text-3xl font-bold text-gray-800">${Object.keys(REFERENCE_TABLE).length}</p>
            </div>
            <i data-lucide="table" class="w-8 h-8 text-purple-500"></i>
          </div>
        </div>
      </div>
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-lg font-semibold mb-4">Informacoes do Armazem</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div class="p-3 bg-gray-50 rounded-lg"><span class="text-gray-500">Paises:</span> <strong>ARG, PAR</strong></div>
          <div class="p-3 bg-gray-50 rounded-lg"><span class="text-gray-500">Max Posicoes:</span> <strong>28/caminhao</strong></div>
          <div class="p-3 bg-gray-50 rounded-lg"><span class="text-gray-500">Max Peso:</span> <strong>27.000 kg</strong></div>
          <div class="p-3 bg-gray-50 rounded-lg"><span class="text-gray-500">Produto:</span> <strong>Po (Detergente)</strong></div>
        </div>
      </div>`;

    lucide.createIcons();

    // Load stats
    const [estoqueRes, contratosRes] = await Promise.all([
      ind_estoque.getAll(),
      ind_contratos.getActive()
    ]);
    const skuCount = estoqueRes.data?.length || 0;
    const contractCount = contratosRes.data?.length || 0;
    const el1 = document.getElementById('statSkus');
    const el2 = document.getElementById('statContracts');
    if (el1) el1.textContent = skuCount;
    if (el2) el2.textContent = contractCount;
  }

  // ========== IMPORT TAB ==========

  renderImportTab(container) {
    const isReadOnly = this.isAnalyst();

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
          <i data-lucide="upload" class="w-5 h-5 text-green-600"></i> Importar Estoque Indaiatuba
        </h2>
        <p class="text-sm text-gray-500 mb-4">Colunas esperadas: <strong>SKU, DESC, Estoque, PPD, Peso Bruto, ARG, PAR</strong></p>

        ${isReadOnly ? '<div class="p-3 mb-4 bg-orange-50 text-orange-700 rounded-lg text-sm">Modo somente leitura - dados nao serao salvos no banco.</div>' : ''}

        <div class="border-2 border-dashed border-green-300 rounded-xl p-8 text-center hover:border-green-500 transition cursor-pointer bg-green-50/50" id="dropZone">
          <i data-lucide="file-spreadsheet" class="w-12 h-12 text-green-400 mx-auto mb-3"></i>
          <p class="text-gray-600 mb-2">Arraste o arquivo Excel aqui ou clique para selecionar</p>
          <input type="file" id="fileInput" accept=".xlsx,.xls,.csv" class="hidden">
          <button id="btnSelectFile" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm">
            Selecionar Arquivo
          </button>
        </div>

        <div id="importStatus" class="mt-4 hidden"></div>
        <div id="referenceAlert" class="mt-4 hidden"></div>

        <!-- Current stock summary -->
        <div id="currentStock" class="mt-6"></div>
      </div>

      <!-- PRIORIDADES -->
      <div class="bg-white rounded-xl shadow-sm p-6 mt-6">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
          <i data-lucide="arrow-up-circle" class="w-5 h-5 text-purple-600"></i> Importar Prioridades Indaiatuba
        </h2>
        <p class="text-sm text-gray-500 mb-2">Colunas esperadas: <strong>Pais, COD/SKU, Prioridade</strong></p>
        <p class="text-sm text-gray-400 mb-4">Niveis: <span class="text-gray-600 font-medium">Baixa (1)</span>, <span class="text-yellow-600 font-medium">Moderada (2)</span>, <span class="text-orange-600 font-medium">Forte (3)</span>, <span class="text-red-600 font-medium">Extrema (4)</span></p>

        ${isReadOnly ? '' : `
        <div class="flex gap-3 mb-4">
          <input type="file" id="priorityFile" accept=".xlsx,.xls,.csv" class="hidden">
          <button id="btnUploadPriority" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm flex items-center gap-2">
            <i data-lucide="upload" class="w-4 h-4"></i> Importar Arquivo
          </button>
          <button id="btnDeletePriorities" class="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm flex items-center gap-2">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Limpar Prioridades
          </button>
        </div>`}

        <div id="priorityStatus" class="mb-4 hidden"></div>
        <div id="currentPriorities" class="mt-4"></div>
      </div>

      <!-- TABELA DE REFERENCIA (fator + peso pallet) -->
      <div class="bg-white rounded-xl shadow-sm p-6 mt-6">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
          <i data-lucide="table" class="w-5 h-5 text-indigo-600"></i> Importar Tabela de Referencia Paraguai
        </h2>
        <p class="text-sm text-gray-500 mb-2">Colunas esperadas: <strong>SKU/COD, Fator, PesoPallet</strong> (ou Peso).</p>
        <p class="text-sm text-gray-400 mb-4">Quando a tabela esta vazia, a alocacao usa o hardcoded do codigo como fallback. Ao importar, substitui totalmente.</p>

        ${isReadOnly ? '' : `
        <div class="flex gap-3 mb-4">
          <input type="file" id="referenceFile" accept=".xlsx,.xls,.csv" class="hidden">
          <button id="btnUploadReference" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm flex items-center gap-2">
            <i data-lucide="upload" class="w-4 h-4"></i> Importar Arquivo
          </button>
          <button id="btnDeleteReference" class="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm flex items-center gap-2">
            <i data-lucide="trash-2" class="w-4 h-4"></i> Limpar e voltar ao fallback
          </button>
        </div>`}

        <div id="referenceStatus" class="mb-4 hidden"></div>
        <div id="currentReference" class="mt-4"></div>
      </div>`;

    lucide.createIcons();

    const fileInput = document.getElementById('fileInput');
    const dropZone = document.getElementById('dropZone');

    document.getElementById('btnSelectFile').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleStockUpload(e));

    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-green-500', 'bg-green-100'); });
    dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('border-green-500', 'bg-green-100'); });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('border-green-500', 'bg-green-100');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        this.handleStockUpload({ target: fileInput });
      }
    });

    // Priority listeners
    if (!isReadOnly) {
      const priorityFile = document.getElementById('priorityFile');
      document.getElementById('btnUploadPriority').addEventListener('click', () => priorityFile.click());
      priorityFile.addEventListener('change', (e) => this.handlePriorityUpload(e));
      document.getElementById('btnDeletePriorities').addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja remover todas as prioridades Indaiatuba?')) {
          await ind_prioridades.deleteAll();
          this.loadCurrentPriorities();
        }
      });
    }

    // Reference table listeners
    if (!isReadOnly) {
      const referenceFile = document.getElementById('referenceFile');
      document.getElementById('btnUploadReference').addEventListener('click', () => referenceFile.click());
      referenceFile.addEventListener('change', (e) => this.handleReferenceUpload(e));
      document.getElementById('btnDeleteReference').addEventListener('click', async () => {
        if (confirm('Limpar a tabela de referencia dinamica? A alocacao volta a usar o hardcoded do codigo.')) {
          await ind_reference_table.deleteAll();
          this.loadCurrentReference();
        }
      });
    }

    this.loadCurrentStock();
    this.loadCurrentPriorities();
    this.loadCurrentReference();
  }

  async handleStockUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('importStatus');
    const alertDiv = document.getElementById('referenceAlert');
    statusDiv.className = 'mt-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm';
    statusDiv.textContent = 'Processando arquivo...';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (jsonData.length === 0) throw new Error('Arquivo vazio');

      // Validate columns
      const firstRow = jsonData[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      const hasCod = keys.some(k => k === 'cod' || k === 'sku');
      const hasEstoque = keys.some(k => k === 'estoque');
      if (!hasCod || !hasEstoque) {
        throw new Error('Colunas obrigatorias nao encontradas. Esperado: SKU/COD, Estoque, PPD, Peso Bruto, ARG, PAR');
      }

      // Delete old and insert new
      if (!this.isAnalyst()) {
        await ind_estoque.deleteAll();
        const { error } = await ind_estoque.insertMany(jsonData);
        if (error) throw new Error(error.message);
      }

      statusDiv.className = 'mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm';
      statusDiv.textContent = `Importado com sucesso: ${jsonData.length} SKUs`;

      // Check reference table
      this.checkReferenceTable(jsonData, alertDiv);
      this.loadCurrentStock();

    } catch (err) {
      statusDiv.className = 'mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm';
      statusDiv.textContent = `Erro: ${err.message}`;
    }
  }

  async getEffectiveReferenceTable() {
    try {
      const { data } = await ind_reference_table.getAll();
      if (data && data.length > 0) {
        const effective = {};
        data.forEach(r => {
          const cod = (r.cod || '').toString().trim();
          if (!cod) return;
          effective[cod] = {
            fator: parseFloat(r.fator),
            pesoPallet: parseFloat(r.peso_pallet)
          };
        });
        return effective;
      }
    } catch (err) {
      console.warn('Falha ao buscar ind_reference_table, usando hardcoded:', err);
    }
    return REFERENCE_TABLE;
  }

  async checkReferenceTable(jsonData, alertDiv) {
    // Tabela de referência só é necessária para PAR — ARG usa lógica direta (28 pal / 25 tons)
    const effectiveTable = await this.getEffectiveReferenceTable();
    const unknowns = [];
    for (const row of jsonData) {
      const n = {};
      Object.keys(row).forEach(k => { n[k.toLowerCase().trim()] = row[k]; });
      const cod = (n.cod || n.sku || '').toString().trim();
      const demandPar = parseInt(n.par || 0) || 0;

      if (demandPar > 0 && !effectiveTable[cod]) {
        unknowns.push({ cod, desc: n.desc || n.descricao || '', demandPar });
      }
    }

    if (unknowns.length > 0) {
      alertDiv.className = 'mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg';
      alertDiv.innerHTML = `
        <div class="flex items-start gap-2">
          <i data-lucide="alert-triangle" class="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"></i>
          <div>
            <p class="font-semibold text-yellow-800">SKUs com demanda PAR NAO encontrados na tabela de referencia (${unknowns.length}):</p>
            <p class="text-sm text-yellow-700 mb-2">Estes SKUs serao ignorados na alocacao de Paraguai. ARG nao requer tabela de referencia.</p>
            <div class="max-h-40 overflow-y-auto">
              <table class="text-xs w-full">
                <thead><tr class="text-left text-yellow-700"><th class="pr-4">COD</th><th class="pr-4">DESC</th><th>PAR</th></tr></thead>
                <tbody>
                  ${unknowns.map(u => `<tr class="border-t border-yellow-200"><td class="pr-4 py-1 font-mono">${u.cod}</td><td class="pr-4">${u.desc}</td><td>${u.demandPar}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>`;
      lucide.createIcons();
    } else {
      alertDiv.className = 'mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm';
      alertDiv.textContent = 'Todos os SKUs com demanda PAR estao na tabela de referencia. ARG nao requer tabela.';
    }
  }

  async loadCurrentStock() {
    const div = document.getElementById('currentStock');
    if (!div) return;

    const { data } = await ind_estoque.getAll();
    if (!data || data.length === 0) {
      div.innerHTML = '<p class="text-sm text-gray-400">Nenhum estoque importado.</p>';
      return;
    }

    const totalSkus = data.length;
    const totalEstoque = data.reduce((s, r) => s + (r.estoque || 0), 0);
    const totalDemandArg = data.reduce((s, r) => s + (r.arg || 0), 0);
    const totalDemandPar = data.reduce((s, r) => s + (r.par || 0), 0);

    div.innerHTML = `
      <h3 class="text-sm font-semibold text-gray-700 mb-2">Estoque Atual</h3>
      <div class="grid grid-cols-4 gap-3 text-sm">
        <div class="p-3 bg-gray-50 rounded-lg text-center"><span class="text-gray-500 block">SKUs</span><strong>${totalSkus}</strong></div>
        <div class="p-3 bg-gray-50 rounded-lg text-center"><span class="text-gray-500 block">Total Estoque (cx)</span><strong>${totalEstoque.toLocaleString('pt-BR')}</strong></div>
        <div class="p-3 bg-blue-50 rounded-lg text-center"><span class="text-gray-500 block">Demanda ARG (cx)</span><strong>${totalDemandArg.toLocaleString('pt-BR')}</strong></div>
        <div class="p-3 bg-purple-50 rounded-lg text-center"><span class="text-gray-500 block">Demanda PAR (cx)</span><strong>${totalDemandPar.toLocaleString('pt-BR')}</strong></div>
      </div>`;
  }

  // ========== PRIORITY UPLOAD ==========

  async handlePriorityUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('priorityStatus');
    statusDiv.className = 'mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm';
    statusDiv.textContent = 'Processando prioridades...';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      if (jsonData.length === 0) throw new Error('Arquivo vazio');

      await ind_prioridades.deleteAll();
      const { error } = await ind_prioridades.upsertMany(jsonData);
      if (error) throw new Error(error.message);

      statusDiv.className = 'mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm';
      statusDiv.textContent = `Importado com sucesso: ${jsonData.length} prioridades processadas`;
      this.loadCurrentPriorities();

    } catch (err) {
      statusDiv.className = 'mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm';
      statusDiv.textContent = `Erro: ${err.message}`;
    }
  }

  async loadCurrentPriorities() {
    const div = document.getElementById('currentPriorities');
    if (!div) return;

    const { data } = await ind_prioridades.getAll();
    if (!data || data.length === 0) {
      div.innerHTML = '<p class="text-sm text-gray-400">Nenhuma prioridade importada. Todos os SKUs serao tratados como prioridade Baixa.</p>';
      return;
    }

    // Count by priority level
    const counts = { baixa: 0, moderada: 0, forte: 0, extrema: 0 };
    data.forEach(p => { counts[p.prioridade] = (counts[p.prioridade] || 0) + 1; });

    const countArg = data.filter(p => p.pais === 'ARG').length;
    const countPar = data.filter(p => p.pais === 'PAR').length;

    div.innerHTML = `
      <h3 class="text-sm font-semibold text-gray-700 mb-2">Prioridades Atuais</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
        <div class="p-3 bg-gray-50 rounded-lg text-center"><span class="text-gray-500 block">Baixa</span><strong>${counts.baixa}</strong></div>
        <div class="p-3 bg-yellow-50 rounded-lg text-center"><span class="text-yellow-600 block">Moderada</span><strong class="text-yellow-700">${counts.moderada}</strong></div>
        <div class="p-3 bg-orange-50 rounded-lg text-center"><span class="text-orange-600 block">Forte</span><strong class="text-orange-700">${counts.forte}</strong></div>
        <div class="p-3 bg-red-50 rounded-lg text-center"><span class="text-red-600 block">Extrema</span><strong class="text-red-700">${counts.extrema}</strong></div>
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-blue-50 rounded-lg text-center"><span class="text-gray-500 block">ARG</span><strong>${countArg}</strong></div>
        <div class="p-3 bg-purple-50 rounded-lg text-center"><span class="text-gray-500 block">PAR</span><strong>${countPar}</strong></div>
      </div>`;
  }

  async handleReferenceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('referenceStatus');
    statusDiv.classList.remove('hidden');
    statusDiv.className = 'mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm';
    statusDiv.textContent = 'Processando tabela de referencia...';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      if (jsonData.length === 0) throw new Error('Arquivo vazio');

      await ind_reference_table.deleteAll();
      const { error } = await ind_reference_table.insertMany(jsonData);
      if (error) throw new Error(error.message);

      statusDiv.className = 'mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm';
      statusDiv.textContent = `Importado com sucesso: ${jsonData.length} linhas processadas`;
      this.loadCurrentReference();

    } catch (err) {
      statusDiv.className = 'mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm';
      statusDiv.textContent = `Erro: ${err.message}`;
    }
  }

  async loadCurrentReference() {
    const div = document.getElementById('currentReference');
    if (!div) return;

    const { data } = await ind_reference_table.getAll();
    const hardcodedCount = Object.keys(REFERENCE_TABLE).length;

    if (!data || data.length === 0) {
      div.innerHTML = `
        <h3 class="text-sm font-semibold text-gray-700 mb-2">Tabela em uso</h3>
        <div class="p-3 bg-gray-50 rounded-lg text-sm">
          <span class="text-gray-500">Fonte:</span> <strong>Hardcoded (fallback do codigo)</strong>
          <span class="ml-4 text-gray-500">SKUs:</span> <strong>${hardcodedCount}</strong>
        </div>`;
      return;
    }

    const ultimaData = data.reduce((max, r) => {
      const d = r.created_at ? new Date(r.created_at) : null;
      return (!max || (d && d > max)) ? d : max;
    }, null);
    const dataFmt = ultimaData ? ultimaData.toLocaleString('pt-BR') : '-';

    div.innerHTML = `
      <h3 class="text-sm font-semibold text-gray-700 mb-2">Tabela em uso</h3>
      <div class="p-3 bg-indigo-50 rounded-lg text-sm">
        <span class="text-indigo-600">Fonte:</span> <strong>Banco (importada)</strong>
        <span class="ml-4 text-indigo-600">SKUs:</span> <strong>${data.length}</strong>
        <span class="ml-4 text-indigo-600">Ultimo upload:</span> <strong>${dataFmt}</strong>
      </div>
      <p class="text-xs text-gray-400 mt-2">Hardcoded no codigo tem ${hardcodedCount} SKUs (fica como fallback se voce limpar).</p>`;
  }

  // ========== CONTRACTS TAB ==========

  renderContractsTab(container) {
    const isReadOnly = this.isAnalyst();

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
          <i data-lucide="file-text" class="w-5 h-5 text-green-600"></i> Contratos Indaiatuba
        </h2>
        <p class="text-sm text-gray-500 mb-4">Colunas esperadas: <strong>Pais, SKU/COD, Contrato, Linha</strong> (Paises aceitos: ARG, PAR)</p>

        ${isReadOnly ? '<div class="p-3 mb-4 bg-orange-50 text-orange-700 rounded-lg text-sm">Modo somente leitura.</div>' : `
        <div class="flex gap-3 mb-4">
          <div class="flex-1">
            <input type="file" id="contractFile" accept=".xlsx,.xls,.csv" class="hidden">
            <button id="btnUploadContract" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm flex items-center gap-2">
              <i data-lucide="upload" class="w-4 h-4"></i> Importar Contratos
            </button>
          </div>
          <button id="btnDeleteContracts" class="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-sm">Limpar Todos</button>
        </div>
        <div id="contractStatus" class="mb-4 hidden"></div>
        `}

        <!-- Filter -->
        <div class="flex gap-3 mb-4 items-center">
          <label class="text-sm text-gray-600">Filtrar por pais:</label>
          <select id="contractFilter" class="px-3 py-2 border rounded-lg text-sm">
            <option value="">Todos</option>
            <option value="ARG">ARG</option>
            <option value="PAR">PAR</option>
          </select>
          <span id="contractCount" class="text-sm text-gray-500 ml-auto"></span>
        </div>

        <div id="contractsList" class="overflow-x-auto"></div>
      </div>`;

    lucide.createIcons();

    if (!isReadOnly) {
      const fileInput = document.getElementById('contractFile');
      document.getElementById('btnUploadContract').addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => this.handleContractUpload(e));
      document.getElementById('btnDeleteContracts').addEventListener('click', async () => {
        if (confirm('Tem certeza que deseja remover todos os contratos Indaiatuba?')) {
          await ind_contratos.deleteAll();
          this.loadContractsList();
        }
      });
    }

    document.getElementById('contractFilter').addEventListener('change', () => this.loadContractsList());
    this.loadContractsList();
  }

  async handleContractUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('contractStatus');
    statusDiv.className = 'mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm';
    statusDiv.textContent = 'Processando contratos...';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

      if (jsonData.length === 0) throw new Error('Arquivo vazio');

      await ind_contratos.deleteAll();
      const { error } = await ind_contratos.insertMany(jsonData);
      if (error) throw new Error(error.message);

      statusDiv.className = 'mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm';
      statusDiv.textContent = `Importado com sucesso: ${jsonData.length} registros processados`;
      this.loadContractsList();

    } catch (err) {
      statusDiv.className = 'mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm';
      statusDiv.textContent = `Erro: ${err.message}`;
    }
  }

  async loadContractsList() {
    const listDiv = document.getElementById('contractsList');
    const countSpan = document.getElementById('contractCount');
    const filter = document.getElementById('contractFilter')?.value || '';

    const { data, error } = await ind_contratos.getAll();
    if (error) {
      listDiv.innerHTML = `<p class="text-red-500 text-sm">Erro ao carregar contratos</p>`;
      return;
    }

    let filtered = data || [];
    if (filter) filtered = filtered.filter(c => c.pais === filter);

    if (countSpan) countSpan.textContent = `${filtered.length} contratos`;

    if (filtered.length === 0) {
      listDiv.innerHTML = '<p class="text-gray-400 text-sm">Nenhum contrato encontrado.</p>';
      return;
    }

    listDiv.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left">Pais</th>
            <th class="px-3 py-2 text-left">COD</th>
            <th class="px-3 py-2 text-left">Contrato</th>
            <th class="px-3 py-2 text-left">Linha</th>
            <th class="px-3 py-2 text-center">Ativo</th>
            ${!this.isAnalyst() ? '<th class="px-3 py-2 text-center">Acao</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${filtered.map(c => `
            <tr class="border-t ${!c.ativo ? 'bg-gray-50 text-gray-400' : ''}">
              <td class="px-3 py-2 font-semibold">${c.pais}</td>
              <td class="px-3 py-2 font-mono">${c.cod}</td>
              <td class="px-3 py-2">${c.contrato || '-'}</td>
              <td class="px-3 py-2">${c.linha || '-'}</td>
              <td class="px-3 py-2 text-center">${c.ativo ? '<span class="text-green-600">Sim</span>' : '<span class="text-red-500">Nao</span>'}</td>
              ${!this.isAnalyst() ? `<td class="px-3 py-2 text-center">
                <button class="toggle-contract px-2 py-1 text-xs rounded ${c.ativo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}" data-id="${c.id}" data-ativo="${c.ativo}">${c.ativo ? 'Desativar' : 'Ativar'}</button>
              </td>` : ''}
            </tr>`).join('')}
        </tbody>
      </table>`;

    listDiv.querySelectorAll('.toggle-contract').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const currentAtivo = btn.dataset.ativo === 'true';
        await ind_contratos.toggleActive(id, !currentAtivo);
        this.loadContractsList();
      });
    });
  }

  // ========== ALLOCATION TAB ==========

  renderAllocationTab(container) {
    const hasResult = this.state.allocationResult !== null;

    container.innerHTML = `
      <div class="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
          <i data-lucide="truck" class="w-5 h-5 text-green-600"></i> Alocar Caminhoes - Indaiatuba
        </h2>
        <p class="text-sm text-gray-500 mb-4">
          Regras: Max <strong>28 posicoes</strong> e <strong>27.000 kg</strong> por caminhao.
          ARG: 1 pallet = 1 posicao (28 pal / 25 tons, como Hub). PAR: posicoes = pallets / fator (tabela de referencia).
        </p>

        ${this.isAnalyst() ? '<div class="p-3 mb-4 bg-orange-50 text-orange-700 rounded-lg text-sm">Modo somente leitura.</div>' : ''}

        <div class="flex gap-3">
          <button id="btnAllocate" class="px-6 py-3 bg-gradient-to-r from-green-500 to-green-700 text-white rounded-lg font-semibold hover:shadow-lg transition flex items-center gap-2" ${this.state.loading ? 'disabled' : ''}>
            <i data-lucide="play" class="w-5 h-5"></i>
            ${this.state.loading ? 'Alocando...' : 'Executar Alocacao'}
          </button>
          ${hasResult ? `
            <button id="btnExport" class="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition flex items-center gap-2">
              <i data-lucide="download" class="w-5 h-5"></i> Exportar Excel
            </button>
            <button id="btnSaveHistory" class="px-6 py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition flex items-center gap-2">
              <i data-lucide="save" class="w-5 h-5"></i> Salvar no Historico
            </button>` : ''}
        </div>
      </div>

      ${this.state.error ? `<div class="p-4 bg-red-50 text-red-700 rounded-lg mb-6">${this.state.error}</div>` : ''}

      <div id="allocationResults"></div>`;

    lucide.createIcons();

    document.getElementById('btnAllocate').addEventListener('click', () => this.runAllocation());
    if (hasResult) {
      document.getElementById('btnExport')?.addEventListener('click', () => this.exportToExcel());
      document.getElementById('btnSaveHistory')?.addEventListener('click', () => this.saveToHistory());
      this.renderAllocationResults();
    }
  }

  async runAllocation() {
    this.setState({ loading: true, error: null, allocationResult: null });
    this.renderTabContent();

    try {
      // 1. Load data (estoque, contratos, prioridades)
      const [estoqueRes, contratosRes, prioridadesRes] = await Promise.all([
        ind_estoque.getAll(),
        ind_contratos.getActive(),
        ind_prioridades.getAll()
      ]);

      const stockData = estoqueRes.data || [];
      const contractsData = contratosRes.data || [];
      const priorityData = prioridadesRes.data || [];

      if (stockData.length === 0) throw new Error('Nenhum dado de estoque importado.');

      // Load effective reference table: banco se tiver dados, senao fallback hardcoded.
      const effectiveReferenceTable = await this.getEffectiveReferenceTable();

      // 2. Build contract map
      const contractMap = new Map();
      const hasContracts = contractsData.length > 0;
      contractsData.forEach(c => {
        contractMap.set(`${c.pais.toUpperCase()}|${c.cod.trim().toUpperCase()}`, {
          contrato: c.contrato || '',
          linha: c.linha || ''
        });
      });

      // 2b. Build priority map (PAIS|COD -> numeric value)
      const priorityMap = {};
      priorityData.forEach(p => {
        const key = `${p.pais.toUpperCase()}|${p.cod.trim().toUpperCase()}`;
        priorityMap[key] = IND_PRIORITY_VALUES[p.prioridade?.toLowerCase()] || 1;
      });

      // 3. Allocate stock per SKU (shared stock, sorted by priority)
      const allocated = { ARG: [], PAR: [] };
      const skippedByContract = [];
      const unknownSkus = [];
      const stockSummary = [];

      for (const row of stockData) {
        const cod = (row.cod || '').toString().trim();
        const ref = effectiveReferenceTable[cod];
        const ppd = row.ppd || 1;
        const pesoBruto = row.peso || row.peso_bruto || row['peso bruto'] || 0;
        let remainingStock = row.estoque || 0;

        // Check reference — only required for PAR; ARG uses direct pallets (like Hub)
        const demandArg = row.arg || 0;
        const demandPar = row.par || 0;
        if (!ref && demandPar > 0) {
          unknownSkus.push({ cod, desc: row.descricao || '', demandArg: 0, demandPar });
        }
        // Skip entirely only if no ref AND no ARG demand
        if (!ref && demandArg <= 0) continue;

        // Build demand array with priorities and sort (higher priority first)
        const demands = [];
        for (const country of IND_COUNTRIES) {
          const demand = country === 'ARG' ? demandArg : demandPar;
          if (demand <= 0) continue;

          // PAR requires reference table
          if (country === 'PAR' && !ref) continue;

          const contractKey = `${country}|${cod.toUpperCase()}`;
          const contractInfo = contractMap.get(contractKey);

          if (hasContracts && !contractInfo) {
            skippedByContract.push({ country, cod, desc: row.descricao || '', demand, ppd });
            continue;
          }

          const priority = priorityMap[contractKey] || 1;
          demands.push({ country, demand, priority, contractInfo });
        }

        // Sort by priority descending (higher value = higher priority = served first)
        demands.sort((a, b) => {
          if (b.priority !== a.priority) return b.priority - a.priority;
          // Tie-break: ARG before PAR (original behavior)
          return a.country.localeCompare(b.country);
        });

        for (const { country, demand, priority, contractInfo } of demands) {
          if (remainingStock <= 0) continue;

          const allocBoxes = Math.min(demand, remainingStock);
          remainingStock -= allocBoxes;

          const pallets = allocBoxes / ppd;

          if (country === 'ARG') {
            // Argentina: lógica direta como Hub — 1 pallet = 1 posição, 28 pal / 25 tons
            // pesoBruto do Excel é peso por caixa (kg), peso por pallet = pesoBruto * ppd + 30kg do pallet
            const PALLET_WEIGHT = 30; // kg por pallet
            const weightPerPallet = pesoBruto > 0 && ppd > 0 ? (pesoBruto * ppd) + PALLET_WEIGHT : 800; // fallback 800kg
            const weight = pallets * weightPerPallet;

            allocated[country].push({
              cod,
              desc: row.descricao || '',
              allocBoxes,
              ppd,
              pallets,
              fator: 1,
              pesoPallet: weightPerPallet,
              positions: pallets, // 1 pallet = 1 posição
              weight,
              priority,
              contrato: contractInfo?.contrato || '',
              linha: contractInfo?.linha || ''
            });
          } else {
            // PAR: usa tabela de referência com fator
            const positions = pallets / ref.fator;
            const weight = pallets * ref.pesoPallet;

            allocated[country].push({
              cod,
              desc: row.descricao || '',
              allocBoxes,
              ppd,
              pallets,
              fator: ref.fator,
              pesoPallet: ref.pesoPallet,
              positions,
              weight,
              priority,
              contrato: contractInfo?.contrato || '',
              linha: contractInfo?.linha || ''
            });
          }
        }

        stockSummary.push({ cod, desc: row.descricao, estoque: row.estoque, demandArg, demandPar, remaining: remainingStock });
      }

      // 4. Form trucks per country
      const trucks = {};
      for (const country of IND_COUNTRIES) {
        const maxWeight = country === 'ARG' ? MAX_WEIGHT_ARG : MAX_WEIGHT_PER_TRUCK;
        trucks[country] = this.formTrucks(allocated[country], maxWeight);
      }

      // 5. Build output
      const output = [];
      for (const country of IND_COUNTRIES) {
        let truckId = 1;
        for (const truck of trucks[country]) {
          for (const item of truck.items) {
            const prioLabel = item.priority === 4 ? 'Extrema' : item.priority === 3 ? 'Forte' : item.priority === 2 ? 'Moderada' : 'Baixa';
            output.push({
              Country: country,
              TruckId: truckId,
              SKU: item.cod,
              Desc: item.desc,
              Caixas: Math.round(item.allocBoxes),
              Pallets: parseFloat(item.pallets.toFixed(2)),
              PPD: item.ppd,
              Fator: item.fator,
              Posicoes: parseFloat(item.positions.toFixed(4)),
              Peso: parseFloat(item.weight.toFixed(1)),
              Prioridade: prioLabel,
              Contrato: item.contrato,
              Linha: item.linha
            });
          }
          truckId++;
        }
      }

      // 6. Summary stats
      const totalTrucks = Object.values(trucks).reduce((s, t) => s + t.length, 0);
      const totalPallets = output.reduce((s, r) => s + r.Pallets, 0);
      const totalPositions = output.reduce((s, r) => s + r.Posicoes, 0);
      const totalWeight = output.reduce((s, r) => s + r.Peso, 0);

      this.setState({
        loading: false,
        allocationResult: {
          output,
          trucks,
          skippedByContract,
          unknownSkus,
          stockSummary,
          stats: { totalTrucks, totalPallets, totalPositions, totalWeight }
        }
      });
      this.renderTabContent();

    } catch (err) {
      this.setState({ loading: false, error: err.message });
      this.renderTabContent();
    }
  }

  // ========== TRUCK FORMATION (GREEDY BIN-PACKING) ==========

  formTrucks(items, maxWeight = MAX_WEIGHT_PER_TRUCK) {
    if (items.length === 0) return [];

    // Sort by priority descending (higher priority first), then by positions descending (biggest first for packing)
    const remaining = items.map((item, idx) => ({ ...item, _idx: idx }));
    remaining.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return b.positions - a.positions;
    });

    const trucks = [];
    const toAllocate = [...remaining];
    const minOccupancy = getMinOccupancy();
    const minPositions = (minOccupancy / 100) * MAX_POSITIONS_PER_TRUCK;
    let failedAttempts = 0;
    const MAX_FAILED = Math.max(10, remaining.length); // Tenta mais combinações antes de desistir

    // REFERENCE_TABLE stores fator with 4 decimals (e.g. 1.0714 for 30/28).
    // The truncation causes 28 * fator to fall just under the target integer
    // (28 * 1.0714 = 29.9992 instead of 30), and Math.floor then drops 1 pallet.
    // POS_EPSILON absorbs this error without ever over-counting a real pallet,
    // since fator stored at 4 decimals has max error ~0.002 over 28 positions.
    const POS_EPSILON = 0.01;
    const WEIGHT_EPSILON = 0.5;

    while (toAllocate.length > 0 && failedAttempts < MAX_FAILED) {
      const truck = { items: [], totalPositions: 0, totalWeight: 0 };
      const notFitted = [];

      for (let i = 0; i < toAllocate.length; i++) {
        const item = toAllocate[i];

        // Try to fit entire item
        if (truck.totalPositions + item.positions <= MAX_POSITIONS_PER_TRUCK + POS_EPSILON &&
            truck.totalWeight + item.weight <= maxWeight + WEIGHT_EPSILON) {
          truck.items.push(item);
          truck.totalPositions += item.positions;
          truck.totalWeight += item.weight;
          continue;
        }

        // Try partial fit (split by whole pallets)
        const remainPos = MAX_POSITIONS_PER_TRUCK - truck.totalPositions;
        const remainWeight = maxWeight - truck.totalWeight;

        const maxPalletsByPos = Math.floor(remainPos * item.fator + POS_EPSILON);
        const maxPalletsByWeight = Math.floor((remainWeight + WEIGHT_EPSILON) / item.pesoPallet);
        const maxPallets = Math.min(maxPalletsByPos, maxPalletsByWeight, Math.floor(item.pallets));

        if (maxPallets >= 1) {
          const partialBoxes = maxPallets * item.ppd;
          const partialPositions = maxPallets / item.fator;
          const partialWeight = maxPallets * item.pesoPallet;

          truck.items.push({
            ...item,
            allocBoxes: partialBoxes,
            pallets: maxPallets,
            positions: partialPositions,
            weight: partialWeight
          });
          truck.totalPositions += partialPositions;
          truck.totalWeight += partialWeight;

          // Keep remainder
          const remPallets = item.pallets - maxPallets;
          if (remPallets > 0) {
            notFitted.push({
              ...item,
              allocBoxes: item.allocBoxes - partialBoxes,
              pallets: remPallets,
              positions: remPallets / item.fator,
              weight: remPallets * item.pesoPallet
            });
          }
        } else {
          notFitted.push(item);
        }
      }

      if (truck.items.length === 0) {
        break; // Can't fit anything more
      }

      // Verificar ocupação mínima — sempre respeitar, sem exceções
      if (truck.totalPositions >= minPositions) {
        trucks.push(truck);
        failedAttempts = 0;
      } else {
        // Caminhão abaixo da ocupação mínima - devolver itens ao pool
        // e tentar combinação diferente removendo o primeiro item (maior)
        // para dar chance a itens menores preencherem melhor
        const truckItems = truck.items;
        const firstItem = truckItems.shift();
        notFitted.push(...truckItems);
        notFitted.push(firstItem);
        failedAttempts++;
      }

      toAllocate.length = 0;
      toAllocate.push(...notFitted);
      // Re-sort: prioridade primeiro, depois posições
      toAllocate.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.positions - a.positions;
      });
    }

    return trucks;
  }

  // ========== SETTINGS TAB ==========

  renderSettingsTab(area) {
    const currentOccupancy = getMinOccupancy();
    const minPos = (currentOccupancy / 100) * MAX_POSITIONS_PER_TRUCK;

    area.innerHTML = `
      <div class="fade-in max-w-2xl mx-auto">
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <i data-lucide="settings" class="w-5 h-5 text-green-600"></i>
            Configuracoes
          </h2>

          <!-- Ocupação Mínima -->
          <div class="border rounded-lg p-5 mb-4">
            <h3 class="font-semibold text-gray-700 mb-1">Ocupacao Minima por Caminhao</h3>
            <p class="text-sm text-gray-500 mb-4">
              Caminhoes que nao atingirem este percentual de posicoes ocupadas serao descartados.
              Com ${MAX_POSITIONS_PER_TRUCK} posicoes por caminhao, o minimo atual e <strong>${minPos.toFixed(1)} posicoes</strong>.
            </p>
            <div class="flex items-center gap-4">
              <input type="range" id="occupancyRange" min="50" max="100" step="1" value="${currentOccupancy}"
                class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600">
              <div class="flex items-center gap-1">
                <input type="number" id="occupancyInput" min="50" max="100" step="1" value="${currentOccupancy}"
                  class="w-20 px-3 py-2 border rounded-lg text-center text-lg font-bold text-green-700 focus:ring-2 focus:ring-green-500 focus:outline-none">
                <span class="text-lg font-bold text-gray-500">%</span>
              </div>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-1 px-1">
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>

            <!-- Presets -->
            <div class="flex gap-2 mt-4">
              <button class="occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition
                ${currentOccupancy === 90 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'}"
                data-value="90">90%</button>
              <button class="occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition
                ${currentOccupancy === 95 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'}"
                data-value="95">95%</button>
              <button class="occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition
                ${currentOccupancy === 98 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'}"
                data-value="98">98%</button>
              <button class="occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition
                ${currentOccupancy === 100 ? 'bg-green-100 border-green-400 text-green-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-600'}"
                data-value="100">100%</button>
            </div>
          </div>

          <!-- Info -->
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
            <i data-lucide="info" class="w-4 h-4 inline mr-1"></i>
            As configuracoes sao salvas automaticamente no navegador e persistem entre sessoes.
          </div>

          <!-- Status salvo -->
          <div id="settingsSaved" class="hidden mt-4 p-3 bg-green-50 border border-green-300 rounded-lg text-sm text-green-700 text-center font-medium">
            <i data-lucide="check-circle" class="w-4 h-4 inline mr-1"></i> Configuracao salva!
          </div>
        </div>
      </div>`;

    lucide.createIcons();

    const rangeEl = document.getElementById('occupancyRange');
    const inputEl = document.getElementById('occupancyInput');

    const saveOccupancy = (val) => {
      const num = Math.min(100, Math.max(50, parseInt(val) || DEFAULT_MIN_OCCUPANCY));
      localStorage.setItem('ind_minOccupancy', num.toString());
      rangeEl.value = num;
      inputEl.value = num;
      // Flash saved message
      const saved = document.getElementById('settingsSaved');
      saved.classList.remove('hidden');
      setTimeout(() => saved.classList.add('hidden'), 2000);
      // Update presets styling
      document.querySelectorAll('.occupancy-preset').forEach(btn => {
        if (parseInt(btn.dataset.value) === num) {
          btn.className = 'occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition bg-green-100 border-green-400 text-green-700';
        } else {
          btn.className = 'occupancy-preset px-3 py-1.5 text-sm rounded-lg border transition bg-gray-50 hover:bg-gray-100 text-gray-600';
        }
      });
    };

    rangeEl.addEventListener('input', () => {
      inputEl.value = rangeEl.value;
    });
    rangeEl.addEventListener('change', () => {
      saveOccupancy(rangeEl.value);
    });
    inputEl.addEventListener('change', () => {
      saveOccupancy(inputEl.value);
    });
    document.querySelectorAll('.occupancy-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        saveOccupancy(btn.dataset.value);
      });
    });
  }

  // ========== HISTORY TAB ==========

  renderHistoryTab(area) {
    area.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Historico de Alocacoes</h2>
        <div id="historyList">
          <div class="flex justify-center py-12">
            <div class="spinner" style="border-top-color: #16a34a;"></div>
          </div>
        </div>
      </div>`;
    this.loadHistory();
  }

  async loadHistory() {
    const container = document.getElementById('historyList');
    if (!container) return;

    const { data, error } = await ind_historico.getAll();

    if (error) {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="alert-circle" class="w-16 h-16 text-red-400 mx-auto mb-4"></i>
          <p class="text-red-600">Erro ao carregar historico</p>
          <p class="text-sm text-gray-500 mt-2">${error.message}</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="inbox" class="w-16 h-16 text-gray-400 mx-auto mb-4"></i>
          <p class="text-gray-600">Nenhum historico encontrado</p>
          <p class="text-sm text-gray-500 mt-2">Execute uma alocacao e salve no historico para ver aqui</p>
        </div>`;
      lucide.createIcons();
      return;
    }

    this._historyData = data;

    container.innerHTML = data.map((item, index) => {
      const dataAlocacao = new Date(item.data_alocacao).toLocaleString('pt-BR');
      const resultado = item.resultado || {};
      const skippedCount = resultado.skippedByContract?.length || 0;
      const unknownCount = resultado.unknownSkus?.length || 0;

      return `
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-4 hover:shadow-md transition">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
                  <i data-lucide="truck" class="w-6 h-6 text-white"></i>
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">Alocacao #${data.length - index}</h3>
                  <p class="text-sm text-gray-500">
                    <i data-lucide="calendar" class="inline w-3 h-3"></i> ${dataAlocacao}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="bg-green-50 rounded-lg p-3">
                  <p class="text-xs text-green-600 font-medium mb-1">Caminhoes</p>
                  <p class="text-2xl font-bold text-green-900">${item.total_caminhoes}</p>
                </div>
                <div class="bg-blue-50 rounded-lg p-3">
                  <p class="text-xs text-blue-600 font-medium mb-1">Pallets</p>
                  <p class="text-2xl font-bold text-blue-900">${parseFloat(item.total_pallets || 0).toFixed(1)}</p>
                </div>
                <div class="bg-purple-50 rounded-lg p-3">
                  <p class="text-xs text-purple-600 font-medium mb-1">Posicoes</p>
                  <p class="text-2xl font-bold text-purple-900">${parseFloat(item.total_posicoes || 0).toFixed(1)}</p>
                </div>
                <div class="bg-orange-50 rounded-lg p-3">
                  <p class="text-xs text-orange-600 font-medium mb-1">Peso (kg)</p>
                  <p class="text-2xl font-bold text-orange-900">${parseFloat(item.total_peso || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                </div>
              </div>

              <div class="text-xs text-gray-500">
                <span class="mr-3">Ocupacao min: ${item.ocupacao_minima || 90}%</span>
                ${skippedCount > 0 ? `<span class="text-red-500 mr-3">Sem contrato: ${skippedCount}</span>` : ''}
                ${unknownCount > 0 ? `<span class="text-yellow-600">SKUs desconhecidos: ${unknownCount}</span>` : ''}
              </div>
            </div>

            <div class="flex flex-col gap-2 ml-4">
              <button class="ind-view-history bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2" data-index="${index}">
                <i data-lucide="eye" class="w-4 h-4"></i> Ver Detalhes
              </button>
              <button class="ind-export-history bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2" data-index="${index}">
                <i data-lucide="download" class="w-4 h-4"></i> Exportar Excel
              </button>
              <button class="ind-delete-history bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2" data-id="${item.id}">
                <i data-lucide="trash-2" class="w-4 h-4"></i> Deletar
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    lucide.createIcons();

    document.querySelectorAll('.ind-view-history').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this._historyData[parseInt(btn.dataset.index)];
        this.viewHistoryDetails(item);
      });
    });

    document.querySelectorAll('.ind-export-history').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = this._historyData[parseInt(btn.dataset.index)];
        this.exportHistoryToExcel(item);
      });
    });

    document.querySelectorAll('.ind-delete-history').forEach(btn => {
      btn.addEventListener('click', () => this.deleteHistoryItem(btn.dataset.id));
    });
  }

  async saveToHistory() {
    if (!this.state.allocationResult) return;

    const btn = document.getElementById('btnSaveHistory');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> Salvando...';
    }

    try {
      const { stats, output, skippedByContract, unknownSkus, stockSummary } = this.state.allocationResult;

      const resultado = {
        output,
        skippedByContract,
        unknownSkus,
        stockSummary,
        stats
      };

      const { error } = await ind_historico.save(resultado, {
        totalTrucks: stats.totalTrucks,
        totalPallets: stats.totalPallets,
        totalPositions: stats.totalPositions,
        totalWeight: stats.totalWeight,
        ocupacaoMinima: getMinOccupancy()
      });

      if (error) throw new Error(error.message);

      this.switchTab('history');
    } catch (err) {
      alert('Erro ao salvar: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Salvar no Historico';
        lucide.createIcons();
      }
    }
  }

  viewHistoryDetails(historyItem) {
    if (!historyItem.resultado) {
      alert('Dados desta alocacao nao disponiveis');
      return;
    }
    this.setState({ allocationResult: historyItem.resultado });
    this.switchTab('allocation');
  }

  exportHistoryToExcel(historyItem) {
    if (!historyItem.resultado) {
      alert('Dados desta alocacao nao disponiveis');
      return;
    }
    // Temporarily set allocationResult, export, then restore
    const prev = this.state.allocationResult;
    this.state.allocationResult = historyItem.resultado;
    this.exportToExcel();
    this.state.allocationResult = prev;
  }

  async deleteHistoryItem(id) {
    if (!id) return;
    if (!confirm('Tem certeza que deseja deletar esta alocacao do historico?\n\nEsta acao nao pode ser desfeita.')) return;

    try {
      const { error } = await ind_historico.delete(id);
      if (error) throw new Error(error.message);
      await this.loadHistory();
    } catch (err) {
      alert('Erro ao deletar: ' + err.message);
    }
  }

  // ========== RENDER ALLOCATION RESULTS ==========

  renderAllocationResults() {
    const resultsDiv = document.getElementById('allocationResults');
    if (!resultsDiv || !this.state.allocationResult) return;

    const { output, trucks, skippedByContract, unknownSkus, stats } = this.state.allocationResult;

    let html = '';

    // Stats cards
    html += `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-green-500">
          <p class="text-sm text-gray-500">Total Caminhoes</p>
          <p class="text-3xl font-bold text-green-700">${stats.totalTrucks}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-blue-500">
          <p class="text-sm text-gray-500">Total Pallets</p>
          <p class="text-3xl font-bold text-blue-700">${stats.totalPallets.toFixed(1)}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-purple-500">
          <p class="text-sm text-gray-500">Total Posicoes</p>
          <p class="text-3xl font-bold text-purple-700">${stats.totalPositions.toFixed(1)}</p>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-4 text-center border-t-4 border-orange-500">
          <p class="text-sm text-gray-500">Peso Total (kg)</p>
          <p class="text-3xl font-bold text-orange-700">${stats.totalWeight.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
        </div>
      </div>`;

    // Alerts
    if (unknownSkus.length > 0) {
      html += `
        <div class="p-4 bg-yellow-50 border border-yellow-300 rounded-lg mb-4">
          <p class="font-semibold text-yellow-800"><i data-lucide="alert-triangle" class="w-4 h-4 inline"></i> ${unknownSkus.length} SKUs PAR ignorados (nao encontrados na tabela de referencia)</p>
          <div class="text-xs mt-2 max-h-32 overflow-y-auto">${unknownSkus.map(u => `<span class="inline-block bg-yellow-200 px-2 py-0.5 rounded mr-1 mb-1">${u.cod}</span>`).join('')}</div>
        </div>`;
    }

    if (skippedByContract.length > 0) {
      html += `
        <div class="p-4 bg-red-50 border border-red-300 rounded-lg mb-4">
          <p class="font-semibold text-red-800"><i data-lucide="x-circle" class="w-4 h-4 inline"></i> ${skippedByContract.length} SKUs ignorados (sem contrato ativo)</p>
          <div class="text-xs mt-2 max-h-32 overflow-y-auto">${skippedByContract.map(s => `<span class="inline-block bg-red-200 px-2 py-0.5 rounded mr-1 mb-1">${s.country}|${s.cod}</span>`).join('')}</div>
        </div>`;
    }

    // Per country truck details
    for (const country of IND_COUNTRIES) {
      const countryTrucks = trucks[country] || [];
      if (countryTrucks.length === 0) continue;

      html += `
        <div class="bg-white rounded-xl shadow-sm p-6 mb-4">
          <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <span class="px-3 py-1 rounded-lg text-white ${country === 'ARG' ? 'bg-blue-600' : 'bg-purple-600'}">${country}</span>
            ${IND_COUNTRY_NAMES[country]} - ${countryTrucks.length} caminhao(es)
          </h3>`;

      countryTrucks.forEach((truck, tIdx) => {
        const occPct = ((truck.totalPositions / MAX_POSITIONS_PER_TRUCK) * 100).toFixed(1);
        const weightPct = ((truck.totalWeight / MAX_WEIGHT_PER_TRUCK) * 100).toFixed(1);

        html += `
          <div class="mb-4 border rounded-lg overflow-hidden">
            <div class="bg-gray-50 px-4 py-2 flex items-center justify-between">
              <span class="font-semibold text-sm">Caminhao ${tIdx + 1}</span>
              <div class="flex gap-4 text-xs">
                <span>Posicoes: <strong>${truck.totalPositions.toFixed(2)}</strong>/28 (${occPct}%)</span>
                <span>Peso: <strong>${truck.totalWeight.toFixed(0)}</strong>/27000 kg (${weightPct}%)</span>
              </div>
            </div>
            <table class="w-full text-xs">
              <thead class="bg-gray-100"><tr>
                <th class="px-3 py-1 text-left">SKU</th>
                <th class="px-3 py-1 text-left">Descricao</th>
                <th class="px-3 py-1 text-right">Caixas</th>
                <th class="px-3 py-1 text-right">Pallets</th>
                <th class="px-3 py-1 text-right">Fator</th>
                <th class="px-3 py-1 text-right">Posicoes</th>
                <th class="px-3 py-1 text-right">Peso (kg)</th>
                <th class="px-3 py-1 text-left">Contrato</th>
              </tr></thead>
              <tbody>
                ${truck.items.map(item => `
                  <tr class="border-t">
                    <td class="px-3 py-1 font-mono">${item.cod}</td>
                    <td class="px-3 py-1 truncate max-w-[200px]">${item.desc}</td>
                    <td class="px-3 py-1 text-right">${Math.round(item.allocBoxes).toLocaleString('pt-BR')}</td>
                    <td class="px-3 py-1 text-right">${item.pallets.toFixed(2)}</td>
                    <td class="px-3 py-1 text-right">${item.fator.toFixed(4)}</td>
                    <td class="px-3 py-1 text-right">${item.positions.toFixed(4)}</td>
                    <td class="px-3 py-1 text-right">${item.weight.toFixed(1)}</td>
                    <td class="px-3 py-1">${item.contrato || '-'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      });

      html += '</div>';
    }

    resultsDiv.innerHTML = html;
    lucide.createIcons();
  }

  // ========== EXCEL EXPORT ==========

  exportToExcel() {
    const result = this.state.allocationResult;
    if (!result) return;

    const wb = XLSX.utils.book_new();

    // Sheet 1: Alocacao
    if (result.output.length > 0) {
      const ws = XLSX.utils.json_to_sheet(result.output.map(r => ({
        Pais: r.Country,
        Caminhao: r.TruckId,
        SKU: r.SKU,
        Descricao: r.Desc,
        Caixas: r.Caixas,
        Pallets: r.Pallets,
        PPD: r.PPD,
        Fator: r.Fator,
        Posicoes: r.Posicoes,
        'Peso (kg)': r.Peso,
        Contrato: r.Contrato,
        Linha: r.Linha,
        Prioridade: r.Prioridade
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Alocacao');
    }

    // Sheet 2: Resumo Caminhoes
    const truckSummary = [];
    for (const country of IND_COUNTRIES) {
      const countryTrucks = result.trucks[country] || [];
      countryTrucks.forEach((truck, idx) => {
        truckSummary.push({
          Pais: country,
          Caminhao: idx + 1,
          Posicoes: parseFloat(truck.totalPositions.toFixed(2)),
          'Posicoes (%)': parseFloat(((truck.totalPositions / MAX_POSITIONS_PER_TRUCK) * 100).toFixed(1)),
          'Peso (kg)': parseFloat(truck.totalWeight.toFixed(1)),
          'Peso (%)': parseFloat(((truck.totalWeight / MAX_WEIGHT_PER_TRUCK) * 100).toFixed(1)),
          SKUs: truck.items.length
        });
      });
    }
    if (truckSummary.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(truckSummary), 'Resumo Caminhoes');
    }

    // Sheet 3: Sem Contrato
    if (result.skippedByContract.length > 0) {
      const ws = XLSX.utils.json_to_sheet(result.skippedByContract.map(s => ({
        Pais: s.country,
        COD: s.cod,
        Descricao: s.desc,
        Demanda: s.demand
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'Sem Contrato');
    }

    // Sheet 4: SKUs Desconhecidos (apenas PAR — ARG não requer tabela)
    if (result.unknownSkus.length > 0) {
      const ws = XLSX.utils.json_to_sheet(result.unknownSkus.map(u => ({
        COD: u.cod,
        Descricao: u.desc,
        'Demanda PAR': u.demandPar,
        Motivo: 'PAR: Nao encontrado na tabela de referencia (fator)'
      })));
      XLSX.utils.book_append_sheet(wb, ws, 'SKUs Desconhecidos');
    }

    // Download
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Alocacao_Indaiatuba_${dateStr}.xlsx`);
  }
}
