const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');
const { Pool } = require('pg');

// (REQ 3) Novas dependências de autenticação
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`; 

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser()); // Para ler os cookies da sessão
app.use(express.static('public'));

// (REQ 3) Configuração da Sessão
app.use(session({
    secret: 'o-seu-segredo-super-secreto-aqui', // Mude isto para uma string aleatória
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false, // Em produção (com HTTPS) deve ser 'true'
        maxAge: 1000 * 60 * 60 * 8 // 8 horas de sessão
    }
}));


// Configuração da Conexão PostgreSQL
const pool = new Pool({
  user: 'postgres',
  host: '10.172.1.15',
  database: 'dash',
  password: 'postgres',
  port: 5432,
});

// --- DDLs (Definição das Tabelas) ---
// (Executa ambas as DDLs ao iniciar)

const DDL_ATESTATOS = `
CREATE TABLE IF NOT EXISTS qhos.atestados (
    id SERIAL PRIMARY KEY,
    nome_funcionario VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    setor VARCHAR(100),
    hospital VARCHAR(255),
    data_emissao DATE NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    dias_afastamento INTEGER,
    nome_medico VARCHAR(255),
    crm_medico VARCHAR(50),
    arquivo VARCHAR(255) NOT NULL,
    data_envio TIMESTAMPTZ DEFAULT NOW(),
    valido BOOLEAN DEFAULT true,
    coordenador_id VARCHAR(10),
    coordenador_nome VARCHAR(255),
    coordenador_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pendente_coordenador',
    validado_por_coordenador BOOLEAN DEFAULT false,
    nome_coordenador_validador VARCHAR(255),
    data_validacao_coordenador TIMESTAMPTZ,
    motivo_recusa_coordenador TEXT,
    validado_por_admin BOOLEAN DEFAULT false,
    nome_admin_validador VARCHAR(255),
    data_validacao_admin TIMESTAMPTZ,
    motivo_recusa_admin TEXT,
    encaminhado_para TEXT
);
`;

// (REQ 3) Nova tabela para Autenticação (Opção 2)
const DDL_COORD_AUTH = `
CREATE TABLE IF NOT EXISTS qhos.coord_auth (
    id_coordenador VARCHAR(10) PRIMARY KEY,
    email VARCHAR(120) UNIQUE NOT NULL,
    senha VARCHAR(255) NOT NULL,
    data_registo TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (id_coordenador) REFERENCES qhos.coord(id)
);
`;

// Função de inicialização do DB
async function inicializarDB() {
    try {
        await pool.query(DDL_ATESTATOS);
        console.log('✅ Tabela "qhos.atestados" verificada/criada.');
        await pool.query(DDL_COORD_AUTH);
        console.log('✅ Tabela "qhos.coord_auth" verificada/criada.');
        console.log(`✅ Conectado ao PostgreSQL (10.172.1.15)`);
    } catch (err) {
        console.error('❌ ERRO CRÍTICO AO INICIAR O BANCO DE DADOS:', err.stack);
        process.exit(1);
    }
}
inicializarDB();


// Configuração do Multer (Upload no caminho de rede)
const uploadDir = '//10.172.0.11/Public/uploads'; 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(uploadDir)) {
      try { fs.mkdirSync(uploadDir, { recursive: true }); } 
      catch (err) { cb(err, null); return; }
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'atestado-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage, /* ... (filtros e limites) ... */ });


// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', port: 587, secure: false,
  auth: { user: 'hmanotificacoes@gmail.com', pass: 'tkkk wtdw cudm qapc' }
});

// Função para validar data do atestado (48 horas)
function isAtestadoValido(dataEmissao) {
  const dataEmissaoObj = new Date(dataEmissao + 'T00:00:00');
  const agora = new Date();
  const diferencaHoras = (agora - dataEmissaoObj) / (1000 * 60 * 60);
  return diferencaHoras <= 48;
}

// --- (REQ 3) Middleware de Autenticação ---
// Verifica se o coordenador está logado
const checkAuth = (req, res, next) => {
    if (req.session && req.session.user) {
        // Utilizador está logado
        next();
    } else {
        // Utilizador não está logado
        // Se for um pedido de API, retorna 401
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Acesso não autorizado. Faça login.' });
        }
        // Se for um pedido de página, redireciona para o login
        res.redirect('/login.html');
    }
};

// --- Rotas Públicas ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// Páginas de login e registo (NÃO SÃO PROTEGIDAS)
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));


// --- Rotas Protegidas do Coordenador ---
// (REQ 3) Esta rota agora é protegida pelo middleware 'checkAuth'
app.get('/validar-atestado', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'coordenador.html'));
});

// Upload do atestado (AGORA USA INSERT)
app.post('/upload-atestado', upload.single('atestadoFile'), async (req, res) => {
  try {
    const {
      nomeFuncionario, dataInicio, dataFim, dataEmissao,
      nomeMedico, crmMedico, email, coordenadorId, setor, hospital
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo do atestado é obrigatório' });
    }
    if (!isAtestadoValido(dataEmissao)) {
      return res.status(400).json({ error: 'Atestado com mais de 48 horas.' });
    }

    // 1. Busca o coordenador selecionado no Banco de Dados
    let coordenadorSelecionado;
    try {
        const query = 'SELECT nome, email FROM qhos.coord WHERE id = $1 AND ativo = \'S\'';
        const coordResult = await pool.query(query, [coordenadorId]);
        if (coordResult.rows.length === 0) {
            return res.status(400).json({ error: 'Coordenador selecionado não é válido ou está inativo.' });
        }
        coordenadorSelecionado = coordResult.rows[0]; 
    } catch (dbErr) {
        return res.status(500).json({ error: 'Erro ao consultar banco de dados de coordenadores.' });
    }

    // 2. Cálculo de dias
    let diasAfastamento = 0;
    try {
      const dataInicioObj = new Date(dataInicio + 'T00:00:00');
      const dataFimObj = new Date(dataFim + 'T00:00:00');
      diasAfastamento = Math.ceil(Math.abs(dataFimObj - dataInicioObj) / (1000 * 60 * 60 * 24)) + 1;
    } catch (e) { /*...*/ }
    
    // 3. Insere o atestado no Banco de Dados
    const insertQuery = `
      INSERT INTO qhos.atestados (
          nome_funcionario, email, setor, hospital, data_emissao, data_inicio, data_fim,
          dias_afastamento, nome_medico, crm_medico, arquivo,
          coordenador_id, coordenador_nome, coordenador_email, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id;
    `;
    const valores = [
        nomeFuncionario, email, setor, hospital, dataEmissao, dataInicio, dataFim,
        diasAfastamento, nomeMedico, crmMedico, req.file.filename,
        coordenadorId, coordenadorSelecionado.nome, coordenadorSelecionado.email,
        'pendente_coordenador'
    ];
    
    const insertResult = await pool.query(insertQuery, valores);
    const novoAtestadoId = insertResult.rows[0].id;
    
    console.log(`✅ Atestado (ID: ${novoAtestadoId}) salvo no DB. Aguardando Coordenador.`);

    // 4. Prepara dados para enviar e-mail
    const dadosParaEmail = {
        id: novoAtestadoId,
        nomeFuncionario, email, setor, dataInicio, dataFim, diasAfastamento,
        nomeMedico, crmMedico,
        coordenadorInfo: {
            nome: coordenadorSelecionado.nome,
            email: coordenadorSelecionado.email
        }
    };

    enviarEmailRecebimento(dadosParaEmail).catch(console.error);
    enviarEmailCoordenador(dadosParaEmail).catch(console.error);

    res.json({
      success: true,
      message: 'Atestado enviado! Aguardando validação do seu coordenador.',
      id: novoAtestadoId
    });

  } catch (error) {
    console.error('❌ Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// --- API Routes (AGORA USAM O DB) ---

// (REQ 3) --- ROTAS DE AUTENTICAÇÃO ---

// POST /api/auth/register (Primeiro Acesso)
app.post('/api/auth/register', async (req, res) => {
  // ID REMOVIDO daqui
  const { email, senha } = req.body;
  // Validação atualizada
  if (!email || !senha) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  }

  try {
      // 1. Verifica se o Email corresponde ao cadastro de Coordenadores e obtém o ID
      // Busca agora por email e retorna o ID e NOME
      const coordQuery = 'SELECT id, nome FROM qhos.coord WHERE email = $1 AND ativo = \'S\'';
      const coordResult = await pool.query(coordQuery, [email]);
      
      if (coordResult.rows.length === 0) {
          // Mensagem atualizada
          return res.status(400).json({ error: 'E-mail não encontrado no cadastro de coordenadores ativos. Contacte o RH.' });
      }
      
      // Guarda o ID encontrado para usar depois
      const coordenadorIdEncontrado = coordResult.rows[0].id;
      const coordenadorNomeEncontrado = coordResult.rows[0].nome;

      // 2. Verifica se este ID já se registou (usando o ID encontrado)
      const authCheck = await pool.query('SELECT 1 FROM qhos.coord_auth WHERE id_coordenador = $1', [coordenadorIdEncontrado]);
      if (authCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Este e-mail de coordenador já possui uma senha. Use a página de login.' });
      }
      
      // 3. Cria a senha (Hash) e guarda na tabela de autenticação (usando o ID encontrado)
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);
      
      const insertAuth = 'INSERT INTO qhos.coord_auth (id_coordenador, email, senha) VALUES ($1, $2, $3)';
      // Insere com o ID correto
      await pool.query(insertAuth, [coordenadorIdEncontrado, email, senhaHash]);
      
      // 4. Cria a sessão (Auto-login)
      req.session.user = {
          id: coordenadorIdEncontrado, // Usa o ID encontrado
          email: email,
          nome: coordenadorNomeEncontrado // Usa o Nome encontrado
      };
      
      console.log(`🔑 Novo registo de coordenador: ${email} (ID: ${coordenadorIdEncontrado})`);
      res.json({ success: true, message: 'Registo criado com sucesso!' });

  } catch (dbErr) {
      if (dbErr.code === '23505') { // UNIQUE constraint (provavelmente email)
           // Mensagem atualizada
          return res.status(400).json({ error: 'Este e-mail já foi registado.' });
      }
      console.error('Erro no registo:', dbErr);
      res.status(500).json({ error: 'Erro interno ao registar.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    if (!email || !senha) {
        return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    }

    try {
        // 1. Encontra o utilizador na tabela de autenticação
        const authQuery = 'SELECT id_coordenador, senha FROM qhos.coord_auth WHERE email = $1';
        const authResult = await pool.query(authQuery, [email]);
        
        if (authResult.rows.length === 0) {
            return res.status(400).json({ error: 'E-mail ou senha inválidos.' });
        }
        
        const userAuth = authResult.rows[0];
        
        // 2. Compara a senha enviada com o hash guardado
        const senhaCorreta = await bcrypt.compare(senha, userAuth.senha);
        if (!senhaCorreta) {
            return res.status(400).json({ error: 'E-mail ou senha inválidos.' });
        }
        
        // 3. Busca o nome na tabela 'qhos.coord'
        const coordQuery = 'SELECT nome FROM qhos.coord WHERE id = $1 AND ativo = \'S\'';
        const coordResult = await pool.query(coordQuery, [userAuth.id_coordenador]);
        
        if (coordResult.rows.length === 0) {
            return res.status(400).json({ error: 'Conta de coordenador inativa. Contacte o RH.' });
        }
        
        // 4. Cria a sessão
        req.session.user = {
            id: userAuth.id_coordenador,
            email: email,
            nome: coordResult.rows[0].nome
        };
        
        console.log(`🔒 Login bem-sucedido: ${email}`);
        res.json({ success: true, message: 'Login com sucesso!' });
        
    } catch (dbErr) {
        console.error('Erro no login:', dbErr);
        res.status(500).json({ error: 'Erro interno ao fazer login.' });
    }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Falha ao fazer logout.' });
        }
        res.clearCookie('connect.sid'); // Limpa o cookie da sessão
        res.json({ success: true, message: 'Logout com sucesso.' });
    });
});

// GET /api/auth/check (Verifica se está logado)
app.get('/api/auth/check', checkAuth, (req, res) => {
    // Se passou pelo 'checkAuth', está logado. Retorna os dados da sessão.
    res.json({ success: true, user: req.session.user });
});


// --- ROTAS NORMAIS DA API ---

// Endpoint para popular o formulário
app.get('/api/coordenadores', async (req, res) => {
    try {
        const query = 'SELECT id, nome, email, setor, escala FROM qhos.coord WHERE ativo = \'S\' ORDER BY nome';
        const { rows } = await pool.query(query);
        const coordenadoresParaSelect = rows.map(row => ({
            id: row.id.trim(),
            nome: row.nome.trim(),
            email: row.email,
            setor: row.setor.trim(),
            escala: row.escala ? row.escala.trim() : ''
        }));
        res.json(coordenadoresParaSelect);
    } catch (dbErr) {
        console.error('Erro ao buscar lista de coordenadores:', dbErr);
        res.status(500).json({ error: 'Erro ao carregar lista de coordenadores.' });
    }
});

// Endpoint do Admin (só vê atestados pós-coordenador)
app.get('/api/atestados', async (req, res) => {
    // NOTA: Esta rota ainda não está protegida por login (Admin)
    try {
        const query = "SELECT * FROM qhos.atestados WHERE status <> 'pendente_coordenador' ORDER BY data_envio DESC";
        const { rows } = await pool.query(query);
        res.json(rows.map(mapRowToAtestadoObject));
    } catch (dbErr) {
        console.error('Erro ao buscar atestados (admin):', dbErr);
        res.status(500).json({ error: 'Erro ao buscar atestados.' });
    }
});

// (REQ 3) Endpoint para a página do Coordenador (BUSCA O PRÓXIMO PENDENTE)
// Esta rota é PROTEGIDA
app.get('/api/coordenador/proximo-atestado', checkAuth, async (req, res) => {
    const coordenadorId = req.session.user.id; // ID do coordenador logado

    try {
        // Busca o atestado pendente mais antigo (FIFO) para este coordenador
        const query = `
            SELECT * FROM qhos.atestados 
            WHERE status = 'pendente_coordenador' AND coordenador_id = $1
            ORDER BY data_envio ASC 
            LIMIT 1;
        `;
        const { rows } = await pool.query(query, [coordenadorId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Nenhum atestado pendente encontrado.' });
        }
        
        res.json(mapRowToAtestadoObject(rows[0]));

    } catch (dbErr) {
        console.error('Erro ao buscar próximo atestado (coordenador):', dbErr);
        res.status(500).json({ error: 'Erro ao buscar atestado.' });
    }
});

// Endpoint do arquivo (usado pelo Admin e Coordenador)
// NOTA: Esta rota não está protegida por sessão para já, 
// para não quebrar o painel de Admin (que ainda não tem login).
app.get('/api/atestados/:id/arquivo', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  try {
      const query = "SELECT arquivo FROM qhos.atestados WHERE id = $1";
      const { rows } = await pool.query(query, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Atestado não encontrado' });
      
      const filePath = path.join(uploadDir, rows[0].arquivo);
      if (!fs.existsSync(filePath)) {
        console.error(`Arquivo não encontrado em: ${filePath}`);
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }
      res.sendFile(filePath);
      
  } catch (dbErr) {
      console.error('Erro ao buscar arquivo:', dbErr);
      res.status(500).json({ error: 'Erro ao buscar arquivo.' });
  }
});

// Endpoints de Ação do Coordenador (PROTEGIDOS)
app.post('/api/atestados/:id/coordenador/aprovar', checkAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const coordenadorLogadoId = req.session.user.id;
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    
    try {
        const atestadoQuery = "SELECT nome_funcionario, email, coordenador_id, coordenador_nome FROM qhos.atestados WHERE id = $1 AND status = 'pendente_coordenador'";
        const atestadoResult = await pool.query(atestadoQuery, [id]);
        if (atestadoResult.rows.length === 0) {
             return res.status(404).json({ error: 'Ação não permitida (atestado não pendente)' });
        }
        
        const atestado = atestadoResult.rows[0];
        
        // (REQ 3) Segurança: Verifica se o coordenador logado é o dono do atestado
        if (atestado.coordenador_id !== coordenadorLogadoId) {
             return res.status(403).json({ error: 'Acesso negado. Este atestado não pertence a si.' });
        }
        
        const updateQuery = `
            UPDATE qhos.atestados SET 
                status = 'pendente_admin', 
                validado_por_coordenador = true, 
                nome_coordenador_validador = $1, 
                data_validacao_coordenador = NOW()
            WHERE id = $2;
        `;
        await pool.query(updateQuery, [atestado.coordenador_nome, id]);
        
        console.log(`👍 Atestado ${id} PRÉ-APROVADO por Coordenador`);
        enviarEmailStatus({ 
            nomeFuncionario: atestado.nome_funcionario, 
            email: atestado.email 
        }, 'pre_aprovado').catch(console.error);
        
        res.json({ success: true, message: 'Atestado aprovado e encaminhado à Medicina do Trabalho (RH).' });

    } catch (dbErr) {
        console.error('Erro (Coordenador Aprovar):', dbErr);
        res.status(500).json({ error: 'Erro ao aprovar.' });
    }
});

app.post('/api/atestados/:id/coordenador/recusar', checkAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    const coordenadorLogadoId = req.session.user.id;
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo da recusa é obrigatório' });

    try {
        const atestadoQuery = "SELECT nome_funcionario, email, coordenador_id, coordenador_nome FROM qhos.atestados WHERE id = $1 AND status = 'pendente_coordenador'";
        const atestadoResult = await pool.query(atestadoQuery, [id]);
        if (atestadoResult.rows.length === 0) {
             return res.status(404).json({ error: 'Ação não permitida' });
        }
        
        const atestado = atestadoResult.rows[0];

        // (REQ 3) Segurança: Verifica se o coordenador logado é o dono do atestado
        if (atestado.coordenador_id !== coordenadorLogadoId) {
             return res.status(403).json({ error: 'Acesso negado. Este atestado não pertence a si.' });
        }
        
        const updateQuery = `
            UPDATE qhos.atestados SET 
                status = 'recusado', 
                validado_por_coordenador = false, 
                nome_coordenador_validador = $1, 
                motivo_recusa_coordenador = $2,
                data_validacao_coordenador = NOW()
            WHERE id = $3;
        `;
        await pool.query(updateQuery, [atestado.coordenador_nome, motivo, id]);
        
        console.log(`👎 Atestado ${id} RECUSADO por Coordenador`);
        enviarEmailStatus({ 
            nomeFuncionario: atestado.nome_funcionario, 
            email: atestado.email,
            nomeCoordenadorValidador: atestado.coordenador_nome
        }, 'recusado_coord', motivo).catch(console.error);
        
        res.json({ success: true, message: 'Atestado recusado com sucesso.' });
    } catch (dbErr) {
        console.error('Erro (Coordenador Recusar):', dbErr);
        res.status(500).json({ error: 'Erro ao recusar.' });
    }
});


// Endpoints de Ação do Admin (Medicina do Trabalho)
// (Rotas do Admin não estão protegidas POR ENQUANTO)
app.post('/api/atestados/:id/aprovar', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    
    try {
        const atestadoQuery = "SELECT nome_funcionario, email FROM qhos.atestados WHERE id = $1 AND status = 'pendente_admin'";
        const atestadoResult = await pool.query(atestadoQuery, [id]);
        if (atestadoResult.rows.length === 0) {
             return res.status(404).json({ error: 'Atestado não encontrado ou status inválido' });
        }
        
        const updateQuery = `
            UPDATE qhos.atestados SET 
                status = 'aprovado', 
                validado_por_admin = true, 
                nome_admin_validador = 'Medicina do Trabalho', 
                data_validacao_admin = NOW()
            WHERE id = $1;
        `;
        await pool.query(updateQuery, [id]);

        console.log(`✅ Atestado ${id} APROVADO (Final)`);
        enviarEmailStatus(atestadoResult.rows[0], 'aprovado_final').catch(console.error);
        res.json({ success: true, message: 'Atestado aprovado com sucesso' });

    } catch (dbErr) {
        console.error('Erro (Admin Aprovar):', dbErr);
        res.status(500).json({ error: 'Erro ao aprovar.' });
    }
});

app.post('/api/atestados/:id/recusar', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const { motivo } = req.body;
    if (!motivo) return res.status(400).json({ error: 'Motivo é obrigatório' });

    try {
        const atestadoQuery = "SELECT nome_funcionario, email FROM qhos.atestados WHERE id = $1 AND status = 'pendente_admin'";
        const atestadoResult = await pool.query(atestadoQuery, [id]);
        if (atestadoResult.rows.length === 0) {
             return res.status(404).json({ error: 'Atestado não encontrado ou status inválido' });
        }
        
        const updateQuery = `
            UPDATE qhos.atestados SET 
                status = 'recusado', 
                validado_por_admin = true, 
                nome_admin_validador = 'Medicina do Trabalho',
                motivo_recusa_admin = $1,
                data_validacao_admin = NOW()
            WHERE id = $2;
        `;
        await pool.query(updateQuery, [motivo, id]);

        console.log(`❌ Atestado ${id} RECUSADO (Final)`);
        enviarEmailStatus(atestadoResult.rows[0], 'recusado_final', motivo).catch(console.error);
        res.json({ success: true, message: 'Atestado recusado' });
        
    } catch (dbErr) {
        console.error('Erro (Admin Recusar):', dbErr);
        res.status(500).json({ error: 'Erro ao recusar.' });
    }
});

app.post('/api/atestados/:id/encaminhar', async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
    const { emails, mensagem } = req.body;
    if (!emails || emails.length === 0) return res.status(400).json({ error: 'Informe e-mail' });
    
    try {
        const { rows } = await pool.query("SELECT * FROM qhos.atestados WHERE id = $1", [id]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Atestado não encontrado' });
        }
        
        const atestado = mapRowToAtestadoObject(rows[0]);
        enviarEmailGestores(atestado, emails, mensagem, true).catch(console.error);
        
        const emailString = Array.isArray(emails) ? emails.join(', ') : emails;
        await pool.query("UPDATE qhos.atestados SET encaminhado_para = $1 WHERE id = $2", [emailString, id]);
        
        res.json({ success: true, message: `Atestado encaminhado com sucesso` });
        
    } catch (dbErr) {
        console.error('Erro (Admin Encaminhar):', dbErr);
        res.status(500).json({ error: 'Erro ao encaminhar.' });
    }
});

// Estatísticas para dashboard
app.get('/api/estatisticas', async (req, res) => {
    try {
        const query = `
            SELECT status, COUNT(*) AS contagem FROM qhos.atestados 
            WHERE status <> 'pendente_coordenador' GROUP BY status
        `;
        const { rows } = await pool.query(query);
        
        const stats = { total: 0, pendentes: 0, aprovados: 0, recusados: 0 };
        
        rows.forEach(row => {
            if (row.status === 'pendente_admin') stats.pendentes = parseInt(row.contagem, 10);
            if (row.status === 'aprovado') stats.aprovados = parseInt(row.contagem, 10);
            if (row.status === 'recusado') stats.recusados = parseInt(row.contagem, 10);
        });
        
        stats.total = stats.pendentes + stats.aprovados + stats.recusados;
        
        // (Lógica de 48h 'invalidos' ainda precisa ser implementada se necessário)
        stats.invalidados = 0; 
        
        res.json(stats);
        
    } catch (dbErr) {
        console.error('Erro ao buscar estatísticas:', dbErr);
        res.status(500).json({ error: 'Erro ao buscar estatísticas.' });
    }
});

// --- Funções de E-mail ---

async function enviarEmailCoordenador(atestado) {
  try {
    const emailCoordenador = atestado.coordenadorInfo.email;
    if (!emailCoordenador) {
        console.error(`Falha ao enviar e-mail: Coordenador ${atestado.coordenadorInfo.nome} não possui e-mail cadastrado no DB.`);
        return;
    }
    
    const assunto = `Atestado para Validação - ${atestado.nomeFuncionario}`;
    // (REQ 3) O link agora é genérico, levando ao portal de login/validação
    const linkValidacao = `${BASE_URL}/validar-atestado`;
    
    const mensagem = `
Prezado(a) ${atestado.coordenadorInfo.nome},

O colaborador ${atestado.nomeFuncionario} (Setor: ${atestado.setor}) enviou um atestado médico que aguarda a sua validação.

- Período: ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)} (${atestado.diasAfastamento} dias)
- Médico: ${atestado.nomeMedico} - CRM: ${atestado.crmMedico}

Por favor, aceda ao Portal de Validação para analisar e aprovar ou recusar o atestado:

Link do Portal:
${linkValidacao}

(Se for o seu primeiro acesso, haverá um link para criar a sua senha).

Atenciosamente,
Sistema de Atestados
    `.trim();

    await transporter.sendMail({
      from: '"Sistema de Atestados" <hmanotificacoes@gmail.com>',
      to: emailCoordenador,
      subject: assunto,
      text: mensagem
    });
    console.log(`📧 E-mail de VALIDAÇÃO enviado para ${emailCoordenador}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email para coordenador:', error.message);
  }
}

async function enviarEmailRecebimento(atestado) {
  try {
    const assunto = 'Atestado Recebido - Aguardando Coordenador';
    const mensagem = `
Prezado(a) ${atestado.nomeFuncionario},
Recebemos o seu atestado médico.
Ele foi encaminhado para o seu coordenador(a) (${atestado.coordenadorInfo.nome}) para validação prévia.
Você será notificado assim que houver uma atualização.
Atenciosamente,
Medicina do Trabalho
    `.trim();
    await transporter.sendMail({
      from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>',
      to: atestado.email,
      subject: assunto,
      text: mensagem
    });
    console.log(`📧 Email de recebimento (aguardando coord) enviado para ${atestado.email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de recebimento:', error.message);
  }
}

async function enviarEmailStatus(atestado, status, motivoRecusa = '') {
  try {
    let assunto = '';
    let mensagem = '';
    switch (status) {
      case 'pre_aprovado':
        assunto = 'Atestado Pré-Aprovado pelo Coordenador';
        mensagem = `Prezado(a) ${atestado.nomeFuncionario},
Seu atestado foi APROVADO pelo seu coordenador(a) e encaminhado para análise final da Medicina do Trabalho (RH).
Você receberá uma confirmação final em breve.
Atenciosamente,
Medicina do Trabalho`;
        break;
      case 'recusado_coord':
        assunto = 'Atestado Recusado pelo Coordenador';
        mensagem = `Prezado(a) ${atestado.nomeFuncionario},
Seu atestado foi RECUSADO pelo seu coordenador(a) (${atestado.nomeCoordenadorValidador}).
Motivo: ${motivoRecusa || 'Não especificado'}
Por favor, verifique com seu coordenador ou envie um novo atestado se for o caso.
Atenciosamente,
Medicina do Trabalho`;
        break;
      case 'aprovado_final':
        assunto = 'Atestado Aprovado';
        mensagem = `Prezado(a) ${atestado.nomeFuncionario},
Seu atestado médico foi APROVADO final pela Medicina do Trabalho.
Atenciosamente,
Medicina do Trabalho`;
        break;
      case 'recusado_final':
        assunto = 'Atestado Recusado';
        mensagem = `Prezado(a) ${atestado.nomeFuncionario},
Após análise, seu atestado foi RECUSADO pela Medicina do Trabalho.
Motivo: ${motivoRecusa || 'Não especificado'}
Por favor, entre em contato com a Medicina do Trabalho (RH) para mais informações.
Atenciosamente,
Medicina do Trabalho`;
        break;
      default: return;
    }
    await transporter.sendMail({
      from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>',
      to: atestado.email,
      subject: assunto,
      text: mensagem.trim()
    });
    console.log(`📧 Email de status (${status}) enviado para ${atestado.email}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar email de ${status}:`, error.message);
  }
}

async function enviarEmailGestores(atestado, emails, mensagemPersonalizada = '', anexo = false) {
  try {
    const assunto = `Atestado para Ciência - ${atestado.nomeFuncionario}`;
    const mensagemBase = `
Prezado(s),
Segue atestado médico do colaborador ${atestado.nomeFuncionario} para ciência.
Colaborador: ${atestado.nomeFuncionario}
Setor: ${atestado.setor || 'Não informado'}
Período: ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}
Dias: ${atestado.diasAfastamento || 'N/A'}
Status: ${atestado.status.toUpperCase()}
Validado por (Coord): ${atestado.nomeCoordenadorValidador || 'N/A'}
Validado por (RH): ${atestado.nomeAdminValidador || 'N/A'}
${mensagemPersonalizada ? `Observação: ${mensagemPersonalizada}\n\n` : ''}
Atenciosamente,
Medicina do Trabalho
    `.trim();
    let emailOptions = {
      from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>',
      to: emails.join(', '),
      subject: assunto,
      text: mensagemBase
    };
    if (anexo) {
        emailOptions.attachments = [{
            filename: atestado.arquivo,
            path: path.join(uploadDir, atestado.arquivo)
        }];
    }
    await transporter.sendMail(emailOptions);
    console.log(`📧 Email (Admin) encaminhado para: ${emails.join(', ')}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email para gestores:', error.message);
  }
}

// --- Funções Auxiliares ---
function formatarData(dataString) {
    if (!dataString) return 'N/A';
    return new Date(dataString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function mapRowToAtestadoObject(row) {
    return {
        id: row.id,
        nomeFuncionario: row.nome_funcionario,
        email: row.email,
        setor: row.setor,
        hospital: row.hospital,
        dataEmissao: row.data_emissao,
        dataInicio: row.data_inicio,
        dataFim: row.data_fim,
        diasAfastamento: row.dias_afastamento,
        nomeMedico: row.nome_medico,
        crmMedico: row.crm_medico,
        arquivo: row.arquivo,
        dataEnvio: row.data_envio,
        valido: row.valido,
        coordenadorInfo: { nome: row.coordenador_nome, email: row.coordenador_email },
        status: row.status,
        validadoPorCoordenador: row.validado_por_coordenador,
        nomeCoordenadorValidador: row.nome_coordenador_validador,
        dataValidacaoCoordenador: row.data_validacao_coordenador,
        motivoRecusaCoordenador: row.motivo_recusa_coordenador,
        validadoPorAdmin: row.validado_por_admin,
        nomeAdminValidador: row.nome_admin_validador,
        dataValidacaoAdmin: row.data_validacao_admin,
        motivoRecusaAdmin: row.motivo_recusa_admin,
        encaminhadoPara: row.encaminhado_para
    };
}

// Rota de limpeza (DEV)
app.delete('/api/atestados', async (req, res) => {
  try {
    await pool.query('TRUNCATE TABLE qhos.atestados RESTART IDENTITY');
    // NOTA: Não limpa a tabela de autenticação (qhos.coord_auth)
    if (fs.existsSync(uploadDir)) {
      fs.readdirSync(uploadDir).forEach(file => {
        fs.unlinkSync(path.join(uploadDir, file));
      });
    }
    res.json({ success: true, message: 'Todos os atestados e arquivos foram removidos' });
  } catch (err) {
    console.error("Falha ao limpar:", err);
    res.status(500).json({ success: false, message: 'Falha ao limpar. Verifique permissões do DB (TRUNCATE).' });
  }
});

// Start do servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`👤 Acesso Colaborador: http://localhost:${PORT}`);
  console.log(`⚙️  Acesso Admin: http://localhost:${PORT}/admin`);
  console.log(`🔑 Acesso Coordenador: http://localhost:${PORT}/validar-atestado`);
  console.log(`📁 Uploads salvos em: ${uploadDir}`);
});