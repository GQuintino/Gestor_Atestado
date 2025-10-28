const express = require('express');
const multer = require('multer');
const nodemailer = require('nodemailer');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'atestado-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.jpg', '.jpeg', '.png'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos PDF, JPG, JPEG e PNG são permitidos'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Armazenamento em memória
let atestados = [];
let nextId = 1;

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com', // Servidor SMTP
  port: 587, // ou 465 para SSL
  secure: false, // true para porta 465, false para outras
  auth: {
      user: 'hmanotificacoes@gmail.com', // Seu e-mail
      pass: 'tkkk wtdw cudm qapc'      // Sua senha de e-mail ou senha de app
  }
});

// Função para validar data do atestado (48 horas)
function isAtestadoValido(dataEmissao) {
  const dataEmissaoObj = new Date(dataEmissao);
  const agora = new Date();
  const diferencaHoras = (agora - dataEmissaoObj) / (1000 * 60 * 60);
  return diferencaHoras <= 48;
}

// Rotas Públicas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Upload do atestado
app.post('/upload-atestado', upload.single('atestadoFile'), (req, res) => {
  try {
    const {
      nomeFuncionario,
      dataInicio,
      dataFim,
      dataEmissao,
      nomeMedico,
      crmMedico,
      email,
      coordenador
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo do atestado é obrigatório' });
    }

    // Validar data de emissão (48 horas)
    if (!isAtestadoValido(dataEmissao)) {
      return res.status(400).json({ 
        error: 'Atestado com mais de 48 horas de emissão não é válido. Por favor, solicite um atestado mais recente.' 
      });
    }

    const novoAtestado = {
      id: nextId++,
      nomeFuncionario,
      dataInicio,
      dataFim,
      dataEmissao,
      nomeMedico,
      crmMedico,
      email,
      coordenador,
      arquivo: req.file.filename,
      status: 'pendente',
      dataEnvio: new Date().toISOString(),
      valido: true
    };

    atestados.push(novoAtestado);

    console.log('✅ Novo atestado recebido:', novoAtestado.nomeFuncionario);

    // Enviar email de confirmação de recebimento
    enviarEmailRecebimento(novoAtestado).catch(console.error);

    res.json({
      success: true,
      message: 'Atestado enviado com sucesso! Aguarde a validação.',
      id: novoAtestado.id
    });

  } catch (error) {
    console.error('❌ Erro no upload:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// API Routes - Admin
app.get('/api/atestados', (req, res) => {
  res.json(atestados);
});

app.get('/api/atestados/:id/arquivo', (req, res) => {
  const id = parseInt(req.params.id);
  const atestado = atestados.find(a => a.id === id);

  if (!atestado) {
    return res.status(404).json({ error: 'Atestado não encontrado' });
  }

  const filePath = path.join(__dirname, 'uploads', atestado.arquivo);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Arquivo não encontrado' });
  }

  res.sendFile(filePath);
});

// Aprovar atestado
app.post('/api/atestados/:id/aprovar', (req, res) => {
  const id = parseInt(req.params.id);
  const atestado = atestados.find(a => a.id === id);

  if (!atestado) {
    return res.status(404).json({ error: 'Atestado não encontrado' });
  }

  atestado.status = 'aprovado';
  atestado.dataValidacao = new Date().toISOString();
  atestado.validadoPor = 'Administrador';

  console.log(`✅ Atestado ${id} aprovado`);

  // Enviar email de aprovação
  enviarEmailStatus(atestado, 'aprovado').catch(console.error);

  res.json({ success: true, message: 'Atestado aprovado com sucesso' });
});

// Recusar atestado
app.post('/api/atestados/:id/recusar', (req, res) => {
  const id = parseInt(req.params.id);
  const { motivo } = req.body;
  const atestado = atestados.find(a => a.id === id);

  if (!atestado) {
    return res.status(404).json({ error: 'Atestado não encontrado' });
  }

  atestado.status = 'recusado';
  atestado.dataValidacao = new Date().toISOString();
  atestado.motivoRecusa = motivo;
  atestado.validadoPor = 'Administrador';

  console.log(`❌ Atestado ${id} recusado: ${motivo}`);

  // Enviar email de recusa
  enviarEmailStatus(atestado, 'recusado', motivo).catch(console.error);

  res.json({ success: true, message: 'Atestado recusado' });
});

// Encaminhar para gestor(es)
app.post('/api/atestados/:id/encaminhar', (req, res) => {
  const id = parseInt(req.params.id);
  const { emails, mensagem } = req.body;
  const atestado = atestados.find(a => a.id === id);

  if (!atestado) {
    return res.status(404).json({ error: 'Atestado não encontrado' });
  }

  if (!emails || emails.length === 0) {
    return res.status(400).json({ error: 'Informe pelo menos um email' });
  }

  // Enviar email para gestor(es)
  enviarEmailGestores(atestado, emails, mensagem).catch(console.error);

  atestado.encaminhadoPara = emails;
  atestado.dataEncaminhamento = new Date().toISOString();

  console.log(`📤 Atestado ${id} encaminhado para: ${emails.join(', ')}`);

  res.json({ 
    success: true, 
    message: `Atestado encaminhado para ${emails.length} gestor(es) com sucesso` 
  });
});

// Estatísticas para dashboard
app.get('/api/estatisticas', (req, res) => {
  const total = atestados.length;
  const pendentes = atestados.filter(a => a.status === 'pendente').length;
  const aprovados = atestados.filter(a => a.status === 'aprovado').length;
  const recusados = atestados.filter(a => a.status === 'recusado').length;
  const invalidados = atestados.filter(a => !a.valido).length;

  res.json({
    total,
    pendentes,
    aprovados,
    recusados,
    invalidados
  });
});

// Função para enviar email de recebimento
async function enviarEmailRecebimento(atestado) {
  try {
    const assunto = 'Atestado Recebido - Em Análise';
    
    const mensagem = `
Prezado(a) ${atestado.nomeFuncionario},

Recebemos o seu atestado médico com os seguintes dados:
- Período: ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}
- Data de Emissão: ${formatarData(atestado.dataEmissao)}
- Médico: ${atestado.nomeMedico} - CRM: ${atestado.crmMedico}

Seu atestado está em fase de análise e você será notificado sobre o resultado em breve.

Atenciosamente,
Equipe de RH
    `.trim();

    const info = await transporter.sendMail({
      from: 'sistema@empresa.com',
      to: atestado.email,
      subject: assunto,
      text: mensagem
    });

    console.log(`📧 Email de recebimento enviado para ${atestado.email}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email de recebimento:', error.message);
  }
}

// Função para enviar email de status
async function enviarEmailStatus(atestado, status, motivoRecusa = '') {
  try {
    const assunto = status === 'aprovado' 
      ? 'Atestado Médico Aprovado' 
      : 'Atestado Médico Recusado';

    const mensagem = status === 'aprovado'
      ? `Prezado(a) ${atestado.nomeFuncionario},

Seu atestado médico do período ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)} foi APROVADO.

Atenciosamente,
Equipe de RH`
      : `Prezado(a) ${atestado.nomeFuncionario},

Seu atestado médico do período ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)} foi RECUSADO.

Motivo: ${motivoRecusa || 'Não especificado'}

Por favor, entre em contato com o RH para mais informações.

Atenciosamente,
Equipe de RH`;

    await transporter.sendMail({
      from: 'sistema@empresa.com',
      to: atestado.email,
      subject: assunto,
      text: mensagem
    });

    console.log(`📧 Email de ${status} enviado para ${atestado.email}`);
  } catch (error) {
    console.error(`❌ Erro ao enviar email de ${status}:`, error.message);
  }
}

// Função para enviar email para gestores
async function enviarEmailGestores(atestado, emails, mensagemPersonalizada = '') {
  try {
    const assunto = `Atestado para Aprovação - ${atestado.nomeFuncionario}`;
    
    const mensagemBase = `
Prezado(s) Gestor(es),

Há um atestado médico pendente de aprovação:

Colaborador: ${atestado.nomeFuncionario}
Período: ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}
Data de Emissão: ${formatarData(atestado.dataEmissao)}
Médico: ${atestado.nomeMedico} - CRM: ${atestado.crmMedico}
Coordenador: ${atestado.coordenador}

${mensagemPersonalizada ? `Observação: ${mensagemPersonalizada}\n\n` : ''}
Por favor, acesse o sistema administrativo para validar este atestado.

Atenciosamente,
Equipe de RH
    `.trim();

    await transporter.sendMail({
      from: 'sistema@empresa.com',
      to: emails.join(', '),
      subject: assunto,
      text: mensagemBase
    });

    console.log(`📧 Email encaminhado para gestores: ${emails.join(', ')}`);
  } catch (error) {
    console.error('❌ Erro ao enviar email para gestores:', error.message);
  }
}

// Função auxiliar para formatar data
function formatarData(dataString) {
  return new Date(dataString).toLocaleDateString('pt-BR');
}

// Rota para limpar atestados (apenas para desenvolvimento)
app.delete('/api/atestados', (req, res) => {
  atestados = [];
  nextId = 1;
  res.json({ success: true, message: 'Todos os atestados foram removidos' });
});

// Rota de saúde do servidor
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    atestados: atestados.length
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`👤 Acesso Colaborador: http://localhost:${PORT}`);
  console.log(`⚙️  Acesso Admin: http://localhost:${PORT}/admin`);
  console.log(`📁 Uploads salvos em: ${path.join(__dirname, 'uploads')}`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});