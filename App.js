/**
 * Truck Allocation System - Main Application
 *
 * This module handles the allocation of pallets to trucks for international logistics.
 * It implements genetic algorithms for optimal truck loading and supports multiple
 * countries with different truck configurations.
 *
 * @module App
 * @version 2.0.0
 */

import { supabase, auth, estoque, prioridades, historico, skusObrigatorios, configuracoes, contratos, zlsb } from './supabaseClient.js';

// ----------------------------------------------------------------------------
// CONSTANTS AND CONFIGURATION
// ----------------------------------------------------------------------------

// Supported country codes for allocation
const COUNTRIES = [
  'ARG', 'BOL', 'CHI', 'COL', 'CUB', 'DR', 'ECU', 'MEX', 'PAR', 'PER',
  'URU', 'COS', 'ELS', 'GUA', 'HON', 'NIC', 'PAN', 'VEN', 'CAR', 'JAM', 'TT'
];

// Maps various country code formats from Excel imports to internal codes
const COUNTRY_CODE_MAP = {
  'UY01': 'URU', 'UY': 'URU', 'UY 01': 'URU', 'URUGUAY': 'URU', 'URUGUAI': 'URU',
  'PY01': 'PAR', 'PY': 'PAR', 'PY 01': 'PAR', 'PARAGUAY': 'PAR', 'PARAGUAI': 'PAR',
  'AR01': 'ARG', 'AR': 'ARG', 'AR 01': 'ARG', 'ARGENTINA': 'ARG',
  'BR01': 'BRA', 'BR': 'BRA', 'BR 01': 'BRA', 'BRASIL': 'BRA', 'BRAZIL': 'BRA',
  'CL01': 'CHI', 'CL': 'CHI', 'CL 01': 'CHI', 'CHILE': 'CHI',
  'CO01': 'COL', 'CO': 'COL', 'CO 01': 'COL', 'COLOMBIA': 'COL', 'COLÔMBIA': 'COL',
  'CU01': 'CUB', 'CU': 'CUB', 'CU 01': 'CUB', 'CUBA': 'CUB',
  'DO01': 'DR', 'DO': 'DR', 'DO 01': 'DR', 'DOMINICAN REPUBLIC': 'DR', 'REP DOMINICANA': 'DR',
  'EC01': 'ECU', 'EC': 'ECU', 'EC 01': 'ECU', 'ECUADOR': 'ECU', 'EQUADOR': 'ECU',
  'MX01': 'MEX', 'MX': 'MEX', 'MX 01': 'MEX', 'MEXICO': 'MEX', 'MÉXICO': 'MEX',
  'PE01': 'PER', 'PE': 'PER', 'PE 01': 'PER', 'PERU': 'PER',
  'CR01': 'COS', 'CR': 'COS', 'CR 01': 'COS', 'COSTA RICA': 'COS',
  'SV01': 'ELS', 'SV': 'ELS', 'SV 01': 'ELS', 'EL SALVADOR': 'ELS',
  'GT01': 'GUA', 'GT': 'GUA', 'GT 01': 'GUA', 'GUATEMALA': 'GUA',
  'HN01': 'HON', 'HN': 'HON', 'HN 01': 'HON', 'HONDURAS': 'HON',
  'NI01': 'NIC', 'NI': 'NIC', 'NI 01': 'NIC', 'NICARAGUA': 'NIC', 'NICARÁGUA': 'NIC',
  'PA01': 'PAN', 'PA': 'PAN', 'PA 01': 'PAN', 'PAN01': 'PAN', 'PANAMA': 'PAN', 'PANAMÁ': 'PAN',
  'VE01': 'VEN', 'VE': 'VEN', 'VE 01': 'VEN', 'VENEZUELA': 'VEN',
  'CAR01': 'CAR', 'CB': 'CAR', 'CAR 01': 'CAR', 'CARIBE': 'CAR', 'CARIBBEAN': 'CAR',
  'JM01': 'JAM', 'JM': 'JAM', 'JM 01': 'JAM', 'JAMAICA': 'JAM',
  'TT01': 'TT', 'TT': 'TT', 'TT 01': 'TT', 'TRINIDAD': 'TT', 'TRINIDAD AND TOBAGO': 'TT', 'TRINIDAD E TOBAGO': 'TT',
  'BO01': 'BOL', 'BO': 'BOL', 'BO 01': 'BOL', 'BOLIVIA': 'BOL', 'BOLÍVIA': 'BOL'
};

const PALLETS_PER_TRUCK = {
  'ARG': 28, 'BOL': 28, 'CHI': 28, 'COL': 22, 'CUB': 22, 'DR': 22, 'ECU': 22,
  'MEX': 22, 'PAR': 28, 'PER': 22, 'URU': 28, 'COS': 22, 'ELS': 22, 'GUA': 22,
  'HON': 22, 'NIC': 22, 'PAN': 22, 'VEN': 22, 'CAR': 22, 'JAM': 22, 'TT': 22
};

// Weight constraints for truck loading (in kilograms)
const TRUCK_MAX_WEIGHT = 25000;
const PALLET_WEIGHT = 30;

// Priority level mappings - supports multiple languages (PT, ES, EN)
// Higher values indicate higher priority; 999 = mandatory items
const PRIORITY_VALUES = {
  'baixa': 1, 'baixo': 1, 'low': 1, 'baja': 1, 'bajo': 1, 'normal': 1,
  'moderada': 2, 'moderado': 2, 'moderate': 2,
  'forte': 3, 'fuerte': 3, 'strong': 3,
  'extrema': 4, 'extremo': 4, 'extreme': 4,
  'obrigatoria': 999
};

const COUNTRY_NAMES = {
  'ARG': 'Argentina', 'BOL': 'Bolívia', 'CHI': 'Chile', 'COL': 'Colômbia',
  'CUB': 'Cuba', 'DR': 'Rep. Dominicana', 'ECU': 'Equador', 'MEX': 'México',
  'PAR': 'Paraguai', 'PER': 'Peru', 'URU': 'Uruguai', 'COS': 'Costa Rica',
  'ELS': 'El Salvador', 'GUA': 'Guatemala', 'HON': 'Honduras', 'NIC': 'Nicarágua',
  'PAN': 'Panamá', 'VEN': 'Venezuela', 'CAR': 'Caribe', 'JAM': 'Jamaica', 'TT': 'Trinidad e Tobago'
};

// Central American HUB countries share trucks with 22-pallet capacity
const HUB_COUNTRIES = ['COS', 'ELS', 'GUA', 'HON', 'NIC', 'PAN'];
const HUB_TRUCK_CAPACITY = 22;

// ----------------------------------------------------------------------------
// MAIN APPLICATION CLASS
// ----------------------------------------------------------------------------

export class App {
  /**
   * Initialize the application with root element and authenticated user
   * @param {HTMLElement} rootElement - DOM element to render the app
   * @param {Object} user - Authenticated user object from Supabase
   */
  constructor(rootElement, user) {
    this.root = rootElement;
    this.user = user;
    this.userRole = null;

    // Isolated sandbox for analyst users (read-only mode, in-memory only)
    this.analystSandbox = {
      estoque: [],
      prioridades: [],
      zlsb: [],
      skusObrigatorios: [],
      hasData: false
    };

    // Application state management
    this.state = {
      loading: false,
      estoque: [],
      prioridades: [],
      allocationResult: null,
      error: null,
      activeTab: 'dashboard'
    };

    // Skip auto-render during recovery mode
    if (!window.isInRecoveryMode) {
      this.render(user);
    }
  }

  // --------------------------------------------------------------------------
  // USER ROLE AND PERMISSIONS
  // --------------------------------------------------------------------------

  /**
   * Fetch user role from database
   * Defaults to 'analyst' (read-only) if role cannot be determined
   */
  async fetchUserRole() {
    if (!this.user) return 'analyst';

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', this.user.id)
        .single();

      if (error) {
        return 'analyst';
      }

      return data?.role || 'analyst';
    } catch (err) {
      return 'analyst';
    }
  }

  /**
   * Get cached user role synchronously
   */
  getUserRole() {
    return this.userRole || 'analyst';
  }

  /**
   * Check if current user has analyst (read-only) permissions
   */
  isAnalyst() {
    return this.getUserRole() === 'analyst';
  }

  /**
   * Check if current user has planning (read-write) permissions
   */
  isPlanning() {
    return this.getUserRole() === 'planning';
  }

  getUserRoleBadge() {
    const role = this.getUserRole();

    if (role === 'planning') {
      return `
        <div class="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          Planning
        </div>
      `;
    } else {
      return `
        <div class="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
          </svg>
          Analyst (Somente Leitura)
        </div>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // RENDERING METHODS
  // --------------------------------------------------------------------------

  /**
   * Main render method - routes to login or dashboard based on auth state
   */
  async render(user) {
    this.user = user;
    if (!user) {
      this.renderLoginScreen();
    } else {
      this.userRole = await this.fetchUserRole();

      console.log(`\nUser authenticated: ${user.email}`);
      console.log(`Role: ${this.userRole}`);
      console.log(`Permissions: ${this.userRole === 'planning' ? 'Read + Write' : 'Read Only'}\n`);

      this.renderDashboard();
    }
  }

  renderLoginScreen() {
    this.root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <i data-lucide="truck" class="w-10 h-10 text-white"></i>
            </div>
            <h1 class="text-3xl font-bold text-gray-800 mb-2">Sistema de Alocação</h1>
            <p class="text-gray-600">Unilever International Logistics</p>
          </div>
          
          <form id="loginForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input 
                type="email" 
                id="email" 
                required
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                placeholder="seu.email@unilever.com"
              />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Senha</label>
              <input 
                type="password" 
                id="password" 
                required
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
              />
            </div>
            
            <div id="loginError" class="hidden text-red-600 text-sm"></div>
            
            <button
              type="submit"
              class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-[1.02] transition"
            >
              Entrar
            </button>
          </form>

          <p class="text-center text-sm text-gray-500 mt-4">
            Acesso restrito. Solicite suas credenciais ao administrador.
          </p>
        </div>
      </div>
    `;

    lucide.createIcons();

    document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
  }

  showPasswordResetScreen() {
    this.root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md fade-in">
          <div class="text-center mb-8">
            <div class="w-20 h-20 bg-gradient-to-br from-green-500 to-teal-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <i data-lucide="key" class="w-10 h-10 text-white"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-800 mb-2">Definir Nova Senha</h1>
            <p class="text-gray-600">Crie sua senha para acessar o sistema</p>
          </div>

          <form id="resetPasswordForm" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Nova Senha</label>
              <input
                type="password"
                id="newPassword"
                required
                minlength="6"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Confirmar Senha</label>
              <input
                type="password"
                id="confirmPassword"
                required
                minlength="6"
                class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
                placeholder="Repita a senha"
              />
            </div>

            <div id="resetError" class="hidden text-red-600 text-sm bg-red-50 p-3 rounded-lg"></div>
            <div id="resetSuccess" class="hidden text-green-600 text-sm bg-green-50 p-3 rounded-lg"></div>

            <button
              type="submit"
              id="resetSubmitBtn"
              class="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-[1.02] transition"
            >
              Salvar Senha
            </button>
          </form>
        </div>
      </div>
    `;

    lucide.createIcons();

    document.getElementById('resetPasswordForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const errorDiv = document.getElementById('resetError');
      const successDiv = document.getElementById('resetSuccess');
      const submitBtn = document.getElementById('resetSubmitBtn');

      // Reset messages
      errorDiv.classList.add('hidden');
      successDiv.classList.add('hidden');

      // Validate passwords match
      if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'As senhas não coincidem. Por favor, verifique.';
        errorDiv.classList.remove('hidden');
        return;
      }

      // Validate minimum length
      if (newPassword.length < 6) {
        errorDiv.textContent = 'A senha deve ter no mínimo 6 caracteres.';
        errorDiv.classList.remove('hidden');
        return;
      }

      // Disable button during request
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';

      try {
        const { error } = await supabase.auth.updateUser({ password: newPassword });

        if (error) {
          errorDiv.textContent = 'Erro ao definir senha: ' + error.message;
          errorDiv.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Salvar Senha';
          return;
        }

        // Success
        successDiv.textContent = 'Senha definida com sucesso! Redirecionando...';
        successDiv.classList.remove('hidden');

        // Redirect to dashboard after 2 seconds
        setTimeout(async () => {
          const user = await auth.getCurrentUser();
          this.render(user);
        }, 2000);

      } catch (err) {
        errorDiv.textContent = 'Erro inesperado: ' + err.message;
        errorDiv.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Salvar Senha';
      }
    });
  }

  renderDashboard() {
    this.root.innerHTML = `
      <div class="min-h-screen bg-gray-50">
        <header class="bg-white shadow-sm border-b border-gray-200">
          <div class="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <i data-lucide="truck" class="w-6 h-6 text-white"></i>
              </div>
              <div>
                <h1 class="text-xl font-bold text-gray-800">Sistema de Alocação</h1>
                <p class="text-sm text-gray-500">Unilever International Logistics</p>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="text-sm text-gray-600">${this.user.email}</div>
                ${this.getUserRoleBadge()}
              </div>
              <button id="switchWarehouseBtn" class="px-3 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition text-sm flex items-center gap-1">
                <i data-lucide="arrow-left-right" class="w-4 h-4"></i> Trocar Armazem
              </button>
              <button id="logoutBtn" class="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition">
                Sair
              </button>
            </div>
          </div>
        </header>

        <div class="bg-white border-b border-gray-200">
          <div class="max-w-7xl mx-auto px-6">
            <nav class="flex gap-1">
              <button data-tab="dashboard" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'dashboard' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="layout-dashboard" class="inline w-4 h-4 mr-2"></i>
                Dashboard
              </button>
              <button data-tab="import" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'import' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
                Importar Dados
              </button>
              <button data-tab="mandatory" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'mandatory' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="alert-circle" class="inline w-4 h-4 mr-2"></i>
                SKUs Obrigatórios
              </button>
              <button data-tab="contracts" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'contracts' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="file-text" class="inline w-4 h-4 mr-2"></i>
                Contratos
              </button>
              <button data-tab="allocation" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'allocation' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="truck" class="inline w-4 h-4 mr-2"></i>
                Alocar Caminhões
              </button>
              <button data-tab="settings" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'settings' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="settings" class="inline w-4 h-4 mr-2"></i>
                Configurações
              </button>
              <button data-tab="history" class="tab-btn px-6 py-3 font-medium transition border-b-2 ${this.state.activeTab === 'history' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-600 hover:text-gray-800'}">
                <i data-lucide="history" class="inline w-4 h-4 mr-2"></i>
                Histórico
              </button>
            </nav>
          </div>
        </div>

        <main class="max-w-7xl mx-auto px-6 py-8">
          <div id="contentArea"></div>
        </main>
      </div>
    `;

    lucide.createIcons();
    
    document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
    document.getElementById('switchWarehouseBtn').addEventListener('click', () => {
      sessionStorage.removeItem('selectedWarehouse');
      location.reload();
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.closest('button').dataset.tab));
    });

    this.renderTabContent();
  }

  renderTabContent() {
    const contentArea = document.getElementById('contentArea');
    
    switch(this.state.activeTab) {
      case 'dashboard':
        this.renderDashboardTab(contentArea);
        break;
      case 'import':
        this.renderImportTab(contentArea);
        break;
      case 'mandatory':
        this.renderMandatoryTab(contentArea);
        break;
      case 'contracts':
        this.renderContractsTab(contentArea);
        break;
      case 'allocation':
        this.renderAllocationTab(contentArea);
        break;
      case 'settings':
        this.renderSettingsTab(contentArea);
        break;
      case 'history':
        this.renderHistoryTab(contentArea);
        break;
    }
    
    lucide.createIcons();
  }

  renderDashboardTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Dashboard</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-gray-600">Pallets Disponíveis</h3>
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <i data-lucide="package" class="w-5 h-5 text-blue-600"></i>
              </div>
            </div>
            <p class="text-3xl font-bold text-gray-800" id="totalSkus">-</p>
            <p class="text-sm text-gray-500 mt-1">Total em estoque</p>

            <div class="mt-4 space-y-2" id="palletsBreakdown">
              <div class="flex justify-between items-center py-2 px-3 bg-green-50 rounded-lg">
                <span class="text-sm text-green-700 flex items-center gap-2">
                  <i data-lucide="check-circle" class="w-4 h-4"></i>
                  Com demanda
                </span>
                <span class="text-sm font-bold text-green-800" id="palletsComDemanda">-</span>
              </div>
              <div class="flex justify-between items-center py-2 px-3 bg-orange-50 rounded-lg">
                <span class="text-sm text-orange-700 flex items-center gap-2">
                  <i data-lucide="alert-circle" class="w-4 h-4"></i>
                  Sem demanda
                </span>
                <span class="text-sm font-bold text-orange-800" id="palletsSemDemanda">-</span>
              </div>
            </div>

            <div id="detailDisponiveis" class="mt-4 pt-4 border-t border-gray-200">
              <div class="space-y-2 max-h-64 overflow-y-auto"></div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-medium text-gray-600">Pallets de Demanda no Mês</h3>
              <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <i data-lucide="trending-up" class="w-5 h-5 text-purple-600"></i>
              </div>
            </div>
            <p class="text-3xl font-bold text-gray-800" id="totalPriorities">-</p>
            <p class="text-sm text-gray-500 mt-1">Demanda total de todos os países</p>
            <button id="toggleDemanda" class="mt-4 text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center gap-2">
              <i data-lucide="chevron-down" class="w-4 h-4"></i>
              Ver por país
            </button>
            <div id="detailDemanda" class="hidden mt-4 pt-4 border-t border-gray-200">
              <div class="space-y-2 max-h-64 overflow-y-auto"></div>
            </div>
          </div>
        </div>

        <div class="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg p-8 text-white">
          <h3 class="text-2xl font-bold mb-2">Pronto para começar?</h3>
          <p class="text-blue-100 mb-6">Importe seus dados e execute a alocação de caminhões por país.</p>
          <button id="startAllocation" class="bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:shadow-lg transform hover:scale-[1.02] transition">
            Iniciar Alocação
            <i data-lucide="arrow-right" class="inline w-4 h-4 ml-2"></i>
          </button>
        </div>
      </div>
    `;

    lucide.createIcons();
    this.loadDashboardStats();

    document.getElementById('startAllocation')?.addEventListener('click', () => this.switchTab('allocation'));

    // Event listener para expandir/colapsar detalhes por país (Demanda)
    document.getElementById('toggleDemanda')?.addEventListener('click', () => {
      const detail = document.getElementById('detailDemanda');
      const icon = document.querySelector('#toggleDemanda i');
      const button = document.getElementById('toggleDemanda');

      if (detail.classList.contains('hidden')) {
        detail.classList.remove('hidden');
        icon.setAttribute('data-lucide', 'chevron-up');
        button.innerHTML = '<i data-lucide="chevron-up" class="w-4 h-4"></i> Ocultar';
      } else {
        detail.classList.add('hidden');
        icon.setAttribute('data-lucide', 'chevron-down');
        button.innerHTML = '<i data-lucide="chevron-down" class="w-4 h-4"></i> Ver por país';
      }
      lucide.createIcons();
    });
  }

  renderImportTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Importar Dados</h2>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 class="font-semibold text-blue-900 mb-2">ℹ️ Formato dos Arquivos</h4>
          <p class="text-blue-800 text-sm mb-2"><strong>Estoque:</strong> COD, DESC, Estoque, PPD, Peso, ARG, BOL, CHI, COL, CUB, DR, ECU, MEX, PAR, PER, URU, COS, ELS, GUA, HON, NIC, VEN, CAR, JAM, TT</p>
          <p class="text-blue-800 text-sm"><strong>Prioridades:</strong> (País), COD, Prioridade</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <i data-lucide="package" class="w-5 h-5 text-blue-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-800">Estoque 1</h3>
            </div>
            <p class="text-gray-600 text-sm mb-4">Primeira categoria de produtos com demanda por país.</p>
            <input type="file" id="stock1File" accept=".xlsx,.xls,.csv" class="hidden" />
            <button id="uploadStock1" class="w-full bg-blue-500 text-white px-4 py-3 rounded-lg hover:bg-blue-600 transition">
              <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
              Selecionar Arquivo
            </button>
            <div id="stock1Status" class="mt-3 text-sm"></div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-cyan-100 rounded-lg flex items-center justify-center">
                <i data-lucide="package" class="w-5 h-5 text-cyan-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-800">Estoque 2</h3>
            </div>
            <p class="text-gray-600 text-sm mb-4">Segunda categoria de produtos com demanda por país.</p>
            <input type="file" id="stock2File" accept=".xlsx,.xls,.csv" class="hidden" />
            <button id="uploadStock2" class="w-full bg-cyan-500 text-white px-4 py-3 rounded-lg hover:bg-cyan-600 transition">
              <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
              Selecionar Arquivo
            </button>
            <div id="stock2Status" class="mt-3 text-sm"></div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <i data-lucide="list-ordered" class="w-5 h-5 text-purple-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-800">Prioridades</h3>
            </div>
            <p class="text-gray-600 text-sm mb-4">Prioridades por país e SKU (baixa, moderada, forte, extrema).</p>
            <input type="file" id="priorityFile" accept=".xlsx,.xls,.csv" class="hidden" />
            <button id="uploadPriority" class="w-full bg-purple-500 text-white px-4 py-3 rounded-lg hover:bg-purple-600 transition">
              <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
              Selecionar Arquivo
            </button>
            <div id="priorityStatus" class="mt-3 text-sm"></div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <i data-lucide="file-check" class="w-5 h-5 text-orange-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-800">Arquivo ZLSB</h3>
            </div>
            <p class="text-gray-600 text-sm mb-4">Lista de SKUs para verificação (apenas informativo).</p>
            <input type="file" id="zlsbFile" accept=".xlsx,.xls,.csv" class="hidden" />
            <button id="uploadZLSB" class="w-full bg-orange-500 text-white px-4 py-3 rounded-lg hover:bg-orange-600 transition">
              <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
              Selecionar Arquivo
            </button>
            <div id="zlsbStatus" class="mt-3 text-sm"></div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <i data-lucide="trash-2" class="w-5 h-5 text-red-600"></i>
              </div>
              <h3 class="text-lg font-semibold text-gray-800">Limpar Dados</h3>
            </div>
            <p class="text-gray-600 text-sm mb-4">Remover dados do banco de dados.</p>
            <div class="grid grid-cols-2 gap-2">
              <button id="clearStock1" class="bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 transition text-sm">
                Est. 1
              </button>
              <button id="clearStock2" class="bg-red-500 text-white px-3 py-2 rounded-lg hover:bg-red-600 transition text-sm">
                Est. 2
              </button>
              <button id="clearZLSB" class="bg-orange-500 text-white px-3 py-2 rounded-lg hover:bg-orange-600 transition text-sm">
                ZLSB
              </button>
              <button id="clearAll" class="bg-red-700 text-white px-3 py-2 rounded-lg hover:bg-red-800 transition text-sm">
                Tudo
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();

    document.getElementById('uploadStock1').addEventListener('click', () => document.getElementById('stock1File').click());
    document.getElementById('uploadStock2').addEventListener('click', () => document.getElementById('stock2File').click());
    document.getElementById('uploadPriority').addEventListener('click', () => document.getElementById('priorityFile').click());
    document.getElementById('uploadZLSB').addEventListener('click', () => document.getElementById('zlsbFile').click());

    document.getElementById('stock1File').addEventListener('change', (e) => this.handleFileUpload(e, 'estoque', 'estoque1'));
    document.getElementById('stock2File').addEventListener('change', (e) => this.handleFileUpload(e, 'estoque', 'estoque2'));
    document.getElementById('priorityFile').addEventListener('change', (e) => this.handleFileUpload(e, 'prioridades'));
    document.getElementById('zlsbFile').addEventListener('change', (e) => this.handleFileUpload(e, 'zlsb'));

    document.getElementById('clearStock1').addEventListener('click', () => this.handleClearData('estoque1'));
    document.getElementById('clearStock2').addEventListener('click', () => this.handleClearData('estoque2'));
    document.getElementById('clearZLSB').addEventListener('click', () => this.handleClearData('zlsb'));
    document.getElementById('clearAll').addEventListener('click', () => this.handleClearData('all'));
  }

  renderMandatoryTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">SKUs Obrigatórios</h2>
        
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <h4 class="font-semibold text-yellow-900 mb-2">⚠️ Sobre SKUs Obrigatórios</h4>
          <p class="text-yellow-800 text-sm mb-2">
            SKUs marcados como obrigatórios serão <strong>SEMPRE</strong> incluídos na alocação, independente da quantidade.
          </p>
          <p class="text-yellow-800 text-sm">
            O sistema usará a <strong>demanda do estoque</strong> para calcular os pallets necessários.
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-4">Adicionar SKU Obrigatório</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="relative">
              <label class="block text-sm font-medium text-gray-700 mb-2">Buscar SKU *</label>
              <div class="relative">
                <input
                  type="text"
                  id="mandatoryCod"
                  placeholder="Digite o código do SKU..."
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <div id="skuSuggestions" class="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto hidden"></div>
              </div>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">País *</label>
              <select id="mandatoryCountry" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none" disabled>
                <option value="">Selecione um SKU primeiro</option>
              </select>
            </div>
            
            <div class="flex items-end">
              <button id="addMandatoryBtn" class="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                <i data-lucide="plus" class="inline w-4 h-4 mr-2"></i>
                Adicionar
              </button>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-800">SKUs Obrigatórios Ativos</h3>
            <button id="clearMandatoryBtn" class="text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition text-sm">
              <i data-lucide="trash-2" class="inline w-4 h-4 mr-1"></i>
              Limpar Todos
            </button>
          </div>
          <div id="mandatoryList">
            <div class="flex justify-center py-8">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
    
    document.getElementById('addMandatoryBtn').addEventListener('click', () => this.addMandatorySku());
    document.getElementById('clearMandatoryBtn').addEventListener('click', () => this.clearMandatory());
    document.getElementById('mandatoryCod').addEventListener('input', (e) => this.handleSkuSearchAdvanced(e.target.value));
    
    this.loadMandatoryList();
  }

  renderContractsTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Contratos de SKU/País</h2>
        
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h4 class="font-semibold text-blue-900 mb-2">ℹ️ Sobre Contratos</h4>
          <p class="text-blue-800 text-sm mb-2">
            Apenas SKUs com <strong>contrato ativo</strong> para um determinado país serão alocados.
          </p>
          <p class="text-blue-800 text-sm">
            <strong>Formato Excel:</strong> Pais (UY01, PY01, etc.), SKU, CONTRATO, LINHA, Ativo (opcional)
          </p>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-6">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <i data-lucide="file-text" class="w-5 h-5 text-green-600"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-800">Importar Contratos</h3>
          </div>
          
          <div class="flex gap-4">
            <div class="flex-1">
              <input type="file" id="contractFile" accept=".xlsx,.xls,.csv" class="hidden" />
              <button id="uploadContract" class="w-full bg-green-500 text-white px-4 py-3 rounded-lg hover:bg-green-600 transition">
                <i data-lucide="upload" class="inline w-4 h-4 mr-2"></i>
                Selecionar Arquivo Excel
              </button>
              <div id="contractStatus" class="mt-3 text-sm"></div>
            </div>
            
            <button id="clearContracts" class="bg-red-500 text-white px-6 py-3 rounded-lg hover:bg-red-600 transition">
              <i data-lucide="trash-2" class="inline w-4 h-4 mr-2"></i>
              Limpar Todos
            </button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold text-gray-800">Contratos Cadastrados</h3>
            <div class="flex gap-2">
              <input
                type="text"
                id="filterSku"
                placeholder="Buscar SKU..."
                class="px-4 py-2 border border-gray-300 rounded-lg text-sm w-48 focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <select id="filterCountry" class="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">Todos os países</option>
                ${COUNTRIES.map(c => `<option value="${c}">${COUNTRY_NAMES[c]}</option>`).join('')}
              </select>
              <select id="filterStatus" class="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="all">Todos</option>
                <option value="active" selected>Somente Ativos</option>
                <option value="inactive">Somente Inativos</option>
              </select>
            </div>
          </div>
          <div id="contractsList">
            <div class="flex justify-center py-8">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    lucide.createIcons();
    
    document.getElementById('uploadContract').addEventListener('click', () => document.getElementById('contractFile').click());
    document.getElementById('contractFile').addEventListener('change', (e) => this.handleContractsUpload(e));
    document.getElementById('clearContracts').addEventListener('click', () => this.clearAllContracts());
    document.getElementById('filterSku').addEventListener('input', () => this.loadContractsList());
    document.getElementById('filterCountry').addEventListener('change', () => this.loadContractsList());
    document.getElementById('filterStatus').addEventListener('change', () => this.loadContractsList());
    
    this.loadContractsList();
  }

  renderSettingsTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Configurações de Alocação</h2>
        
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 max-w-2xl">
          <div id="settingsContent">
            <div class="flex justify-center py-8">
              <div class="spinner"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.loadSettings();
  }

  // --------------------------------------------------------------------------
  // MANDATORY SKU MANAGEMENT
  // --------------------------------------------------------------------------

  /**
   * Load and display mandatory SKU list
   * Analysts see sandbox data, Planning users see database data
   */
  async loadMandatoryList() {
    const container = document.getElementById('mandatoryList');

    let data, error;

    if (this.isAnalyst()) {
      // Analyst: show sandbox mandatory SKUs only
      data = this.analystSandbox.skusObrigatorios;
      error = null;
    } else {
      // Planning: fetch from database
      const result = await skusObrigatorios.getAll();
      data = result.data;
      error = result.error;
    }
    
    if (error || !data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <i data-lucide="inbox" class="w-12 h-12 text-gray-400 mx-auto mb-3"></i>
          <p class="text-gray-600">Nenhum SKU obrigatório configurado</p>
          <p class="text-sm text-gray-500 mt-1">Adicione SKUs que devem ser sempre enviados</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    const { data: estoqueData } = await estoque.getAll();
    const estoqueMap = {};
    if (estoqueData) {
      estoqueData.forEach(item => {
        const key = item.cod.trim().toUpperCase();
        estoqueMap[key] = item;
      });
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="bg-gray-50 border-b-2 border-gray-200">
            <tr>
              <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU (COD)</th>
              <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descrição</th>
              <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">País</th>
              <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Demanda</th>
              <th class="px-4 py-3 text-center text-sm font-semibold text-gray-700">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            ${data.map(item => {
              const skuKey = item.cod.trim().toUpperCase();
              const skuInfo = estoqueMap[skuKey];
              const demanda = skuInfo ? (skuInfo[item.pais.toLowerCase()] || 0) : 0;
              
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-3 font-medium text-gray-900">${item.cod}</td>
                  <td class="px-4 py-3 text-gray-600 text-sm">${skuInfo?.descricao || '-'}</td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      ${COUNTRY_NAMES[item.pais] || item.pais}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <span class="${demanda > 0 ? 'text-green-600 font-semibold' : 'text-red-600'}">${demanda} cx</span>
                  </td>
                  <td class="px-4 py-3 text-center">
                    <button data-id="${item.id || ''}" data-pais="${item.pais}" data-cod="${item.cod}" class="remove-mandatory-btn text-red-600 hover:bg-red-50 p-2 rounded transition">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    lucide.createIcons();

    document.querySelectorAll('.remove-mandatory-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removeMandatory(btn.dataset.id, btn.dataset.pais, btn.dataset.cod));
    });
  }

  async handleSkuSearchAdvanced(searchTerm) {
    const suggestionsDiv = document.getElementById('skuSuggestions');
    const countrySelect = document.getElementById('mandatoryCountry');
    const addBtn = document.getElementById('addMandatoryBtn');
    
    if (!searchTerm || searchTerm.length < 2) {
      suggestionsDiv.classList.add('hidden');
      suggestionsDiv.innerHTML = '';
      countrySelect.disabled = true;
      countrySelect.innerHTML = '<option value="">Selecione um SKU primeiro</option>';
      addBtn.disabled = true;
      return;
    }

    const { data } = await estoque.getAll();
    if (!data) return;

    const matches = data.filter(item => 
      item.cod.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.descricao && item.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
    ).slice(0, 10);

    if (matches.length > 0) {
      suggestionsDiv.classList.remove('hidden');
      suggestionsDiv.innerHTML = matches.map(item => `
        <div class="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 select-sku-item" 
             data-cod="${item.cod}"
             data-full='${JSON.stringify(item)}'>
          <div class="font-semibold text-gray-800">${item.cod}</div>
          <div class="text-sm text-gray-600">${item.descricao || '-'}</div>
        </div>
      `).join('');

      suggestionsDiv.querySelectorAll('.select-sku-item').forEach(el => {
        el.addEventListener('click', () => {
          const skuData = JSON.parse(el.dataset.full);
          this.selectSkuForMandatory(skuData);
        });
      });
    } else {
      suggestionsDiv.classList.remove('hidden');
      suggestionsDiv.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">Nenhum SKU encontrado</div>';
    }
  }

  selectSkuForMandatory(skuData) {
    const input = document.getElementById('mandatoryCod');
    const suggestionsDiv = document.getElementById('skuSuggestions');
    const countrySelect = document.getElementById('mandatoryCountry');
    const addBtn = document.getElementById('addMandatoryBtn');

    input.value = skuData.cod;
    input.dataset.selected = JSON.stringify(skuData);
    suggestionsDiv.classList.add('hidden');

    const paisesComDemanda = [];
    COUNTRIES.forEach(country => {
      const demanda = skuData[country.toLowerCase()] || 0;
      if (demanda > 0) {
        paisesComDemanda.push(country);
      }
    });

    if (paisesComDemanda.length === 0) {
      countrySelect.innerHTML = '<option value="">Este SKU não tem demanda em nenhum país</option>';
      countrySelect.disabled = true;
      addBtn.disabled = true;
    } else {
      countrySelect.innerHTML = '<option value="">Selecione o país...</option>' +
        paisesComDemanda.map(c => `<option value="${c}">${COUNTRY_NAMES[c]} (${skuData[c.toLowerCase()]} cx)</option>`).join('');
      countrySelect.disabled = false;
      
      countrySelect.addEventListener('change', () => {
        addBtn.disabled = !countrySelect.value;
      });
    }
  }

  async addMandatorySku() {
    const input = document.getElementById('mandatoryCod');
    const countrySelect = document.getElementById('mandatoryCountry');

    if (!input.dataset.selected || !countrySelect.value) {
      alert('Selecione um SKU e um país!');
      return;
    }

    const skuData = JSON.parse(input.dataset.selected);
    const country = countrySelect.value;

    // 🔒 VERIFICAÇÃO DE ROLE: Analyst salva no sandbox
    if (this.isAnalyst()) {
      // Check for duplicate in sandbox
      const duplicate = this.analystSandbox.skusObrigatorios.find(
        s => s.pais === country && s.cod === skuData.cod
      );

      if (duplicate) {
        alert('Este SKU já está marcado como obrigatório para este país!');
        return;
      }

      // Save to sandbox
      this.analystSandbox.skusObrigatorios.push({
        pais: country,
        cod: skuData.cod
      });

    } else {
      // Planning: save to database
      const { error } = await skusObrigatorios.add({
        pais: country,
        cod: skuData.cod
      });

      if (error) {
        if (error.message.includes('duplicate')) {
          alert('Este SKU já está marcado como obrigatório para este país!');
        } else {
          alert('Erro ao adicionar: ' + error.message);
        }
        return;
      }
    }

    input.value = '';
    input.dataset.selected = '';
    countrySelect.innerHTML = '<option value="">Selecione um SKU primeiro</option>';
    countrySelect.disabled = true;
    document.getElementById('addMandatoryBtn').disabled = true;
    document.getElementById('skuSuggestions').classList.add('hidden');

    // Reload list without popup
    this.loadMandatoryList();
    this.loadMandatoryList();
  }

  async removeMandatory(id, pais, cod) {
    if (!confirm('Remover este SKU obrigatório?')) return;

    // 🔒 VERIFICAÇÃO DE ROLE: Analyst remove do sandbox
    if (this.isAnalyst()) {
      // Remove from sandbox using country and code
      const index = this.analystSandbox.skusObrigatorios.findIndex(
        s => s.pais === pais && s.cod === cod
      );

      if (index !== -1) {
        this.analystSandbox.skusObrigatorios.splice(index, 1);
      }
    } else {
      // Planning: remove from database
      const { error } = await skusObrigatorios.remove(id);

      if (error) {
        alert('Erro ao remover: ' + error.message);
        return;
      }
    }

    this.loadMandatoryList();
  }

  async clearMandatory() {
    if (!confirm('Remover TODOS os SKUs obrigatórios?')) return;

    const { error } = await skusObrigatorios.deleteAll();

    if (error) {
      alert('Erro ao limpar: ' + error.message);
      return;
    }

    this.loadMandatoryList();
  }

  // --------------------------------------------------------------------------
  // SKU CONTRACT SEARCH
  // --------------------------------------------------------------------------

  async handleSkuContractSearch(searchTerm) {
    const suggestionsDiv = document.getElementById('skuSearchSuggestions');
    const resultsDiv = document.getElementById('skuSearchResults');
    
    if (!searchTerm || searchTerm.length < 2) {
      suggestionsDiv.classList.add('hidden');
      suggestionsDiv.innerHTML = '';
      resultsDiv.classList.add('hidden');
      return;
    }

    // Fetch all contracts
    const { data: allContracts } = await contratos.getAll();
    if (!allContracts) return;

    // Get unique SKUs matching the search
    const uniqueSkus = new Set();
    allContracts.forEach(c => {
      if (c.cod.toLowerCase().includes(searchTerm.toLowerCase())) {
        uniqueSkus.add(c.cod);
      }
    });

    const matches = Array.from(uniqueSkus).slice(0, 10);

    if (matches.length > 0) {
      suggestionsDiv.classList.remove('hidden');
      suggestionsDiv.innerHTML = matches.map(sku => `
        <div class="px-4 py-3 hover:bg-purple-50 cursor-pointer border-b last:border-b-0 search-sku-item" 
             data-sku="${sku}">
          <div class="font-semibold text-gray-800">${sku}</div>
        </div>
      `).join('');

      suggestionsDiv.querySelectorAll('.search-sku-item').forEach(el => {
        el.addEventListener('click', () => {
          this.showSkuContracts(el.dataset.sku, allContracts);
        });
      });
    } else {
      suggestionsDiv.classList.remove('hidden');
      suggestionsDiv.innerHTML = '<div class="px-4 py-3 text-gray-500 text-sm">Nenhum SKU encontrado</div>';
    }
  }

  async showSkuContracts(sku, allContracts) {
    const input = document.getElementById('skuSearchInput');
    const suggestionsDiv = document.getElementById('skuSearchSuggestions');
    const resultsDiv = document.getElementById('skuSearchResults');

    input.value = sku;
    suggestionsDiv.classList.add('hidden');

    // Fetch stock data for SKU description
    const { data: estoqueData } = await estoque.getAll();
    const estoqueMap = {};
    if (estoqueData) {
      estoqueData.forEach(item => {
        const key = item.cod.trim().toUpperCase();
        estoqueMap[key] = item;
      });
    }

    const skuInfo = estoqueMap[sku.toUpperCase()];
    
    // Filter contracts for this SKU
    const skuContracts = allContracts.filter(c => c.cod.toUpperCase() === sku.toUpperCase());

    if (skuContracts.length === 0) {
      resultsDiv.innerHTML = `
        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 class="font-semibold text-red-900 mb-2">❌ Sem Contratos</h4>
          <p class="text-red-800 text-sm">
            O SKU <strong>${sku}</strong> não possui nenhum contrato cadastrado.
          </p>
          ${skuInfo ? `<p class="text-red-700 text-xs mt-2">${skuInfo.descricao}</p>` : ''}
        </div>
      `;
      resultsDiv.classList.remove('hidden');
      return;
    }

    // Separate active and inactive contracts
    const activeContracts = skuContracts.filter(c => c.ativo);
    const inactiveContracts = skuContracts.filter(c => !c.ativo);

    resultsDiv.innerHTML = `
      <div class="space-y-4">
        <div class="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
          <h4 class="font-bold text-purple-900 mb-1">SKU: ${sku}</h4>
          ${skuInfo ? `<p class="text-purple-700 text-sm">${skuInfo.descricao}</p>` : ''}
          <div class="mt-3 flex gap-4 text-sm">
            <span class="text-green-700 font-semibold">✓ ${activeContracts.length} contrato(s) ativo(s)</span>
            ${inactiveContracts.length > 0 ? `<span class="text-gray-600">⊗ ${inactiveContracts.length} inativo(s)</span>` : ''}
          </div>
        </div>

        ${activeContracts.length > 0 ? `
          <div class="border border-green-200 rounded-lg overflow-hidden">
            <div class="bg-green-50 px-4 py-3 border-b border-green-200">
              <h5 class="font-semibold text-green-900">Contratos Ativos</h5>
            </div>
            <div class="divide-y divide-green-100">
              ${activeContracts.map(c => `
                <div class="px-4 py-3 hover:bg-green-50">
                  <div class="grid grid-cols-4 gap-4 items-center">
                    <div>
                      <div class="text-xs text-gray-500 uppercase">País</div>
                      <div class="font-semibold text-gray-900">${COUNTRY_NAMES[c.pais] || c.pais}</div>
                    </div>
                    <div>
                      <div class="text-xs text-gray-500 uppercase">Contrato</div>
                      <div class="font-medium text-gray-800">${c.contrato || '-'}</div>
                    </div>
                    <div>
                      <div class="text-xs text-gray-500 uppercase">Linha</div>
                      <div class="font-medium text-gray-800">${c.linha || '-'}</div>
                    </div>
                    <div class="text-right">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        ✓ Ativo
                      </span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${inactiveContracts.length > 0 ? `
          <div class="border border-gray-200 rounded-lg overflow-hidden">
            <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h5 class="font-semibold text-gray-700">Contratos Inativos</h5>
            </div>
            <div class="divide-y divide-gray-100">
              ${inactiveContracts.map(c => `
                <div class="px-4 py-3 hover:bg-gray-50 opacity-60">
                  <div class="grid grid-cols-4 gap-4 items-center">
                    <div>
                      <div class="text-xs text-gray-500 uppercase">País</div>
                      <div class="font-semibold text-gray-700">${COUNTRY_NAMES[c.pais] || c.pais}</div>
                    </div>
                    <div>
                      <div class="text-xs text-gray-500 uppercase">Contrato</div>
                      <div class="font-medium text-gray-600">${c.contrato || '-'}</div>
                    </div>
                    <div>
                      <div class="text-xs text-gray-500 uppercase">Linha</div>
                      <div class="font-medium text-gray-600">${c.linha || '-'}</div>
                    </div>
                    <div class="text-right">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200 text-gray-600">
                        ⊗ Inativo
                      </span>
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    resultsDiv.classList.remove('hidden');
    lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // CONTRACT MANAGEMENT
  // --------------------------------------------------------------------------

  async loadContractsList() {
    const container = document.getElementById('contractsList');
    const filterCountry = document.getElementById('filterCountry')?.value || '';
    const filterStatus = document.getElementById('filterStatus')?.value || 'active';
    const filterSku = document.getElementById('filterSku')?.value.trim().toUpperCase() || '';


    // Fetch contracts from database
    const { data, error } = await contratos.getAll();
    
    if (error) {
      console.error('❌ Erro ao buscar contratos:', error);
      container.innerHTML = `<p class="text-red-600 text-center py-8">Erro ao carregar: ${error.message}</p>`;
      return;
    }
    
    
    if (data && data.length > 0) {
      data.slice(0, 3).forEach((c, i) => {
      });
      
      // Count contracts by country
      const byCountry = {};
      data.forEach(c => {
        byCountry[c.pais] = (byCountry[c.pais] || 0) + 1;
      });
      Object.entries(byCountry).sort((a, b) => b[1] - a[1]).forEach(([pais, count]) => {
      });
    }

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <i data-lucide="inbox" class="w-12 h-12 text-gray-400 mx-auto mb-3"></i>
          <p class="text-gray-600">Nenhum contrato cadastrado</p>
          <p class="text-sm text-gray-500 mt-1">Importe um arquivo Excel com os contratos</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    const { data: estoqueData } = await estoque.getAll();
    const estoqueMap = {};
    if (estoqueData) {
      estoqueData.forEach(item => {
        const key = item.cod.trim().toUpperCase();
        estoqueMap[key] = item;
      });
    }

    let filteredData = data;
    
    
    if (filterSku) {
      const beforeFilter = filteredData.length;
      filteredData = filteredData.filter(c => c.cod.toUpperCase().includes(filterSku));
    }
    
    if (filterCountry) {
      const beforeFilter = filteredData.length;
      filteredData = filteredData.filter(c => {
        const match = c.pais === filterCountry;
        if (!match && c.pais.includes('PAR')) {
        }
        return match;
      });
    }
    
    if (filterStatus === 'active') {
      const beforeFilter = filteredData.length;
      filteredData = filteredData.filter(c => c.ativo);
    } else if (filterStatus === 'inactive') {
      const beforeFilter = filteredData.length;
      filteredData = filteredData.filter(c => !c.ativo);
    }
    

    if (filteredData.length === 0) {
      container.innerHTML = `
        <div class="text-center py-8">
          <p class="text-gray-600">Nenhum contrato encontrado com os filtros selecionados</p>
        </div>
      `;
      return;
    }

    const groupedByCountry = {};
    filteredData.forEach(item => {
      if (!groupedByCountry[item.pais]) {
        groupedByCountry[item.pais] = [];
      }
      groupedByCountry[item.pais].push(item);
    });

    container.innerHTML = `
      <div class="space-y-4 max-h-[600px] overflow-y-auto">
        ${Object.keys(groupedByCountry).sort().map(pais => {
          const contracts = groupedByCountry[pais];
          return `
            <div class="border border-gray-200 rounded-lg">
              <div class="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h4 class="font-semibold text-gray-800">
                  ${COUNTRY_NAMES[pais] || pais} 
                  <span class="text-sm font-normal text-gray-600">(${contracts.length} contratos)</span>
                </h4>
              </div>
              <div class="divide-y divide-gray-100">
                ${contracts.map(item => {
                  const skuKey = item.cod.trim().toUpperCase();
                  const skuInfo = estoqueMap[skuKey];
                  
                  return `
                    <div class="px-4 py-3 hover:bg-gray-50 flex justify-between items-center">
                      <div class="flex-1 grid grid-cols-3 gap-4">
                        <div>
                          <div class="font-medium text-gray-900">${item.cod}</div>
                          <div class="text-sm text-gray-600">${skuInfo?.descricao || 'Descrição não encontrada'}</div>
                        </div>
                        <div>
                          <div class="text-xs text-gray-500 uppercase">Contrato</div>
                          <div class="text-sm font-medium text-gray-800">${item.contrato || '-'}</div>
                        </div>
                        <div>
                          <div class="text-xs text-gray-500 uppercase">Linha</div>
                          <div class="text-sm font-medium text-gray-800">${item.linha || '-'}</div>
                        </div>
                      </div>
                      <div class="flex items-center gap-3">
                        <label class="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            ${item.ativo ? 'checked' : ''} 
                            class="sr-only peer toggle-contract-status" 
                            data-id="${item.id}"
                            data-status="${item.ativo}"
                          />
                          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                          <span class="ml-3 text-sm font-medium ${item.ativo ? 'text-green-600' : 'text-gray-400'}">
                            ${item.ativo ? 'Ativo' : 'Inativo'}
                          </span>
                        </label>
                        <button data-id="${item.id}" class="remove-contract-btn text-red-600 hover:bg-red-50 p-2 rounded transition">
                          <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    lucide.createIcons();
    
    document.querySelectorAll('.remove-contract-btn').forEach(btn => {
      btn.addEventListener('click', () => this.removeContract(btn.dataset.id));
    });

    document.querySelectorAll('.toggle-contract-status').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const newStatus = e.target.checked;
        this.toggleContractStatus(toggle.dataset.id, newStatus);
      });
    });
  }

  async handleContractsUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusDiv = document.getElementById('contractStatus');
    statusDiv.innerHTML = '<p class="text-blue-600">⏳ Processando arquivo...</p>';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      jsonData.slice(0, 5).forEach((row, idx) => {
      });
      
      // Detect available columns
      if (jsonData.length > 0) {
      }
      
      // Display available country code mappings
      
      // Process and map countries
      const processedData = [];
      const seenKeys = new Set();
      let duplicatesRemoved = 0;
      let countriesMapped = {};
      let errorLines = [];

      jsonData.forEach((row, index) => {
        // Detect country column name
        const paisKey = Object.keys(row).find(k => {
          const lower = k.toLowerCase().trim();
          return lower === 'pais' || 
                 lower === 'país' || 
                 lower === 'country' ||
                 lower === 'codigo' ||
                 lower === 'código' ||
                 lower.includes('pais') ||
                 lower.includes('país');
        });
        
        if (!paisKey) {
          errorLines.push({
            linha: index + 1,
            colunas: Object.keys(row),
            motivo: 'Coluna de país não encontrada'
          });
          return;
        }

        let paisOriginal = row[paisKey];
        if (!paisOriginal) {
          errorLines.push({
            linha: index + 1,
            motivo: 'País vazio'
          });
          return;
        }

        // Clean and normalize country code
        paisOriginal = String(paisOriginal).trim().toUpperCase().replace(/\s+/g, ' ');
        
        // Map country code to internal format
        const paisMapeado = COUNTRY_CODE_MAP[paisOriginal] || paisOriginal;
        
        // Log country code mapping
        if (index < 10 || !COUNTRIES.includes(paisMapeado)) {
        }
        
        // Validate mapped country code
        if (!COUNTRIES.includes(paisMapeado)) {
          errorLines.push({
            linha: index + 1,
            paisOriginal: paisOriginal,
            paisMapeado: paisMapeado,
            motivo: `País "${paisOriginal}" mapeado para "${paisMapeado}" não está na lista de países válidos: [${COUNTRIES.join(', ')}]`
          });
          return; // Skip invalid country
        }
        
        // Track country mappings
        if (!countriesMapped[paisOriginal]) {
          countriesMapped[paisOriginal] = paisMapeado;
        }

        // Detect SKU column name
        const skuKey = Object.keys(row).find(k => {
          const lower = k.toLowerCase().trim();
          return lower === 'sku' || 
                 lower === 'cod' || 
                 lower === 'codigo' ||
                 lower === 'código' ||
                 lower.includes('sku') ||
                 lower.includes('cod');
        });
        
        if (!skuKey) {
          errorLines.push({
            linha: index + 1,
            colunas: Object.keys(row),
            motivo: 'Coluna de SKU não encontrada'
          });
          return;
        }
        
        const sku = skuKey ? String(row[skuKey]).trim().toUpperCase() : '';

        if (!sku) {
          errorLines.push({
            linha: index + 1,
            motivo: 'SKU vazio'
          });
          return;
        }

        // Create unique key for deduplication
        const uniqueKey = `${paisMapeado}|${sku}`;

        // Check for duplicates
        if (seenKeys.has(uniqueKey)) {
          duplicatesRemoved++;
          return;
        }

        seenKeys.add(uniqueKey);

        // Detect contract and line columns
        const contratoKey = Object.keys(row).find(k => k.toLowerCase().includes('contrato'));
        const linhaKey = Object.keys(row).find(k => k.toLowerCase().includes('linha'));
        const ativoKey = Object.keys(row).find(k => k.toLowerCase().includes('ativo'));

        // Add processed contract
        processedData.push({
          pais: paisMapeado,
          cod: sku,
          contrato: contratoKey ? (row[contratoKey] || '') : '',
          linha: linhaKey ? (row[linhaKey] || '') : '',
          ativo: ativoKey ? Boolean(row[ativoKey]) : true
        });
      });

      
      if (errorLines.length > 0) {
        errorLines.slice(0, 20).forEach(e => {
        });
      }
      
      Object.entries(countriesMapped).forEach(([orig, mapped]) => {
        const count = processedData.filter(p => p.pais === mapped).length;
      });
      
      const byCountry = {};
      processedData.forEach(c => {
        byCountry[c.pais] = (byCountry[c.pais] || 0) + 1;
      });
      Object.entries(byCountry).sort((a, b) => b[1] - a[1]).forEach(([pais, count]) => {
        const countryName = COUNTRY_NAMES[pais] || pais;
      });

      if (processedData.length === 0) {
        // Show detailed error message
        const firstRow = jsonData[0];
        const availableColumns = firstRow ? Object.keys(firstRow).join(', ') : 'nenhuma';
        
        const errorSummary = errorLines.slice(0, 10).map(e => {
          if (e.paisOriginal) {
            return `Linha ${e.linha}: "${e.paisOriginal}" → "${e.paisMapeado}" - ${e.motivo}`;
          }
          return `Linha ${e.linha}: ${e.motivo}`;
        }).join('\n');
        
        throw new Error(`❌ Nenhum contrato válido encontrado no arquivo.

📋 COLUNAS ENCONTRADAS: ${availableColumns}

✅ COLUNAS ESPERADAS: 
- País/Pais/Country (códigos: UY01, PY01, AR01, NI01, MX01, PE01, TT01, VE01, etc.)
- SKU/COD (código do produto)
- CONTRATO (opcional)
- LINHA (opcional)

⚠️ PRIMEIROS ERROS:
${errorSummary}

💡 DICA: Abra o console do navegador (F12) para ver o log completo.`);
      }

      statusDiv.innerHTML = '<p class="text-blue-600">⏳ Enviando para o Supabase...</p>';

      const result = await contratos.insertMany(processedData);
      
      if (result.error) {
        throw new Error(result.error.message);
      }

      statusDiv.innerHTML = `
        <div class="bg-green-50 border border-green-200 rounded-lg p-3">
          <p class="text-green-800 font-semibold">✓ Importação concluída!</p>
          <p class="text-green-700 text-sm mt-1">
            ${processedData.length} contratos únicos importados
          </p>
          ${errorLines.length > 0 ? `
            <p class="text-yellow-700 text-sm mt-1">
              ⚠️ ${errorLines.length} linhas com erro (verifique o console)
            </p>
          ` : ''}
          <p class="text-green-600 text-xs mt-1">
            ${duplicatesRemoved > 0 ? `${duplicatesRemoved} duplicatas removidas` : 'Nenhuma duplicata encontrada'}
          </p>
          <details class="mt-2">
            <summary class="text-xs text-green-700 cursor-pointer">Ver mapeamento de países</summary>
            <div class="mt-2 text-xs text-green-600">
              ${Object.entries(countriesMapped).map(([orig, mapped]) => 
                `<div>${orig} → ${mapped}</div>`
              ).join('')}
            </div>
          </details>
        </div>
      `;
      
      this.loadContractsList();
      e.target.value = '';
      
    } catch (error) {
      console.error('❌ Erro ao processar arquivo:', error);
      statusDiv.innerHTML = `
        <div class="bg-red-50 border border-red-300 rounded-lg p-3">
          <p class="text-red-800 font-semibold">✗ Erro ao processar arquivo</p>
          <p class="text-red-700 text-sm mt-2 whitespace-pre-wrap">${error.message}</p>
          <p class="text-red-600 text-xs mt-2">Verifique o console (F12) para mais detalhes</p>
        </div>
      `;
    }
  }

  async removeContract(id) {
    if (!confirm('Remover este contrato?')) return;

    const { error } = await contratos.remove(id);

    if (error) {
      alert('Erro ao remover: ' + error.message);
      return;
    }

    this.loadContractsList();
  }

  async toggleContractStatus(id, ativo) {
    const { error } = await contratos.toggleActive(id, ativo);

    if (error) {
      alert('Erro ao atualizar status: ' + error.message);
      this.loadContractsList();
      return;
    }

  }

  async clearAllContracts() {
    if (!confirm('Remover TODOS os contratos? Esta ação não pode ser desfeita.')) return;

    const { error } = await contratos.deleteAll();

    if (error) {
      alert('Erro ao limpar: ' + error.message);
      return;
    }

    // Reload list without popup
    this.loadPriorityList();
    this.loadContractsList();
  }

  async loadSettings() {
    const container = document.getElementById('settingsContent');
    const { data, error } = await configuracoes.get();

    if (error) {
      container.innerHTML = `<p class="text-red-600">Erro ao carregar configurações: ${error.message}</p>`;
      return;
    }

    // Merge database data with defaults for backward compatibility
    const defaults = {
      ocupacao_minima_percentual: 95,
      ocupacao_minima_obrigatorios: 90,
      permitir_pallets_fracionados: true,
      fracionados_todos_skus: false,
      priorizar_completar_caminhao: true,
      usar_algoritmo_genetico: true,
      max_skus_por_caminhao_arg: 0
    };
    const config = { ...defaults, ...(data || {}) };

    container.innerHTML = `
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Ocupação Mínima do Caminhão (%)
          </label>
          <input
            type="number"
            id="minOccupancy"
            value="${config.ocupacao_minima_percentual}"
            min="0"
            max="100"
            step="1"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p class="text-sm text-gray-500 mt-1">
            Caminhões sem SKUs obrigatórios com ocupação menor que este valor serão rejeitados (ex: 99% = mínimo 27.7 pallets em caminhão de 28)
          </p>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Ocupação Mínima com SKUs Obrigatórios (%)
          </label>
          <input
            type="number"
            id="minOccupancyMandatory"
            value="${config.ocupacao_minima_obrigatorios}"
            min="0"
            max="100"
            step="1"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p class="text-sm text-gray-500 mt-1">
            Caminhões com SKUs obrigatórios com ocupação menor que este valor serão rejeitados (ex: 96% = mínimo 26.9 pallets em caminhão de 28)
          </p>
        </div>

        <div class="flex items-start">
          <input
            type="checkbox"
            id="allowFractional"
            ${config.permitir_pallets_fracionados ? 'checked' : ''}
            class="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
          />
          <div class="ml-3">
            <label for="allowFractional" class="text-sm font-medium text-gray-700">
              Permitir Pallets Fracionados
            </label>
            <p class="text-sm text-gray-500 mt-1">
              Se ativado, SKUs obrigatórios podem ter menos que 1 pallet completo (ex: 0.2 pallets = 10 caixas se PPD=50)
            </p>
          </div>
        </div>

        <div class="flex items-start">
          <input
            type="checkbox"
            id="allowFractionalAll"
            ${config.fracionados_todos_skus ? 'checked' : ''}
            class="mt-1 w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
          />
          <div class="ml-3">
            <label for="allowFractionalAll" class="text-sm font-medium text-gray-700">
              Fracionados para Todos os SKUs
            </label>
            <p class="text-sm text-gray-500 mt-1">
              Quando ativo, substitui a flag acima. Todos os SKUs (obrigatórios e normais) podem ter pallets fracionados. Fracionados são agrupados nos últimos veículos.
            </p>
          </div>
        </div>

        <div class="flex items-start">
          <input
            type="checkbox"
            id="prioritizeCompletion"
            ${config.priorizar_completar_caminhao ? 'checked' : ''}
            class="mt-1 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
          />
          <div class="ml-3">
            <label for="prioritizeCompletion" class="text-sm font-medium text-gray-700">
              Priorizar Completar Caminhão
            </label>
            <p class="text-sm text-gray-500 mt-1">
              Após alocar SKUs obrigatórios, o sistema tentará completar o caminhão com outros produtos do mesmo país
            </p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Máximo de SKUs por Caminhão - Argentina (0 = sem limite)
          </label>
          <input
            type="number"
            id="maxSkusArg"
            value="${config.max_skus_por_caminhao_arg}"
            min="0"
            max="50"
            step="1"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
          />
          <p class="text-sm text-gray-500 mt-1">
            Limita a quantidade de SKUs distintos por caminhão para Argentina. Caminhões que não atingirem a ocupação mínima com este limite terão seus itens devolvidos para a pilha e reagrupados. (0 = desativado)
          </p>
        </div>

        <div class="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border-2 border-purple-200">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
              <span class="text-xl">🧬</span>
            </div>
            <div>
              <p class="text-sm font-bold text-purple-900">Algoritmo Genético Ativo</p>
              <p class="text-xs text-purple-700">Otimização avançada com Simulated Annealing</p>
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-gray-200">
          <button id="saveSettingsBtn" class="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-lg hover:shadow-lg transition font-semibold">
            <i data-lucide="save" class="inline w-4 h-4 mr-2"></i>
            Salvar Configurações
          </button>
        </div>
      </div>
    `;

    lucide.createIcons();
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
  }

  async saveSettings() {
    const minOccupancy = parseFloat(document.getElementById('minOccupancy').value);
    const minOccupancyMandatory = parseFloat(document.getElementById('minOccupancyMandatory').value);
    const allowFractional = document.getElementById('allowFractional').checked;
    const allowFractionalAll = document.getElementById('allowFractionalAll').checked;
    const prioritizeCompletion = document.getElementById('prioritizeCompletion').checked;
    const maxSkusArg = parseInt(document.getElementById('maxSkusArg').value) || 0;

    if (minOccupancy < 0 || minOccupancy > 100) {
      alert('Ocupação mínima deve estar entre 0 e 100%');
      return;
    }

    if (minOccupancyMandatory < 0 || minOccupancyMandatory > 100) {
      alert('Ocupação mínima para SKUs obrigatórios deve estar entre 0 e 100%');
      return;
    }

    const { error } = await configuracoes.update({
      ocupacao_minima_percentual: minOccupancy,
      ocupacao_minima_obrigatorios: minOccupancyMandatory,
      permitir_pallets_fracionados: allowFractional,
      fracionados_todos_skus: allowFractionalAll,
      priorizar_completar_caminhao: prioritizeCompletion,
      usar_algoritmo_genetico: true, // Sempre usar algoritmo genético
      max_skus_por_caminhao_arg: maxSkusArg
    });

    if (error) {
      alert('Erro ao salvar: ' + error.message);
      return;
    }

    // Feedback visual de sucesso
    const btn = document.getElementById('saveSettingsBtn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="check" class="inline w-4 h-4 mr-2"></i>Salvo!';
    btn.classList.remove('from-purple-500', 'to-indigo-600');
    btn.classList.add('from-green-500', 'to-green-600');
    lucide.createIcons();

    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.classList.remove('from-green-500', 'to-green-600');
      btn.classList.add('from-purple-500', 'to-indigo-600');
      lucide.createIcons();
    }, 2000);
  }

  renderAllocationTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Alocar Caminhões</h2>
        
        ${this.state.allocationResult ? this.renderAllocationResult() : `
          <div class="bg-white rounded-xl shadow-sm p-8 border border-gray-200 text-center">
            <div class="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-6 flex items-center justify-center">
              <i data-lucide="truck" class="w-10 h-10 text-white"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-800 mb-3">Iniciar Alocação</h3>
            <p class="text-gray-600 mb-6">Processar alocação de produtos em caminhões por país com base em demanda e prioridades.</p>
            <button id="runAllocationBtn" class="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-lg font-semibold hover:shadow-lg transform hover:scale-[1.02] transition">
              <i data-lucide="play" class="inline w-5 h-5 mr-2"></i>
              Executar Alocação
            </button>
          </div>
        `}
      </div>
    `;

    lucide.createIcons();
    
    const runBtn = document.getElementById('runAllocationBtn');
    if (runBtn) {
      runBtn.addEventListener('click', () => this.runAllocation());
    }

    if (this.state.allocationResult) {
      this.attachResultButtons();
    }
  }

  attachResultButtons() {
    setTimeout(() => {
      const saveBtn = document.getElementById('saveAllocationBtn');
      const exportBtn = document.getElementById('exportExcelBtn');
      const newBtn = document.getElementById('newAllocationBtn');

      const tabAllocated = document.getElementById('tabAllocated');
      const tabSkipped = document.getElementById('tabSkipped');
      const tabZLSB = document.getElementById('tabZLSB');
      const tabAnalysis = document.getElementById('tabAnalysis');
      const tabAnalysisAllocation = document.getElementById('tabAnalysisAllocation');
      const tabSemDemanda = document.getElementById('tabSemDemanda');
      const tabDiagnostic = document.getElementById('tabDiagnostic');
      const contentAllocated = document.getElementById('contentAllocated');
      const contentSkipped = document.getElementById('contentSkipped');
      const contentZLSB = document.getElementById('contentZLSB');
      const contentAnalysis = document.getElementById('contentAnalysis');
      const contentAnalysisAllocation = document.getElementById('contentAnalysisAllocation');
      const contentSemDemanda = document.getElementById('contentSemDemanda');
      const contentDiagnostic = document.getElementById('contentDiagnostic');

      if (saveBtn) {
        saveBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.saveAllocation();
        });
      }

      if (exportBtn) {
        exportBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.exportToExcel();
        });
      }

      if (newBtn) {
        newBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.setState({ allocationResult: null });
          this.renderTabContent();
        });
      }

      // Allocated tab
      if (tabAllocated && contentAllocated) {
        tabAllocated.addEventListener('click', () => {
          tabAllocated.classList.add('border-purple-600', 'text-purple-600');
          tabAllocated.classList.remove('border-transparent', 'text-gray-600');
          contentAllocated.classList.remove('hidden');

          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      // No contract tab
      if (tabSkipped && contentSkipped) {
        tabSkipped.addEventListener('click', () => {
          tabSkipped.classList.add('border-purple-600', 'text-purple-600');
          tabSkipped.classList.remove('border-transparent', 'text-gray-600');
          contentSkipped.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      // ZLSB tab
      if (tabZLSB && contentZLSB) {
        tabZLSB.addEventListener('click', () => {
          tabZLSB.classList.add('border-purple-600', 'text-purple-600');
          tabZLSB.classList.remove('border-transparent', 'text-gray-600');
          contentZLSB.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      // Analysis tab
      if (tabAnalysis && contentAnalysis) {
        tabAnalysis.addEventListener('click', () => {
          tabAnalysis.classList.add('border-purple-600', 'text-purple-600');
          tabAnalysis.classList.remove('border-transparent', 'text-gray-600');
          contentAnalysis.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      // Analysis Allocation tab
      if (tabAnalysisAllocation && contentAnalysisAllocation) {
        tabAnalysisAllocation.addEventListener('click', () => {
          tabAnalysisAllocation.classList.add('border-purple-600', 'text-purple-600');
          tabAnalysisAllocation.classList.remove('border-transparent', 'text-gray-600');
          contentAnalysisAllocation.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      // Diagnostic tab
      if (tabDiagnostic && contentDiagnostic) {
        tabDiagnostic.addEventListener('click', () => {
          tabDiagnostic.classList.add('border-purple-600', 'text-purple-600');
          tabDiagnostic.classList.remove('border-transparent', 'text-gray-600');
          contentDiagnostic.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabSemDemanda && contentSemDemanda) {
            tabSemDemanda.classList.remove('border-purple-600', 'text-purple-600');
            tabSemDemanda.classList.add('border-transparent', 'text-gray-600');
            contentSemDemanda.classList.add('hidden');
          }
        });
      }

      // Sem Demanda tab
      if (tabSemDemanda && contentSemDemanda) {
        tabSemDemanda.addEventListener('click', () => {
          tabSemDemanda.classList.add('border-purple-600', 'text-purple-600');
          tabSemDemanda.classList.remove('border-transparent', 'text-gray-600');
          contentSemDemanda.classList.remove('hidden');

          if (tabAllocated && contentAllocated) {
            tabAllocated.classList.remove('border-purple-600', 'text-purple-600');
            tabAllocated.classList.add('border-transparent', 'text-gray-600');
            contentAllocated.classList.add('hidden');
          }
          if (tabSkipped && contentSkipped) {
            tabSkipped.classList.remove('border-purple-600', 'text-purple-600');
            tabSkipped.classList.add('border-transparent', 'text-gray-600');
            contentSkipped.classList.add('hidden');
          }
          if (tabZLSB && contentZLSB) {
            tabZLSB.classList.remove('border-purple-600', 'text-purple-600');
            tabZLSB.classList.add('border-transparent', 'text-gray-600');
            contentZLSB.classList.add('hidden');
          }
          if (tabAnalysis && contentAnalysis) {
            tabAnalysis.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysis.classList.add('border-transparent', 'text-gray-600');
            contentAnalysis.classList.add('hidden');
          }
          if (tabAnalysisAllocation && contentAnalysisAllocation) {
            tabAnalysisAllocation.classList.remove('border-purple-600', 'text-purple-600');
            tabAnalysisAllocation.classList.add('border-transparent', 'text-gray-600');
            contentAnalysisAllocation.classList.add('hidden');
          }
          if (tabDiagnostic && contentDiagnostic) {
            tabDiagnostic.classList.remove('border-purple-600', 'text-purple-600');
            tabDiagnostic.classList.add('border-transparent', 'text-gray-600');
            contentDiagnostic.classList.add('hidden');
          }
        });
      }

      lucide.createIcons();
    }, 100);
  }

  renderAllocationResult() {
    const result = this.state.allocationResult;
    
    return `
      <div class="space-y-6">
        <div class="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
          <h3 class="text-xl font-bold mb-4">Resultado da Alocação</h3>
          <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p class="text-blue-100 text-sm">Total de Caminhões</p>
              <p class="text-3xl font-bold">${result.totalTrucks}</p>
              ${result.totalHubTrucks > 0 ? `<p class="text-blue-200 text-xs">(${result.totalTrucks - result.totalHubTrucks} diretos + ${result.totalHubTrucks} HUB)</p>` : ''}
            </div>
            <div>
              <p class="text-blue-100 text-sm">Total de Pallets</p>
              <p class="text-3xl font-bold">${result.totalPallets.toFixed(1)}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">Países Atendidos</p>
              <p class="text-3xl font-bold">${result.countriesServed}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">SKUs Sem Contrato</p>
              <p class="text-3xl font-bold ${result.skippedByContract?.length > 0 ? 'text-yellow-300' : ''}">${result.skippedByContract?.length || 0}</p>
            </div>
            <div>
              <p class="text-blue-100 text-sm">SKUs Fora do ZLSB</p>
              <p class="text-3xl font-bold ${result.skippedByZLSB?.length > 0 ? 'text-orange-300' : ''}">${result.skippedByZLSB?.length || 0}</p>
            </div>
          </div>
          ${result.zlsbVerified ? `
            <div class="mt-4 text-sm text-blue-100">
              ✓ Verificação ZLSB realizada: ${result.zlsbTotalSkus} SKUs na lista
            </div>
          ` : ''}
        </div>

        <div class="bg-white rounded-xl shadow-sm border border-gray-200">
          <div class="border-b border-gray-200">
            <nav class="flex gap-1 px-6">
              <button id="tabAllocated" class="result-tab px-6 py-3 font-medium transition border-b-2 border-purple-600 text-purple-600">
                <i data-lucide="truck" class="inline w-4 h-4 mr-2"></i>
                Alocados (${result.output.length})
              </button>
              ${result.skippedByContract?.length > 0 ? `
                <button id="tabSkipped" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                  <i data-lucide="alert-triangle" class="inline w-4 h-4 mr-2"></i>
                  Sem Contrato (${result.skippedByContract.length})
                </button>
              ` : ''}
              ${result.skippedByZLSB?.length > 0 ? `
                <button id="tabZLSB" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                  <i data-lucide="file-warning" class="inline w-4 h-4 mr-2"></i>
                  Fora do ZLSB (${result.skippedByZLSB.length})
                </button>
              ` : ''}
              <button id="tabAnalysis" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                <i data-lucide="bar-chart-3" class="inline w-4 h-4 mr-2"></i>
                Análise
              </button>
              <button id="tabAnalysisAllocation" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                <i data-lucide="package-x" class="inline w-4 h-4 mr-2"></i>
                Análise Alocação
              </button>
              ${result.skusSemDemanda?.length > 0 ? `
                <button id="tabSemDemanda" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                  <i data-lucide="archive" class="inline w-4 h-4 mr-2"></i>
                  Estoque s/ Demanda (${result.skusSemDemanda.length})
                </button>
              ` : ''}
              <button id="tabDiagnostic" class="result-tab px-6 py-3 font-medium transition border-b-2 border-transparent text-gray-600 hover:text-gray-800">
                <i data-lucide="activity" class="inline w-4 h-4 mr-2"></i>
                Diagnóstico
              </button>
            </nav>
          </div>

          <div id="contentAllocated" class="p-6">
            <h3 class="text-lg font-semibold text-gray-800 mb-4">Detalhes por País</h3>
            <div class="space-y-4 max-h-[600px] overflow-y-auto">
              ${(() => {
                // Separate DIRETO rows from HUB mixed rows
                const directRows = result.output.filter(r => !r.IsHubTruck);
                const hubMixedRows = result.output.filter(r => r.IsHubTruck);

                // Group direct rows by country
                const directByCountry = {};
                directRows.forEach(r => {
                  if (!directByCountry[r.Country]) directByCountry[r.Country] = [];
                  directByCountry[r.Country].push(r);
                });

                // Group all rows by country (for summary totals including HUB)
                const allByCountry = {};
                result.output.forEach(r => {
                  if (!allByCountry[r.Country]) allByCountry[r.Country] = [];
                  allByCountry[r.Country].push(r);
                });

                // Group HUB mixed by label
                const hubByLabel = {};
                hubMixedRows.forEach(r => {
                  const label = r.HubTruckLabel || 'HUB';
                  if (!hubByLabel[label]) hubByLabel[label] = [];
                  hubByLabel[label].push(r);
                });
                const hubLabels = Object.keys(hubByLabel).sort();

                let html = '';

                // ========== PART 1: RESUMO POR PAÍS ==========
                html += '<h4 class="font-semibold text-gray-700 mb-3">Resumo por País</h4>';
                html += '<div class="grid gap-2 mb-6">';

                for (const country of Object.keys(allByCountry).sort()) {
                  const rows = allByCountry[country];
                  const totalBoxes = rows.reduce((s, r) => s + r.BoxQuantity, 0);
                  const totalPallets = rows.reduce((s, r) => s + r.PalletQuantity, 0);
                  const directCount = directByCountry[country] ? [...new Set(directByCountry[country].map(r => r.TruckId))].length : 0;
                  const hubCount = hubMixedRows.filter(r => r.Country === country).length > 0 ? 1 : 0;

                  html += '<div class="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border border-gray-200">';
                  html += '<div class="flex items-center gap-3">';
                  html += '<span class="font-bold text-purple-900">' + country + '</span>';
                  if (directCount > 0) html += '<span class="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-semibold rounded">' + directCount + ' direto' + (directCount > 1 ? 's' : '') + '</span>';
                  if (hubCount > 0) html += '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">+ HUB</span>';
                  html += '</div>';
                  html += '<div class="text-sm text-gray-600">';
                  html += totalBoxes.toLocaleString('pt-BR') + ' cx &middot; ' + (Math.round(totalPallets * 100) / 100) + ' pallets';
                  html += '</div>';
                  html += '</div>';
                }

                if (hubLabels.length > 0) {
                  const hubTotalBoxes = hubMixedRows.reduce((s, r) => s + r.BoxQuantity, 0);
                  const hubTotalPallets = hubMixedRows.reduce((s, r) => s + r.PalletQuantity, 0);
                  html += '<div class="flex items-center justify-between bg-green-50 rounded-lg px-4 py-2 border border-green-200">';
                  html += '<div class="flex items-center gap-3">';
                  html += '<span class="font-bold text-green-900">HUB (mistos)</span>';
                  html += '<span class="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">' + hubLabels.length + ' caminhão' + (hubLabels.length > 1 ? 'ões' : '') + '</span>';
                  html += '</div>';
                  html += '<div class="text-sm text-gray-600">';
                  html += hubTotalBoxes.toLocaleString('pt-BR') + ' cx &middot; ' + (Math.round(hubTotalPallets * 100) / 100) + ' pallets';
                  html += '</div>';
                  html += '</div>';
                }

                html += '</div>';

                // ========== PART 2: CONFIGURAÇÃO DOS VEÍCULOS ==========
                html += '<h4 class="font-semibold text-gray-700 mb-3">Configuração dos Veículos</h4>';

                // DIRETO trucks per country
                for (const country of Object.keys(directByCountry).sort()) {
                  const countryRows = directByCountry[country];
                  const truckIds = [...new Set(countryRows.map(r => r.TruckId))];
                  html += '<div class="border-t-4 border-purple-600 bg-purple-50 rounded-lg p-4">';
                  html += '<h4 class="font-bold text-lg text-purple-900">' + country + ' - ' + truckIds.length + ' caminhões</h4>';
                  html += '</div>';

                  for (const truckId of truckIds) {
                    const truckRows = countryRows.filter(r => r.TruckId === truckId);
                    const isComfort = country === 'ARG' && truckRows.every(r => r.Desc.toUpperCase().includes('COMFORT'));
                    html += '<div class="border border-gray-200 rounded-lg p-4 ml-4">';
                    html += '<h5 class="font-semibold text-gray-800 mb-2">';
                    html += 'Caminhão #' + truckId;
                    if (isComfort) html += ' <span class="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-semibold rounded">🛋️ COMFORT DEDICADO</span>';
                    html += '</h5>';
                    html += '<div class="space-y-1 text-sm">';

                    for (const row of truckRows) {
                      html += '<div class="flex justify-between py-1 border-b border-gray-100">';
                      html += '<span class="text-gray-700">';
                      html += row.SKU + ' - ' + row.Desc;
                      if (row.IsMandatory) html += ' <span class="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-semibold rounded">OBRIGATÓRIO</span>';
                      html += '</span>';
                      html += '<span class="text-gray-600">' + row.BoxQuantity + ' cx (' + row.PalletQuantity + ' pallets)</span>';
                      html += '</div>';
                    }

                    html += '</div></div>';
                  }
                }

                // HUB mixed trucks
                if (hubLabels.length > 0) {
                  html += '<div class="border-t-4 border-green-600 bg-green-50 rounded-lg p-4">';
                  html += '<h4 class="font-bold text-lg text-green-900">HUB - ' + hubLabels.length + ' caminhões</h4>';
                  html += '</div>';

                  for (const label of hubLabels) {
                    const truckRows = hubByLabel[label];
                    const countries = [...new Set(truckRows.map(r => r.Country))].join(' + ');
                    html += '<div class="border border-gray-200 rounded-lg p-4 ml-4">';
                    html += '<h5 class="font-semibold text-gray-800 mb-2">';
                    html += label;
                    html += ' <span class="ml-2 px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">' + countries + '</span>';
                    html += '</h5>';
                    html += '<div class="space-y-1 text-sm">';

                    for (const row of truckRows) {
                      html += '<div class="flex justify-between py-1 border-b border-gray-100">';
                      html += '<span class="text-gray-700">';
                      html += '<span class="text-xs text-gray-500 mr-1">[' + row.Country + ']</span> ';
                      html += row.SKU + ' - ' + row.Desc;
                      if (row.IsMandatory) html += ' <span class="ml-2 px-2 py-0.5 bg-orange-100 text-orange-800 text-xs font-semibold rounded">OBRIGATÓRIO</span>';
                      html += '</span>';
                      html += '<span class="text-gray-600">' + row.BoxQuantity + ' cx (' + row.PalletQuantity + ' pallets)</span>';
                      html += '</div>';
                    }

                    html += '</div></div>';
                  }
                }

                return html;
              })()}
            </div>
          </div>

          ${result.skippedByContract?.length > 0 ? `
            <div id="contentSkipped" class="p-6 hidden">
              <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-yellow-900 mb-2">⚠️ SKUs Não Alocados</h4>
                <p class="text-yellow-800 text-sm">
                  Estes SKUs possuem demanda mas <strong>não possuem contrato ativo</strong> na tabela de contratos.
                  Adicione contratos para estes SKUs ou marque-os como obrigatórios.
                </p>
              </div>
              
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">País</th>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descrição</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Demanda (cx)</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">PPD</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Peso (kg)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    ${result.skippedByContract.map(item => `
                      <tr class="hover:bg-yellow-50">
                        <td class="px-4 py-3">
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${COUNTRY_NAMES[item.country] || item.country}
                          </span>
                        </td>
                        <td class="px-4 py-3 font-medium text-gray-900">${item.sku}</td>
                        <td class="px-4 py-3 text-gray-600 text-sm">${item.desc}</td>
                        <td class="px-4 py-3 text-right font-semibold text-red-600">${item.demanda}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.ppd}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.peso.toFixed(3)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          ${result.skippedByZLSB?.length > 0 ? `
            <div id="contentZLSB" class="p-6 hidden">
              <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-orange-900 mb-2">⚠️ SKUs Não Encontrados no ZLSB</h4>
                <p class="text-orange-800 text-sm mb-2">
                  Estes SKUs possuem demanda mas <strong>não foram encontrados no arquivo ZLSB</strong> importado.
                </p>
                <p class="text-orange-700 text-sm">
                  <strong>Nota:</strong> Estes SKUs não foram alocados. Cadastre-os no arquivo ZLSB para que sejam considerados.
                </p>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">País</th>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descrição</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Demanda (cx)</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">PPD</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Peso (kg)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    ${result.skippedByZLSB.map(item => `
                      <tr class="hover:bg-orange-50">
                        <td class="px-4 py-3">
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${COUNTRY_NAMES[item.pais] || item.pais}
                          </span>
                        </td>
                        <td class="px-4 py-3 font-medium text-gray-900">${item.cod}</td>
                        <td class="px-4 py-3 text-gray-600 text-sm">${item.descricao}</td>
                        <td class="px-4 py-3 text-right font-semibold text-orange-600">${item.demanda}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.ppd}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.peso.toFixed(3)}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <div id="contentAnalysis" class="p-6 hidden">
            ${this.renderAnalysisBreakdown(result)}
          </div>

          <div id="contentAnalysisAllocation" class="p-6 hidden">
            ${this.renderAnalysisAllocation(result)}
          </div>

          ${result.skusSemDemanda?.length > 0 ? `
            <div id="contentSemDemanda" class="p-6 hidden">
              <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                <h4 class="font-semibold text-gray-900 mb-2">📦 SKUs com Estoque mas Sem Demanda</h4>
                <p class="text-gray-700 text-sm">
                  Estes SKUs possuem estoque no armazém mas <strong>não possuem demanda para nenhum país</strong>.
                  Representam produtos que estão ocupando espaço sem previsão de saída.
                </p>
              </div>

              <div class="grid grid-cols-3 gap-4 mb-4">
                <div class="bg-blue-50 rounded-lg p-4 text-center">
                  <p class="text-sm text-blue-600 font-medium">Total SKUs</p>
                  <p class="text-2xl font-bold text-blue-900">${result.skusSemDemanda.length}</p>
                </div>
                <div class="bg-purple-50 rounded-lg p-4 text-center">
                  <p class="text-sm text-purple-600 font-medium">Total Pallets</p>
                  <p class="text-2xl font-bold text-purple-900">${result.skusSemDemanda.reduce((sum, s) => sum + s.pallets, 0).toFixed(1)}</p>
                </div>
                <div class="bg-green-50 rounded-lg p-4 text-center">
                  <p class="text-sm text-green-600 font-medium">Peso Total (kg)</p>
                  <p class="text-2xl font-bold text-green-900">${result.skusSemDemanda.reduce((sum, s) => sum + s.peso, 0).toFixed(1)}</p>
                </div>
              </div>

              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">SKU</th>
                      <th class="px-4 py-3 text-left text-sm font-semibold text-gray-700">Descrição</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Caixas</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Pallets</th>
                      <th class="px-4 py-3 text-right text-sm font-semibold text-gray-700">Peso (kg)</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200">
                    ${result.skusSemDemanda.map(item => `
                      <tr class="hover:bg-gray-50">
                        <td class="px-4 py-3 font-medium text-gray-900">${item.sku}</td>
                        <td class="px-4 py-3 text-gray-600 text-sm">${item.descricao}</td>
                        <td class="px-4 py-3 text-right font-semibold text-gray-800">${item.caixas}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.pallets}</td>
                        <td class="px-4 py-3 text-right text-gray-600">${item.peso}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <div id="contentDiagnostic" class="p-6 hidden">
            ${this.renderDiagnostic(result)}
          </div>
        </div>

        <div class="flex gap-4">
          <button id="saveAllocationBtn" class="flex-1 ${this.getUserRole() === 'analyst' ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'} text-white px-6 py-3 rounded-lg transition font-semibold">
            <i data-lucide="${this.getUserRole() === 'analyst' ? 'lock' : 'save'}" class="inline w-4 h-4 mr-2"></i>
            ${this.getUserRole() === 'analyst' ? 'Salvar Bloqueado (Analyst)' : 'Salvar no Histórico'}
          </button>
          <button id="exportExcelBtn" class="flex-1 bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition font-semibold">
            <i data-lucide="download" class="inline w-4 h-4 mr-2"></i>
            Exportar para Excel
          </button>
          <button id="newAllocationBtn" class="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 transition font-semibold">
            Nova Alocação
          </button>
        </div>
      </div>
    `;
  }

  renderAnalysisBreakdown(result) {
    // Calcular métricas por país
    const countryMetrics = {};

    // 1. OFERECIDO - da propriedade allStockPallets do result
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        if (!countryMetrics[pallet.country]) {
          countryMetrics[pallet.country] = {
            oferecido: 0,
            alocadoEmVeiculos: 0
          };
        }
        countryMetrics[pallet.country].oferecido += pallet.quantity;
      });
    }

    // 2. ALOCADO EM VEÍCULOS - da primeira aba (Alocação)
    // Usar result.output que contém todos os pallets alocados
    if (result.output) {
      result.output.forEach(row => {
        const country = row.Country;
        if (!countryMetrics[country]) {
          countryMetrics[country] = {
            oferecido: 0,
            alocadoEmVeiculos: 0
          };
        }
        // PalletQuantity é a quantidade de pallets deste SKU no caminhão
        countryMetrics[country].alocadoEmVeiculos += row.PalletQuantity;
      });
    }

    // Calcular pallets não alocados
    const analysis = Object.keys(countryMetrics).map(country => {
      const metrics = countryMetrics[country];
      const naoAlocado = metrics.oferecido - metrics.alocadoEmVeiculos;

      return {
        country,
        oferecido: metrics.oferecido,
        alocadoEmVeiculos: metrics.alocadoEmVeiculos,
        naoAlocado: naoAlocado
      };
    }).sort((a, b) => b.oferecido - a.oferecido);

    // Totais
    const totals = analysis.reduce((acc, item) => ({
      oferecido: acc.oferecido + item.oferecido,
      alocadoEmVeiculos: acc.alocadoEmVeiculos + item.alocadoEmVeiculos,
      naoAlocado: acc.naoAlocado + item.naoAlocado
    }), { oferecido: 0, alocadoEmVeiculos: 0, naoAlocado: 0 });

    return `
      <div class="space-y-4">
        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
          <h4 class="font-bold text-indigo-900 mb-2">
            <i data-lucide="bar-chart-3" class="inline w-5 h-5 mr-2"></i>
            Análise de Alocação por País
          </h4>
          <p class="text-indigo-800 text-sm">
            Comparação entre pallets oferecidos, alocados em veículos e não alocados.
          </p>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th class="px-4 py-3 text-left font-semibold text-gray-700">País</th>
                <th class="px-4 py-3 text-right font-semibold text-gray-700">Oferecido (pallets)</th>
                <th class="px-4 py-3 text-right font-semibold text-gray-700">Alocado em Veículos (pallets)</th>
                <th class="px-4 py-3 text-right font-semibold text-gray-700">Não Alocado (pallets)</th>
                <th class="px-4 py-3 text-right font-semibold text-gray-700">% Alocação</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${analysis.map(item => {
                const percentAlocado = item.oferecido > 0 ? ((item.alocadoEmVeiculos / item.oferecido) * 100) : 0;
                return `
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        ${COUNTRY_NAMES[item.country] || item.country}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-right font-medium text-gray-900">${item.oferecido.toFixed(1)}</td>
                    <td class="px-4 py-3 text-right font-medium text-green-600">${item.alocadoEmVeiculos.toFixed(1)}</td>
                    <td class="px-4 py-3 text-right ${item.naoAlocado > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}">${item.naoAlocado.toFixed(1)}</td>
                    <td class="px-4 py-3 text-right font-medium ${percentAlocado >= 90 ? 'text-green-600' : percentAlocado >= 70 ? 'text-orange-600' : 'text-red-600'}">${percentAlocado.toFixed(1)}%</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-gray-100 border-t-2 border-gray-300">
              <tr class="font-bold">
                <td class="px-4 py-3 text-gray-900">TOTAL</td>
                <td class="px-4 py-3 text-right text-gray-900">${totals.oferecido.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-green-600">${totals.alocadoEmVeiculos.toFixed(1)}</td>
                <td class="px-4 py-3 text-right ${totals.naoAlocado > 0 ? 'text-red-600' : 'text-gray-500'}">${totals.naoAlocado.toFixed(1)}</td>
                <td class="px-4 py-3 text-right text-gray-900">${totals.oferecido > 0 ? ((totals.alocadoEmVeiculos / totals.oferecido) * 100).toFixed(1) : 0}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div class="bg-white border border-gray-200 rounded-lg p-4">
            <h5 class="font-semibold text-gray-900 mb-2">📊 Legenda das Colunas</h5>
            <dl class="space-y-2 text-sm">
              <dt class="inline font-medium text-gray-700">Oferecido:</dt>
              <dd class="inline text-gray-600 ml-1">Pallets disponíveis após competição de estoque</dd><br>
              <dt class="inline font-medium text-gray-700">Alocado em Veículos:</dt>
              <dd class="inline text-gray-600 ml-1">Pallets efetivamente alocados nos veículos formados</dd><br>
              <dt class="inline font-medium text-gray-700">Não Alocado:</dt>
              <dd class="inline text-gray-600 ml-1">Diferença entre oferecido e alocado (pallets que não foram aos veículos)</dd><br>
              <dt class="inline font-medium text-gray-700">% Alocação:</dt>
              <dd class="inline text-gray-600 ml-1">Percentual de pallets oferecidos que foram alocados</dd>
            </dl>
          </div>

          <div class="bg-gradient-to-br from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
            <h5 class="font-semibold text-purple-900 mb-2">📈 Resumo Geral</h5>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between">
                <dt class="text-gray-700">Total Oferecido:</dt>
                <dd class="font-bold text-gray-900">${totals.oferecido.toFixed(1)} pallets</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-700">Total Alocado:</dt>
                <dd class="font-bold text-green-600">${totals.alocadoEmVeiculos.toFixed(1)} pallets</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-700">Total Não Alocado:</dt>
                <dd class="font-bold text-red-600">${totals.naoAlocado.toFixed(1)} pallets</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-700">Taxa de Alocação:</dt>
                <dd class="font-bold text-purple-600">${totals.oferecido > 0 ? ((totals.alocadoEmVeiculos / totals.oferecido) * 100).toFixed(1) : 0}%</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    `;
  }

  renderAnalysisAllocation(result) {
    // Criar mapa de SKUs alocados por país
    const allocatedSkus = {};

    if (result.output) {
      result.output.forEach(row => {
        const key = `${row.Country}|${row.SKU}`;
        if (!allocatedSkus[key]) {
          allocatedSkus[key] = 0;
        }
        allocatedSkus[key] += row.BoxQuantity;
      });
    }

    // Agrupar pallets oferecidos por país e SKU (somar pallets cheios + fracionados)
    const offeredSkus = {};

    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        const key = `${pallet.country}|${pallet.sku}`;

        if (!offeredSkus[key]) {
          offeredSkus[key] = {
            country: pallet.country,
            sku: pallet.sku,
            desc: pallet.desc || '-',
            totalPallets: 0,
            ppd: pallet.ppd,
            weight: pallet.weight,
            isMandatory: pallet.isMandatory
          };
        }

        // Somar todas as quantidades de pallets (cheios + fracionados)
        offeredSkus[key].totalPallets += pallet.quantity;
      });
    }

    // Identificar SKUs não alocados
    const notAllocatedSkus = [];

    Object.keys(offeredSkus).forEach(key => {
      const offered = offeredSkus[key];
      const allocatedQty = allocatedSkus[key] || 0;

      // Converter pallets oferecidos para caixas
      const offeredBoxes = offered.totalPallets * offered.ppd;

      if (allocatedQty < offeredBoxes) {
        const notAllocatedBoxes = offeredBoxes - allocatedQty;
        const notAllocatedPallets = notAllocatedBoxes / offered.ppd;

        notAllocatedSkus.push({
          country: offered.country,
          sku: offered.sku,
          desc: offered.desc,
          boxQuantity: Math.round(notAllocatedBoxes),
          palletQuantity: notAllocatedPallets,
          ppd: offered.ppd,
          weight: offered.weight,
          isMandatory: offered.isMandatory
        });
      }
    });

    // Ordenar por país e depois por quantidade
    notAllocatedSkus.sort((a, b) => {
      if (a.country !== b.country) {
        return a.country.localeCompare(b.country);
      }
      return b.palletQuantity - a.palletQuantity;
    });

    // Calcular totais por país
    const countryTotals = {};
    notAllocatedSkus.forEach(item => {
      if (!countryTotals[item.country]) {
        countryTotals[item.country] = 0;
      }
      countryTotals[item.country] += item.palletQuantity;
    });

    return `
      <div class="space-y-4">
        <div class="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
          <h4 class="font-bold text-red-900 mb-2">
            <i data-lucide="package-x" class="inline w-5 h-5 mr-2"></i>
            SKUs Não Alocados em Veículos
          </h4>
          <p class="text-red-800 text-sm">
            SKUs que foram oferecidos mas não foram alocados nos veículos formados (${notAllocatedSkus.length} SKUs).
          </p>
        </div>

        ${notAllocatedSkus.length === 0 ? `
          <div class="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
            <i data-lucide="check-circle" class="w-16 h-16 text-green-600 mx-auto mb-4"></i>
            <h4 class="text-lg font-semibold text-green-900 mb-2">Todos os SKUs Foram Alocados!</h4>
            <p class="text-green-700">Não há SKUs oferecidos que ficaram sem alocação.</p>
          </div>
        ` : `
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th class="px-4 py-3 text-left font-semibold text-gray-700">País</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-700">SKU</th>
                  <th class="px-4 py-3 text-left font-semibold text-gray-700">Descrição</th>
                  <th class="px-4 py-3 text-right font-semibold text-gray-700">Caixas Não Alocadas</th>
                  <th class="px-4 py-3 text-right font-semibold text-gray-700">Pallets Não Alocados</th>
                  <th class="px-4 py-3 text-right font-semibold text-gray-700">PPD</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                ${notAllocatedSkus.map((item, idx) => {
                  const showCountryHeader = idx === 0 || item.country !== notAllocatedSkus[idx - 1].country;
                  return `
                    ${showCountryHeader ? `
                      <tr class="bg-red-50">
                        <td colspan="6" class="px-4 py-3">
                          <div class="flex justify-between items-center">
                            <span class="font-bold text-red-900">
                              <span class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-red-100 text-red-800">
                                ${COUNTRY_NAMES[item.country] || item.country}
                              </span>
                            </span>
                            <span class="text-sm text-red-700">
                              Total não alocado: <span class="font-bold">${countryTotals[item.country].toFixed(1)} pallets</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    ` : ''}
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-3"></td>
                      <td class="px-4 py-3 font-medium text-gray-900">${item.sku}</td>
                      <td class="px-4 py-3 text-gray-600">${item.desc}</td>
                      <td class="px-4 py-3 text-right font-semibold text-red-600">${item.boxQuantity}</td>
                      <td class="px-4 py-3 text-right font-semibold text-red-600">${item.palletQuantity.toFixed(1)}</td>
                      <td class="px-4 py-3 text-right text-gray-600">${item.ppd}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot class="bg-gray-100 border-t-2 border-gray-300">
                <tr class="font-bold">
                  <td class="px-4 py-3 text-gray-900" colspan="4">TOTAL NÃO ALOCADO</td>
                  <td class="px-4 py-3 text-right text-red-600">${notAllocatedSkus.reduce((sum, item) => sum + item.palletQuantity, 0).toFixed(1)}</td>
                  <td class="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        `}
      </div>
    `;
  }

  renderDiagnostic(result) {
    // Análise combinada: por que pallets não foram alocados?
    const diagnosticByCountry = {};

    // 1. Coletar dados de pallets não alocados por país
    const allocatedSkus = {};
    if (result.output) {
      result.output.forEach(row => {
        const key = `${row.Country}|${row.SKU}`;
        if (!allocatedSkus[key]) {
          allocatedSkus[key] = 0;
        }
        allocatedSkus[key] += row.BoxQuantity;
      });
    }

    const offeredSkus = {};
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        const key = `${pallet.country}|${pallet.sku}`;
        if (!offeredSkus[key]) {
          offeredSkus[key] = {
            country: pallet.country,
            sku: pallet.sku,
            totalPallets: 0,
            ppd: pallet.ppd,
            weight: pallet.weight,
            isMandatory: pallet.isMandatory,
            priority: pallet.priority
          };
        }
        offeredSkus[key].totalPallets += pallet.quantity;
      });
    }

    // 2. Identificar pallets não alocados e analisar razões
    Object.keys(offeredSkus).forEach(key => {
      const offered = offeredSkus[key];
      const allocatedQty = allocatedSkus[key] || 0;
      const offeredBoxes = offered.totalPallets * offered.ppd;

      if (allocatedQty < offeredBoxes) {
        const country = offered.country;
        const notAllocatedBoxes = offeredBoxes - allocatedQty;
        const notAllocatedPallets = notAllocatedBoxes / offered.ppd;

        if (!diagnosticByCountry[country]) {
          diagnosticByCountry[country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            reasons: {
              fragmentacao: 0,          // Pallets fracionados
              pesoExcessivo: 0,          // SKUs muito pesados
              baixaPrioridade: 0,        // Prioridade baixa
              quantidadeInsuficiente: 0  // Último caminhão parcial
            },
            skuDetails: []
          };
        }

        diagnosticByCountry[country].totalNotAllocated += notAllocatedPallets;
        diagnosticByCountry[country].skuDetails.push({
          sku: offered.sku,
          pallets: notAllocatedPallets,
          weight: offered.weight,
          isFractional: notAllocatedPallets < 1,
          priority: offered.priority,
          isMandatory: offered.isMandatory
        });

        // Classificar razões
        if (notAllocatedPallets < 1) {
          diagnosticByCountry[country].reasons.fragmentacao += notAllocatedPallets;
        }

        // Peso por pallet > 700kg é considerado pesado
        const weightPerPallet = offered.weight / offered.totalPallets;
        if (weightPerPallet > 700) {
          diagnosticByCountry[country].reasons.pesoExcessivo += notAllocatedPallets;
        }

        // Prioridade 1 ou 2 é considerada baixa
        if (offered.priority <= 2) {
          diagnosticByCountry[country].reasons.baixaPrioridade += notAllocatedPallets;
        }
      }
    });

    // Calcular totais oferecidos e alocados por país
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        if (!diagnosticByCountry[pallet.country]) {
          diagnosticByCountry[pallet.country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            reasons: { fragmentacao: 0, pesoExcessivo: 0, baixaPrioridade: 0, quantidadeInsuficiente: 0 },
            skuDetails: []
          };
        }
        diagnosticByCountry[pallet.country].totalOffered += pallet.quantity;
      });
    }

    if (result.output) {
      result.output.forEach(row => {
        if (!diagnosticByCountry[row.Country]) {
          diagnosticByCountry[row.Country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            reasons: { fragmentacao: 0, pesoExcessivo: 0, baixaPrioridade: 0, quantidadeInsuficiente: 0 },
            skuDetails: []
          };
        }
        diagnosticByCountry[row.Country].totalAllocated += row.PalletQuantity;
      });
    }

    // Calcular quantidade insuficiente (último caminhão parcial)
    Object.keys(diagnosticByCountry).forEach(country => {
      const data = diagnosticByCountry[country];
      const truckCapacity = PALLETS_PER_TRUCK[country] || 28;
      const remainingPallets = data.totalNotAllocated;

      if (remainingPallets > 0 && remainingPallets < truckCapacity) {
        data.reasons.quantidadeInsuficiente = remainingPallets;
      }
    });

    // Ordenar países por quantidade não alocada
    const sortedCountries = Object.keys(diagnosticByCountry)
      .filter(country => diagnosticByCountry[country].totalNotAllocated > 0)
      .sort((a, b) => diagnosticByCountry[b].totalNotAllocated - diagnosticByCountry[a].totalNotAllocated);

    if (sortedCountries.length === 0) {
      return `
        <div class="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <i data-lucide="check-circle" class="w-16 h-16 text-green-600 mx-auto mb-4"></i>
          <h4 class="text-lg font-semibold text-green-900 mb-2">Alocação 100% Eficiente!</h4>
          <p class="text-green-700">Todos os pallets oferecidos foram alocados em veículos.</p>
        </div>
      `;
    }

    return `
      <div class="space-y-6">
        <div class="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
          <h4 class="font-bold text-blue-900 mb-2 flex items-center">
            <i data-lucide="activity" class="inline w-5 h-5 mr-2"></i>
            Diagnóstico - Por que pallets não foram alocados?
          </h4>
          <p class="text-blue-800 text-sm">
            Análise combinada dos fatores que impediram a alocação de pallets em veículos.
          </p>
        </div>

        ${sortedCountries.map(country => {
          const data = diagnosticByCountry[country];
          const truckCapacity = PALLETS_PER_TRUCK[country] || 28;
          const totalReasons = Object.values(data.reasons).reduce((sum, val) => sum + val, 0);

          // Calcular percentuais de cada razão
          const reasonsWithPercentage = [];

          if (data.reasons.fragmentacao > 0) {
            reasonsWithPercentage.push({
              tipo: 'Fragmentação (Pallets Fracionados)',
              icon: 'puzzle',
              color: 'orange',
              impacto: data.reasons.fragmentacao,
              percentual: (data.reasons.fragmentacao / data.totalNotAllocated * 100),
              descricao: `${data.skuDetails.filter(s => s.isFractional).length} SKUs com pallets fracionados (< 1 pallet completo)`
            });
          }

          if (data.reasons.pesoExcessivo > 0) {
            const heavySkus = data.skuDetails.filter(s => {
              const weightPerPallet = s.weight / s.pallets;
              return weightPerPallet > 700;
            });
            reasonsWithPercentage.push({
              tipo: 'Peso Excessivo (>700kg/pallet)',
              icon: 'weight',
              color: 'red',
              impacto: data.reasons.pesoExcessivo,
              percentual: (data.reasons.pesoExcessivo / data.totalNotAllocated * 100),
              descricao: `${heavySkus.length} SKUs pesados dificultam completar capacidade sem exceder ${TRUCK_MAX_WEIGHT.toLocaleString('pt-BR')}kg`
            });
          }

          if (data.reasons.baixaPrioridade > 0) {
            reasonsWithPercentage.push({
              tipo: 'Baixa Prioridade',
              icon: 'arrow-down',
              color: 'gray',
              impacto: data.reasons.baixaPrioridade,
              percentual: (data.reasons.baixaPrioridade / data.totalNotAllocated * 100),
              descricao: `SKUs de prioridade baixa (1-2) substituídos por maior prioridade`
            });
          }

          if (data.reasons.quantidadeInsuficiente > 0) {
            reasonsWithPercentage.push({
              tipo: 'Quantidade Insuficiente para Veículo',
              icon: 'package-minus',
              color: 'blue',
              impacto: data.reasons.quantidadeInsuficiente,
              percentual: (data.reasons.quantidadeInsuficiente / data.totalNotAllocated * 100),
              descricao: `Restante de ${data.reasons.quantidadeInsuficiente.toFixed(1)} pallets insuficiente para formar caminhão (capacidade: ${truckCapacity} pallets)`
            });
          }

          // Verificar se há pallets que não formaram veículo por peso impossível
          const impossibleByWeight = data.totalNotAllocated -
            (data.reasons.fragmentacao + data.reasons.baixaPrioridade + data.reasons.quantidadeInsuficiente);

          if (impossibleByWeight > 0.5) {
            reasonsWithPercentage.push({
              tipo: 'Formação Impossível por Peso',
              icon: 'alert-triangle',
              color: 'purple',
              impacto: impossibleByWeight,
              percentual: (impossibleByWeight / data.totalNotAllocated * 100),
              descricao: `Nenhuma combinação válida possível: pallets muito pesados impedem atingir capacidade sem exceder ${TRUCK_MAX_WEIGHT.toLocaleString('pt-BR')}kg`
            });
          }

          const allocationRate = (data.totalAllocated / data.totalOffered * 100);

          return `
            <div class="border border-gray-200 rounded-lg overflow-hidden">
              <div class="bg-gradient-to-r from-gray-50 to-gray-100 p-4 border-b border-gray-200">
                <div class="flex justify-between items-start">
                  <div>
                    <h3 class="text-xl font-bold text-gray-900">
                      ${COUNTRY_NAMES[country] || country}
                    </h3>
                    <p class="text-sm text-gray-600 mt-1">
                      ${data.totalNotAllocated.toFixed(1)} pallets não alocados de ${data.totalOffered.toFixed(1)} oferecidos
                      (${(100 - allocationRate).toFixed(1)}% não alocado)
                    </p>
                  </div>
                  <div class="text-right">
                    <div class="text-2xl font-bold ${allocationRate >= 95 ? 'text-green-600' : allocationRate >= 80 ? 'text-yellow-600' : 'text-red-600'}">
                      ${allocationRate.toFixed(1)}%
                    </div>
                    <div class="text-xs text-gray-500">Taxa de Alocação</div>
                  </div>
                </div>
              </div>

              <div class="p-4 space-y-3">
                ${reasonsWithPercentage.map(reason => `
                  <div class="bg-${reason.color}-50 border border-${reason.color}-200 rounded-lg p-4">
                    <div class="flex items-start gap-3">
                      <div class="w-10 h-10 bg-${reason.color}-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <i data-lucide="${reason.icon}" class="w-5 h-5 text-${reason.color}-600"></i>
                      </div>
                      <div class="flex-1">
                        <div class="flex justify-between items-start mb-1">
                          <h4 class="font-semibold text-${reason.color}-900">${reason.tipo}</h4>
                          <span class="text-sm font-bold text-${reason.color}-700">${reason.percentual.toFixed(1)}%</span>
                        </div>
                        <p class="text-sm text-${reason.color}-800 mb-2">${reason.descricao}</p>
                        <div class="flex items-center gap-2">
                          <div class="flex-1 bg-${reason.color}-200 rounded-full h-2">
                            <div class="bg-${reason.color}-600 h-2 rounded-full transition-all" style="width: ${reason.percentual}%"></div>
                          </div>
                          <span class="text-xs font-medium text-${reason.color}-700">${reason.impacto.toFixed(1)} pallets</span>
                        </div>
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderHistoryTab(container) {
    container.innerHTML = `
      <div class="fade-in">
        <h2 class="text-2xl font-bold text-gray-800 mb-6">Histórico de Alocações</h2>
        <div id="historyList">
          <div class="flex justify-center py-12">
            <div class="spinner"></div>
          </div>
        </div>
      </div>
    `;

    this.loadHistory();
  }

  // Allocation Logic
  
  // Helper function to display allocation progress
  showAllocationProgress(message, percentage = null, details = '') {
    const contentArea = document.getElementById('contentArea');
    if (!contentArea) return;

    // Atualizar título da aba para ser visível mesmo em background
    if (percentage !== null) {
      document.title = `[${percentage}%] ${message} - Consolidação`;
    } else {
      document.title = `⏳ ${message} - Consolidação`;
    }

    const progressHTML = `
      <div class="fade-in">
        <div class="bg-white rounded-xl shadow-lg p-8 border-2 border-purple-200 max-w-2xl mx-auto">
          <div class="text-center">
            <div class="w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center animate-pulse">
              <i data-lucide="loader" class="w-10 h-10 text-white animate-spin"></i>
            </div>

            <h3 class="text-2xl font-bold text-gray-800 mb-4">Processando Alocação</h3>

            <div class="mb-6">
              <p class="text-lg font-semibold text-purple-600 mb-2">${message}</p>
              ${details ? `<p class="text-sm text-gray-600">${details}</p>` : ''}
            </div>

            ${percentage !== null ? `
              <div class="mb-4">
                <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div class="bg-gradient-to-r from-purple-500 to-indigo-600 h-3 rounded-full transition-all duration-500"
                       style="width: ${percentage}%"></div>
                </div>
                <p class="text-sm text-gray-500 mt-2">${percentage}% concluído</p>
              </div>
            ` : `
              <div class="flex justify-center gap-2 mb-4">
                <div class="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
              </div>
            `}

            <div class="space-y-3">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                <p class="text-sm text-blue-800">
                  <i data-lucide="info" class="inline w-4 h-4 mr-1"></i>
                  <strong>Dica:</strong> Abra o Console do navegador (F12) para ver logs detalhados do processamento.
                </p>
              </div>

              <div class="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
                <p class="text-sm text-green-800">
                  <i data-lucide="check-circle" class="inline w-4 h-4 mr-1"></i>
                  <strong>O processamento continua mesmo se você mudar de aba!</strong> Verifique o título da aba para acompanhar o progresso.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    contentArea.innerHTML = progressHTML;
    lucide.createIcons();
  }

  // --------------------------------------------------------------------------
  // TRUCK ALLOCATION ENGINE
  // --------------------------------------------------------------------------

  /**
   * Main allocation entry point
   * Orchestrates the entire truck allocation process
   */
  async runAllocation() {
    this.setState({ loading: true, error: null });

    this.showAllocationProgress('Carregando dados...', 0);

    try {
      // Data source selection based on user role
      let estoqueData, prioridadesData;

      if (this.isAnalyst() && this.analystSandbox.hasData) {
        // Analyst users: use in-memory sandbox data
        estoqueData = { data: this.analystSandbox.estoque || [], error: null };
        prioridadesData = { data: this.analystSandbox.prioridades || [], error: null };
      } else {
        // Planning users: fetch from database
        [estoqueData, prioridadesData] = await Promise.all([
          estoque.getAll(),
          prioridades.getAll()
        ]);
      }

      // Mandatory SKUs: analyst uses sandbox, planning uses database
      let obrigatoriosData;
      if (this.isAnalyst()) {
        obrigatoriosData = { data: this.analystSandbox.skusObrigatorios || [], error: null };
      } else {
        obrigatoriosData = await skusObrigatorios.getAll();
      }

      // Configuration, contracts and ZLSB always come from database
      const [configData, contratosData, zlsbData] = await Promise.all([
        configuracoes.get(),
        contratos.getActive(),
        zlsb.getAll()
      ]);

      if (estoqueData.error) throw new Error(estoqueData.error.message);
      if (prioridadesData.error) throw new Error(prioridadesData.error.message);

      const stockData = estoqueData.data || [];
      const priorityData = prioridadesData.data || [];
      const obrigatorios = obrigatoriosData.data || [];
      const contractsData = contratosData.data || [];
      const zlsbRows = zlsbData?.data || [];
      const zlsbSet = new Set(zlsbRows.map(r => (r.cod || '').trim().toUpperCase()).filter(Boolean));

      // Merge database config with defaults for backward compatibility
      const configDefaults = {
        ocupacao_minima_percentual: 95,
        ocupacao_minima_obrigatorios: 90,
        permitir_pallets_fracionados: true,
        fracionados_todos_skus: false,
        priorizar_completar_caminhao: true,
        usar_algoritmo_genetico: true,
        max_skus_por_caminhao_arg: 0
      };
      const config = { ...configDefaults, ...(configData.data || {}) };

      if (stockData.length === 0) {
        throw new Error('Nenhum dado de estoque encontrado. Importe os dados primeiro.');
      }


      const contractMap = new Map();
      contractsData.forEach(c => {
        const key = `${c.pais.toUpperCase()}|${c.cod.trim().toUpperCase()}`;
        contractMap.set(key, {
          hasContract: true,
          contrato: c.contrato || '',
          linha: c.linha || ''
        });
      });


      // Map SKU categories (estoque1 or estoque2)
      const categoryMap = {};
      stockData.forEach(item => {
        const key = item.cod.trim().toUpperCase();
        categoryMap[key] = item.categoria || 'estoque1';
      });

      const priorityMap = {};
      priorityData.forEach(p => {
        const key = `${p.pais.toUpperCase()}|${p.cod.trim().toUpperCase()}`;
        priorityMap[key] = PRIORITY_VALUES[p.prioridade.toLowerCase()] || 1;
      });

      // DEBUG: Log priority data for verification
      console.log('=== DEBUG PRIORIDADES ===');
      console.log('Total registros no banco:', priorityData.length);
      console.log('Total entradas no priorityMap:', Object.keys(priorityMap).length);
      // Show unique priority values found
      const prioridadeValues = {};
      priorityData.forEach(p => {
        const val = p.prioridade;
        prioridadeValues[val] = (prioridadeValues[val] || 0) + 1;
      });
      console.log('Valores de prioridade encontrados:', prioridadeValues);
      // Show entries with priority > 1 (non-baixa)
      const highPriority = Object.entries(priorityMap).filter(([k, v]) => v > 1);
      console.log('Entradas com prioridade > baixa:', highPriority.length);
      highPriority.forEach(([key, val]) => {
        const label = val === 4 ? 'EXTREMA' : val === 3 ? 'FORTE' : val === 2 ? 'MODERADA' : val;
        console.log(`  ${key} => ${label} (${val})`);
      });

      obrigatorios.forEach(o => {
        const key = `${o.pais.toUpperCase()}|${o.cod.trim().toUpperCase()}`;
        priorityMap[key] = PRIORITY_VALUES['obrigatoria'];
      });

      const mandatorySet = new Set();
      obrigatorios.forEach(o => {
        const key = `${o.pais.toUpperCase()}|${o.cod.trim().toUpperCase()}`;
        mandatorySet.add(key);
      });



      // Update progress indicator
      this.showAllocationProgress('Processando demanda de estoque...', 10,
        'Analisando disponibilidade e prioridades');

      // Group stock data by country
      const countryGroups = {};
      for (const country of COUNTRIES) {
        countryGroups[country] = [];
      }

      const { skippedByContract, skippedByZLSB: skippedByZLSBAlloc } = this.allocateStockAdvancedCorrected(stockData, priorityMap, mandatorySet, countryGroups, contractMap, zlsbSet);

      const output = [];
      const allStockPallets = [];  // All pallets including fractional for stock reports
      const hubPallets = {};       // Central American HUB countries for mixed allocation

      // Initialize HUB country structure
      HUB_COUNTRIES.forEach(c => { hubPallets[c] = []; });

      // Phase 1: Process individual countries
      const totalCountries = COUNTRIES.filter(c => countryGroups[c].length > 0).length;
      let processedCountries = 0;

      for (const country of COUNTRIES) {
        const products = countryGroups[country];

        if (products.length === 0) continue;

        // Atualizar progresso para cada país
        processedCountries++;
        const progress = 15 + Math.floor((processedCountries / totalCountries) * 70); // 15-85%
        this.showAllocationProgress(
          `Alocando caminhões: ${country}`,
          progress,
          `🧬 Algoritmo Genético • País ${processedCountries}/${totalCountries}`
        );

        // Aguardar um frame para UI atualizar
        await new Promise(resolve => setTimeout(resolve, 10));

        const mandatoryProducts = products.filter(p => p.isMandatory);
        const normalProducts = products.filter(p => !p.isMandatory);


        // Debug SKU 64947665 in mandatoryProducts for CHI
        if (country === 'CHI') {
          const sku64947665InMandatory = mandatoryProducts.filter(p => p.sku === '64947665');
          sku64947665InMandatory.forEach(p => {
          });
        }

        if (mandatoryProducts.length > 0) {
          mandatoryProducts.forEach(p => {
          });
        }

        // Truck formation: full pallets + fractional pallets based on config
        // When fracionados_todos_skus is ON, all SKUs get fractional pallets
        const fractionalAllEnabled = config.fracionados_todos_skus === true;
        const mandatoryPallets = this.palletizeAdvanced(mandatoryProducts, fractionalAllEnabled || config.permitir_pallets_fracionados);
        const normalPallets = fractionalAllEnabled
          ? this.palletizeAdvanced(normalProducts, true)
          : this.palletize(normalProducts);
        const palletsForTrucks = [...mandatoryPallets, ...normalPallets];

        // Debug SKU 64947665 for CHI
        if (country === 'CHI') {
          const mandatoryPallets64947665 = mandatoryPallets.filter(p => p.sku === '64947665');
          mandatoryPallets64947665.forEach((p, i) => {
          });

          const sku64947665Pallets = palletsForTrucks.filter(p => p.sku === '64947665');
          if (sku64947665Pallets.length > 0) {
            sku64947665Pallets.forEach((p, i) => {
            });
          } else {
          }
        }

        // Stock allocation reports: include ALL stock with fractional pallets
        const allProductsForStock = this.palletizeAllStock(products);
        allProductsForStock.forEach(pallet => {
          allStockPallets.push({
            ...pallet,
            country: country
          });
        });

        if (palletsForTrucks.length === 0) continue;

        const truckCapacity = PALLETS_PER_TRUCK[country];
        const truckMaxWeight = country === 'PAR' ? TRUCK_MAX_WEIGHT + 2000 : TRUCK_MAX_WEIGHT;

        // HUB countries: save pallets for later mixed allocation
        if (HUB_COUNTRIES.includes(country)) {
          hubPallets[country] = palletsForTrucks;
          continue; // Skip to next country
        }

        // Standard countries: allocate then reorder by priority
        let trucks;

        // Separate mandatory and normal pallets for allocation
        const mandatoryForAllocation = palletsForTrucks.filter(p => p.isMandatory);
        const normalForAllocation = palletsForTrucks.filter(p => !p.isMandatory);

        // Argentina uses specialized COMFORT grouping algorithm
        if (country === 'ARG') {
          trucks = this.allocateTrucksARGComfortGrouping(
            mandatoryForAllocation,
            normalForAllocation,
            config.ocupacao_minima_percentual,
            config.ocupacao_minima_obrigatorios,
            config.priorizar_completar_caminhao,
            truckMaxWeight,
            config.max_skus_por_caminhao_arg || 0
          );

        } else {
          // All other countries use genetic algorithm
          trucks = this.allocateTrucksGenetic(
            country,
            mandatoryForAllocation,
            normalForAllocation,
            config.ocupacao_minima_percentual,
            config.ocupacao_minima_obrigatorios,
            config.priorizar_completar_caminhao,
            truckMaxWeight
          );
        }

        // Post-allocation optimization: consolidate high priority items in first trucks
        trucks = this.consolidateHighPriorityItems(trucks, country, truckMaxWeight);

        // Consolidate specific SKUs (68472205 and 68568095) in same truck when possible
        trucks = this.consolidateSpecificSkus(trucks, country, truckMaxWeight);

        // Generic SKU consolidation: pull scattered SKUs together to minimize order spread
        trucks = this.consolidateScatteredSkus(trucks, country, truckMaxWeight, {
          minScatterCount: 4,
          minTrucksScattered: 2,
          excludeSkus: ['68472205', '68568095']
        });

        // Argentina only: consolidate COMFORT products into minimum number of trucks
        // Runs last to prevent being undone by other consolidations
        if (country === 'ARG') {
          trucks = this.consolidateComfortTrucks(trucks, truckMaxWeight);
        }

        // Enforce max SKUs per truck for ARG after all post-processing
        const maxSkusLimit = (config.max_skus_por_caminhao_arg || 0);
        if (country === 'ARG' && maxSkusLimit > 0) {
          trucks = this.enforceMaxSkusPerTruck(trucks, maxSkusLimit, PALLETS_PER_TRUCK[country] || 28, truckMaxWeight, config.ocupacao_minima_percentual);
        }

        // Debug SKU 64947665 in CHI trucks
        if (country === 'CHI') {
          let found = false;
          trucks.forEach((truck, idx) => {
            const has64947665 = truck.pallets.some(p => p.sku === '64947665');
            if (has64947665) {
              const pallets64947665 = truck.pallets.filter(p => p.sku === '64947665');
              pallets64947665.forEach(p => {
              });
              found = true;
            }
          });
          if (!found) {
          }
        }

        let countryTruckId = 1; // Reinicia contagem para cada país
        for (const truck of trucks) {
          const grouped = this.groupSKUsInTruck(truck);
          for (const sku in grouped) {
            const row = grouped[sku];
            output.push({
              Country: country,
              TruckId: countryTruckId,
              SKU: row.sku,
              Desc: row.desc,
              Contrato: row.contrato || '',
              Linha: row.linha || '',
              BoxQuantity: Math.round(row.palletQty * row.ppd),
              PalletQuantity: row.palletQty,
              PPD: row.ppd,
              Weight: parseFloat(row.weight.toFixed(3)),
              Priority: row.priority,
              IsMandatory: row.isMandatory || false,
              Categoria: categoryMap[row.sku.toUpperCase()] || 'estoque1'
            });
          }
          countryTruckId++;
        }
      }

      // Phase 2: Process mixed HUB countries
      this.showAllocationProgress('Processando países HUB...', 88,
        'Mesclando pallets de COS, ELS, GUA, HON, NIC');

      const hubTrucks = this.allocateTrucksHUB(
        hubPallets,
        config.ocupacao_minima_percentual,
        config.ocupacao_minima_obrigatorios,
        config.priorizar_completar_caminhao
      );


      // Add HUB trucks to output
      // DIRETO: single-country trucks get normal TruckId per country
      // HUB: multi-country trucks get HUB1, HUB2, etc.
      const hubDirectoCounters = {};
      HUB_COUNTRIES.forEach(c => { hubDirectoCounters[c] = 1; });
      let hubMixedCounter = 1;

      for (const truck of hubTrucks) {
        // Group by SKU + origin country
        const grouped = {};
        for (const p of truck.pallets) {
          const key = `${p.sku}|${p.country}`;
          if (!grouped[key]) {
            grouped[key] = {
              ...p,
              country: p.country,
              palletQty: 0,
              weight: 0,
              contrato: p.contrato || '',
              linha: p.linha || ''
            };
          }
          grouped[key].palletQty += p.quantity;
          grouped[key].weight += p.weight;
        }

        const countriesInTruck = [...truck.countries];
        const isMixedTruck = countriesInTruck.length > 1;

        if (isMixedTruck) {
          // Multi-country HUB truck: HUB1, HUB2, etc.
          // TruckId mirrors the HUB number so HON/NIC/PAN rows show 1 for HUB1, 2 for HUB2, etc.
          const hubNumber = hubMixedCounter;
          const hubLabel = `HUB${hubNumber}`;
          hubMixedCounter++;

          for (const key in grouped) {
            const row = grouped[key];
            output.push({
              Country: row.country,
              TruckId: hubNumber,
              SKU: row.sku,
              Desc: row.desc,
              Contrato: row.contrato || '',
              Linha: row.linha || '',
              BoxQuantity: Math.round(row.palletQty * row.ppd),
              PalletQuantity: row.palletQty,
              PPD: row.ppd,
              Weight: parseFloat(row.weight.toFixed(3)),
              Priority: row.priority,
              IsMandatory: row.isMandatory || false,
              Categoria: categoryMap[row.sku.toUpperCase()] || 'estoque1',
              IsHubTruck: true,
              HubCountries: countriesInTruck.join('+'),
              HubTruckLabel: hubLabel
            });
          }
        } else {
          // Single-country DIRETO truck: normal TruckId
          const singleCountry = countriesInTruck[0];
          const truckId = hubDirectoCounters[singleCountry];
          hubDirectoCounters[singleCountry]++;

          for (const key in grouped) {
            const row = grouped[key];
            output.push({
              Country: row.country,
              TruckId: truckId,
              SKU: row.sku,
              Desc: row.desc,
              Contrato: row.contrato || '',
              Linha: row.linha || '',
              BoxQuantity: Math.round(row.palletQty * row.ppd),
              PalletQuantity: row.palletQty,
              PPD: row.ppd,
              Weight: parseFloat(row.weight.toFixed(3)),
              Priority: row.priority,
              IsMandatory: row.isMandatory || false,
              Categoria: categoryMap[row.sku.toUpperCase()] || 'estoque1',
              IsHubTruck: false,
              HubCountries: '',
              HubTruckLabel: ''
            });
          }
        }
      }

      const totalHubTrucks = hubMixedCounter - 1;

      const totalPallets = output.reduce((sum, row) => sum + row.PalletQuantity, 0);
      const countriesServed = new Set(output.map(r => r.Country)).size;

      // ZLSB Verification
      // Collect all SKUs with demand
      const skusComDemanda = [];
      stockData.forEach(row => {
        const codUpper = row.cod.trim().toUpperCase();
        COUNTRIES.forEach(country => {
          const demanda = row[country.toLowerCase()] || 0;
          if (demanda > 0) {
            skusComDemanda.push({
              cod: codUpper,
              descricao: row.descricao || '',
              pais: country,
              demanda: demanda,
              ppd: row.ppd,
              peso: row.peso
            });
          }
        });
      });

      const zlsbCheck = await zlsb.checkMissingSKUs(skusComDemanda);

      // Calcular SKUs com estoque mas sem demanda para nenhum país
      const skusSemDemanda = [];
      stockData.forEach(row => {
        const codUpper = row.cod.trim().toUpperCase();
        const estoqueTotal = row.estoque || 0;

        // Verificar se tem estoque
        if (estoqueTotal <= 0) return;

        // Verificar se tem demanda em algum país
        let temDemanda = false;
        COUNTRIES.forEach(country => {
          const demanda = row[country.toLowerCase()] || 0;
          if (demanda > 0) temDemanda = true;
        });

        // Se tem estoque mas não tem demanda
        if (!temDemanda) {
          const ppd = row.ppd || 1;
          const peso = row.peso || 0;
          const pallets = estoqueTotal / ppd;
          const pesoTotal = pallets * peso;

          skusSemDemanda.push({
            sku: row.cod,
            descricao: row.descricao || '-',
            caixas: estoqueTotal,
            pallets: parseFloat(pallets.toFixed(2)),
            peso: parseFloat(pesoTotal.toFixed(2))
          });
        }
      });

      // Calculate total trucks: per-country TruckIds (DIRETO) + HUB mixed trucks
      const trucksByCountry = {};
      output.forEach(row => {
        // Only count rows with numeric TruckId (skip HUB mixed trucks with empty TruckId)
        if (row.TruckId && row.TruckId !== '') {
          if (!trucksByCountry[row.Country] || row.TruckId > trucksByCountry[row.Country]) {
            trucksByCountry[row.Country] = row.TruckId;
          }
        }
      });
      const directTrucksCount = Object.values(trucksByCountry).reduce((sum, max) => sum + max, 0);
      const totalTrucksCount = directTrucksCount + totalHubTrucks;

      const result = {
        output,
        allStockPallets, // All pallets including fractional ones for stock reports
        skippedByContract,
        skippedByZLSB: skippedByZLSBAlloc || [],
        zlsbTotalSkus: zlsbSet.size || 0,
        zlsbVerified: zlsbSet.size > 0,
        skusSemDemanda, // SKUs com estoque mas sem demanda
        totalTrucks: totalTrucksCount,
        totalHubTrucks: totalHubTrucks,
        totalPallets,
        countriesServed,
        config: config,
        timestamp: new Date().toISOString()
      };


      // Progresso final
      this.showAllocationProgress('Finalizando alocação...', 95,
        `${result.totalTrucks} caminhões formados com ${result.totalPallets.toFixed(1)} pallets`);

      // Aguardar um momento para mostrar progresso final
      await new Promise(resolve => setTimeout(resolve, 500));

      // Restaurar título original
      document.title = '✅ Alocação Concluída - Consolidação';

      // Tentar notificação do navegador (se permitido)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Alocação Concluída!', {
          body: `${result.totalTrucks} caminhões formados com ${result.totalPallets.toFixed(1)} pallets`,
          icon: '/favicon.ico'
        });
      }

      this.setState({ allocationResult: result, loading: false });
      this.renderTabContent();

      // Restaurar título para padrão após 3 segundos
      setTimeout(() => {
        if (document.title.includes('Concluída')) {
          document.title = 'Consolidação - Unilever International Logistics';
        }
      }, 3000);

    } catch (error) {
      this.setState({ error: error.message, loading: false });
      document.title = '❌ Erro na Alocação - Consolidação';
      console.error('Erro ao executar alocação:', error.message);
      console.error('Erro completo:', error);

      // Restaurar título após 3 segundos
      setTimeout(() => {
        document.title = 'Consolidação - Unilever International Logistics';
      }, 3000);
    }
  }

  // Solicitar permissão de notificação (opcional)
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
      }
    }
  }

  allocateStockAdvancedCorrected(stockData, priorityMap, mandatorySet, countryGroups, contractMap, zlsbSet = new Set()) {
    const skippedItems = [];
    const skippedByZLSB = [];

    // Debug: Check first 5 items to verify stock values
    stockData.slice(0, 5).forEach((row, i) => {
    });

    for (const row of stockData) {
      const { cod, descricao, estoque: stock, ppd, peso: boxWeight } = row;
      const codUpper = cod.trim().toUpperCase();
      let currentStock = stock || 0; // Ensure stock is never undefined
      const demand = [];

      // Debug specific SKU
      if (codUpper === '64947665') {
      }

      // Warn if stock is 0 or undefined but there's demand
      const totalDemand = COUNTRIES.reduce((sum, c) => sum + (row[c.toLowerCase()] || 0), 0);
      if ((stock === 0 || stock === undefined || stock === null) && totalDemand > 0) {
      }

      for (const country of COUNTRIES) {
        const boxQty = row[country.toLowerCase()] || 0;
        const key = `${country}|${codUpper}`;
        const isMandatory = mandatorySet.has(key);
        const priority = priorityMap[key] || 1;

        // Debug specific SKU for CHI
        if (codUpper === '64947665' && country === 'CHI') {
        }
        
        const contractInfo = contractMap.get(key);

        // Countries that bypass contract verification
        const countriesWithoutContractCheck = ['CAR', 'VEN', 'CUB'];
        const skipContractCheck = countriesWithoutContractCheck.includes(country);

        const hasContract = contractMap.size === 0 || contractInfo?.hasContract || skipContractCheck;

        // Contract is required even for mandatory SKUs. Mandatory only bypasses
        // occupancy thresholds, not the contract gate.
        if (!hasContract) {
          if (boxQty > 0) {
            skippedItems.push({
              country: country,
              sku: codUpper,
              desc: descricao || '',
              demanda: boxQty,
              ppd: ppd,
              peso: boxWeight
            });
          }
          continue;
        }

        // ZLSB check: se ZLSB carregado e SKU não está na lista, pular (sem bypass de obrigatórios)
        const inZLSB = zlsbSet.size === 0 || zlsbSet.has(codUpper);
        if (!inZLSB) {
          if (boxQty > 0) {
            skippedByZLSB.push({
              pais: country,
              cod: codUpper,
              descricao: descricao || '',
              demanda: boxQty,
              ppd: ppd || 0,
              peso: boxWeight || 0
            });
          }
          continue;
        }
        
        if (boxQty > 0) {
          demand.push({ 
            priority, 
            country, 
            boxQty,
            isMandatory,
            contrato: contractInfo?.contrato || '',
            linha: contractInfo?.linha || ''
          });

          if (isMandatory) {
          }
        }
      }

      demand.sort((a, b) => {
        if (a.isMandatory !== b.isMandatory) return b.isMandatory - a.isMandatory;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.country.localeCompare(b.country);
      });

      // DEBUG: SKU 64353556
      if (codUpper === '64353556') {
        console.log(`\n========== DEBUG SKU 64353556 ==========`);
        console.log(`Estoque disponível: ${currentStock}`);
        console.log(`Demanda ANTES do sort:`);
        demand.forEach(d => {
          const label = d.priority === 999 ? 'OBRIG' : d.priority === 4 ? 'EXTREMA' : d.priority === 3 ? 'FORTE' : d.priority === 2 ? 'MODERADA' : 'BAIXA';
          console.log(`  ${d.country} | Demanda: ${d.boxQty} | Prioridade: ${label}(${d.priority}) | Obrig: ${d.isMandatory} | Contrato: ${d.contrato}`);
        });
        console.log(`Prioridades no banco para este SKU:`);
        COUNTRIES.forEach(c => {
          const k = `${c}|64353556`;
          if (priorityMap[k]) console.log(`  ${k} => ${priorityMap[k]}`);
        });
        console.log(`Demanda DEPOIS do sort (ordem de alocação):`);
        demand.forEach(d => {
          const label = d.priority === 999 ? 'OBRIG' : d.priority === 4 ? 'EXTREMA' : d.priority === 3 ? 'FORTE' : d.priority === 2 ? 'MODERADA' : 'BAIXA';
          console.log(`  ${d.country} | Demanda: ${d.boxQty} | Prioridade: ${label}(${d.priority}) | Obrig: ${d.isMandatory}`);
        });
      }

      let debugStock = currentStock;
      for (const { country, boxQty, isMandatory, contrato, linha } of demand) {
        if (currentStock <= 0) break;
        const allocatedBoxes = Math.min(currentStock, boxQty);
        if (codUpper === '64353556') {
          console.log(`  => ALOCOU ${country}: ${allocatedBoxes} cx (sobra: ${currentStock - allocatedBoxes})`);
        }
        countryGroups[country].push({
          sku: cod,
          desc: descricao || '',
          allocatedBoxes,
          ppd,
          boxWeight,
          priority: priorityMap[`${country}|${codUpper}`] || 1,
          isMandatory,
          contrato,
          linha
        });
        currentStock -= allocatedBoxes;
      }
      if (codUpper === '64353556') {
        console.log(`Estoque restante: ${currentStock}`);
        console.log(`========================================\n`);
      }
    }
    
    if (skippedItems.length > 0) {
    }

    return { skippedByContract: skippedItems, skippedByZLSB };
  }

  palletizeAdvanced(products, allowFractional) {
    const pallets = [];

    for (const { sku, desc, allocatedBoxes, ppd, boxWeight, priority, isMandatory, contrato, linha } of products) {
      const fullPallets = Math.floor(allocatedBoxes / ppd);
      const remainingBoxes = allocatedBoxes % ppd;

      // Full pallets
      for (let i = 0; i < fullPallets; i++) {
        pallets.push({
          sku,
          priority,
          desc,
          weight: (boxWeight * ppd) + PALLET_WEIGHT,
          ppd,
          quantity: 1.0,
          isMandatory,
          contrato,
          linha
        });
      }

      // Fractional pallet from remaining boxes
      if (allowFractional && remainingBoxes > 0) {
        const fraction = remainingBoxes / ppd;
        pallets.push({
          sku,
          priority,
          desc,
          weight: (boxWeight * remainingBoxes) + PALLET_WEIGHT,
          ppd,
          quantity: fraction,
          isMandatory,
          isFractional: true,
          contrato,
          linha
        });
      }
    }

    return pallets;
  }

  // Palletize all stock including fractional pallets for reporting
  // Usada para gerar relatório "Alocado Estoque 1" e "Alocado Estoque 2"
  palletizeAllStock(products) {
    const pallets = [];
    for (const { sku, desc, allocatedBoxes, ppd, boxWeight, priority, isMandatory, contrato, linha } of products) {
      const fullPallets = Math.floor(allocatedBoxes / ppd);
      const remainingBoxes = allocatedBoxes % ppd;

      // Add full pallets
      for (let i = 0; i < fullPallets; i++) {
        pallets.push({
          sku,
          priority,
          desc,
          weight: (boxWeight * ppd) + PALLET_WEIGHT,
          ppd,
          quantity: 1.0,
          isMandatory,
          contrato,
          linha,
          isFractional: false
        });
      }

      // Add fractional pallet if remainder exists
      if (remainingBoxes > 0) {
        const fraction = remainingBoxes / ppd;
        pallets.push({
          sku,
          priority,
          desc,
          weight: (boxWeight * remainingBoxes) + PALLET_WEIGHT,
          ppd,
          quantity: fraction,
          isMandatory,
          contrato,
          linha,
          isFractional: true
        });
      }
    }
    return pallets;
  }

  allocateTrucksARGWithComfort(pallets, TRUCK_CAPACITY, MAX_WEIGHT, minOccupancy, minOccupancyMandatory, prioritizeCompletion) {

    const comfortMandatory = pallets.filter(p => p.isMandatory && p.desc.toUpperCase().includes('COMFORT'));
    const comfortNormal = pallets.filter(p => !p.isMandatory && p.desc.toUpperCase().includes('COMFORT'));
    const nonComfortMandatory = pallets.filter(p => p.isMandatory && !p.desc.toUpperCase().includes('COMFORT'));
    const nonComfortNormal = pallets.filter(p => !p.isMandatory && !p.desc.toUpperCase().includes('COMFORT'));


    const trucks = [];
    const sortPallets = (arr) => arr.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.sku.localeCompare(b.sku);
    });

    sortPallets(comfortMandatory);
    sortPallets(comfortNormal);
    sortPallets(nonComfortMandatory);
    sortPallets(nonComfortNormal);

    const allComfort = [...comfortMandatory, ...comfortNormal];

    while (allComfort.length > 0) {
      const truck = {
        pallets: [],
        totalWeight: 0,
        totalQuantity: 0,
        hasMandatory: comfortMandatory.length > 0,
        isComfortTruck: true
      };

      for (let i = allComfort.length - 1; i >= 0; i--) {
        const pallet = allComfort[i];
        if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
            truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          truck.totalQuantity += pallet.quantity;
          allComfort.splice(i, 1);

          if (pallet.isMandatory) {
            const idx = comfortMandatory.findIndex(p => p === pallet);
            if (idx >= 0) comfortMandatory.splice(idx, 1);
          } else {
            const idx = comfortNormal.findIndex(p => p === pallet);
            if (idx >= 0) comfortNormal.splice(idx, 1);
          }
        }
      }

      if (truck.pallets.length === 0) break;

      const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;

      if (truck.totalQuantity >= TRUCK_CAPACITY) {
        trucks.push(truck);
      } else {
        allComfort.push(...truck.pallets);
        truck.pallets.forEach(p => {
          if (p.isMandatory) comfortMandatory.push(p);
          else comfortNormal.push(p);
        });
        sortPallets(comfortMandatory);
        sortPallets(comfortNormal);
        break;
      }
    }

    let mandatoryPallets = [...comfortMandatory, ...nonComfortMandatory];
    let normalPallets = [...comfortNormal, ...nonComfortNormal];

    sortPallets(mandatoryPallets);
    sortPallets(normalPallets);


    while (mandatoryPallets.length > 0) {
      const truck = {
        pallets: [],
        totalWeight: 0,
        totalQuantity: 0,
        hasMandatory: true
      };

      for (let i = mandatoryPallets.length - 1; i >= 0; i--) {
        const pallet = mandatoryPallets[i];
        if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
            truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          truck.totalQuantity += pallet.quantity;
          mandatoryPallets.splice(i, 1);
        }
      }

      if (truck.pallets.length === 0) break;

      if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
        for (let i = normalPallets.length - 1; i >= 0; i--) {
          const pallet = normalPallets[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            normalPallets.splice(i, 1);
          }
        }
      }

      const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;

      // Use different minimum occupancy for trucks with mandatory SKUs
      const hasMandatoryPallets = truck.pallets.some(p => p.isMandatory);
      const requiredOccupancy = hasMandatoryPallets ? minOccupancyMandatory : minOccupancy;

      if (occupancy >= requiredOccupancy) {
        trucks.push(truck);
      } else {
        mandatoryPallets.push(...truck.pallets.filter(p => p.isMandatory));
        normalPallets.push(...truck.pallets.filter(p => !p.isMandatory));
        sortPallets(mandatoryPallets);
        sortPallets(normalPallets);
        break;
      }
    }

    const remainingTrucks = this.allocateTrucks(normalPallets, TRUCK_CAPACITY, MAX_WEIGHT);
    trucks.push(...remainingTrucks);

    return trucks;
  }

  allocateTrucksAdvanced(pallets, TRUCK_CAPACITY, MAX_WEIGHT, minOccupancy, minOccupancyMandatory, prioritizeCompletion) {
    let trucks = [];
    let mandatoryPallets = pallets.filter(p => p.isMandatory);
    let normalPallets = pallets.filter(p => !p.isMandatory);


    // Categorizar pallets por peso/pallet para melhor balanceamento
    const categorizePalletsByWeight = (palletsArray) => {
      const heavy = [];
      const medium = [];
      const light = [];

      palletsArray.forEach(p => {
        const weightPerPallet = p.weight / (p.quantity || 1);
        if (weightPerPallet > 900) {
          heavy.push(p);
        } else if (weightPerPallet >= 700) {
          medium.push(p);
        } else {
          light.push(p);
        }
      });

      return { heavy, medium, light };
    };

    const sortByPriorityAndWeight = (arr, weightOrder = 'desc') => {
      return arr.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const weightDiff = weightOrder === 'desc' ? b.weight - a.weight : a.weight - b.weight;
        if (weightDiff !== 0) return weightDiff;
        // Tie-break by SKU so same-SKU pallets stay contiguous in the queue
        return String(a.sku || '').localeCompare(String(b.sku || ''));
      });
    };

    // Categorizar pallets obrigatórios e normais
    const mandatoryCategories = categorizePalletsByWeight(mandatoryPallets);
    const normalCategories = categorizePalletsByWeight(normalPallets);

    // Logs diagnósticos detalhados

    const totalPalletsQty = mandatoryPallets.reduce((sum, p) => sum + p.quantity, 0) +
                            normalPallets.reduce((sum, p) => sum + p.quantity, 0);
    const totalWeight = mandatoryPallets.reduce((sum, p) => sum + p.weight, 0) +
                        normalPallets.reduce((sum, p) => sum + p.weight, 0);


    const heavyQty = mandatoryCategories.heavy.reduce((sum, p) => sum + p.quantity, 0);
    const mediumQty = mandatoryCategories.medium.reduce((sum, p) => sum + p.quantity, 0);
    const lightQty = mandatoryCategories.light.reduce((sum, p) => sum + p.quantity, 0);
    const heavyWeight = mandatoryCategories.heavy.reduce((sum, p) => sum + p.weight, 0);
    const mediumWeight = mandatoryCategories.medium.reduce((sum, p) => sum + p.weight, 0);
    const lightWeight = mandatoryCategories.light.reduce((sum, p) => sum + p.weight, 0);


    const heavyQtyNormal = normalCategories.heavy.reduce((sum, p) => sum + p.quantity, 0);
    const mediumQtyNormal = normalCategories.medium.reduce((sum, p) => sum + p.quantity, 0);
    const lightQtyNormal = normalCategories.light.reduce((sum, p) => sum + p.quantity, 0);


    // Ordenar cada categoria
    sortByPriorityAndWeight(mandatoryCategories.heavy, 'desc');
    sortByPriorityAndWeight(mandatoryCategories.medium, 'desc');
    sortByPriorityAndWeight(mandatoryCategories.light, 'asc'); // Leves em ordem crescente
    sortByPriorityAndWeight(normalCategories.heavy, 'desc');
    sortByPriorityAndWeight(normalCategories.medium, 'desc');
    sortByPriorityAndWeight(normalCategories.light, 'asc');

    // FASE 1: Balanceamento Inteligente - Pesados + Médios + Leves
    let attempt = 0;
    const maxAttempts = Math.max(Math.ceil(mandatoryPallets.length / 3), 50);

    while ((mandatoryCategories.heavy.length > 0 || mandatoryCategories.medium.length > 0 || mandatoryCategories.light.length > 0) && attempt < maxAttempts) {
      attempt++;
      const truck = {
        pallets: [],
        totalWeight: 0,
        totalQuantity: 0,
        hasMandatory: true
      };

      const targetWeightPhase1 = MAX_WEIGHT * 0.50; // Usar 50% do peso com pesados/médios

      // SUBFASE 1.1: Adicionar pallets PESADOS até ~50% do peso máximo
      for (let i = mandatoryCategories.heavy.length - 1; i >= 0; i--) {
        if (truck.totalWeight >= targetWeightPhase1) break;

        const pallet = mandatoryCategories.heavy[i];
        if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
            truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          truck.totalQuantity += pallet.quantity;
          mandatoryCategories.heavy.splice(i, 1);
        }
      }

      // SUBFASE 1.2: Adicionar pallets MÉDIOS para balancear
      for (let i = mandatoryCategories.medium.length - 1; i >= 0; i--) {
        const pallet = mandatoryCategories.medium[i];
        if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
            truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          truck.totalQuantity += pallet.quantity;
          mandatoryCategories.medium.splice(i, 1);
        }
      }

      // SUBFASE 1.3: Completar com pallets LEVES (maximizar ocupação)
      for (let i = mandatoryCategories.light.length - 1; i >= 0; i--) {
        const pallet = mandatoryCategories.light[i];
        if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
            truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          truck.totalQuantity += pallet.quantity;
          mandatoryCategories.light.splice(i, 1);
        }
      }

      if (truck.pallets.length === 0) {
        break;
      }

      // SUBFASE 1.4: Completar com pallets NORMAIS (priorizar leves)
      if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
        // Primeiro tentar leves
        for (let i = normalCategories.light.length - 1; i >= 0; i--) {
          const pallet = normalCategories.light[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            normalCategories.light.splice(i, 1);
          }
        }

        // Depois tentar médios
        for (let i = normalCategories.medium.length - 1; i >= 0; i--) {
          if (truck.totalQuantity >= TRUCK_CAPACITY) break;
          const pallet = normalCategories.medium[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            normalCategories.medium.splice(i, 1);
          }
        }

        // Por último, pesados normais
        for (let i = normalCategories.heavy.length - 1; i >= 0; i--) {
          if (truck.totalQuantity >= TRUCK_CAPACITY) break;
          const pallet = normalCategories.heavy[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            normalCategories.heavy.splice(i, 1);
          }
        }
      }

      const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
      const requiredOccupancy = minOccupancyMandatory;


      if (occupancy >= requiredOccupancy) {
        trucks.push(truck);
      } else {
        // Devolver pallets às categorias
        truck.pallets.forEach(p => {
          if (p.isMandatory) {
            const weightPerPallet = p.weight / (p.quantity || 1);
            if (weightPerPallet > 900) {
              mandatoryCategories.heavy.push(p);
            } else if (weightPerPallet >= 700) {
              mandatoryCategories.medium.push(p);
            } else {
              mandatoryCategories.light.push(p);
            }
          } else {
            const weightPerPallet = p.weight / (p.quantity || 1);
            if (weightPerPallet > 900) {
              normalCategories.heavy.push(p);
            } else if (weightPerPallet >= 700) {
              normalCategories.medium.push(p);
            } else {
              normalCategories.light.push(p);
            }
          }
        });

        // Reordenar
        sortByPriorityAndWeight(mandatoryCategories.heavy, 'desc');
        sortByPriorityAndWeight(mandatoryCategories.medium, 'desc');
        sortByPriorityAndWeight(mandatoryCategories.light, 'asc');
        sortByPriorityAndWeight(normalCategories.heavy, 'desc');
        sortByPriorityAndWeight(normalCategories.medium, 'desc');
        sortByPriorityAndWeight(normalCategories.light, 'asc');
        break;
      }
    }

    // FASE 1.5: Tentativa com ocupação reduzida (85%) se ainda há muitos pallets
    const totalRemainingMandatory = mandatoryCategories.heavy.length + mandatoryCategories.medium.length + mandatoryCategories.light.length;
    if (totalRemainingMandatory > 10) {

      const reducedOccupancy = 85;
      attempt = 0;
      const maxAttemptsReduced = Math.min(totalRemainingMandatory, 30);

      while ((mandatoryCategories.heavy.length > 0 || mandatoryCategories.medium.length > 0 || mandatoryCategories.light.length > 0) && attempt < maxAttemptsReduced) {
        attempt++;
        const truck = {
          pallets: [],
          totalWeight: 0,
          totalQuantity: 0,
          hasMandatory: true
        };

        // Tentar balanceamento similar mas aceitar ocupação menor
        const targetWeightReduced = MAX_WEIGHT * 0.50;

        for (let i = mandatoryCategories.heavy.length - 1; i >= 0; i--) {
          if (truck.totalWeight >= targetWeightReduced) break;
          const pallet = mandatoryCategories.heavy[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            mandatoryCategories.heavy.splice(i, 1);
          }
        }

        for (let i = mandatoryCategories.medium.length - 1; i >= 0; i--) {
          const pallet = mandatoryCategories.medium[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            mandatoryCategories.medium.splice(i, 1);
          }
        }

        for (let i = mandatoryCategories.light.length - 1; i >= 0; i--) {
          const pallet = mandatoryCategories.light[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            mandatoryCategories.light.splice(i, 1);
          }
        }

        if (truck.pallets.length === 0) break;

        // Completar com normais
        if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
          for (let i = normalCategories.light.length - 1; i >= 0; i--) {
            const pallet = normalCategories.light[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              normalCategories.light.splice(i, 1);
            }
          }

          for (let i = normalCategories.medium.length - 1; i >= 0; i--) {
            if (truck.totalQuantity >= TRUCK_CAPACITY) break;
            const pallet = normalCategories.medium[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              normalCategories.medium.splice(i, 1);
            }
          }

          for (let i = normalCategories.heavy.length - 1; i >= 0; i--) {
            if (truck.totalQuantity >= TRUCK_CAPACITY) break;
            const pallet = normalCategories.heavy[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              normalCategories.heavy.splice(i, 1);
            }
          }
        }

        const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;


        if (occupancy >= reducedOccupancy) {
          trucks.push(truck);
        } else {
          // Devolver pallets
          truck.pallets.forEach(p => {
            if (p.isMandatory) {
              const weightPerPallet = p.weight / (p.quantity || 1);
              if (weightPerPallet > 900) {
                mandatoryCategories.heavy.push(p);
              } else if (weightPerPallet >= 700) {
                mandatoryCategories.medium.push(p);
              } else {
                mandatoryCategories.light.push(p);
              }
            } else {
              const weightPerPallet = p.weight / (p.quantity || 1);
              if (weightPerPallet > 900) {
                normalCategories.heavy.push(p);
              } else if (weightPerPallet >= 700) {
                normalCategories.medium.push(p);
              } else {
                normalCategories.light.push(p);
              }
            }
          });
          break;
        }
      }
    }

    // Reconstruir listas de mandatoryPallets e normalPallets
    mandatoryPallets = [...mandatoryCategories.heavy, ...mandatoryCategories.medium, ...mandatoryCategories.light];
    normalPallets = [...normalCategories.heavy, ...normalCategories.medium, ...normalCategories.light];

    // FASE 2: Reagrupar pallets obrigatórios com múltiplas estratégias
    if (mandatoryPallets.length > 0) {

      // Estratégia 1: Pallets leves primeiro (mais tentativas)
      let lightFirst = [...mandatoryPallets].sort((a, b) => a.weight - b.weight);
      attempt = 0;

      while (lightFirst.length > 0 && attempt < 10) {
        attempt++;
        const truck = {
          pallets: [],
          totalWeight: 0,
          totalQuantity: 0,
          hasMandatory: true
        };

        for (let i = lightFirst.length - 1; i >= 0; i--) {
          const pallet = lightFirst[i];
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalWeight += pallet.weight;
            truck.totalQuantity += pallet.quantity;
            lightFirst.splice(i, 1);

            const idx = mandatoryPallets.findIndex(p => p.sku === pallet.sku && p.quantity === pallet.quantity && p.weight === pallet.weight);
            if (idx >= 0) mandatoryPallets.splice(idx, 1);
          }
        }

        if (truck.pallets.length === 0) break;

        if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
          for (let i = normalPallets.length - 1; i >= 0; i--) {
            const pallet = normalPallets[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              normalPallets.splice(i, 1);
            }
          }
        }

        const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
        const requiredOccupancy = minOccupancyMandatory;


        if (occupancy >= requiredOccupancy) {
          trucks.push(truck);
        } else {
          mandatoryPallets.push(...truck.pallets.filter(p => p.isMandatory));
          normalPallets.push(...truck.pallets.filter(p => !p.isMandatory));
          sortByPriorityAndWeight(mandatoryPallets);
          sortByPriorityAndWeight(normalPallets);
          break;
        }
      }

      // Estratégia 2: Tentar agrupar por quantidade de pallets (fracionados com fracionados)
      if (mandatoryPallets.length > 0) {
        const fractionalFirst = [...mandatoryPallets].sort((a, b) => {
          const aFrac = a.quantity < 1 ? 0 : 1;
          const bFrac = b.quantity < 1 ? 0 : 1;
          if (aFrac !== bFrac) return aFrac - bFrac;
          return a.weight - b.weight;
        });

        attempt = 0;
        while (fractionalFirst.length > 0 && attempt < 10) {
          attempt++;
          const truck = {
            pallets: [],
            totalWeight: 0,
            totalQuantity: 0,
            hasMandatory: true
          };

          for (let i = fractionalFirst.length - 1; i >= 0; i--) {
            const pallet = fractionalFirst[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              fractionalFirst.splice(i, 1);

              const idx = mandatoryPallets.findIndex(p => p.sku === pallet.sku && p.quantity === pallet.quantity && p.weight === pallet.weight);
              if (idx >= 0) mandatoryPallets.splice(idx, 1);
            }
          }

          if (truck.pallets.length === 0) break;

          if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
            for (let i = normalPallets.length - 1; i >= 0; i--) {
              const pallet = normalPallets[i];
              if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                  truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
                truck.pallets.push(pallet);
                truck.totalWeight += pallet.weight;
                truck.totalQuantity += pallet.quantity;
                normalPallets.splice(i, 1);
              }
            }
          }

          const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
          const requiredOccupancy = minOccupancyMandatory;


          if (occupancy >= requiredOccupancy) {
            trucks.push(truck);
          } else {
            mandatoryPallets.push(...truck.pallets.filter(p => p.isMandatory));
            normalPallets.push(...truck.pallets.filter(p => !p.isMandatory));
            sortByPriorityAndWeight(mandatoryPallets);
            sortByPriorityAndWeight(normalPallets);
            break;
          }
        }
      }

      // Estratégia 2.3: Ordenar por densidade (peso/quantidade) - maximizar utilização
      if (mandatoryPallets.length > 0) {
        const densityFirst = [...mandatoryPallets].sort((a, b) => {
          const densityA = a.weight / (a.quantity || 1);
          const densityB = b.weight / (b.quantity || 1);
          return densityA - densityB; // Menor densidade primeiro (mais leves por pallet)
        });

        attempt = 0;
        while (densityFirst.length > 0 && attempt < 10) {
          attempt++;
          const truck = {
            pallets: [],
            totalWeight: 0,
            totalQuantity: 0,
            hasMandatory: true
          };

          for (let i = densityFirst.length - 1; i >= 0; i--) {
            const pallet = densityFirst[i];
            if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
              truck.pallets.push(pallet);
              truck.totalWeight += pallet.weight;
              truck.totalQuantity += pallet.quantity;
              densityFirst.splice(i, 1);

              const idx = mandatoryPallets.findIndex(p => p.sku === pallet.sku && p.quantity === pallet.quantity && p.weight === pallet.weight);
              if (idx >= 0) mandatoryPallets.splice(idx, 1);
            }
          }

          if (truck.pallets.length === 0) break;

          if (prioritizeCompletion && truck.totalQuantity < TRUCK_CAPACITY) {
            for (let i = normalPallets.length - 1; i >= 0; i--) {
              const pallet = normalPallets[i];
              if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
                  truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
                truck.pallets.push(pallet);
                truck.totalWeight += pallet.weight;
                truck.totalQuantity += pallet.quantity;
                normalPallets.splice(i, 1);
              }
            }
          }

          const occupancy = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
          const requiredOccupancy = minOccupancyMandatory;


          if (occupancy >= requiredOccupancy) {
            trucks.push(truck);
          } else {
            mandatoryPallets.push(...truck.pallets.filter(p => p.isMandatory));
            normalPallets.push(...truck.pallets.filter(p => !p.isMandatory));
            sortByPriorityAndWeight(mandatoryPallets);
            sortByPriorityAndWeight(normalPallets);
            break;
          }
        }
      }
    }

    // FASE 3: Relatório de pallets obrigatórios não alocados
    if (mandatoryPallets.length > 0) {
      const skuSummary = {};
      mandatoryPallets.forEach(p => {
        if (!skuSummary[p.sku]) {
          skuSummary[p.sku] = { pallets: 0, totalQty: 0 };
        }
        skuSummary[p.sku].pallets++;
        skuSummary[p.sku].totalQty += p.quantity;
      });
      Object.entries(skuSummary).forEach(([sku, info]) => {
      });
    }

    // FASE 4: Alocar pallets normais restantes
    if (normalPallets.length > 0) {
      const remainingTrucks = this.allocateTrucks(normalPallets, TRUCK_CAPACITY, MAX_WEIGHT);
      trucks.push(...remainingTrucks);
    }

    return trucks;
  }

  // --------------------------------------------------------------------------
  // GENETIC ALGORITHM FOR TRUCK ALLOCATION
  // --------------------------------------------------------------------------

  /**
   * Genetic algorithm with simulated annealing for optimal pallet-to-truck allocation
   * Uses evolutionary approach to maximize truck utilization while respecting constraints
   *
   * @param {string} country - Country code for capacity lookup
   * @param {Array} mandatoryPallets - High priority pallets that must be allocated
   * @param {Array} normalPallets - Standard priority pallets
   * @param {number} minOccupancy - Minimum truck occupancy percentage
   * @param {number} minOccupancyMandatory - Minimum occupancy for mandatory-only trucks
   * @param {boolean} prioritizeCompletion - Whether to prioritize filling trucks
   * @param {number} maxWeight - Maximum truck weight in kg
   * @returns {Array} Array of truck objects with allocated pallets
   */
  allocateTrucksGenetic(country, mandatoryPallets, normalPallets, minOccupancy, minOccupancyMandatory, prioritizeCompletion, maxWeight = TRUCK_MAX_WEIGHT, maxSkusArg = 0) {
    const TRUCK_CAPACITY = PALLETS_PER_TRUCK[country] || 28;
    const MAX_WEIGHT = maxWeight;

    const isArgDebug = country === 'ARG';

    if (country === 'PAR' && MAX_WEIGHT === 27000) {
    }

    const startTime = Date.now();

    // Genetic algorithm parameters - tuned for maximum exploration
    const POPULATION_SIZE = 50;
    const GENERATIONS = 30;
    const TOURNAMENT_SIZE = 5;
    const CROSSOVER_RATE = 0.9;
    const MUTATION_RATE = 0.3;
    const ELITE_SIZE = 5;

    // Simulated annealing parameters for solution refinement
    const SA_ITERATIONS = 20;
    const INITIAL_TEMP = 150;
    const COOLING_RATE = 0.95;

    // Combine all pallets with unique identifiers for tracking
    const allPallets = [...mandatoryPallets, ...normalPallets].map((p, idx) => ({
      ...p,
      _uniqueId: idx
    }));

    if (allPallets.length === 0) {
      return [];
    }


    // DIAGNÓSTICO DETALHADO - DISTRIBUIÇÃO DE PALLETS (REGRA DE NEGÓCIO DO ALGORITMO ORIGINAL)

    const totalPalletsQty = allPallets.reduce((sum, p) => sum + p.quantity, 0);
    const totalWeight = allPallets.reduce((sum, p) => sum + p.weight, 0);


    // Categorizar por peso (REGRA DE NEGÓCIO #1)
    const heavyPallets = allPallets.filter(p => (p.weight / (p.quantity || 1)) > 900);
    const mediumPallets = allPallets.filter(p => {
      const wpp = p.weight / (p.quantity || 1);
      return wpp >= 700 && wpp <= 900;
    });
    const lightPallets = allPallets.filter(p => (p.weight / (p.quantity || 1)) < 700);

    const heavyQty = heavyPallets.reduce((sum, p) => sum + p.quantity, 0);
    const mediumQty = mediumPallets.reduce((sum, p) => sum + p.quantity, 0);
    const lightQty = lightPallets.reduce((sum, p) => sum + p.quantity, 0);


    // Debug: mostrar alguns pallets
    allPallets.slice(0, 5).forEach(p => {
      const wpp = (p.weight / (p.quantity || 1)).toFixed(0);
    });

    // === FUNÇÕES AUXILIARES ===

    // Categorizar pallets por peso (REGRA DE NEGÓCIO DO ALGORITMO ORIGINAL)
    const categorizePalletByWeight = (pallet) => {
      const wpp = pallet.weight / (pallet.quantity || 1);
      if (wpp > 900) return 'heavy';
      if (wpp >= 700) return 'medium';
      return 'light';
    };

    // Fitness function AVANÇADA: incorpora TODAS as regras de negócio do allocateTrucksAdvanced
    const calculateFitness = (solution) => {
      let totalAllocated = 0;
      let totalOccupancy = 0;
      let totalWeightUtilization = 0;
      let mandatoryAllocated = 0;
      let mandatoryMissing = 0;
      let balancePenalty = 0;
      let categoryMixBonus = 0;
      const trucks = solution.trucks || [];

      trucks.forEach(truck => {
        totalAllocated += truck.totalQuantity;
        const volumeOcc = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
        const weightOcc = (truck.totalWeight / MAX_WEIGHT) * 100;

        totalOccupancy += volumeOcc;
        totalWeightUtilization += weightOcc;

        truck.pallets.forEach(p => {
          if (p.isMandatory) mandatoryAllocated++;
        });

        // REGRA 1: Penalizar desbalanceamento peso/volume
        // Ideal: peso e volume proporcionais (ex: 95% volume + 90% peso = balanceado)
        const imbalance = Math.abs(volumeOcc - weightOcc);
        if (imbalance > 20) {
          balancePenalty += imbalance * 2;
        }

        // REGRA 2: Bonificar mix de categorias (heavy+medium+light)
        const truckCategories = new Set();
        truck.pallets.forEach(p => {
          truckCategories.add(categorizePalletByWeight(p));
        });

        if (truckCategories.size >= 2) {
          categoryMixBonus += 50; // Bônus por caminhão balanceado
        }
      });

      // Contar obrigatórios não alocados usando _uniqueId
      const allocatedIds = new Set();
      trucks.forEach(t => t.pallets.forEach(p => allocatedIds.add(p._uniqueId)));

      mandatoryPallets.forEach((p, idx) => {
        if (!allocatedIds.has(idx)) {
          mandatoryMissing++;
        }
      });

      const avgOccupancy = trucks.length > 0 ? totalOccupancy / trucks.length : 0;
      const avgWeightUtil = trucks.length > 0 ? totalWeightUtilization / trucks.length : 0;

      // NOVA FÓRMULA DE FITNESS (PRIORIZA MÁXIMO DE PALLETS)
      const fitness =
        (totalAllocated * 1000) +        // CRÍTICO: Maximizar pallets alocados (peso 1000!)
        (trucks.length * 500) +          // NOVO: Bonus por mais caminhões
        (avgOccupancy * 10) +            // Maximizar ocupação de volume
        (avgWeightUtil * 5) +            // Maximizar utilização de peso
        categoryMixBonus -               // Recompensar caminhões balanceados
        balancePenalty -                 // Penalizar desbalanceamento
        (mandatoryMissing * 5000);       // Penalizar obrigatórios perdidos

      return {
        fitness,
        totalAllocated,
        avgOccupancy,
        avgWeightUtil,
        mandatoryMissing,
        balancePenalty,
        categoryMixBonus,
        trucks: trucks.length
      };
    };

    // NOVA FUNÇÃO SIMPLIFICADA: Sem categorização, apenas MAXIMIZAR pallets
    // Baseado na alocação manual perfeita do usuário
    const effectiveMaxSkus = (country === 'ARG' && maxSkusArg > 0) ? maxSkusArg : 0;

    const createBalancedGreedySolution = (palletOrder) => {
      const trucks = [];
      const used = new Set();

      if (isArgDebug) {
      }

      // NÃO categorizar! Apenas usar a ordem fornecida pelo GA
      let remainingPallets = palletOrder.filter(p => !used.has(p._uniqueId));

      // ESTRATÉGIA SIMPLIFICADA: Apenas preencher caminhões sequencialmente
      // SEM categorização, SEM subfases, SEM ordem rígida
      // Igual à alocação manual perfeita do usuário

      let attempts = 0;
      const MAX_ATTEMPTS = 50; // Permitir muitas tentativas

      while (remainingPallets.length > 0 && attempts < MAX_ATTEMPTS) {
        attempts++;

        const truck = {
          pallets: [],
          totalWeight: 0,
          totalQuantity: 0
        };

        const truckSkus = effectiveMaxSkus > 0 ? new Set() : null;

        // SIMPLESMENTE adicionar pallets NA ORDEM até completar caminhão
        for (const pallet of remainingPallets) {
          if (used.has(pallet._uniqueId)) continue;

          // Verificar limite de SKUs distintos (só quando effectiveMaxSkus > 0)
          if (truckSkus) {
            const palletSku = pallet.sku || '';
            if (!truckSkus.has(palletSku) && truckSkus.size >= effectiveMaxSkus) {
              continue;
            }
          }

          // Tentar adicionar se cabe
          if (truck.totalQuantity + pallet.quantity <= TRUCK_CAPACITY &&
              truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
            truck.pallets.push(pallet);
            truck.totalQuantity += pallet.quantity;
            truck.totalWeight += pallet.weight;
            used.add(pallet._uniqueId);
            if (truckSkus) truckSkus.add(pallet.sku || '');
          }
        }

        // Se não conseguiu nenhum pallet, para
        if (truck.pallets.length === 0) break;

        // Verificar ocupação
        const hasMandatory = truck.pallets.some(p => p.isMandatory);
        const occ = (truck.totalQuantity / TRUCK_CAPACITY) * 100;
        const requiredOcc = hasMandatory ? minOccupancyMandatory : minOccupancy;

        if (isArgDebug) {
        }

        if (occ >= requiredOcc) {
          // ACEITAR caminhão
          trucks.push(truck);
          if (isArgDebug) {
          }
        } else {
          // NÃO ACEITAR: Devolver pallets e remover o PRIMEIRO da lista
          // Isso força o algoritmo a tentar combinações diferentes
          if (isArgDebug) {
          }

          truck.pallets.forEach(p => used.delete(p._uniqueId));

          // Remover primeiro pallet da lista para forçar combinação diferente
          if (remainingPallets.length > 0) {
            remainingPallets = remainingPallets.slice(1);
          }
        }

        // Atualizar lista de restantes
        remainingPallets = palletOrder.filter(p => !used.has(p._uniqueId));
      }

      if (isArgDebug) {
        const totalAllocated = trucks.reduce((sum, t) => sum + t.totalQuantity, 0);
      }

      return {
        trucks,
        order: palletOrder
      };
    };

    // Criar população inicial com 4 estratégias AVANÇADAS (REGRA DE NEGÓCIO DO ALGORITMO ORIGINAL)
    const createInitialPopulation = () => {
      const population = [];

      // Estratégia 1: BALANCEAMENTO - Heavy → Medium → Light (categorização por peso)
      const strategy1 = [...allPallets].sort((a, b) => {
        if (a.isMandatory !== b.isMandatory) return b.isMandatory - a.isMandatory;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.weight - a.weight;
      });
      const sol1 = createBalancedGreedySolution(strategy1);
      population.push(sol1);

      // Estratégia 2: DENSIDADE - weight/quantity descendente (estratégia original FASE 2.3)
      const strategy2 = [...allPallets].sort((a, b) => {
        if (a.isMandatory !== b.isMandatory) return b.isMandatory - a.isMandatory;
        const densityA = a.weight / a.quantity;
        const densityB = b.weight / b.quantity;
        return densityB - densityA;  // Maior densidade primeiro
      });
      population.push(createBalancedGreedySolution(strategy2));

      // Estratégia 3: LEVES PRIMEIRO - inverte a ordem (light → medium → heavy)
      const lightFirst = allPallets.filter(p => (p.weight / p.quantity) < 700);
      const mediumFirst = allPallets.filter(p => (p.weight / p.quantity) >= 700 && (p.weight / p.quantity) <= 900);
      const heavyFirst = allPallets.filter(p => (p.weight / p.quantity) > 900);
      const strategy3 = [...lightFirst, ...mediumFirst, ...heavyFirst];
      population.push(createBalancedGreedySolution(strategy3));

      // Estratégia 4: PRIORIDADE PURA - ordenar apenas por mandatory + priority + quantidade
      const strategy4 = [...allPallets].sort((a, b) => {
        if (a.isMandatory !== b.isMandatory) return b.isMandatory - a.isMandatory;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.quantity - a.quantity;
      });
      population.push(createBalancedGreedySolution(strategy4));

      // Estratégias aleatórias para diversidade genética
      for (let i = 4; i < POPULATION_SIZE; i++) {
        const shuffled = [...allPallets].sort(() => Math.random() - 0.5);
        population.push(createBalancedGreedySolution(shuffled));
      }

      return population;
    };

    // Seleção por torneio
    const tournamentSelection = (population, fitnessScores) => {
      let best = null;
      let bestFitness = -Infinity;

      for (let i = 0; i < TOURNAMENT_SIZE; i++) {
        const idx = Math.floor(Math.random() * population.length);
        if (fitnessScores[idx].fitness > bestFitness) {
          bestFitness = fitnessScores[idx].fitness;
          best = population[idx];
        }
      }

      return best;
    };

    // Crossover: mistura as ordens de dois pais
    const crossover = (parent1, parent2) => {
      if (Math.random() > CROSSOVER_RATE) return parent1;

      const order1 = parent1.order;
      const order2 = parent2.order;
      const size = order1.length;
      const start = Math.floor(Math.random() * size);
      const end = start + Math.floor(Math.random() * (size - start));

      const child = new Array(size);
      const used = new Set();

      // Copiar segmento do pai 1
      for (let i = start; i <= end && i < size; i++) {
        child[i] = order1[i];
        used.add(order1[i]._uniqueId);  // Usar _uniqueId
      }

      // Preencher resto do pai 2
      let idx = 0;
      for (let i = 0; i < size; i++) {
        if (child[i] === undefined) {
          // Procurar próximo elemento válido do pai 2
          while (idx < size && (order2[idx] === undefined || used.has(order2[idx]._uniqueId))) {
            idx++;
          }
          if (idx < size && order2[idx] !== undefined) {
            child[i] = order2[idx];
            used.add(order2[idx]._uniqueId);  // Usar _uniqueId
            idx++;
          }
        }
      }

      // Filtrar undefined e garantir que temos elementos válidos
      const validChild = child.filter(x => x !== undefined);
      return validChild.length > 0 ? createBalancedGreedySolution(validChild) : parent1;
    };

    // Mutação: troca posições aleatórias
    const mutate = (solution) => {
      if (Math.random() > MUTATION_RATE) return solution;

      const order = [...solution.order];
      const idx1 = Math.floor(Math.random() * order.length);
      const idx2 = Math.floor(Math.random() * order.length);

      [order[idx1], order[idx2]] = [order[idx2], order[idx1]];

      return createBalancedGreedySolution(order);
    };

    // === ALGORITMO GENÉTICO ===

    let population = createInitialPopulation();

    // Debug: verificar se a população inicial tem caminhões
    const initialTruckCounts = population.map(p => p.trucks.length);

    let bestSolution = null;
    let bestFitness = -Infinity;

    for (let gen = 0; gen < GENERATIONS; gen++) {
      // Avaliar fitness
      const fitnessScores = population.map(sol => calculateFitness(sol));

      // Atualizar melhor solução
      fitnessScores.forEach((score, idx) => {
        if (score.fitness > bestFitness) {
          bestFitness = score.fitness;
          bestSolution = JSON.parse(JSON.stringify(population[idx]));
        }
      });

      if (gen % 3 === 0 || gen === GENERATIONS - 1) {
        const best = fitnessScores.reduce((a, b) => a.fitness > b.fitness ? a : b);
        // Progress log removed
      }

      // Nova geração
      const newPopulation = [];

      // Elitismo: manter as melhores soluções
      const sorted = population
        .map((sol, idx) => ({ sol, fitness: fitnessScores[idx].fitness }))
        .sort((a, b) => b.fitness - a.fitness);

      for (let i = 0; i < ELITE_SIZE; i++) {
        newPopulation.push(sorted[i].sol);
      }

      // Gerar resto da população
      while (newPopulation.length < POPULATION_SIZE) {
        const parent1 = tournamentSelection(population, fitnessScores);
        const parent2 = tournamentSelection(population, fitnessScores);
        const child = crossover(parent1, parent2);
        const mutated = mutate(child);
        newPopulation.push(mutated);
      }

      population = newPopulation;
    }

    // === SIMULATED ANNEALING (REFINAMENTO) ===

    let currentSolution = JSON.parse(JSON.stringify(bestSolution));
    let currentFitness = calculateFitness(currentSolution).fitness;
    let temperature = INITIAL_TEMP;

    for (let iter = 0; iter < SA_ITERATIONS; iter++) {
      // Gerar vizinho: trocar 2 posições aleatórias
      const neighbor = JSON.parse(JSON.stringify(currentSolution));
      const idx1 = Math.floor(Math.random() * neighbor.order.length);
      const idx2 = Math.floor(Math.random() * neighbor.order.length);
      [neighbor.order[idx1], neighbor.order[idx2]] = [neighbor.order[idx2], neighbor.order[idx1]];

      const neighborSolution = createBalancedGreedySolution(neighbor.order);
      const neighborFitness = calculateFitness(neighborSolution).fitness;

      // Aceitar ou rejeitar
      const delta = neighborFitness - currentFitness;
      if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
        currentSolution = neighborSolution;
        currentFitness = neighborFitness;

        if (currentFitness > bestFitness) {
          bestSolution = JSON.parse(JSON.stringify(currentSolution));
          bestFitness = currentFitness;
        }
      }

      temperature *= COOLING_RATE;
    }

    const finalStats = calculateFitness(bestSolution);
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);


    if (isArgDebug) {
      const palletsNaoAlocados = totalPalletsQty - finalStats.totalAllocated;

      // ANÁLISE DETALHADA: Identificar quais pallets NÃO foram alocados
      const allocatedIds = new Set();
      bestSolution.trucks.forEach(truck => {
        truck.pallets.forEach(p => allocatedIds.add(p._uniqueId));
      });

      const nonAllocatedPallets = allPallets.filter(p => !allocatedIds.has(p._uniqueId));

      if (nonAllocatedPallets.length > 0) {

        // Agrupar por SKU
        const groupedBySKU = {};
        nonAllocatedPallets.forEach(p => {
          const key = `${p.sku}_${p.isMandatory ? 'OBR' : 'NOR'}`;
          if (!groupedBySKU[key]) {
            groupedBySKU[key] = {
              sku: p.sku,
              descricao: p.descricao,
              isMandatory: p.isMandatory,
              totalQty: 0,
              totalWeight: 0,
              count: 0,
              pallets: []
            };
          }
          groupedBySKU[key].totalQty += p.quantity;
          groupedBySKU[key].totalWeight += p.weight;
          groupedBySKU[key].count++;
          groupedBySKU[key].pallets.push(p);
        });

        // Analisar cada grupo
        Object.values(groupedBySKU).forEach((group, idx) => {
          const wpp = group.totalWeight / group.totalQty;
          const category = wpp > 900 ? 'PESADO' : wpp >= 700 ? 'MÉDIO' : 'LEVE';


          // Analisar por que não foi alocado
          const reasons = [];

          // Verificar se caberia em algum caminhão existente
          let couldFitInExisting = false;
          bestSolution.trucks.forEach(truck => {
            const spaceLeft = TRUCK_CAPACITY - truck.totalQuantity;
            const weightLeft = MAX_WEIGHT - truck.totalWeight;

            group.pallets.forEach(p => {
              if (p.quantity <= spaceLeft && p.weight <= weightLeft) {
                couldFitInExisting = true;
              }
            });
          });

          if (couldFitInExisting) {
            reasons.push('❌ PODERIA caber em caminhão existente mas não foi adicionado');
          }

          // Verificar se formaria caminhão válido sozinho
          const minPalletsRequired = TRUCK_CAPACITY * (group.isMandatory ? minOccupancyMandatory : minOccupancy) / 100;
          if (group.totalQty >= minPalletsRequired) {
            reasons.push(`✅ PODERIA formar caminhão próprio (tem ${group.totalQty.toFixed(2)} >= ${minPalletsRequired.toFixed(2)} pallets)`);
          } else {
            reasons.push(`❌ NÃO forma caminhão sozinho (${group.totalQty.toFixed(2)} < ${minPalletsRequired.toFixed(2)} pallets para ${(group.isMandatory ? minOccupancyMandatory : minOccupancy)}%)`);
          }

          // Verificar se é muito pesado
          if (wpp > 1200) {
            reasons.push('⚠️ Muito pesado (>1200 kg/pallet) - dificulta combinação');
          }

        });

      }
    }

    // Métricas de qualidade (REGRA DE NEGÓCIO DO ALGORITMO ORIGINAL)

    // Debug: mostrar primeiros caminhões com detalhes de balanceamento
    if (bestSolution.trucks && bestSolution.trucks.length > 0) {
      bestSolution.trucks.slice(0, 5).forEach((truck, idx) => {
        const volumeOcc = (truck.totalQuantity / TRUCK_CAPACITY * 100).toFixed(1);
        const weightOcc = (truck.totalWeight / MAX_WEIGHT * 100).toFixed(1);
        const imbalance = Math.abs(parseFloat(volumeOcc) - parseFloat(weightOcc)).toFixed(1);

        // Contar categorias no caminhão
        const categories = new Set();
        truck.pallets.forEach(p => {
          const cat = categorizePalletByWeight(p);
          categories.add(cat);
        });
        const catStr = Array.from(categories).join('+');

      });
    } else {
    }


    // Limpar _uniqueId dos pallets antes de retornar
    const cleanedTrucks = (bestSolution.trucks || []).map(truck => ({
      ...truck,
      pallets: truck.pallets.map(p => {
        const { _uniqueId, ...cleanPallet } = p;
        return cleanPallet;
      })
    }));

    return cleanedTrucks;
  }

  // NOVA FUNÇÃO: Reordenar caminhões por prioridade (alta prioridade primeiro)
  // Não altera a alocação, apenas reorganiza a ordem dos caminhões
  reorderTrucksByPriority(trucks, country) {
    if (!trucks || trucks.length === 0) return trucks;


    // Função para verificar se é alta prioridade (3, 4 ou 999)
    const isHighPriority = (pallet) => {
      const priority = pallet.priority || 1;
      return priority >= 3;
    };

    // Função para verificar se é COMFORT (apenas para ARG)
    const isComfort = (pallet) => {
      const desc = (pallet.desc || pallet.descricao || '').toUpperCase();
      return desc.includes('COMFORT');
    };

    // Calcular score de prioridade para cada caminhão
    const trucksWithScore = trucks.map((truck, originalIndex) => {
      const totalPallets = truck.pallets.reduce((sum, p) => sum + p.quantity, 0);
      const highPriorityPallets = truck.pallets
        .filter(p => isHighPriority(p))
        .reduce((sum, p) => sum + p.quantity, 0);

      // Score baseado em: % de pallets de alta prioridade + soma das prioridades
      const highPriorityPercent = totalPallets > 0 ? (highPriorityPallets / totalPallets) * 100 : 0;
      const prioritySum = truck.pallets.reduce((sum, p) => sum + (p.priority || 1) * p.quantity, 0);

      // Para Argentina: considerar também COMFORT
      let comfortScore = 0;
      if (country === 'ARG') {
        const comfortPallets = truck.pallets
          .filter(p => isComfort(p))
          .reduce((sum, p) => sum + p.quantity, 0);
        comfortScore = totalPallets > 0 ? (comfortPallets / totalPallets) * 10 : 0;
      }

      // Score final: prioridade é mais importante, COMFORT é secundário (para ARG)
      const score = (highPriorityPercent * 100) + prioritySum + comfortScore;

      return {
        truck,
        originalIndex,
        score,
        highPriorityPercent,
        prioritySum
      };
    });

    // Ordenar por score (maior primeiro)
    trucksWithScore.sort((a, b) => b.score - a.score);

    // Log da reordenação
    trucksWithScore.slice(0, 5).forEach((item, newIndex) => {
      const highPallets = item.truck.pallets.filter(p => isHighPriority(p)).reduce((s, p) => s + p.quantity, 0);
      const totalPallets = item.truck.pallets.reduce((s, p) => s + p.quantity, 0);
    });
    if (trucksWithScore.length > 5) {
    }

    // Estatísticas
    const highOnlyTrucks = trucksWithScore.filter(t => t.highPriorityPercent === 100).length;
    const mixedTrucks = trucksWithScore.filter(t => t.highPriorityPercent > 0 && t.highPriorityPercent < 100).length;
    const lowOnlyTrucks = trucksWithScore.filter(t => t.highPriorityPercent === 0).length;


    // Retornar apenas os trucks na nova ordem
    return trucksWithScore.map(item => item.truck);
  }

  /**
   * Enforce max SKUs per truck after all post-processing.
   * Collects all pallets from violating trucks, then rebuilds using greedy bin-packing
   * respecting both maxSkus and minOccupancy constraints.
   */
  enforceMaxSkusPerTruck(trucks, maxSkus, truckCapacity, maxWeight, minOccupancy) {
    if (!trucks || maxSkus <= 0) return trucks;

    // Separate compliant trucks from violating ones
    const goodTrucks = [];
    const pool = []; // pallets to reallocate

    for (const truck of trucks) {
      const skuSet = new Set(truck.pallets.map(p => p.sku || ''));
      if (skuSet.size <= maxSkus) {
        goodTrucks.push(truck);
      } else {
        // Truck violates — all its pallets go back to pool
        pool.push(...truck.pallets);
      }
    }

    if (pool.length === 0) return trucks;

    // Also try to fit pool pallets into existing good trucks first
    for (let i = pool.length - 1; i >= 0; i--) {
      const pallet = pool[i];
      const palletSku = pallet.sku || '';

      for (const truck of goodTrucks) {
        const truckSkus = new Set(truck.pallets.map(p => p.sku || ''));
        if (!truckSkus.has(palletSku) && truckSkus.size >= maxSkus) continue;
        if (truck.totalQuantity + (pallet.quantity || 0) > truckCapacity) continue;
        if (truck.totalWeight + (pallet.weight || 0) > maxWeight) continue;

        truck.pallets.push(pallet);
        truck.totalQuantity += (pallet.quantity || 0);
        truck.totalWeight += (pallet.weight || 0);
        pool.splice(i, 1);
        break;
      }
    }

    if (pool.length === 0) return goodTrucks;

    // Build new trucks from remaining pool with greedy bin-packing
    // Sort by quantity descending for better packing
    pool.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));

    const newTrucks = [];
    const used = new Set();
    let attempts = 0;

    while (pool.some((_, i) => !used.has(i)) && attempts < 30) {
      attempts++;
      const truck = { pallets: [], totalQuantity: 0, totalWeight: 0 };
      const truckSkus = new Set();

      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        const pallet = pool[i];
        const palletSku = pallet.sku || '';

        if (!truckSkus.has(palletSku) && truckSkus.size >= maxSkus) continue;
        if (truck.totalQuantity + (pallet.quantity || 0) > truckCapacity) continue;
        if (truck.totalWeight + (pallet.weight || 0) > maxWeight) continue;

        truck.pallets.push(pallet);
        truck.totalQuantity += (pallet.quantity || 0);
        truck.totalWeight += (pallet.weight || 0);
        truckSkus.add(palletSku);
        used.add(i);
      }

      if (truck.pallets.length === 0) break;

      // Check occupancy
      const occ = (truck.totalQuantity / truckCapacity) * 100;
      if (occ >= minOccupancy) {
        newTrucks.push(truck);
      } else {
        // Truck below minimum — return pallets to pool for retry
        truck.pallets.forEach(p => {
          const idx = pool.indexOf(p);
          if (idx >= 0) used.delete(idx);
        });
        // Remove first unused pallet to force different combination
        const firstUnused = pool.findIndex((_, i) => !used.has(i));
        if (firstUnused >= 0) used.add(firstUnused);
      }
    }

    return [...goodTrucks, ...newTrucks];
  }

  /**
   * Consolidate high priority items into first trucks
   * Swaps pallets between trucks to concentrate urgent items (priority 3, 4, 999)
   */
  consolidateHighPriorityItems(trucks, country, maxWeight = TRUCK_MAX_WEIGHT) {
    if (!trucks || !Array.isArray(trucks) || trucks.length === 0) return trucks;

    const TRUCK_CAPACITY = PALLETS_PER_TRUCK[country] || 28;
    const MAX_WEIGHT = maxWeight;
    const isHighPriority = (p) => p && (p.priority || 1) >= 3;

    const getTruckWeight = (t) => {
      if (t.totalWeight !== undefined) return t.totalWeight;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.weight || 0), 0) : 0;
    };

    const getTruckQuantity = (t) => {
      if (t.totalQuantity !== undefined) return t.totalQuantity;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.quantity || 0), 0) : 0;
    };

    const workingTrucks = trucks.map(t => ({
      ...t,
      pallets: t.pallets ? [...t.pallets] : [],
      totalWeight: getTruckWeight(t),
      totalQuantity: getTruckQuantity(t)
    }));

    const highPriorityItems = [];
    workingTrucks.forEach((truck, truckIdx) => {
      if (!truck.pallets) return;
      truck.pallets.forEach((pallet, palletIdx) => {
        if (isHighPriority(pallet)) {
          highPriorityItems.push({ pallet, truckIdx, palletIdx });
        }
      });
    });

    highPriorityItems.sort((a, b) => (b.pallet.priority || 1) - (a.pallet.priority || 1));

    for (const item of highPriorityItems) {
      const { pallet, truckIdx: sourceIdx } = item;
      const sourceTruck = workingTrucks[sourceIdx];

      if (!sourceTruck.pallets.includes(pallet)) continue;

      for (let targetIdx = 0; targetIdx < sourceIdx; targetIdx++) {
        const targetTruck = workingTrucks[targetIdx];

        const newQty = targetTruck.totalQuantity + (pallet.quantity || 0);
        const newWeight = targetTruck.totalWeight + (pallet.weight || 0);

        if (newQty <= TRUCK_CAPACITY && newWeight <= MAX_WEIGHT) {
          const idx = sourceTruck.pallets.indexOf(pallet);
          if (idx >= 0) {
            sourceTruck.pallets.splice(idx, 1);
            sourceTruck.totalQuantity -= (pallet.quantity || 0);
            sourceTruck.totalWeight -= (pallet.weight || 0);

            targetTruck.pallets.push(pallet);
            targetTruck.totalQuantity = newQty;
            targetTruck.totalWeight = newWeight;
          }
          break;
        }

        const lowPallets = targetTruck.pallets.filter(p => !isHighPriority(p));
        for (const lowPallet of lowPallets) {
          const newTargetQty = targetTruck.totalQuantity - (lowPallet.quantity || 0) + (pallet.quantity || 0);
          const newTargetWeight = targetTruck.totalWeight - (lowPallet.weight || 0) + (pallet.weight || 0);
          const newSourceQty = sourceTruck.totalQuantity - (pallet.quantity || 0) + (lowPallet.quantity || 0);
          const newSourceWeight = sourceTruck.totalWeight - (pallet.weight || 0) + (lowPallet.weight || 0);

          if (newTargetQty <= TRUCK_CAPACITY && newTargetWeight <= MAX_WEIGHT &&
              newSourceQty <= TRUCK_CAPACITY && newSourceWeight <= MAX_WEIGHT) {
            const highIdx = sourceTruck.pallets.indexOf(pallet);
            const lowIdx = targetTruck.pallets.indexOf(lowPallet);

            if (highIdx >= 0 && lowIdx >= 0) {
              sourceTruck.pallets.splice(highIdx, 1);
              targetTruck.pallets.splice(lowIdx, 1);
              targetTruck.pallets.push(pallet);
              sourceTruck.pallets.push(lowPallet);

              targetTruck.totalQuantity = newTargetQty;
              targetTruck.totalWeight = newTargetWeight;
              sourceTruck.totalQuantity = newSourceQty;
              sourceTruck.totalWeight = newSourceWeight;
            }
            break;
          }
        }

        if (!sourceTruck.pallets.includes(pallet)) break;
      }
    }

    workingTrucks.sort((a, b) => {
      const highA = a.pallets.filter(p => isHighPriority(p)).reduce((s, p) => s + (p.quantity || 0), 0);
      const highB = b.pallets.filter(p => isHighPriority(p)).reduce((s, p) => s + (p.quantity || 0), 0);
      return highB - highA;
    });

    return workingTrucks;
  }

  // Consolida SKUs específicos nos ÚLTIMOS caminhões (68472205 e 68568095)
  // Works from last to first to avoid conflicts with priority consolidation
  consolidateSpecificSkus(trucks, country, maxWeight = TRUCK_MAX_WEIGHT) {
    if (!trucks || !Array.isArray(trucks) || trucks.length === 0) return trucks;

    const TRUCK_CAPACITY = PALLETS_PER_TRUCK[country] || 28;
    const MAX_WEIGHT = maxWeight;
    const TARGET_SKUS = ['68472205', '68568095'];
    const isTargetSku = (p) => p && TARGET_SKUS.includes(String(p.sku));

    const getTruckWeight = (t) => {
      if (t.totalWeight !== undefined) return t.totalWeight;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.weight || 0), 0) : 0;
    };

    const getTruckQuantity = (t) => {
      if (t.totalQuantity !== undefined) return t.totalQuantity;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.quantity || 0), 0) : 0;
    };

    const workingTrucks = trucks.map(t => ({
      ...t,
      pallets: t.pallets ? [...t.pallets] : [],
      totalWeight: getTruckWeight(t),
      totalQuantity: getTruckQuantity(t)
    }));

    const allTargetPallets = [];
    workingTrucks.forEach((truck, truckIdx) => {
      if (!truck.pallets) return;
      truck.pallets.forEach((pallet) => {
        if (isTargetSku(pallet)) {
          allTargetPallets.push({ pallet, truckIdx, quantity: pallet.quantity || 0, weight: pallet.weight || 0 });
        }
      });
    });

    if (allTargetPallets.length === 0) return trucks;

    const uniqueTruckIdxs = [...new Set(allTargetPallets.map(p => p.truckIdx))].sort((a, b) => b - a);
    if (uniqueTruckIdxs.length <= 1) return trucks;

    allTargetPallets.sort((a, b) => a.truckIdx - b.truckIdx);
    const destinationTrucks = [uniqueTruckIdxs[0]];

    for (const item of allTargetPallets) {
      const { pallet, truckIdx: currentTruckIdx } = item;
      const currentTruck = workingTrucks[currentTruckIdx];

      if (!currentTruck.pallets.includes(pallet)) continue;
      if (destinationTrucks.includes(currentTruckIdx)) continue;

      let moved = false;

      for (const destIdx of destinationTrucks) {
        const destTruck = workingTrucks[destIdx];

        const newQty = destTruck.totalQuantity + (pallet.quantity || 0);
        const newWeight = destTruck.totalWeight + (pallet.weight || 0);

        if (newQty <= TRUCK_CAPACITY && newWeight <= MAX_WEIGHT) {
          const idx = currentTruck.pallets.indexOf(pallet);
          if (idx >= 0) {
            currentTruck.pallets.splice(idx, 1);
            currentTruck.totalQuantity -= (pallet.quantity || 0);
            currentTruck.totalWeight -= (pallet.weight || 0);

            destTruck.pallets.push(pallet);
            destTruck.totalQuantity = newQty;
            destTruck.totalWeight = newWeight;
            moved = true;
          }
          break;
        }

        const swappablePallets = destTruck.pallets.filter(p => !isTargetSku(p));
        swappablePallets.sort((a, b) => (b.weight || 0) - (a.weight || 0));

        for (const swapPallet of swappablePallets) {
          const newDestQty = destTruck.totalQuantity - (swapPallet.quantity || 0) + (pallet.quantity || 0);
          const newDestWeight = destTruck.totalWeight - (swapPallet.weight || 0) + (pallet.weight || 0);
          const newSourceQty = currentTruck.totalQuantity - (pallet.quantity || 0) + (swapPallet.quantity || 0);
          const newSourceWeight = currentTruck.totalWeight - (pallet.weight || 0) + (swapPallet.weight || 0);

          if (newDestQty <= TRUCK_CAPACITY && newDestWeight <= MAX_WEIGHT &&
              newSourceQty <= TRUCK_CAPACITY && newSourceWeight <= MAX_WEIGHT) {
            const palletIdx = currentTruck.pallets.indexOf(pallet);
            const swapIdx = destTruck.pallets.indexOf(swapPallet);

            if (palletIdx >= 0 && swapIdx >= 0) {
              currentTruck.pallets.splice(palletIdx, 1);
              destTruck.pallets.splice(swapIdx, 1);
              destTruck.pallets.push(pallet);
              currentTruck.pallets.push(swapPallet);

              destTruck.totalQuantity = newDestQty;
              destTruck.totalWeight = newDestWeight;
              currentTruck.totalQuantity = newSourceQty;
              currentTruck.totalWeight = newSourceWeight;
              moved = true;
            }
            break;
          }
        }

        if (moved) break;
      }

      if (!moved && !destinationTrucks.includes(currentTruckIdx)) {
        const nextDestIdx = uniqueTruckIdxs.find(idx => !destinationTrucks.includes(idx) && idx !== currentTruckIdx);
        if (nextDestIdx !== undefined) {
          destinationTrucks.push(nextDestIdx);
        } else {
          destinationTrucks.push(currentTruckIdx);
        }
      }
    }

    return workingTrucks;
  }

  // Generic version of consolidateSpecificSkus: any SKU scattered above a threshold
  // gets pulled together via direct moves and 1-for-1 swaps. Respects truck capacity
  // and weight limits. Runs from last truck to first to avoid clashing with priority
  // consolidation (priorities flow first->last).
  consolidateScatteredSkus(trucks, country, maxWeight = TRUCK_MAX_WEIGHT, options = {}) {
    if (!trucks || !Array.isArray(trucks) || trucks.length < 2) return trucks;

    const minScatterCount = options.minScatterCount ?? 4;
    const minTrucksScattered = options.minTrucksScattered ?? 2;
    const excludeSkus = new Set((options.excludeSkus || []).map(s => String(s)));

    const TRUCK_CAPACITY = PALLETS_PER_TRUCK[country] || 28;
    const MAX_WEIGHT = maxWeight;

    const getTruckWeight = (t) => {
      if (t.totalWeight !== undefined) return t.totalWeight;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.weight || 0), 0) : 0;
    };
    const getTruckQuantity = (t) => {
      if (t.totalQuantity !== undefined) return t.totalQuantity;
      return t.pallets ? t.pallets.reduce((s, p) => s + (p.quantity || 0), 0) : 0;
    };

    const workingTrucks = trucks.map(t => ({
      ...t,
      pallets: t.pallets ? [...t.pallets] : [],
      totalWeight: getTruckWeight(t),
      totalQuantity: getTruckQuantity(t)
    }));

    // Index SKU -> { trucksSet, totalQuantity }
    const skuStats = new Map();
    workingTrucks.forEach((truck, truckIdx) => {
      truck.pallets.forEach((pallet) => {
        const sku = String(pallet.sku || '');
        if (!sku || excludeSkus.has(sku)) return;
        if (!skuStats.has(sku)) skuStats.set(sku, { trucksSet: new Set(), totalQuantity: 0 });
        const entry = skuStats.get(sku);
        entry.trucksSet.add(truckIdx);
        entry.totalQuantity += (pallet.quantity || 0);
      });
    });

    // Pick scattered SKUs above thresholds, sort by spread (most scattered first)
    const scatteredSkus = [];
    for (const [sku, stats] of skuStats.entries()) {
      if (stats.totalQuantity >= minScatterCount && stats.trucksSet.size >= minTrucksScattered) {
        scatteredSkus.push({ sku, trucksCount: stats.trucksSet.size, totalQuantity: stats.totalQuantity });
      }
    }
    if (scatteredSkus.length === 0) return trucks;
    scatteredSkus.sort((a, b) => {
      if (b.trucksCount !== a.trucksCount) return b.trucksCount - a.trucksCount;
      return b.totalQuantity - a.totalQuantity;
    });

    // Process each scattered SKU
    for (const { sku } of scatteredSkus) {
      const isTargetSku = (p) => p && String(p.sku || '') === sku;

      // Re-collect pallets for this SKU (positions may have shifted from previous iterations)
      const targetPallets = [];
      workingTrucks.forEach((truck, truckIdx) => {
        truck.pallets.forEach((pallet) => {
          if (isTargetSku(pallet)) targetPallets.push({ pallet, truckIdx });
        });
      });
      if (targetPallets.length === 0) continue;

      const uniqueTruckIdxs = [...new Set(targetPallets.map(p => p.truckIdx))].sort((a, b) => b - a);
      if (uniqueTruckIdxs.length <= 1) continue;

      // Use the highest-index truck holding this SKU as initial destination
      const destinationTrucks = [uniqueTruckIdxs[0]];
      targetPallets.sort((a, b) => a.truckIdx - b.truckIdx);

      for (const item of targetPallets) {
        const { pallet, truckIdx: currentTruckIdx } = item;
        const currentTruck = workingTrucks[currentTruckIdx];
        if (!currentTruck.pallets.includes(pallet)) continue;
        if (destinationTrucks.includes(currentTruckIdx)) continue;

        let moved = false;

        for (const destIdx of destinationTrucks) {
          const destTruck = workingTrucks[destIdx];

          // Try direct move
          const newQty = destTruck.totalQuantity + (pallet.quantity || 0);
          const newWeight = destTruck.totalWeight + (pallet.weight || 0);
          if (newQty <= TRUCK_CAPACITY && newWeight <= MAX_WEIGHT) {
            const idx = currentTruck.pallets.indexOf(pallet);
            if (idx >= 0) {
              currentTruck.pallets.splice(idx, 1);
              currentTruck.totalQuantity -= (pallet.quantity || 0);
              currentTruck.totalWeight -= (pallet.weight || 0);
              destTruck.pallets.push(pallet);
              destTruck.totalQuantity = newQty;
              destTruck.totalWeight = newWeight;
              moved = true;
            }
            break;
          }

          // Try 1-for-1 swap with a non-target pallet from the destination
          const swappablePallets = destTruck.pallets.filter(p => !isTargetSku(p));
          swappablePallets.sort((a, b) => (b.weight || 0) - (a.weight || 0));

          for (const swapPallet of swappablePallets) {
            const newDestQty = destTruck.totalQuantity - (swapPallet.quantity || 0) + (pallet.quantity || 0);
            const newDestWeight = destTruck.totalWeight - (swapPallet.weight || 0) + (pallet.weight || 0);
            const newSourceQty = currentTruck.totalQuantity - (pallet.quantity || 0) + (swapPallet.quantity || 0);
            const newSourceWeight = currentTruck.totalWeight - (pallet.weight || 0) + (swapPallet.weight || 0);

            if (newDestQty <= TRUCK_CAPACITY && newDestWeight <= MAX_WEIGHT &&
                newSourceQty <= TRUCK_CAPACITY && newSourceWeight <= MAX_WEIGHT) {
              const palletIdx = currentTruck.pallets.indexOf(pallet);
              const swapIdx = destTruck.pallets.indexOf(swapPallet);
              if (palletIdx >= 0 && swapIdx >= 0) {
                currentTruck.pallets.splice(palletIdx, 1);
                destTruck.pallets.splice(swapIdx, 1);
                destTruck.pallets.push(pallet);
                currentTruck.pallets.push(swapPallet);
                destTruck.totalQuantity = newDestQty;
                destTruck.totalWeight = newDestWeight;
                currentTruck.totalQuantity = newSourceQty;
                currentTruck.totalWeight = newSourceWeight;
                moved = true;
              }
              break;
            }
          }

          if (moved) break;
        }

        if (!moved && !destinationTrucks.includes(currentTruckIdx)) {
          const nextDestIdx = uniqueTruckIdxs.find(idx => !destinationTrucks.includes(idx) && idx !== currentTruckIdx);
          if (nextDestIdx !== undefined) {
            destinationTrucks.push(nextDestIdx);
          } else {
            destinationTrucks.push(currentTruckIdx);
          }
        }
      }
    }

    return workingTrucks;
  }

  // --------------------------------------------------------------------------
  // ARGENTINA-SPECIFIC ALLOCATION WITH COMFORT GROUPING
  // --------------------------------------------------------------------------

  /**
   * Argentina allocation with COMFORT product consolidation
   * Uses genetic algorithm then reorders by priority and COMFORT grouping
   */
  allocateTrucksARGComfortGrouping(mandatoryPallets, normalPallets, minOccupancy, minOccupancyMandatory, prioritizeCompletion, maxWeight = TRUCK_MAX_WEIGHT, maxSkusArg = 0) {
    const trucks = this.allocateTrucksGenetic(
      'ARG',
      mandatoryPallets,
      normalPallets,
      minOccupancy,
      minOccupancyMandatory,
      prioritizeCompletion,
      maxWeight,
      maxSkusArg
    );

    return this.reorderTrucksByPriorityAndComfort(trucks);
  }

  /**
   * Consolidate COMFORT products into minimum number of trucks
   * Performs swaps between trucks to group COMFORT items together
   * This reduces logistics complexity for COMFORT product handling
   */
  consolidateComfortTrucks(trucks, maxWeight) {
    if (!trucks || trucks.length < 2) return trucks;

    const TRUCK_CAPACITY = 28;
    const isComfort = (pallet) => {
      const desc = (pallet.desc || pallet.descricao || '').toUpperCase();
      return desc.includes('COMFORT');
    };

    const getTruckQty = (truck) => truck.pallets.reduce((sum, p) => sum + p.quantity, 0);
    const getComfortQty = (truck) => truck.pallets.filter(p => isComfort(p)).reduce((sum, p) => sum + p.quantity, 0);
    const getNonComfortQty = (truck) => truck.pallets.filter(p => !isComfort(p)).reduce((sum, p) => sum + p.quantity, 0);

    // Initial statistics
    const totalComfortPallets = trucks.reduce((sum, t) => sum + getComfortQty(t), 0);
    const trucksWithComfortInitial = trucks.filter(t => getComfortQty(t) > 0).length;

    console.log(`[COMFORT] ========== START CONSOLIDATION ==========`);
    console.log(`[COMFORT] Total COMFORT: ${totalComfortPallets} pallets in ${trucksWithComfortInitial} trucks`);
    console.log(`[COMFORT] Theoretical minimum trucks: ${Math.ceil(totalComfortPallets / TRUCK_CAPACITY)}`);

    // Log initial state of each truck
    trucks.forEach((t, i) => {
      const comfortQty = getComfortQty(t);
      const nonComfortQty = getNonComfortQty(t);
      console.log(`[COMFORT] Truck ${i + 1}: ${comfortQty} COMFORT, ${nonComfortQty} non-COMFORT, weight ${t.totalWeight.toFixed(0)}kg`);
    });

    // Step 1: Sort trucks - most COMFORT first (targets), least COMFORT last (sources)
    trucks.sort((a, b) => getComfortQty(b) - getComfortQty(a));

    console.log(`[COMFORT] ========== AFTER SORTING ==========`);
    trucks.forEach((t, i) => {
      console.log(`[COMFORT] Truck ${i + 1}: ${getComfortQty(t)} COMFORT, ${getNonComfortQty(t)} non-COMFORT`);
    });

    // Step 2: Main consolidation loop - try to empty trucks from the end
    let totalSwaps = 0;
    let totalMoves = 0;
    let improved = true;
    let iterations = 0;

    while (improved && iterations < 100) {
      improved = false;
      iterations++;

      // For each SOURCE truck (from last to first)
      for (let sourceIdx = trucks.length - 1; sourceIdx >= 1; sourceIdx--) {
        const sourceTruck = trucks[sourceIdx];

        // Get COMFORT pallets from source (updated each iteration)
        let sourceComfortPallets = sourceTruck.pallets.filter(p => isComfort(p));
        if (sourceComfortPallets.length === 0) continue;

        // Try to move each COMFORT pallet
        for (const comfortPallet of [...sourceComfortPallets]) {
          // Check if still in truck (may have been moved)
          if (!sourceTruck.pallets.includes(comfortPallet)) continue;

          // Try each TARGET truck (from first up to before source)
          for (let targetIdx = 0; targetIdx < sourceIdx; targetIdx++) {
            const targetTruck = trucks[targetIdx];

            // Option A: Direct move if space available
            const targetQty = getTruckQty(targetTruck);
            const spaceAvailable = TRUCK_CAPACITY - targetQty;
            const weightAvailable = maxWeight - targetTruck.totalWeight;

            if (comfortPallet.quantity <= spaceAvailable && comfortPallet.weight <= weightAvailable) {
              // Direct move
              const idx = sourceTruck.pallets.indexOf(comfortPallet);
              sourceTruck.pallets.splice(idx, 1);
              sourceTruck.totalWeight -= comfortPallet.weight;
              targetTruck.pallets.push(comfortPallet);
              targetTruck.totalWeight += comfortPallet.weight;
              totalMoves++;
              improved = true;
              console.log(`[COMFORT] MOVE: Truck ${sourceIdx + 1} -> ${targetIdx + 1} (direct, free space)`);
              break;
            }

            // Option B: SWAP - exchange COMFORT for non-COMFORT
            const targetNonComfort = targetTruck.pallets.filter(p => !isComfort(p));

            for (const nonComfortPallet of targetNonComfort) {
              // Calculate new weights after swap
              const newTargetWeight = targetTruck.totalWeight - nonComfortPallet.weight + comfortPallet.weight;
              const newSourceWeight = sourceTruck.totalWeight - comfortPallet.weight + nonComfortPallet.weight;

              // Calculate new quantities after swap
              const newTargetQty = targetQty - nonComfortPallet.quantity + comfortPallet.quantity;
              const newSourceQty = getTruckQty(sourceTruck) - comfortPallet.quantity + nonComfortPallet.quantity;

              // Validate swap constraints
              if (newTargetWeight <= maxWeight && newSourceWeight <= maxWeight &&
                  newTargetQty <= TRUCK_CAPACITY && newSourceQty <= TRUCK_CAPACITY) {

                const comfortIdx = sourceTruck.pallets.indexOf(comfortPallet);
                const nonComfortIdx = targetTruck.pallets.indexOf(nonComfortPallet);

                if (comfortIdx >= 0 && nonComfortIdx >= 0) {
                  // Execute swap
                  sourceTruck.pallets[comfortIdx] = nonComfortPallet;
                  targetTruck.pallets[nonComfortIdx] = comfortPallet;
                  sourceTruck.totalWeight = newSourceWeight;
                  targetTruck.totalWeight = newTargetWeight;
                  totalSwaps++;
                  improved = true;
                  console.log(`[COMFORT] SWAP: Truck ${sourceIdx + 1} <-> ${targetIdx + 1} (${comfortPallet.quantity} COMFORT for ${nonComfortPallet.quantity} non-COMFORT)`);
                  break;
                }
              }
            }

            // If moved/swapped, proceed to next COMFORT pallet
            if (!sourceTruck.pallets.includes(comfortPallet)) break;
          }
        }
      }

      // Re-sort after each iteration
      trucks.sort((a, b) => getComfortQty(b) - getComfortQty(a));
    }

    // Final statistics
    const trucksWithComfortFinal = trucks.filter(t => getComfortQty(t) > 0).length;

    console.log(`[COMFORT] ========== END CONSOLIDATION ==========`);
    console.log(`[COMFORT] Iterations: ${iterations}, Swaps: ${totalSwaps}, Moves: ${totalMoves}`);
    console.log(`[COMFORT] Trucks with COMFORT: ${trucksWithComfortInitial} -> ${trucksWithComfortFinal}`);

    trucks.forEach((t, i) => {
      const comfortQty = getComfortQty(t);
      const nonComfortQty = getNonComfortQty(t);
      const totalQty = getTruckQty(t);
      console.log(`[COMFORT] Truck ${i + 1}: ${comfortQty}/${totalQty} COMFORT, weight ${t.totalWeight.toFixed(0)}kg/${maxWeight}kg`);
    });

    return trucks;
  }

  /**
   * Reorder trucks by priority and COMFORT for Argentina
   * High priority trucks first, then COMFORT-heavy trucks
   */
  reorderTrucksByPriorityAndComfort(trucks) {
    if (!trucks || trucks.length === 0) return trucks;


    const isHighPriority = (pallet) => (pallet.priority || 1) >= 3;
    const isComfort = (pallet) => {
      const desc = (pallet.desc || pallet.descricao || '').toUpperCase();
      return desc.includes('COMFORT');
    };

    // Calcular scores para cada caminhão
    const trucksWithScore = trucks.map((truck, originalIndex) => {
      const totalQty = truck.pallets.reduce((sum, p) => sum + p.quantity, 0);

      const highPriorityQty = truck.pallets
        .filter(p => isHighPriority(p))
        .reduce((sum, p) => sum + p.quantity, 0);

      const comfortQty = truck.pallets
        .filter(p => isComfort(p))
        .reduce((sum, p) => sum + p.quantity, 0);

      const highPriorityPercent = totalQty > 0 ? (highPriorityQty / totalQty) * 100 : 0;
      const comfortPercent = totalQty > 0 ? (comfortQty / totalQty) * 100 : 0;

      // Classificar o caminhão
      let category = 5; // Default: baixa prioridade + não-comfort
      if (highPriorityPercent >= 50 && comfortPercent >= 50) {
        category = 1; // Alta + Comfort
      } else if (highPriorityPercent >= 50) {
        category = 2; // Alta + Não-Comfort
      } else if (comfortPercent >= 50) {
        category = 3; // Baixa + Comfort
      } else if (highPriorityPercent > 0 || comfortPercent > 0) {
        category = 4; // Misto
      }

      // Score: categoria (menor = melhor) + % de alta prioridade + % de comfort
      const score = (6 - category) * 10000 + highPriorityPercent * 100 + comfortPercent;

      return {
        truck,
        originalIndex,
        category,
        score,
        highPriorityPercent,
        comfortPercent,
        totalQty
      };
    });

    // Ordenar por score (maior primeiro = melhor categoria primeiro)
    trucksWithScore.sort((a, b) => b.score - a.score);

    // Log da reordenação
    const categoryNames = {
      1: 'ALTA+COMFORT',
      2: 'ALTA+NÃO-COMFORT',
      3: 'BAIXA+COMFORT',
      4: 'MISTO',
      5: 'BAIXA+NÃO-COMFORT'
    };

    trucksWithScore.slice(0, 8).forEach((item, newIndex) => {
    });
    if (trucksWithScore.length > 8) {
    }

    // Statistics by category
    const stats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    trucksWithScore.forEach(t => stats[t.category]++);

    return trucksWithScore.map(item => item.truck);
  }

  // --------------------------------------------------------------------------
  // CENTRAL AMERICAN ALLOCATION (SOLO and HUB)
  // --------------------------------------------------------------------------

  /**
   * Allocate trucks for Central American countries.
   * GUA, ELS and COS form direct trucks only with their own pallets.
   * PAN tries direct first; whatever does not reach min occupancy on its own
   * goes to the HUB pool to combine with HON and NIC.
   * HON and NIC never form direct trucks. They form HUB trucks combining
   * their pallets; each HUB truck must include at least 2 distinct of
   * {HON, NIC, PAN}.
   */
  allocateTrucksHUB(palletsByCountry, minOccupancy, minOccupancyMandatory, prioritizeCompletion) {
    // Countries that form trucks only with their own pallets (no HUB combination).
    const SOLO_COUNTRIES = ['GUA', 'ELS', 'COS'];
    // Countries that try direct first, then HUB with the leftover.
    const HYBRID_COUNTRIES = ['PAN'];
    // Countries that never form direct trucks. They form HUB trucks combining
    // their pallets with the leftover from HYBRID_COUNTRIES; each HUB truck
    // must include at least 2 distinct of {HON, NIC, PAN}.
    const HUB_ONLY_COUNTRIES = ['HON', 'NIC'];

    // Available pallets per country (tagged with origin)
    const available = {};
    for (const country of HUB_COUNTRIES) {
      available[country] = (palletsByCountry[country] || []).map(p => ({ ...p, country }));
    }

    const sortPallets = (arr) => arr.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.sku.localeCompare(b.sku);
    });

    // Helper: try to form trucks from a pool of pallets (single country pool)
    const tryFormTrucks = (pool) => {
      const formed = [];
      let mandatory = pool.filter(p => p.isMandatory);
      let normal = pool.filter(p => !p.isMandatory);
      sortPallets(mandatory);
      sortPallets(normal);

      // Mandatory-first trucks
      let keepTrying = true;
      while (mandatory.length > 0 && keepTrying) {
        const truck = {
          pallets: [], totalWeight: 0, totalQuantity: 0,
          hasMandatory: true, isHubTruck: true, countries: new Set()
        };

        for (let i = mandatory.length - 1; i >= 0; i--) {
          const p = mandatory[i];
          if (truck.totalQuantity + p.quantity <= HUB_TRUCK_CAPACITY &&
              truck.totalWeight + p.weight <= TRUCK_MAX_WEIGHT) {
            truck.pallets.push(p);
            truck.totalWeight += p.weight;
            truck.totalQuantity += p.quantity;
            truck.countries.add(p.country);
            mandatory.splice(i, 1);
          }
        }

        if (truck.pallets.length === 0) break;

        if (prioritizeCompletion && truck.totalQuantity < HUB_TRUCK_CAPACITY) {
          for (let i = normal.length - 1; i >= 0; i--) {
            const p = normal[i];
            if (truck.totalQuantity + p.quantity <= HUB_TRUCK_CAPACITY &&
                truck.totalWeight + p.weight <= TRUCK_MAX_WEIGHT) {
              truck.pallets.push(p);
              truck.totalWeight += p.weight;
              truck.totalQuantity += p.quantity;
              truck.countries.add(p.country);
              normal.splice(i, 1);
            }
          }
        }

        const occupancy = (truck.totalQuantity / HUB_TRUCK_CAPACITY) * 100;
        const hasMandatoryPallets = truck.pallets.some(p => p.isMandatory);
        const requiredOccupancy = hasMandatoryPallets ? minOccupancyMandatory : minOccupancy;

        if (occupancy >= requiredOccupancy) {
          formed.push(truck);
        } else {
          mandatory.push(...truck.pallets.filter(p => p.isMandatory));
          normal.push(...truck.pallets.filter(p => !p.isMandatory));
          sortPallets(mandatory);
          sortPallets(normal);
          keepTrying = false;
        }
      }

      // Normal-only trucks
      keepTrying = true;
      while (normal.length > 0 && keepTrying) {
        const truck = {
          pallets: [], totalWeight: 0, totalQuantity: 0,
          hasMandatory: false, isHubTruck: true, countries: new Set()
        };

        for (let i = normal.length - 1; i >= 0; i--) {
          const p = normal[i];
          if (truck.totalQuantity + p.quantity <= HUB_TRUCK_CAPACITY &&
              truck.totalWeight + p.weight <= TRUCK_MAX_WEIGHT) {
            truck.pallets.push(p);
            truck.totalWeight += p.weight;
            truck.totalQuantity += p.quantity;
            truck.countries.add(p.country);
            normal.splice(i, 1);
          }
        }

        if (truck.pallets.length === 0) break;

        const occupancy = (truck.totalQuantity / HUB_TRUCK_CAPACITY) * 100;
        if (occupancy >= minOccupancy) {
          formed.push(truck);
        } else {
          normal.push(...truck.pallets);
          sortPallets(normal);
          keepTrying = false;
        }
      }

      return { formed, remaining: [...mandatory, ...normal] };
    };

    // Helper: form HUB trucks combining pallets from the given countries.
    // Each truck must include pallets from at least 2 distinct of these
    // countries; otherwise the truck is rejected.
    const tryFormHubMixedTrucks = (countries) => {
      let mandatory = countries.flatMap(c => available[c]).filter(p => p.isMandatory);
      let normal = countries.flatMap(c => available[c]).filter(p => !p.isMandatory);
      sortPallets(mandatory);
      sortPallets(normal);

      const formed = [];

      const canFit = (truck, p) =>
        truck.totalQuantity + p.quantity <= HUB_TRUCK_CAPACITY &&
        truck.totalWeight + p.weight <= TRUCK_MAX_WEIGHT;

      const addToTruck = (truck, p) => {
        truck.pallets.push(p);
        truck.totalWeight += p.weight;
        truck.totalQuantity += p.quantity;
        truck.countries.add(p.country);
        if (p.isMandatory) truck.hasMandatory = true;
      };

      // Seed truck with the highest-priority pallet of the given country,
      // looking first in mandatory then in normal.
      const seedCountry = (truck, country) => {
        for (const arr of [mandatory, normal]) {
          const idx = arr.findIndex(p => p.country === country);
          if (idx >= 0 && canFit(truck, arr[idx])) {
            addToTruck(truck, arr[idx]);
            arr.splice(idx, 1);
            return true;
          }
        }
        return false;
      };

      let keepTrying = true;
      while (keepTrying && (mandatory.length + normal.length) > 0) {
        const truck = {
          pallets: [], totalWeight: 0, totalQuantity: 0,
          hasMandatory: false, isHubTruck: true, countries: new Set()
        };

        let seededCount = 0;
        for (const country of countries) {
          if (seedCountry(truck, country)) seededCount++;
        }

        if (seededCount < 2) {
          // Need at least 2 distinct countries: return seeded pallets and stop.
          mandatory.push(...truck.pallets.filter(p => p.isMandatory));
          normal.push(...truck.pallets.filter(p => !p.isMandatory));
          sortPallets(mandatory);
          sortPallets(normal);
          break;
        }

        for (let i = mandatory.length - 1; i >= 0; i--) {
          const p = mandatory[i];
          if (canFit(truck, p)) {
            addToTruck(truck, p);
            mandatory.splice(i, 1);
          }
        }

        if (prioritizeCompletion || !truck.hasMandatory) {
          for (let i = normal.length - 1; i >= 0; i--) {
            const p = normal[i];
            if (canFit(truck, p)) {
              addToTruck(truck, p);
              normal.splice(i, 1);
            }
          }
        }

        const occupancy = (truck.totalQuantity / HUB_TRUCK_CAPACITY) * 100;
        const requiredOccupancy = truck.hasMandatory ? minOccupancyMandatory : minOccupancy;

        if (occupancy >= requiredOccupancy) {
          formed.push(truck);
        } else {
          mandatory.push(...truck.pallets.filter(p => p.isMandatory));
          normal.push(...truck.pallets.filter(p => !p.isMandatory));
          sortPallets(mandatory);
          sortPallets(normal);
          keepTrying = false;
        }
      }

      return formed;
    };

    const trucks = [];

    // Phase 1: SOLO trucks for GUA, ELS, COS. Own pallets only, no combination.
    for (const country of SOLO_COUNTRIES) {
      if (available[country].length === 0) continue;
      const { formed, remaining } = tryFormTrucks(available[country]);
      if (formed.length > 0) {
        trucks.push(...formed);
        available[country] = remaining;
      }
    }

    // Phase 2: HYBRID countries (PAN). Try direct trucks first with own pallets.
    // Whatever does not meet min occupancy stays in available[country] and
    // moves to the HUB pool in Phase 3.
    for (const country of HYBRID_COUNTRIES) {
      if (available[country].length === 0) continue;
      const { formed, remaining } = tryFormTrucks(available[country]);
      if (formed.length > 0) {
        trucks.push(...formed);
        available[country] = remaining;
      }
    }

    // Phase 3: HUB trucks combining HON, NIC and any leftover from HYBRID
    // (PAN). At least 2 of these countries must have pallets, and each formed
    // truck must include pallets from at least 2 distinct of these countries.
    const HUB_POOL_COUNTRIES = [...HUB_ONLY_COUNTRIES, ...HYBRID_COUNTRIES];
    const activeHubPool = HUB_POOL_COUNTRIES.filter(c => available[c].length > 0);
    if (activeHubPool.length >= 2) {
      const totalQty = activeHubPool.reduce((s, c) =>
        s + available[c].reduce((s2, p) => s2 + p.quantity, 0), 0);
      const minRequiredQty = (Math.min(minOccupancy, minOccupancyMandatory) / 100) * HUB_TRUCK_CAPACITY;
      if (totalQty >= minRequiredQty) {
        const formed = tryFormHubMixedTrucks(HUB_POOL_COUNTRIES);
        trucks.push(...formed);
      }
    }

    return trucks;
  }

  palletize(products) {
    const pallets = [];
    for (const { sku, desc, allocatedBoxes, ppd, boxWeight, priority, contrato, linha } of products) {
      const quantity = Math.floor(allocatedBoxes / ppd);
      for (let i = 0; i < quantity; i++) {
        pallets.push({
          sku,
          priority,
          desc,
          weight: (boxWeight * ppd) + PALLET_WEIGHT,
          ppd,
          quantity: 1.0,
          isMandatory: false,
          contrato,
          linha
        });
      }
    }
    return pallets;
  }

  allocateTrucks(pallets, TRUCK_CAPACITY, MAX_WEIGHT) {
    let trucks = [];
    let leftovers = [];

    pallets.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.sku.localeCompare(b.sku);
    });

    pallets.forEach(pallet => {
      let placed = false;
      for (const truck of trucks) {
        if (truck.pallets.length < TRUCK_CAPACITY && truck.totalWeight + pallet.weight <= MAX_WEIGHT) {
          truck.pallets.push(pallet);
          truck.totalWeight += pallet.weight;
          placed = true;
          break;
        }
      }

      if (!placed) {
        trucks.push({
          pallets: [pallet],
          totalWeight: pallet.weight
        });
      }
    });

    const finalized = [];
    trucks.forEach(truck => {
      if (truck.pallets.length === TRUCK_CAPACITY && truck.totalWeight <= MAX_WEIGHT) {
        finalized.push(truck);
      } else {
        leftovers.push(...truck.pallets);
      }
    });

    const optimized = [];
    leftovers.sort((a, b) => b.priority - a.priority);
    while (leftovers.length >= TRUCK_CAPACITY) {
      const candidate = leftovers.splice(0, TRUCK_CAPACITY);
      const totalWeight = candidate.reduce((acc, pallet) => acc + pallet.weight, 0);
      if (totalWeight <= MAX_WEIGHT) {
        optimized.push({ pallets: candidate, totalWeight });
      } else {
        leftovers.push(...candidate);
        break;
      }
    }

    return [...finalized, ...optimized];
  }

  groupSKUsInTruck(truck) {
    const grouped = {};
    for (const p of truck.pallets) {
      if (!grouped[p.sku]) {
        grouped[p.sku] = {
          ...p,
          palletQty: 0,
          weight: 0,
          contrato: p.contrato || '',
          linha: p.linha || ''
        };
      }
      grouped[p.sku].palletQty += p.quantity;
      grouped[p.sku].weight += p.weight;
    }
    return grouped;
  }

  // Helper Methods

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    const { data, error } = await auth.signIn(email, password);

    if (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('hidden');
    } else {
      this.render(data.user);
    }
  }

  async handleSignup() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('loginError');

    if (!email || !password) {
      errorDiv.textContent = 'Preencha email e senha';
      errorDiv.classList.remove('hidden');
      return;
    }

    const { data, error } = await auth.signUp(email, password);

    if (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('hidden');
    } else {
      alert('Conta criada! Verifique seu email para confirmar.');
    }
  }

  async handleLogout() {
    await auth.signOut();
    this.render(null);
  }

  switchTab(tab) {
    this.setState({ activeTab: tab });
    this.renderDashboard();
  }

  async loadDashboardStats() {
    // 🔒 VERIFICAÇÃO DE ROLE: Analyst usa dados do sandbox ou BD (leitura)
    let estoqueData;

    if (this.isAnalyst() && this.analystSandbox.hasData) {
      // Analyst com dados no sandbox: usa dados da memória
      estoqueData = { data: this.analystSandbox.estoque, error: null };
    } else {
      // Planning ou Analyst sem dados no sandbox: busca do BD
      estoqueData = await estoque.getAll();
    }

    const totalSkusEl = document.getElementById('totalSkus');
    const totalPrioritiesEl = document.getElementById('totalPriorities');
    const detailDisponiveisEl = document.getElementById('detailDisponiveis');
    const detailDemandaEl = document.getElementById('detailDemanda');

    if (estoqueData.data && estoqueData.data.length > 0) {
      // Calcular pallets disponíveis (estoque convertido em pallets)
      let totalPalletsDisponiveis = 0;
      let palletsComDemanda = 0;
      let palletsSemDemanda = 0;

      // Calcular demanda total (soma de todos os países)
      let totalPalletsDemanda = 0;

      // Dados por país
      const countryDisponiveis = {};
      const countryDemanda = {};

      // Inicializar contadores
      COUNTRIES.forEach(country => {
        countryDisponiveis[country] = 0;
        countryDemanda[country] = 0;
      });

      estoqueData.data.forEach(item => {
        const estoqueQty = item.estoque || 0;
        const ppd = item.ppd || 1;

        // Verificar se este SKU tem demanda em algum país
        let temDemandaTotal = 0;
        COUNTRIES.forEach(country => {
          temDemandaTotal += item[country.toLowerCase()] || 0;
        });

        // Pallets disponíveis = estoque / PPD
        if (estoqueQty > 0 && ppd > 0) {
          const fullPallets = Math.floor(estoqueQty / ppd);
          const remaining = estoqueQty % ppd;
          const pallets = fullPallets + (remaining > 0 ? remaining / ppd : 0);
          totalPalletsDisponiveis += pallets;

          // Separar pallets com e sem demanda
          if (temDemandaTotal > 0) {
            palletsComDemanda += pallets;
          } else {
            palletsSemDemanda += pallets;
          }
        }

        // Demanda por país
        COUNTRIES.forEach(country => {
          const demand = item[country.toLowerCase()] || 0;
          if (demand > 0 && ppd > 0) {
            const fullPallets = Math.floor(demand / ppd);
            const remaining = demand % ppd;
            const pallets = fullPallets + (remaining > 0 ? remaining / ppd : 0);
            countryDemanda[country] += pallets;
            totalPalletsDemanda += pallets;
          }
        });
      });

      // Atualizar totais
      if (totalSkusEl) {
        totalSkusEl.textContent = totalPalletsDisponiveis.toFixed(1);
      }

      // Atualizar breakdown de pallets com/sem demanda
      const palletsComDemandaEl = document.getElementById('palletsComDemanda');
      const palletsSemDemandaEl = document.getElementById('palletsSemDemanda');

      if (palletsComDemandaEl) {
        palletsComDemandaEl.textContent = palletsComDemanda.toFixed(1);
      }

      if (palletsSemDemandaEl) {
        palletsSemDemandaEl.textContent = palletsSemDemanda.toFixed(1);
      }

      if (totalPrioritiesEl) {
        totalPrioritiesEl.textContent = totalPalletsDemanda.toFixed(1);
      }

      // Calcular percentuais
      const pctComDemanda = totalPalletsDisponiveis > 0 ? ((palletsComDemanda / totalPalletsDisponiveis) * 100).toFixed(1) : 0;
      const pctSemDemanda = totalPalletsDisponiveis > 0 ? ((palletsSemDemanda / totalPalletsDisponiveis) * 100).toFixed(1) : 0;

      // Renderizar detalhes - Disponíveis
      if (detailDisponiveisEl) {
        const container = detailDisponiveisEl.querySelector('div');
        container.innerHTML = `
          <div class="space-y-3">
            <div class="flex justify-between items-center py-2 px-3 bg-blue-50 rounded-lg">
              <span class="text-sm text-blue-700">Total em Estoque</span>
              <span class="text-sm font-bold text-blue-800">${totalPalletsDisponiveis.toFixed(1)} pallets</span>
            </div>
            <div class="flex justify-between items-center py-2 px-3 bg-green-50 rounded-lg">
              <span class="text-sm text-green-700">Com Demanda</span>
              <span class="text-sm font-bold text-green-800">${palletsComDemanda.toFixed(1)} (${pctComDemanda}%)</span>
            </div>
            <div class="flex justify-between items-center py-2 px-3 bg-orange-50 rounded-lg">
              <span class="text-sm text-orange-700">Sem Demanda</span>
              <span class="text-sm font-bold text-orange-800">${palletsSemDemanda.toFixed(1)} (${pctSemDemanda}%)</span>
            </div>
          </div>
          <p class="text-xs text-gray-500 mt-3 px-1">SKUs sem demanda possuem estoque mas nenhum país solicitou no período.</p>
        `;
      }

      // Renderizar detalhes por país - Demanda
      if (detailDemandaEl) {
        const container = detailDemandaEl.querySelector('div');

        // Ordenar países por demanda (maior primeiro)
        const sortedCountries = Object.entries(countryDemanda)
          .filter(([_, value]) => value > 0)
          .sort((a, b) => b[1] - a[1]);

        if (sortedCountries.length > 0) {
          container.innerHTML = sortedCountries.map(([country, pallets]) => {
            const percentage = ((pallets / totalPalletsDemanda) * 100).toFixed(1);
            return `
              <div class="flex justify-between items-center py-2 px-3 hover:bg-purple-50 rounded-lg transition">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium px-2 py-1 rounded-full bg-purple-100 text-purple-700">${country}</span>
                  <span class="text-sm text-gray-600">${COUNTRY_NAMES[country] || country}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-gray-500">${percentage}%</span>
                  <span class="text-sm font-bold text-gray-800">${pallets.toFixed(1)}</span>
                </div>
              </div>
            `;
          }).join('');
        } else {
          container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhuma demanda encontrada</p>';
        }
      }
    } else {
      if (totalSkusEl) {
        totalSkusEl.textContent = '0';
      }

      if (totalPrioritiesEl) {
        totalPrioritiesEl.textContent = '0';
      }

      if (detailDisponiveisEl) {
        const container = detailDisponiveisEl.querySelector('div');
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhum dado de estoque</p>';
      }

      if (detailDemandaEl) {
        const container = detailDemandaEl.querySelector('div');
        container.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhuma demanda encontrada</p>';
      }
    }
  }

  async handleFileUpload(e, type, categoria = null) {
    const file = e.target.files[0];
    if (!file) return;

    let statusDiv;
    if (type === 'estoque') {
      const statusId = categoria === 'estoque1' ? 'stock1Status' : 'stock2Status';
      statusDiv = document.getElementById(statusId);
    } else if (type === 'zlsb') {
      statusDiv = document.getElementById('zlsbStatus');
    } else {
      statusDiv = document.getElementById('priorityStatus');
    }

    if (!statusDiv) {
      console.error('Status div não encontrado');
      return;
    }

    statusDiv.innerHTML = '<p class="text-blue-600">⏳ Processando arquivo...</p>';

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      // 🔒 VERIFICAÇÃO DE ROLE: Analyst usa sandbox (memória)
      if (this.isAnalyst()) {
        statusDiv.innerHTML = '<p class="text-blue-600">⏳ Processando dados...</p>';

        if (type === 'estoque') {
          this.analystSandbox.estoque = jsonData;
          this.analystSandbox.hasData = true;
          statusDiv.innerHTML = `<p class="text-green-600">✓ ${jsonData.length} itens carregados (modo demonstração)</p>`;
        } else if (type === 'prioridades') {
          this.analystSandbox.prioridades = jsonData;
          this.analystSandbox.hasData = true;
          statusDiv.innerHTML = `<p class="text-green-600">✓ ${jsonData.length} prioridades carregadas (modo demonstração)</p>`;
        } else if (type === 'zlsb') {
          this.analystSandbox.zlsb = jsonData;
          this.analystSandbox.hasData = true;
          statusDiv.innerHTML = `<p class="text-green-600">✓ ${jsonData.length} itens ZLSB carregados (modo demonstração)</p>`;
        }

      } else {
        // Planning: save to database normalmente
        statusDiv.innerHTML = '<p class="text-blue-600">⏳ Enviando para o Supabase...</p>';

        if (type === 'estoque') {
          const deleteResult = await estoque.deleteByCategory(categoria);
          if (deleteResult.error) {
            if (deleteResult.error.code === 'PROJECT_PAUSED') {
              throw new Error(deleteResult.error.message);
            }
            throw new Error(deleteResult.error.message);
          }

          const result = await estoque.insertMany(jsonData, categoria);
          if (result.error) {
            if (result.error.code === 'PROJECT_PAUSED') {
              throw new Error(result.error.message);
            }
            throw new Error(result.error.message);
          }
          statusDiv.innerHTML = `<p class="text-green-600">✓ ${jsonData.length} itens importados com sucesso!</p>`;
        } else if (type === 'prioridades') {
          await prioridades.deleteAll();
          const result = await prioridades.upsertMany(jsonData);
          if (result.error) {
            if (result.error.code === 'PROJECT_PAUSED') {
              throw new Error(result.error.message);
            }
            throw new Error(result.error.message);
          }
          statusDiv.innerHTML = `<p class="text-green-600">✓ ${jsonData.length} prioridades importadas com sucesso!</p>`;
        } else if (type === 'zlsb') {
          await zlsb.deleteAll();
          const result = await zlsb.insertMany(jsonData);
        if (result.error) {
          if (result.error.code === 'PROJECT_PAUSED') {
            throw new Error(result.error.message);
          }
          throw new Error(result.error.message);
        }
          statusDiv.innerHTML = `
            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
              <p class="text-green-800 font-semibold">✓ ${jsonData.length} SKUs importados com sucesso!</p>
              <p class="text-green-700 text-sm mt-1">
                A verificação será feita automaticamente durante a alocação.
              </p>
            </div>
          `;
        }
      }

      this.loadDashboardStats();
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      
      if (error.message.includes('PROJETO PAUSADO') || error.message.includes('Resume Project')) {
        statusDiv.innerHTML = `
          <div class="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mt-2">
            <p class="text-yellow-900 font-semibold mb-2">⚠️ Projeto Supabase Pausado</p>
            <p class="text-yellow-800 text-sm mb-3">Seu projeto está inativo. Siga os passos:</p>
            <ol class="text-yellow-800 text-sm space-y-1 ml-4 list-decimal">
              <li>Abra o <a href="https://supabase.com/dashboard" target="_blank" class="underline font-semibold">Dashboard do Supabase</a></li>
              <li>Selecione seu projeto</li>
              <li>Clique em <strong>"Resume Project"</strong></li>
              <li>Aguarde 1-2 minutos</li>
              <li>Tente importar novamente</li>
            </ol>
          </div>
        `;
      } else {
        statusDiv.innerHTML = `<p class="text-red-600">✗ Erro: ${error.message}</p>`;
      }
    }
  }

  async handleClearData(categoria = 'all') {
    let message = 'Tem certeza que deseja limpar ';

    if (categoria === 'estoque1') {
      message += 'o Estoque 1?';
    } else if (categoria === 'estoque2') {
      message += 'o Estoque 2?';
    } else if (categoria === 'zlsb') {
      message += 'o arquivo ZLSB?';
    } else {
      message += 'TODOS os dados? Esta ação não pode ser desfeita.';
    }

    if (!confirm(message)) return;

    try {
      if (categoria === 'estoque1' || categoria === 'estoque2') {
        await estoque.deleteByCategory(categoria);
        // Limpo com sucesso (sem popup)
      } else if (categoria === 'zlsb') {
        await zlsb.deleteAll();
        // ZLSB limpo (sem popup)
      } else {
        await Promise.all([
          estoque.deleteAll(),
          prioridades.deleteAll(),
          zlsb.deleteAll()
        ]);
        // Dados limpos (sem popup)
      }
      this.loadDashboardStats();
    } catch (error) {
      alert('Erro ao limpar dados: ' + error.message);
    }
  }

  async saveAllocation() {
    // Role check: Analyst users cannot save
    const userRole = this.getUserRole(); // Busca do cache (já foi carregado no render)

    if (userRole === 'analyst') {
      alert('⚠️ Usuário Analyst não pode salvar alterações.\n\nApenas usuários com role "Planning" podem salvar no histórico.\n\nVocê pode usar todas as funcionalidades, mas os dados não serão persistidos.');
      return;
    }


    if (!this.state.allocationResult) {
      console.error('Nenhum resultado para salvar');
      return;
    }


    try {
      const result = await historico.save(this.state.allocationResult);
      
      if (result.error) {
        throw new Error(result.error.message);
      }
      
      // Allocation saved successfully
      this.switchTab('history');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar: ' + error.message);
    }
  }

  async generateAllocationByCategoryReport(allStockPallets) {
    // Fetch original stock data to maintain complete structure
    const { data: estoqueData } = await estoque.getAll();
    if (!estoqueData) return { estoque1: [], estoque2: [] };

    // Estoque 1 definition
    const ESTOQUE1_BASE = [
      { name: 'COD', field: 'cod' }, { name: 'DESC', field: 'desc' },
      { name: 'Estoque', field: 'estoque' }, { name: 'PPD', field: 'ppd' }, { name: 'Peso', field: 'peso' }
    ];
    const ESTOQUE1_COUNTRY_ORDER = ['ARG', 'BOL', 'CHI', 'COL', 'CUB', 'DR', 'ECU', 'MEX', 'PAR', 'PER', 'URU', 'COS', 'ELS', 'GUA', 'HON', 'NIC', 'VEN', 'PAN'];

    // Estoque 2 definition
    const ESTOQUE2_BASE = [
      { name: 'COD', field: 'cod' }, { name: 'DESC', field: 'desc' },
      { name: 'Estoque', field: 'estoque' }, { name: 'PPD', field: 'ppd' }, { name: 'Peso Bruto', field: 'peso' }
    ];
    const ESTOQUE2_COUNTRY_ORDER = ['ARG', 'BOL', 'CHI', 'COL', 'COS', 'CUB', 'DR', 'ECU', 'ELS', 'GUA', 'HON', 'NIC', 'PAR', 'PER', 'URU', 'MEX', 'VEN', 'CAR', 'TT', 'JAM'];

    // Map SKU categories
    const categoryMap = {};
    estoqueData.forEach(item => {
      const key = item.cod.trim().toUpperCase();
      categoryMap[key] = item.categoria || 'estoque1';
    });

    // Group allocations by SKU and Category using allStockPallets (includes fractional pallets)
    const allocatedBySkuAndCategory = {};

    allStockPallets.forEach(pallet => {
      const categoria = categoryMap[pallet.sku.toUpperCase()] || 'estoque1';
      const key = `${categoria}|${pallet.sku}`;

      if (!allocatedBySkuAndCategory[key]) {
        allocatedBySkuAndCategory[key] = {
          categoria: categoria,
          cod: pallet.sku,
          desc: pallet.desc,
          ppd: pallet.ppd,
          peso: (pallet.weight - PALLET_WEIGHT) / (pallet.ppd * pallet.quantity), // Peso por caixa
          countries: {}
        };

        // Initialize all countries with 0
        COUNTRIES.forEach(country => {
          allocatedBySkuAndCategory[key].countries[country] = 0;
        });
      }

      // Sum allocated boxes for each country (including fractional pallets)
      const boxQty = Math.round(pallet.ppd * pallet.quantity);
      allocatedBySkuAndCategory[key].countries[pallet.country] += boxQty;
    });

    // Create arrays maintaining ALL SKUs from original files in original order
    const estoque1 = [];
    const estoque2 = [];

    estoqueData.forEach(item => {
      const categoria = item.categoria || 'estoque1';
      const codUpper = item.cod.trim().toUpperCase();
      const key = `${categoria}|${codUpper}`;

      // Check if this SKU was allocated
      const allocated = allocatedBySkuAndCategory[key];

      const countryOrder = categoria === 'estoque1' ? ESTOQUE1_COUNTRY_ORDER : ESTOQUE2_COUNTRY_ORDER;
      const baseColumns = categoria === 'estoque1' ? ESTOQUE1_BASE : ESTOQUE2_BASE;

      // Internal field values
      const fieldValues = {
        'cod': item.cod,
        'desc': item.descricao || '',
        'estoque': item.estoque || 0,
        'ppd': item.ppd || 0,
        'peso': (item.peso || 0).toFixed(3).replace('.', ',')
      };

      // Build row using original column names from file
      const row = {};
      baseColumns.forEach(col => {
        row[col.name] = fieldValues[col.field];
      });

      countryOrder.forEach(country => {
        row[country] = allocated ? (allocated.countries[country] || 0) : 0;
      });

      if (categoria === 'estoque1') {
        estoque1.push(row);
      } else if (categoria === 'estoque2') {
        estoque2.push(row);
      }
    });

    return { estoque1, estoque2 };
  }

  generateAnalysisData(result) {
    // Calcular métricas por país
    const countryMetrics = {};

    // 1. OFERECIDO - da propriedade allStockPallets do result
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        if (!countryMetrics[pallet.country]) {
          countryMetrics[pallet.country] = {
            oferecido: 0,
            alocadoEmVeiculos: 0
          };
        }
        countryMetrics[pallet.country].oferecido += pallet.quantity;
      });
    }

    // 2. ALOCADO EM VEÍCULOS - da primeira aba (Alocação)
    // Usar result.output que contém todos os pallets alocados
    if (result.output) {
      result.output.forEach(row => {
        const country = row.Country;
        if (!countryMetrics[country]) {
          countryMetrics[country] = {
            oferecido: 0,
            alocadoEmVeiculos: 0
          };
        }
        // PalletQuantity é a quantidade de pallets deste SKU no caminhão
        countryMetrics[country].alocadoEmVeiculos += row.PalletQuantity;
      });
    }

    // Converter para array e calcular pallets não alocados
    const analysis = Object.keys(countryMetrics).map(country => {
      const metrics = countryMetrics[country];
      const naoAlocado = metrics.oferecido - metrics.alocadoEmVeiculos;
      const percentAlocado = metrics.oferecido > 0 ? ((metrics.alocadoEmVeiculos / metrics.oferecido) * 100) : 0;

      return {
        'País': COUNTRY_NAMES[country] || country,
        'Oferecido (pallets)': parseFloat(metrics.oferecido.toFixed(1)),
        'Alocado em Veículos (pallets)': parseFloat(metrics.alocadoEmVeiculos.toFixed(1)),
        'Não Alocado (pallets)': parseFloat(naoAlocado.toFixed(1)),
        '% Alocação': parseFloat(percentAlocado.toFixed(1))
      };
    }).sort((a, b) => b['Oferecido (pallets)'] - a['Oferecido (pallets)']);

    // Adicionar linha de total
    const totals = analysis.reduce((acc, item) => ({
      oferecido: acc.oferecido + item['Oferecido (pallets)'],
      alocadoEmVeiculos: acc.alocadoEmVeiculos + item['Alocado em Veículos (pallets)'],
      naoAlocado: acc.naoAlocado + item['Não Alocado (pallets)']
    }), { oferecido: 0, alocadoEmVeiculos: 0, naoAlocado: 0 });

    const percentTotal = totals.oferecido > 0 ? ((totals.alocadoEmVeiculos / totals.oferecido) * 100) : 0;

    analysis.push({
      'País': 'TOTAL',
      'Oferecido (pallets)': parseFloat(totals.oferecido.toFixed(1)),
      'Alocado em Veículos (pallets)': parseFloat(totals.alocadoEmVeiculos.toFixed(1)),
      'Não Alocado (pallets)': parseFloat(totals.naoAlocado.toFixed(1)),
      '% Alocação': parseFloat(percentTotal.toFixed(1))
    });

    return analysis;
  }

  generateAnalysisAllocationData(result) {
    // Criar mapa de SKUs alocados por país
    const allocatedSkus = {};

    if (result.output) {
      result.output.forEach(row => {
        const key = `${row.Country}|${row.SKU}`;
        if (!allocatedSkus[key]) {
          allocatedSkus[key] = 0;
        }
        allocatedSkus[key] += row.BoxQuantity;
      });
    }

    // Agrupar pallets oferecidos por país e SKU (somar pallets cheios + fracionados)
    const offeredSkus = {};

    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        const key = `${pallet.country}|${pallet.sku}`;

        if (!offeredSkus[key]) {
          offeredSkus[key] = {
            country: pallet.country,
            sku: pallet.sku,
            desc: pallet.desc || '-',
            totalPallets: 0,
            ppd: pallet.ppd
          };
        }

        // Somar todas as quantidades de pallets (cheios + fracionados)
        offeredSkus[key].totalPallets += pallet.quantity;
      });
    }

    // Identificar SKUs não alocados
    const notAllocatedSkus = [];

    Object.keys(offeredSkus).forEach(key => {
      const offered = offeredSkus[key];
      const allocatedQty = allocatedSkus[key] || 0;
      const offeredBoxes = offered.totalPallets * offered.ppd;

      if (allocatedQty < offeredBoxes) {
        const notAllocatedBoxes = offeredBoxes - allocatedQty;
        const notAllocatedPallets = notAllocatedBoxes / offered.ppd;

        notAllocatedSkus.push({
          'País': COUNTRY_NAMES[offered.country] || offered.country,
          'SKU': offered.sku,
          'Descrição': offered.desc,
          'Caixas Não Alocadas': Math.round(notAllocatedBoxes),
          'Pallets Não Alocados': parseFloat(notAllocatedPallets.toFixed(1)),
          'PPD': offered.ppd
        });
      }
    });

    // Ordenar por país
    notAllocatedSkus.sort((a, b) => a['País'].localeCompare(b['País']));

    return notAllocatedSkus;
  }

  generateDiagnosticData(result) {
    const diagnosticByCountry = {};

    // Coletar dados (mesma lógica do renderDiagnostic)
    const allocatedSkus = {};
    if (result.output) {
      result.output.forEach(row => {
        const key = `${row.Country}|${row.SKU}`;
        if (!allocatedSkus[key]) {
          allocatedSkus[key] = 0;
        }
        allocatedSkus[key] += row.BoxQuantity;
      });
    }

    const offeredSkus = {};
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        const key = `${pallet.country}|${pallet.sku}`;
        if (!offeredSkus[key]) {
          offeredSkus[key] = {
            country: pallet.country,
            totalPallets: 0,
            ppd: pallet.ppd,
            weight: pallet.weight,
            priority: pallet.priority
          };
        }
        offeredSkus[key].totalPallets += pallet.quantity;
      });
    }

    // Analisar pallets não alocados
    Object.keys(offeredSkus).forEach(key => {
      const offered = offeredSkus[key];
      const allocatedQty = allocatedSkus[key] || 0;
      const offeredBoxes = offered.totalPallets * offered.ppd;

      if (allocatedQty < offeredBoxes) {
        const country = offered.country;
        const notAllocatedBoxes = offeredBoxes - allocatedQty;
        const notAllocatedPallets = notAllocatedBoxes / offered.ppd;

        if (!diagnosticByCountry[country]) {
          diagnosticByCountry[country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            fragmentacao: 0,
            pesoExcessivo: 0,
            baixaPrioridade: 0,
            quantidadeInsuficiente: 0
          };
        }

        diagnosticByCountry[country].totalNotAllocated += notAllocatedPallets;

        if (notAllocatedPallets < 1) {
          diagnosticByCountry[country].fragmentacao += notAllocatedPallets;
        }

        const weightPerPallet = offered.weight / offered.totalPallets;
        if (weightPerPallet > 900) {
          diagnosticByCountry[country].pesoExcessivo += notAllocatedPallets;
        }

        if (offered.priority <= 2) {
          diagnosticByCountry[country].baixaPrioridade += notAllocatedPallets;
        }
      }
    });

    // Calcular totais
    if (result.allStockPallets) {
      result.allStockPallets.forEach(pallet => {
        if (!diagnosticByCountry[pallet.country]) {
          diagnosticByCountry[pallet.country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            fragmentacao: 0,
            pesoExcessivo: 0,
            baixaPrioridade: 0,
            quantidadeInsuficiente: 0
          };
        }
        diagnosticByCountry[pallet.country].totalOffered += pallet.quantity;
      });
    }

    if (result.output) {
      result.output.forEach(row => {
        if (!diagnosticByCountry[row.Country]) {
          diagnosticByCountry[row.Country] = {
            totalOffered: 0,
            totalAllocated: 0,
            totalNotAllocated: 0,
            fragmentacao: 0,
            pesoExcessivo: 0,
            baixaPrioridade: 0,
            quantidadeInsuficiente: 0
          };
        }
        diagnosticByCountry[row.Country].totalAllocated += row.PalletQuantity;
      });
    }

    // Calcular quantidade insuficiente
    Object.keys(diagnosticByCountry).forEach(country => {
      const data = diagnosticByCountry[country];
      const truckCapacity = PALLETS_PER_TRUCK[country] || 28;
      const remainingPallets = data.totalNotAllocated;

      if (remainingPallets > 0 && remainingPallets < truckCapacity) {
        data.quantidadeInsuficiente = remainingPallets;
      }
    });

    // Gerar dados para Excel
    const diagnosticData = [];

    Object.keys(diagnosticByCountry)
      .filter(country => diagnosticByCountry[country].totalNotAllocated > 0)
      .sort((a, b) => diagnosticByCountry[b].totalNotAllocated - diagnosticByCountry[a].totalNotAllocated)
      .forEach(country => {
        const data = diagnosticByCountry[country];
        const allocationRate = (data.totalAllocated / data.totalOffered * 100);
        const truckCapacity = PALLETS_PER_TRUCK[country] || 28;

        diagnosticData.push({
          'País': COUNTRY_NAMES[country] || country,
          'Oferecido (pallets)': parseFloat(data.totalOffered.toFixed(1)),
          'Alocado (pallets)': parseFloat(data.totalAllocated.toFixed(1)),
          'Não Alocado (pallets)': parseFloat(data.totalNotAllocated.toFixed(1)),
          'Taxa Alocação (%)': parseFloat(allocationRate.toFixed(1)),
          'Ocupação Mínima Não Atingida': parseFloat(data.totalNotAllocated.toFixed(1)),
          'Fragmentação (pallets)': parseFloat(data.fragmentacao.toFixed(1)),
          'Peso Excessivo (pallets)': parseFloat(data.pesoExcessivo.toFixed(1)),
          'Baixa Prioridade (pallets)': parseFloat(data.baixaPrioridade.toFixed(1)),
          'Qtd Insuficiente (pallets)': parseFloat(data.quantidadeInsuficiente.toFixed(1)),
          'Capacidade Caminhão': truckCapacity
        });
      });

    return diagnosticData;
  }

  async exportToExcel() {
    if (!this.state.allocationResult) {
      alert('Nenhum resultado para exportar');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Erro: Biblioteca XLSX não carregada. Recarregue a página.');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();

      // Format data for Excel in specified order (without Category column)
      const outputForExcel = this.state.allocationResult.output.map(row => ({
        Country: row.Country,
        TruckId: row.TruckId,
        SKU: row.SKU,
        BoxQuantity: row.BoxQuantity,
        Desc: row.Desc,
        PalletQuantity: row.PalletQuantity,
        PPD: row.PPD,
        Weight: row.Weight.toFixed(3).replace('.', ','),
        Priority: row.Priority,
        IsMandatory: row.IsMandatory,
        Contrato: row.Contrato,
        Linha: row.Linha,
        HubTruck: row.HubTruckLabel || ''
      }));

      const ws1 = XLSX.utils.json_to_sheet(outputForExcel);
      XLSX.utils.book_append_sheet(wb, ws1, 'Alocação');

      if (this.state.allocationResult.skippedByContract &&
          this.state.allocationResult.skippedByContract.length > 0) {

        const skippedData = this.state.allocationResult.skippedByContract.map(item => ({
          'País': COUNTRY_NAMES[item.country] || item.country,
          'SKU': item.sku,
          'Descrição': item.desc,
          'Demanda (cx)': item.demanda,
          'PPD': item.ppd,
          'Peso (kg)': item.peso.toFixed(3).replace('.', ',')
        }));

        const ws2 = XLSX.utils.json_to_sheet(skippedData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Sem Contrato');
      }

      if (this.state.allocationResult.skippedByZLSB &&
          this.state.allocationResult.skippedByZLSB.length > 0) {

        const zlsbData = this.state.allocationResult.skippedByZLSB.map(item => ({
          'País': COUNTRY_NAMES[item.pais] || item.pais,
          'SKU': item.cod,
          'Descrição': item.descricao,
          'Demanda (cx)': item.demanda,
          'PPD': item.ppd,
          'Peso (kg)': item.peso.toFixed(3).replace('.', ',')
        }));

        const ws3 = XLSX.utils.json_to_sheet(zlsbData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Fora do ZLSB');
      }

      // Create sheets with allocations grouped by category (Stock 1 and Stock 2)
      // Uses allStockPallets which includes ALL pallets (full + fractional)
      const allocationsByCategory = await this.generateAllocationByCategoryReport(this.state.allocationResult.allStockPallets);

      // Column order is already set by generateAllocationByCategoryReport via row key order
      // Extract column names from the first row of each category for the XLSX header
      const e1Columns = allocationsByCategory.estoque1.length > 0 ? Object.keys(allocationsByCategory.estoque1[0]) : [];
      const e2Columns = allocationsByCategory.estoque2.length > 0 ? Object.keys(allocationsByCategory.estoque2[0]) : [];

      if (allocationsByCategory.estoque1.length > 0) {
        const ws4 = XLSX.utils.json_to_sheet(allocationsByCategory.estoque1, { header: e1Columns });
        XLSX.utils.book_append_sheet(wb, ws4, 'Alocado Estoque 1');
      }

      if (allocationsByCategory.estoque2.length > 0) {
        const ws5 = XLSX.utils.json_to_sheet(allocationsByCategory.estoque2, { header: e2Columns });
        XLSX.utils.book_append_sheet(wb, ws5, 'Alocado Estoque 2');
      }

      // Aba Análise
      const analysisData = this.generateAnalysisData(this.state.allocationResult);
      if (analysisData.length > 0) {
        const ws6 = XLSX.utils.json_to_sheet(analysisData);
        XLSX.utils.book_append_sheet(wb, ws6, 'Análise');
      }

      // Aba Análise Alocação (SKUs não alocados)
      const analysisAllocationData = this.generateAnalysisAllocationData(this.state.allocationResult);
      if (analysisAllocationData.length > 0) {
        const ws7 = XLSX.utils.json_to_sheet(analysisAllocationData);
        XLSX.utils.book_append_sheet(wb, ws7, 'Análise Alocação');
      }

      // Aba Diagnóstico (razões dos pallets não alocados)
      const diagnosticData = this.generateDiagnosticData(this.state.allocationResult);
      if (diagnosticData.length > 0) {
        const ws8 = XLSX.utils.json_to_sheet(diagnosticData);
        XLSX.utils.book_append_sheet(wb, ws8, 'Diagnóstico');
      }

      // Aba SKUs com Estoque sem Demanda
      if (this.state.allocationResult.skusSemDemanda &&
          this.state.allocationResult.skusSemDemanda.length > 0) {

        const semDemandaData = this.state.allocationResult.skusSemDemanda.map(item => ({
          'SKU': item.sku,
          'Descrição': item.descricao,
          'Caixas': item.caixas,
          'Pallets': item.pallets,
          'Peso (kg)': item.peso
        }));

        const wsSemDemanda = XLSX.utils.json_to_sheet(semDemandaData);
        XLSX.utils.book_append_sheet(wb, wsSemDemanda, 'Estoque sem Demanda');
      }

      const filename = `Alocacao_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      const messages = [];
      messages.push('✅ Arquivo Excel exportado com sucesso!');
      messages.push('');
      messages.push('📊 Abas criadas:');
      messages.push('  • Alocação - Todos os caminhões formados');
      messages.push('  • Análise - Comparação oferecido vs alocado por país');
      if (analysisAllocationData.length > 0) {
        messages.push(`  • Análise Alocação - ${analysisAllocationData.length} SKUs não alocados`);
      }
      if (diagnosticData.length > 0) {
        messages.push(`  • Diagnóstico - Análise de ${diagnosticData.length} países com pallets não alocados`);
      }

      if (allocationsByCategory.estoque1.length > 0) {
        messages.push(`  • Alocado Estoque 1 - ${allocationsByCategory.estoque1.length} SKUs`);
      }
      if (allocationsByCategory.estoque2.length > 0) {
        messages.push(`  • Alocado Estoque 2 - ${allocationsByCategory.estoque2.length} SKUs`);
      }
      if (this.state.allocationResult.skippedByContract?.length > 0) {
        messages.push(`  • Sem Contrato - ${this.state.allocationResult.skippedByContract.length} SKUs`);
      }
      if (this.state.allocationResult.skippedByZLSB?.length > 0) {
        messages.push(`  • Fora do ZLSB - ${this.state.allocationResult.skippedByZLSB.length} SKUs`);
      }
      if (this.state.allocationResult.skusSemDemanda?.length > 0) {
        messages.push(`  • Estoque sem Demanda - ${this.state.allocationResult.skusSemDemanda.length} SKUs`);
      }

      alert(messages.join('\n'));
    } catch (error) {
      console.error('Erro na exportação:', error);
      alert('Erro ao exportar: ' + error.message);
    }
  }

  async loadHistory() {
    const container = document.getElementById('historyList');

    // Show loading indicator
    container.innerHTML = `
      <div class="flex justify-center py-12">
        <div class="spinner"></div>
      </div>
    `;

    const { data, error } = await historico.getAll();


    if (error) {
      console.error('Erro ao carregar histórico:', error);
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="alert-circle" class="w-16 h-16 text-red-400 mx-auto mb-4"></i>
          <p class="text-red-600">Erro ao carregar histórico</p>
          <p class="text-sm text-gray-500 mt-2">${error.message}</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12">
          <i data-lucide="inbox" class="w-16 h-16 text-gray-400 mx-auto mb-4"></i>
          <p class="text-gray-600">Nenhum histórico encontrado</p>
          <p class="text-sm text-gray-500 mt-2">Execute uma alocação e salve no histórico para ver aqui</p>
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // Store history data in memory for quick access
    this._historyData = data;

    container.innerHTML = data.map((item, index) => {
      const dataAlocacao = new Date(item.data_alocacao).toLocaleString('pt-BR');
      const resultado = item.resultado || {};
      const skippedCount = resultado.skippedByContract?.length || 0;

      return `
        <div class="bg-white rounded-xl shadow-sm p-6 border border-gray-200 mb-4 hover:shadow-md transition">
          <div class="flex justify-between items-start">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <i data-lucide="truck" class="w-6 h-6 text-white"></i>
                </div>
                <div>
                  <h3 class="font-semibold text-gray-800 text-lg">Alocação #${data.length - index}</h3>
                  <p class="text-sm text-gray-500">
                    <i data-lucide="calendar" class="inline w-3 h-3"></i>
                    ${dataAlocacao}
                  </p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div class="bg-blue-50 rounded-lg p-3">
                  <p class="text-xs text-blue-600 font-medium mb-1">Caminhões</p>
                  <p class="text-2xl font-bold text-blue-900">${item.total_caminhoes}</p>
                </div>
                <div class="bg-purple-50 rounded-lg p-3">
                  <p class="text-xs text-purple-600 font-medium mb-1">Pallets</p>
                  <p class="text-2xl font-bold text-purple-900">${item.total_pallets?.toFixed(1) || 0}</p>
                </div>
                <div class="bg-green-50 rounded-lg p-3">
                  <p class="text-xs text-green-600 font-medium mb-1">Países</p>
                  <p class="text-2xl font-bold text-green-900">${resultado.countriesServed || 0}</p>
                </div>
                <div class="bg-${skippedCount > 0 ? 'yellow' : 'gray'}-50 rounded-lg p-3">
                  <p class="text-xs text-${skippedCount > 0 ? 'yellow' : 'gray'}-600 font-medium mb-1">Sem Contrato</p>
                  <p class="text-2xl font-bold text-${skippedCount > 0 ? 'yellow' : 'gray'}-900">${skippedCount}</p>
                </div>
              </div>
              
              ${resultado.config ? `
                <div class="text-xs text-gray-500 mb-3">
                  <span class="mr-3">⚙️ Ocupação mín: ${resultado.config.ocupacao_minima_percentual}%</span>
                  <span class="mr-3">${resultado.config.permitir_pallets_fracionados ? '✓' : '✗'} Pallets fracionados</span>
                  <span class="mr-3">${resultado.config.fracionados_todos_skus ? '✓' : '✗'} Fracionados todos</span>
                  <span>${resultado.config.priorizar_completar_caminhao ? '✓' : '✗'} Priorizar completar</span>
                </div>
              ` : ''}
            </div>
            
            <div class="flex flex-col gap-2 ml-4">
              <button
                class="view-history-btn bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2"
                data-index="${index}"
              >
                <i data-lucide="eye" class="w-4 h-4"></i>
                Ver Detalhes
              </button>
              <button
                class="export-history-btn bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2"
                data-index="${index}"
              >
                <i data-lucide="download" class="w-4 h-4"></i>
                Exportar Excel
              </button>
              <button
                class="delete-history-btn bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition text-sm font-medium flex items-center gap-2"
                data-id="${item.id}"
              >
                <i data-lucide="trash-2" class="w-4 h-4"></i>
                Deletar
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    lucide.createIcons();

    // Add event listeners using index lookup (faster than JSON parsing)
    document.querySelectorAll('.view-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const historyItem = this._historyData[index];
        this.viewHistoryDetails(historyItem);
      });
    });

    document.querySelectorAll('.export-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index);
        const historyItem = this._historyData[index];
        this.exportHistoryToExcel(historyItem);
      });
    });
    
    document.querySelectorAll('.delete-history-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this.deleteHistory(id);
      });
    });
    
  }

  async exportHistoryToExcel(historyItem) {
    if (!historyItem.resultado) {
      alert('Dados de alocação não encontrados neste histórico');
      return;
    }

    if (typeof XLSX === 'undefined') {
      alert('Erro: Biblioteca XLSX não carregada. Recarregue a página.');
      return;
    }

    try {
      const resultado = historyItem.resultado;
      const wb = XLSX.utils.book_new();

      // Format data for Excel in specified order (without Category column)
      const outputForExcel = resultado.output.map(row => ({
        Country: row.Country,
        TruckId: row.TruckId,
        SKU: row.SKU,
        BoxQuantity: row.BoxQuantity,
        Desc: row.Desc,
        PalletQuantity: row.PalletQuantity,
        PPD: row.PPD,
        Weight: row.Weight.toFixed(3).replace('.', ','),
        Priority: row.Priority,
        IsMandatory: row.IsMandatory,
        Contrato: row.Contrato,
        Linha: row.Linha,
        HubTruck: row.HubTruckLabel || ''
      }));

      const ws1 = XLSX.utils.json_to_sheet(outputForExcel);
      XLSX.utils.book_append_sheet(wb, ws1, 'Alocação');

      // Add SKUs without contract sheet if exists
      if (resultado.skippedByContract && resultado.skippedByContract.length > 0) {
        const skippedData = resultado.skippedByContract.map(item => ({
          'País': COUNTRY_NAMES[item.country] || item.country,
          'SKU': item.sku,
          'Descrição': item.desc,
          'Demanda (cx)': item.demanda,
          'PPD': item.ppd,
          'Peso (kg)': item.peso.toFixed(3).replace('.', ',')
        }));

        const ws2 = XLSX.utils.json_to_sheet(skippedData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Sem Contrato');
      }

      // Add SKUs outside ZLSB sheet if exists
      if (resultado.skippedByZLSB && resultado.skippedByZLSB.length > 0) {
        const zlsbData = resultado.skippedByZLSB.map(item => ({
          'País': COUNTRY_NAMES[item.pais] || item.pais,
          'SKU': item.cod,
          'Descrição': item.descricao,
          'Demanda (cx)': item.demanda,
          'PPD': item.ppd,
          'Peso (kg)': item.peso.toFixed(3).replace('.', ',')
        }));

        const ws3 = XLSX.utils.json_to_sheet(zlsbData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Fora do ZLSB');
      }

      // Create sheets with allocations grouped by category
      // Usar allStockPallets se disponível, senão converter output para o formato esperado
      let stockPalletsForReport = resultado.allStockPallets;
      if (!stockPalletsForReport || stockPalletsForReport.length === 0) {
        // Converter output para formato de pallets (para históricos antigos)
        stockPalletsForReport = resultado.output.map(row => ({
          sku: row.SKU,
          desc: row.Desc,
          ppd: row.PPD,
          quantity: row.PalletQuantity,
          weight: row.Weight,
          country: row.Country
        }));
      }
      const allocationsByCategory = await this.generateAllocationByCategoryReport(stockPalletsForReport);

      // Column order is already set by generateAllocationByCategoryReport via row key order
      const e1Columns = allocationsByCategory.estoque1.length > 0 ? Object.keys(allocationsByCategory.estoque1[0]) : [];
      const e2Columns = allocationsByCategory.estoque2.length > 0 ? Object.keys(allocationsByCategory.estoque2[0]) : [];

      if (allocationsByCategory.estoque1.length > 0) {
        const ws4 = XLSX.utils.json_to_sheet(allocationsByCategory.estoque1, { header: e1Columns });
        XLSX.utils.book_append_sheet(wb, ws4, 'Alocado Estoque 1');
      }

      if (allocationsByCategory.estoque2.length > 0) {
        const ws5 = XLSX.utils.json_to_sheet(allocationsByCategory.estoque2, { header: e2Columns });
        XLSX.utils.book_append_sheet(wb, ws5, 'Alocado Estoque 2');
      }

      // Add SKUs with stock but no demand if exists
      if (resultado.skusSemDemanda && resultado.skusSemDemanda.length > 0) {
        const semDemandaData = resultado.skusSemDemanda.map(item => ({
          'SKU': item.sku,
          'Descrição': item.descricao,
          'Caixas': item.caixas,
          'Pallets': item.pallets,
          'Peso (kg)': item.peso
        }));

        const wsSemDemanda = XLSX.utils.json_to_sheet(semDemandaData);
        XLSX.utils.book_append_sheet(wb, wsSemDemanda, 'Estoque sem Demanda');
      }

      // File name with date
      const dataAlocacao = new Date(historyItem.data_alocacao);
      const dataFormatada = dataAlocacao.toISOString().split('T')[0];
      const horaFormatada = dataAlocacao.toTimeString().split(' ')[0].replace(/:/g, '-');
      const filename = `Alocacao_${dataFormatada}_${horaFormatada}.xlsx`;

      XLSX.writeFile(wb, filename);

      const messages = [];
      messages.push('✅ Excel exportado com sucesso!');
      messages.push('');
      messages.push('📊 Abas criadas:');
      messages.push('  • Alocação');
      if (allocationsByCategory.estoque1.length > 0) {
        messages.push(`  • Alocado Estoque 1 - ${allocationsByCategory.estoque1.length} SKUs`);
      }
      if (allocationsByCategory.estoque2.length > 0) {
        messages.push(`  • Alocado Estoque 2 - ${allocationsByCategory.estoque2.length} SKUs`);
      }
      if (resultado.skippedByContract?.length > 0) {
        messages.push(`  • Sem Contrato - ${resultado.skippedByContract.length} SKUs`);
      }
      if (resultado.skippedByZLSB?.length > 0) {
        messages.push(`  • Fora do ZLSB - ${resultado.skippedByZLSB.length} SKUs`);
      }
      if (resultado.skusSemDemanda?.length > 0) {
        messages.push(`  • Estoque sem Demanda - ${resultado.skusSemDemanda.length} SKUs`);
      }

      alert(messages.join('\n'));
    } catch (error) {
      console.error('Erro ao exportar histórico:', error);
      alert('Erro ao exportar: ' + error.message);
    }
  }

  viewHistoryDetails(historyItem) {
    if (!historyItem.resultado) {
      alert('Dados de alocação não encontrados neste histórico');
      return;
    }

    // Load result into state as if it were a new allocation
    this.setState({ allocationResult: historyItem.resultado });
    
    // Switch to allocation tab to show details
    this.switchTab('allocation');
  }

  async deleteHistory(id) {
    if (!id) {
      alert('Erro: ID da alocação não encontrado');
      return;
    }

    if (!confirm('Tem certeza que deseja deletar esta alocação do histórico?\n\nEsta ação não pode ser desfeita.')) {
      return;
    }

    try {
      const user = await auth.getCurrentUser();
      if (!user) {
        alert('Erro: Usuário não autenticado');
        return;
      }


      const { error } = await supabase
        .from('historico_alocacoes')
        .delete()
        .eq('id', id);

      if (error) {
        throw new Error(error.message);
      }


      // Reload history list immediately
      await this.loadHistory();

      // Allocation removed successfully
      
    } catch (error) {
      console.error('❌ Erro ao deletar histórico:', error);
      alert('Erro ao deletar: ' + error.message);
    }
  }

  setState(updates) {
    this.state = { ...this.state, ...updates };
  }
}