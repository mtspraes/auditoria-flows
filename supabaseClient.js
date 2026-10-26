// Importar Supabase do CDN (versão específica para evitar problemas de cache)
// esm.sh substituiu jsdelivr porque o último apresentou 404 intermitente em algumas regioes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.14';

// ⚠️ IMPORTANTE: Substitua estas variáveis com suas credenciais do Supabase
const SUPABASE_URL = 'https://jaqdxfslcuukkotgtrhd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphcWR4ZnNsY3V1a2tvdGd0cmhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTQ5NjQsImV4cCI6MjA4MjA3MDk2NH0.Be72y2NVCbxDRSycG2dz3RYHcRvJwkLgtGFrlT7RZE4';

// Criar cliente Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: {
    schema: 'public',
  },
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true  // Reativado para suportar invite/recovery
  },
  global: {
    headers: {
      'x-client-info': 'supabase-js/2.0.0',
    },
  }
});

// ========== HELPER: RETRY COM BACKOFF ==========

async function retryOperation(operation, maxRetries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (result.error && result.error.message?.includes('503')) {
        throw new Error('Service Unavailable');
      }
      
      if (result.error && result.error.message?.includes('schema cache')) {
        throw new Error('Service Unavailable');
      }
      
      return result;
    } catch (error) {
      console.warn(`Tentativa ${attempt}/${maxRetries} falhou:`, error.message);
      
      if (attempt === maxRetries) {
        if (error.message.includes('Service Unavailable') || error.message.includes('503')) {
          return { 
            error: { 
              message: '⌛ PROJETO PAUSADO: Seu projeto Supabase está inativo. Vá no dashboard do Supabase e clique em "Resume Project".',
              code: 'PROJECT_PAUSED'
            } 
          };
        }
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    }
  }
}

// ========== AUTENTICAÇÃO ==========

export const auth = {
  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { data, error };
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });
    return { data, error };
  },

  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  onAuthStateChange: (callback) => {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// ========== ESTOQUE ==========

export const estoque = {
  // ✅ Paginação para buscar todos os registros de estoque
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  getByCategory: async (categoria) => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('estoque')
        .select('*')
        .eq('categoria', categoria)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  insertMany: async (items, categoria = 'estoque1') => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const itemsWithUser = items.map((item, index) => {
      // Normalize keys to handle different case variations
      const normalizedItem = {};
      Object.keys(item).forEach(key => {
        normalizedItem[key.toLowerCase()] = item[key];
      });

      const mappedItem = {
        user_id: user.id,
        categoria: categoria,
        ordem: index, // Preserve original file order
        cod: normalizedItem.cod || '',
        descricao: normalizedItem.desc || normalizedItem.descricao || normalizedItem.descrição || '',
        estoque: parseInt(normalizedItem.estoque || normalizedItem.stock || 0) || 0,
        ppd: parseInt(normalizedItem.ppd || 0) || 0,
        peso: parseFloat((normalizedItem.peso || normalizedItem['peso bruto'] || normalizedItem.peso_bruto || normalizedItem.pesobruto || normalizedItem.weight || '0').toString().replace(',', '.')) || 0
      };

      const countries = ['ARG', 'BOL', 'CHI', 'COL', 'CUB', 'DR', 'ECU', 'MEX', 'PAR', 'PER',
                        'URU', 'COS', 'ELS', 'GUA', 'HON', 'NIC', 'PAN', 'VEN', 'CAR', 'JAM', 'TT'];

      countries.forEach(country => {
        // Use normalized item to handle case-insensitive column names
        mappedItem[country.toLowerCase()] = parseInt(normalizedItem[country.toLowerCase()] || 0) || 0;
      });

      return mappedItem;
    });

    return await retryOperation(async () => {
      const { data, error } = await supabase
        .from('estoque')
        .insert(itemsWithUser);
      return { data, error };
    });
  },

  deleteByCategory: async (categoria) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL records for this category (shared between all users)
    return await retryOperation(async () => {
      const { error } = await supabase
        .from('estoque')
        .delete()
        .eq('categoria', categoria);
      return { error };
    });
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL stock records (shared between all users)
    const { error } = await supabase
      .from('estoque')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    return { error };
  }
};

// ========== PRIORIDADES ==========

export const prioridades = {
  // ✅ CORRIGIDO: Buscar TODAS as prioridades sem limite de 1000 (paginação)
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('prioridades')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: false });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  upsertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Map synonyms to the 4 accepted DB values: baixa, moderada, forte, extrema
    const priorityMapping = {
      'baixa': 'baixa', 'baixo': 'baixa', 'low': 'baixa', 'baja': 'baixa', 'bajo': 'baixa', 'normal': 'baixa',
      'moderada': 'moderada', 'moderado': 'moderada', 'moderate': 'moderada',
      'forte': 'forte', 'fuerte': 'forte', 'strong': 'forte',
      'extrema': 'extrema', 'extremo': 'extrema', 'extreme': 'extrema'
    };

    const itemsWithUser = items.map(item => {
      const keys = Object.keys(item);

      // Flexible country column detection
      const paisKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'pais' || lower === 'país' || lower === 'country' ||
               lower.includes('pais') || lower.includes('país');
      }) || keys[0]; // Fallback to first column

      // Flexible priority column detection
      const prioridadeKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'prioridade' || lower === 'prioridades' ||
               lower === 'priority' || lower === 'prioridad' ||
               lower.includes('priorid') || lower.includes('priority');
      });

      // Flexible SKU code column detection
      const codKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'cod' || lower === 'codigo' || lower === 'código' ||
               lower === 'sku' || lower === 'code' || lower === 'material' ||
               lower.includes('cod') || lower.includes('sku');
      });

      const rawPais = String(paisKey ? item[paisKey] : '').trim().toUpperCase().replace(/\s+/g, ' ');
      const rawPrioridade = String(prioridadeKey ? item[prioridadeKey] : 'baixa').toLowerCase().trim();
      const rawCod = String(codKey ? item[codKey] : '').trim();

      // Normalize country code using COUNTRY_MAPPING
      const pais = COUNTRY_MAPPING[rawPais] || rawPais;
      const finalPriority = priorityMapping[rawPrioridade] || 'baixa';

      return {
        user_id: user.id,
        pais: pais,
        cod: rawCod,
        prioridade: finalPriority
      };
    });

    // Deduplicar: manter última ocorrência de cada (pais, cod)
    const deduped = new Map();
    itemsWithUser.forEach(item => deduped.set(`${item.pais}|${item.cod}`, item));
    const uniqueItems = Array.from(deduped.values());

    const { data, error } = await supabase
      .from('prioridades')
      .upsert(uniqueItems, {
        onConflict: 'user_id,pais,cod',
        ignoreDuplicates: false
      });
    return { data, error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL priorities (shared between all users)
    const { error } = await supabase
      .from('prioridades')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    return { error };
  }
};

// ========== HISTÓRICO ==========

export const historico = {
  getAll: async (limit = 50) => {
    const user = await auth.getCurrentUser();
    if (!user) return { data: null, error: { message: 'Usuário não autenticado' } };

    // Buscar todas as alocações (de todos os usuários) para visibilidade compartilhada
    const { data, error } = await supabase
      .from('historico_alocacoes')
      .select('*')
      .order('data_alocacao', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  save: async (resultado) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('historico_alocacoes')
      .insert({
        user_id: user.id,
        total_caminhoes: Math.round(resultado.totalTrucks || 0),
        total_pallets: Math.round(resultado.totalPallets || 0),
        resultado: resultado
      });
    return { data, error };
  }
};

// ========== SKUs OBRIGATÓRIOS ==========

export const skusObrigatorios = {
  // ✅ Paginação para buscar todos os SKUs obrigatórios
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('skus_obrigatorios')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('pais', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  getByCountry: async (pais) => {
    const { data, error } = await supabase
      .from('skus_obrigatorios')
      .select('*')
      .eq('pais', pais);
    return { data, error };
  },

  add: async (item) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('skus_obrigatorios')
      .insert({
        user_id: user.id,
        pais: item.pais.toUpperCase().trim(),
        cod: item.cod.toString().trim(),
        quantidade_caixas: parseInt(item.quantidade_caixas) || 0
      });
    return { data, error };
  },

  remove: async (id) => {
    const { error } = await supabase
      .from('skus_obrigatorios')
      .delete()
      .eq('id', id);
    return { error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL mandatory SKUs (shared between all users)
    const { error } = await supabase
      .from('skus_obrigatorios')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    return { error };
  }
};

// ========== CONFIGURAÇÕES ==========

export const configuracoes = {
  get: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('configuracoes_alocacao')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('configuracoes_alocacao')
        .insert({
          user_id: user.id,
          ocupacao_minima_percentual: 95.0,
          ocupacao_minima_obrigatorios: 90.0,
          permitir_pallets_fracionados: true,
          fracionados_todos_skus: false,
          priorizar_completar_caminhao: true,
          usar_algoritmo_genetico: false
        })
        .select()
        .single();
      return { data: newData, error: insertError };
    }

    return { data, error };
  },

  update: async (config) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('configuracoes_alocacao')
      .upsert({
        user_id: user.id,
        ocupacao_minima_percentual: config.ocupacao_minima_percentual || 95.0,
        ocupacao_minima_obrigatorios: config.ocupacao_minima_obrigatorios || 90.0,
        permitir_pallets_fracionados: config.permitir_pallets_fracionados !== false,
        fracionados_todos_skus: config.fracionados_todos_skus === true,
        priorizar_completar_caminhao: config.priorizar_completar_caminhao !== false,
        usar_algoritmo_genetico: config.usar_algoritmo_genetico === true,
        max_skus_por_caminhao_arg: config.max_skus_por_caminhao_arg ?? 0
      }, {
        onConflict: 'user_id'
      });
    return { data, error };
  }
};

// ========== CONTRATOS (CORRIGIDO) ==========

const COUNTRY_MAPPING = {
  'UY01': 'URU', 'UY': 'URU', 'UY 01': 'URU', 'URUGUAY': 'URU', 'URUGUAI': 'URU',
  'PY01': 'PAR', 'PY': 'PAR', 'PY 01': 'PAR', 'PARAGUAY': 'PAR', 'PARAGUAI': 'PAR',
  'AR01': 'ARG', 'AR': 'ARG', 'AR 01': 'ARG', 'ARGENTINA': 'ARG',
  'CL01': 'CHI', 'CL': 'CHI', 'CL 01': 'CHI', 'CHILE': 'CHI',
  'CO01': 'COL', 'CO': 'COL', 'CO 01': 'COL', 'COLOMBIA': 'COL', 'COLOMBIA': 'COL',
  'CU01': 'CUB', 'CU': 'CUB', 'CU 01': 'CUB', 'CUBA': 'CUB',
  'DO01': 'DR', 'DO': 'DR', 'DO 01': 'DR', 'DOMINICAN REPUBLIC': 'DR', 'REP DOMINICANA': 'DR',
  'EC01': 'ECU', 'EC': 'ECU', 'EC 01': 'ECU', 'ECUADOR': 'ECU', 'EQUADOR': 'ECU',
  'MX01': 'MEX', 'MX': 'MEX', 'MX 01': 'MEX', 'MEXICO': 'MEX',
  'PE01': 'PER', 'PE': 'PER', 'PE 01': 'PER', 'PERU': 'PER',
  'CR01': 'COS', 'CR': 'COS', 'CR 01': 'COS', 'COSTA RICA': 'COS',
  'SV01': 'ELS', 'SV': 'ELS', 'SV 01': 'ELS', 'EL SALVADOR': 'ELS',
  'GT01': 'GUA', 'GT': 'GUA', 'GT 01': 'GUA', 'GUATEMALA': 'GUA',
  'HN01': 'HON', 'HN': 'HON', 'HN 01': 'HON', 'HONDURAS': 'HON',
  'NI01': 'NIC', 'NI': 'NIC', 'NI 01': 'NIC', 'NICARAGUA': 'NIC',
  'PA01': 'PAN', 'PA': 'PAN', 'PA 01': 'PAN', 'PAN01': 'PAN', 'PANAMA': 'PAN', 'PANAMÁ': 'PAN',
  'VE01': 'VEN', 'VE': 'VEN', 'VE 01': 'VEN', 'VENEZUELA': 'VEN',
  'CB01': 'CAR', 'CB': 'CAR', 'CAR 01': 'CAR', 'CARIBE': 'CAR', 'CARIBBEAN': 'CAR',
  'JM01': 'JAM', 'JM': 'JAM', 'JM 01': 'JAM', 'JAMAICA': 'JAM',
  'TT01': 'TT', 'TT 01': 'TT', 'TRINIDAD': 'TT', 'TRINIDAD AND TOBAGO': 'TT', 'TRINIDAD E TOBAGO': 'TT',
  'BO01': 'BOL', 'BO': 'BOL', 'BO 01': 'BOL', 'BOLIVIA': 'BOL'
};

const VALID_COUNTRIES = [
  'ARG', 'BOL', 'CHI', 'COL', 'CUB', 'DR', 'ECU', 'MEX', 'PAR', 'PER',
  'URU', 'COS', 'ELS', 'GUA', 'HON', 'NIC', 'PAN', 'VEN', 'CAR', 'JAM', 'TT'
];

export const contratos = {
  // ✅ CORRIGIDO: Buscar TODOS os contratos sem limite de 1000
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('contratos')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('pais', { ascending: true })
        .order('cod', { ascending: true });

      if (error) return { data: null, error };
      
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  // ✅ CORRIGIDO: Buscar TODOS os contratos ativos sem limite
  getActive: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('contratos')
        .select('*')
        .eq('ativo', true)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('pais', { ascending: true });

      if (error) return { data: null, error };
      
      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  getByCountry: async (pais) => {
    const { data, error } = await supabase
      .from('contratos')
      .select('*')
      .eq('pais', pais)
      .eq('ativo', true);
    return { data, error };
  },

  insertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const itemsWithUser = items.map(item => {
      const paisTabela = (item.Pais || item.pais || item.PAIS || item.PAÍS || '').toString().trim().toUpperCase();
      const paisScript = COUNTRY_MAPPING[paisTabela] || paisTabela;
      
      const cod = (item.SKU || item.sku || item.COD || item.cod || '').toString().trim().toUpperCase();
      const contrato = (item.CONTRATO || item.Contrato || item.contrato || '').toString().trim();
      const linha = (item.LINHA || item.Linha || item.linha || '').toString().trim();
      const ativo = item.Ativo !== undefined ? Boolean(item.Ativo) : true;

      return {
        user_id: user.id,
        pais: paisScript,
        cod: cod,
        contrato: contrato || null,
        linha: linha || null,
        ativo: ativo,
        data_inicio: item.Data_Inicio || item.data_inicio || null,
        data_fim: item.Data_Fim || item.data_fim || null
      };
    }).filter(item => item.pais && item.cod);

    if (itemsWithUser.length === 0) {
      return { error: { message: 'Nenhum contrato válido encontrado no arquivo' } };
    }

    const uniqueItems = [];
    const seen = new Map();
    
    for (let i = itemsWithUser.length - 1; i >= 0; i--) {
      const item = itemsWithUser[i];
      const key = `${item.pais}|${item.cod}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueItems.unshift(item);
      }
    }

    console.log(`Total de linhas no Excel: ${itemsWithUser.length}`);
    console.log(`Linhas únicas após remover duplicatas: ${uniqueItems.length}`);
    console.log(`Duplicatas removidas: ${itemsWithUser.length - uniqueItems.length}`);

    const { data, error } = await supabase
      .from('contratos')
      .upsert(uniqueItems, { 
        onConflict: 'user_id,pais,cod',
        ignoreDuplicates: false 
      });
    return { data, error };
  },

  add: async (item) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('contratos')
      .insert({
        user_id: user.id,
        pais: item.pais.toUpperCase().trim(),
        cod: item.cod.toString().trim().toUpperCase(),
        contrato: item.contrato || null,
        linha: item.linha || null,
        ativo: item.ativo !== undefined ? item.ativo : true,
        data_inicio: item.data_inicio || null,
        data_fim: item.data_fim || null
      });
    return { data, error };
  },

  remove: async (id) => {
    const { error } = await supabase
      .from('contratos')
      .delete()
      .eq('id', id);
    return { error };
  },

  toggleActive: async (id, ativo) => {
    const { error } = await supabase
      .from('contratos')
      .update({ ativo })
      .eq('id', id);
    return { error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL contracts (shared between all users)
    const { error } = await supabase
      .from('contratos')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    return { error };
  }
};

// ========== ARQUIVO ZLSB ==========

export const zlsb = {
  // ✅ Paginação para buscar todos os SKUs ZLSB
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('zlsb_skus')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: false });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) {
          hasMore = false;
        }
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  insertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Processar os dados do Excel ZLSB
    const itemsWithUser = items.map(item => ({
      user_id: user.id,
      cod: (item.SKU || item.sku || item.COD || item.cod || '').toString().trim().toUpperCase()
    })).filter(item => item.cod); // Remover linhas vazias

    if (itemsWithUser.length === 0) {
      return { error: { message: 'Nenhum SKU válido encontrado no arquivo ZLSB' } };
    }

    // Remover duplicatas
    const uniqueItems = [];
    const seen = new Set();

    itemsWithUser.forEach(item => {
      if (!seen.has(item.cod)) {
        seen.add(item.cod);
        uniqueItems.push(item);
      }
    });

    console.log(`ZLSB: Total de SKUs lidos: ${itemsWithUser.length}`);
    console.log(`ZLSB: SKUs únicos: ${uniqueItems.length}`);
    console.log(`ZLSB: Duplicatas removidas: ${itemsWithUser.length - uniqueItems.length}`);

    return await retryOperation(async () => {
      const { data, error } = await supabase
        .from('zlsb_skus')
        .insert(uniqueItems);
      return { data, error };
    });
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    // Delete ALL ZLSB records (shared between all users)
    const { error } = await supabase
      .from('zlsb_skus')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    return { error };
  },

  // Verificar quais SKUs da demanda NÃO estão na lista ZLSB
  checkMissingSKUs: async (skusComDemanda) => {
    const { data: zlsbData, error } = await zlsb.getAll();

    if (error) {
      console.error('Erro ao buscar dados ZLSB:', error);
      return { missing: [], total: 0, error };
    }

    // Se não houver dados ZLSB, não fazer verificação
    if (!zlsbData || zlsbData.length === 0) {
      console.log('⚠️ Nenhum SKU cadastrado no arquivo ZLSB - verificação não será realizada');
      return { missing: [], total: 0, skipped: true };
    }

    // Criar Set com SKUs do ZLSB para busca rápida
    const zlsbSet = new Set(zlsbData.map(item => item.cod.trim().toUpperCase()));

    // Verificar quais SKUs com demanda NÃO estão no ZLSB
    const missingSKUs = skusComDemanda.filter(sku => !zlsbSet.has(sku.cod.trim().toUpperCase()));

    console.log(`📋 ZLSB: Total de SKUs na lista: ${zlsbSet.size}`);
    console.log(`📋 SKUs com demanda verificados: ${skusComDemanda.length}`);
    console.log(`⚠️ SKUs com demanda NÃO encontrados no ZLSB: ${missingSKUs.length}`);

    return { missing: missingSKUs, total: zlsbSet.size, skipped: false };
  }
};// ========== INDAIATUBA - ESTOQUE ==========

export const ind_estoque = {
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('ind_estoque')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) hasMore = false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  insertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const itemsWithUser = items.map((item, index) => {
      const n = {};
      Object.keys(item).forEach(key => { n[key.toLowerCase().trim()] = item[key]; });

      const mapped = {
        user_id: user.id,
        ordem: index,
        cod: (n.cod || n.sku || '').toString().trim(),
        descricao: n.desc || n.descricao || n['descrição'] || '',
        estoque: parseInt(n.estoque || 0) || 0,
        ppd: parseInt(n.ppd || 0) || 0,
        peso: parseFloat((n.peso || n['peso bruto'] || n.peso_bruto || '0').toString().replace(',', '.')) || 0
      };

      ['arg', 'par'].forEach(c => {
        mapped[c] = parseInt(n[c] || 0) || 0;
      });

      return mapped;
    });

    return await retryOperation(async () => {
      const { data, error } = await supabase.from('ind_estoque').insert(itemsWithUser);
      return { data, error };
    });
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { error } = await supabase
      .from('ind_estoque')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    return { error };
  }
};

// ========== INDAIATUBA - PRIORIDADES ==========

const IND_PRIORITY_MAPPING = {
  'baixa': 'baixa', 'baixo': 'baixa', 'low': 'baixa', 'baja': 'baixa', 'bajo': 'baixa', 'normal': 'baixa',
  'moderada': 'moderada', 'moderado': 'moderada', 'moderate': 'moderada',
  'forte': 'forte', 'fuerte': 'forte', 'strong': 'forte',
  'extrema': 'extrema', 'extremo': 'extrema', 'extreme': 'extrema'
};

export const ind_prioridades = {
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('ind_prioridades')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('created_at', { ascending: false });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) hasMore = false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  upsertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const itemsWithUser = items.map(item => {
      const keys = Object.keys(item);

      const paisKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'pais' || lower === 'país' || lower === 'country' || lower.includes('pais') || lower.includes('país');
      }) || keys[0];

      const prioridadeKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'prioridade' || lower === 'prioridades' || lower === 'priority' || lower === 'prioridad' || lower.includes('priorid') || lower.includes('priority');
      });

      const codKey = keys.find(k => {
        const lower = k.toLowerCase().trim();
        return lower === 'cod' || lower === 'codigo' || lower === 'código' || lower === 'sku' || lower === 'code' || lower === 'material' || lower.includes('cod') || lower.includes('sku');
      });

      const rawPais = String(paisKey ? item[paisKey] : '').trim().toUpperCase().replace(/\s+/g, ' ');
      const rawPrioridade = String(prioridadeKey ? item[prioridadeKey] : 'baixa').toLowerCase().trim();
      const rawCod = String(codKey ? item[codKey] : '').trim();

      // Normalize country
      const IND_COUNTRY_NORM = {
        'PY01': 'PAR', 'PY': 'PAR', 'PY 01': 'PAR', 'PARAGUAY': 'PAR', 'PARAGUAI': 'PAR',
        'AR01': 'ARG', 'AR': 'ARG', 'AR 01': 'ARG', 'ARGENTINA': 'ARG',
        'ARG': 'ARG', 'PAR': 'PAR'
      };
      const pais = IND_COUNTRY_NORM[rawPais] || rawPais;
      const finalPriority = IND_PRIORITY_MAPPING[rawPrioridade] || 'baixa';

      return {
        user_id: user.id,
        pais: pais,
        cod: rawCod,
        prioridade: finalPriority
      };
    }).filter(item => item.pais && item.cod && ['ARG', 'PAR'].includes(item.pais));

    if (itemsWithUser.length === 0) {
      return { error: { message: 'Nenhuma prioridade válida (países aceitos: ARG, PAR)' } };
    }

    // Deduplicar: manter última ocorrência de cada (pais, cod)
    const deduped = new Map();
    itemsWithUser.forEach(item => deduped.set(`${item.pais}|${item.cod}`, item));
    const uniqueItems = Array.from(deduped.values());

    const { data, error } = await supabase
      .from('ind_prioridades')
      .upsert(uniqueItems, { onConflict: 'pais,cod', ignoreDuplicates: false });
    return { data, error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { error } = await supabase
      .from('ind_prioridades')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    return { error };
  }
};

// ========== INDAIATUBA - CONTRATOS ==========

const IND_COUNTRY_MAPPING = {
  'PY01': 'PAR', 'PY': 'PAR', 'PY 01': 'PAR', 'PARAGUAY': 'PAR', 'PARAGUAI': 'PAR',
  'AR01': 'ARG', 'AR': 'ARG', 'AR 01': 'ARG', 'ARGENTINA': 'ARG'
};

const IND_VALID_COUNTRIES = ['ARG', 'PAR'];

export const ind_contratos = {
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('ind_contratos')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('pais', { ascending: true })
        .order('cod', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) hasMore = false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  getActive: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('ind_contratos')
        .select('*')
        .eq('ativo', true)
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('pais', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) hasMore = false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  insertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const itemsWithUser = items.map(item => {
      const paisRaw = (item.Pais || item.pais || item.PAIS || item['PAÍS'] || '').toString().trim().toUpperCase();
      const paisNorm = IND_COUNTRY_MAPPING[paisRaw] || paisRaw;
      const cod = (item.SKU || item.sku || item.COD || item.cod || '').toString().trim().toUpperCase();
      const contrato = (item.CONTRATO || item.Contrato || item.contrato || '').toString().trim();
      const linha = (item.LINHA || item.Linha || item.linha || '').toString().trim();
      const ativo = item.Ativo !== undefined ? Boolean(item.Ativo) : true;

      return {
        user_id: user.id,
        pais: paisNorm,
        cod,
        contrato: contrato || null,
        linha: linha || null,
        ativo,
        data_inicio: item.Data_Inicio || item.data_inicio || null,
        data_fim: item.Data_Fim || item.data_fim || null
      };
    }).filter(item => item.pais && item.cod && IND_VALID_COUNTRIES.includes(item.pais));

    if (itemsWithUser.length === 0) {
      return { error: { message: 'Nenhum contrato válido encontrado (países aceitos: ARG, PAR)' } };
    }

    // Deduplicate
    const uniqueItems = [];
    const seen = new Map();
    for (let i = itemsWithUser.length - 1; i >= 0; i--) {
      const key = `${itemsWithUser[i].pais}|${itemsWithUser[i].cod}`;
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueItems.unshift(itemsWithUser[i]);
      }
    }

    const { data, error } = await supabase
      .from('ind_contratos')
      .upsert(uniqueItems, { onConflict: 'pais,cod', ignoreDuplicates: false });
    return { data, error };
  },

  toggleActive: async (id, ativo) => {
    const { error } = await supabase
      .from('ind_contratos')
      .update({ ativo })
      .eq('id', id);
    return { error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { error } = await supabase
      .from('ind_contratos')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    return { error };
  }
};

// ========== INDAIATUBA - HISTÓRICO ==========

export const ind_historico = {
  getAll: async (limit = 50) => {
    const { data, error } = await supabase
      .from('ind_historico_alocacoes')
      .select('*')
      .order('data_alocacao', { ascending: false })
      .limit(limit);
    return { data, error };
  },

  save: async (resultado, stats) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuário não autenticado' } };

    const { data, error } = await supabase
      .from('ind_historico_alocacoes')
      .insert({
        user_id: user.id,
        total_caminhoes: stats.totalTrucks || 0,
        total_pallets: stats.totalPallets || 0,
        total_posicoes: stats.totalPositions || 0,
        total_peso: stats.totalWeight || 0,
        ocupacao_minima: stats.ocupacaoMinima || 90,
        resultado: resultado
      });
    return { data, error };
  },

  delete: async (id) => {
    const { error } = await supabase
      .from('ind_historico_alocacoes')
      .delete()
      .eq('id', id);
    return { error };
  }
};

// ========== INDAIATUBA - TABELA DE REFERENCIA (fator + peso_pallet) ==========

export const ind_reference_table = {
  getAll: async () => {
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('ind_reference_table')
        .select('*')
        .range(page * pageSize, (page + 1) * pageSize - 1)
        .order('cod', { ascending: true });

      if (error) return { data: null, error };

      if (data && data.length > 0) {
        allData = allData.concat(data);
        if (data.length < pageSize) hasMore = false;
        page++;
      } else {
        hasMore = false;
      }
    }

    return { data: allData, error: null };
  },

  insertMany: async (items) => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuario nao autenticado' } };

    const toNumber = (v) => {
      if (v === null || v === undefined || v === '') return NaN;
      return parseFloat(String(v).trim().replace(',', '.'));
    };

    const mapped = items.map(item => {
      const keys = Object.keys(item);

      const skuKey = keys.find(k => {
        const l = k.toLowerCase().trim();
        return l === 'sku' || l === 'cod' || l === 'codigo' || l === 'código' || l.includes('sku') || l.includes('cod');
      });

      const fatorKey = keys.find(k => {
        const l = k.toLowerCase().trim();
        return l === 'fator' || l === 'factor';
      });

      const pesoKey = keys.find(k => {
        const l = k.toLowerCase().trim();
        return l === 'pesopallet' || l === 'peso_pallet' || l === 'peso pallet'
            || l === 'pesopalete' || l === 'peso palete'
            || l === 'peso' || l.includes('peso');
      });

      const cod = skuKey ? String(item[skuKey]).trim().toUpperCase() : '';
      const fator = fatorKey ? toNumber(item[fatorKey]) : NaN;
      const peso_pallet = pesoKey ? toNumber(item[pesoKey]) : NaN;

      return { user_id: user.id, cod, fator, peso_pallet };
    }).filter(item => item.cod && Number.isFinite(item.fator) && item.fator > 0
                   && Number.isFinite(item.peso_pallet) && item.peso_pallet > 0);

    if (mapped.length === 0) {
      return { error: { message: 'Nenhuma linha valida. Esperado: colunas SKU/COD, Fator, PesoPallet (ou Peso).' } };
    }

    // Dedup por cod, mantendo a ultima ocorrencia
    const dedup = new Map();
    mapped.forEach(item => dedup.set(item.cod, item));
    const unique = Array.from(dedup.values());

    const { data, error } = await supabase
      .from('ind_reference_table')
      .insert(unique);
    return { data, error };
  },

  deleteAll: async () => {
    const user = await auth.getCurrentUser();
    if (!user) return { error: { message: 'Usuario nao autenticado' } };

    const { error } = await supabase
      .from('ind_reference_table')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    return { error };
  }
};