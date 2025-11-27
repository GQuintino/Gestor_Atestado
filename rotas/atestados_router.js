const express = require('express');
const path = require('path');
const fs = require('fs');

// Função principal que recebe as 4 dependências (sem bcrypt)
function createAtestadosRouter(poolDash, transporter, uploadAtestado, logAndRespondError) {
    const router = express.Router();
    const BASE_URL_ATEestados = '/atestados';

    console.log("🧭 Definindo Rotas do Módulo de Atestados (Modo TOKEN v3)...");

    // --- Middleware de Autenticação (Token) ---
    const checkTokenCoord = async (req, res, next) => {
        const endpointName = 'checkTokenCoord';
        const { token } = req.params; 
        if (!token) {
            console.warn(`[AUTH TOKEN] Acesso negado: Token não fornecido.`);
            return res.status(401).json({ error: 'Token de acesso não fornecido.' });
        }
        try {
            const coordCheckQuery = 'SELECT id, nome, email FROM qhos.coord WHERE token_acesso = $1 AND ativo = \'S\'';
            const coordResult = await poolDash.query(coordCheckQuery, [token]);
            if (coordResult.rows.length > 0) {
                const coordInfo = coordResult.rows[0];
                req.coordinator = {
                     id: coordInfo.id.trim(),
                     nome: coordInfo.nome.trim(),
                     email: coordInfo.email 
                };
                console.log(`[AUTH TOKEN] Coordenador ${coordInfo.nome} (ID: ${coordInfo.id}) verificado.`);
                next();
            } else {
                console.warn(`[AUTH TOKEN] Acesso negado: Token inválido ou coordenador inativo.`);
                if (req.path.includes('/api/')) {
                    return res.status(403).json({ error: 'Acesso negado. Token inválido.'});
                }
                res.status(403).sendFile(path.join(__dirname, '../public/atestados', 'acesso_negado.html'));
            }
        } catch (dbErr) {
            logAndRespondError(res, dbErr, endpointName);
        }
    };

    // --- Constantes e Funções Auxiliares ---
    const uploadDirAtestados = '/mnt/public/uploads'; 
    function isAtestadoValido(dataEmissao) {
        if (!dataEmissao) return false;
        try {
            const dataEmissaoObj = new Date(dataEmissao + 'T23:59:59.999');           
            const agora = new Date();
            const diferencaMs = agora - dataEmissaoObj;  
            const limite48hMs = 48 * 60 * 60 * 1000;
            return diferencaMs <= limite48hMs;   
        } catch(e) { console.error("Erro ao validar data de emissão:", e); return false; }
    }
    function formatarData(dataString) {
        if (!dataString) return 'N/A';
        try {
            const dataObj = new Date(dataString);
            return dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        } catch(e) { return 'Data Inválida'; }
    }
    function mapRowToAtestadoObject(row) {
        if (!row) return null;
        return {
            id: row.id, nomeFuncionario: row.nome_funcionario, email: row.email,
            setor: row.setor, hospital: row.hospital, dataEmissao: row.data_emissao,
            dataInicio: row.data_inicio, dataFim: row.data_fim, diasAfastamento: row.dias_afastamento,
            nomeMedico: row.nome_medico, crmMedico: row.crm_medico, arquivo: row.arquivo,
            dataEnvio: row.data_envio, valido: row.valido,
            coordenadorInfo: { nome: row.coordenador_nome, email: row.coordenador_email },
            status: row.status, validadoPorCoordenador: row.validado_por_coordenador,
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

    // --- Funções de E-mail (com correção do Link Mágico) ---
    async function enviarEmailCoordenador(atestado, req) { 
      try {
        const emailCoordenador = atestado.coordenadorInfo.email;
        if (!emailCoordenador) {
            console.error(`[ATEestados_EMAIL] Falha: Coordenador ${atestado.coordenadorInfo.nome} sem e-mail.`); return;
        }
        const coordenadorId = atestado.coordenadorInfo.id;
        if (!coordenadorId) {
             console.error(`[ATEestados_EMAIL] Falha: ID do Coordenador não fornecido.`); return;
        }
        const tokenQuery = 'SELECT token_acesso FROM qhos.coord WHERE id = $1 AND ativo = \'S\'';
        const tokenResult = await poolDash.query(tokenQuery, [coordenadorId]);
        if (tokenResult.rows.length === 0 || !tokenResult.rows[0].token_acesso) {
            console.error(`[ATEestados_EMAIL] Falha: Token não encontrado para Coordenador ID ${coordenadorId}.`); return;
        }
        const tokenCoordenador = tokenResult.rows[0].token_acesso;
        const assunto = `Atestado para Validação - ${atestado.nomeFuncionario}`;
        const linkValidacao = `${req.protocol}://${req.get('host')}${BASE_URL_ATEestados}/validar/${tokenCoordenador}`;
        const mensagem = `
Prezado(a) ${atestado.coordenadorInfo.nome},
O colaborador ${atestado.nomeFuncionario} (Setor: ${atestado.setor || 'N/I'}) enviou um atestado médico que aguarda a sua validação.
- Período: ${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)} (${atestado.diasAfastamento || 'N/A'} dias)
- Médico: ${atestado.nomeMedico || 'N/I'} - CRM: ${atestado.crmMedico || 'N/I'}
Por favor, aceda ao seu portal de validação através do link abaixo:
Link de Acesso Direto:
${linkValidacao}
Atenciosamente,
Sistema de Atestados`.trim();
        await transporter.sendMail({
          from: '"Sistema de Atestados" <hmanotificacoes@gmail.com>',
          to: emailCoordenador, subject: assunto, text: mensagem
        });
        console.log(`[ATEestados_EMAIL] Validação (Link Mágico) enviado para ${emailCoordenador}`);
      } catch (error) { console.error('[ATEestados_EMAIL] Erro Coordenador (Token):', error.message); }
    }
    // (As outras 3 funções de e-mail - enviarEmailRecebimento, enviarEmailStatus, enviarEmailGestores - continuam aqui, sem alterações)
    async function enviarEmailRecebimento(atestado) {
        try {
            const assunto = 'Atestado Recebido - Aguardando Coordenador';
            const mensagem = `
Prezado(a) ${atestado.nomeFuncionario},
Recebemos o seu atestado médico. Ele foi encaminhado para o seu coordenador(a) (${atestado.coordenadorInfo.nome}) para validação prévia.
Você será notificado assim que houver uma atualização.
Atenciosamente,
Medicina do Trabalho`.trim();
            await transporter.sendMail({ from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>', to: atestado.email, subject: assunto, text: mensagem });
            console.log(`[ATEestados_EMAIL] Recebimento (aguardando coord) enviado para ${atestado.email}`);
        } catch (error) { console.error('[ATEestados_EMAIL] Erro Recebimento:', error.message); }
    }
    async function enviarEmailStatus(atestado, status, motivoRecusa = '') {
      try {
        let assunto = ''; let mensagem = '';
        switch (status) {
          case 'pre_aprovado':
            assunto = 'Atestado Pré-Aprovado pelo Coordenador';
            mensagem = `Prezado(a) ${atestado.nomeFuncionario}, Seu atestado foi APROVADO pelo seu coordenador(a) e encaminhado para análise final da Medicina do Trabalho (RH). Você receberá uma confirmação final em breve. Atenciosamente, Medicina do Trabalho`;
            break;
          case 'recusado_coord':
            assunto = 'Atestado Recusado pelo Coordenador';
            mensagem = `Prezado(a) ${atestado.nomeFuncionario}, Seu atestado foi RECUSADO pelo seu coordenador(a) (${atestado.nomeCoordenadorValidador || 'N/I'}). Motivo: ${motivoRecusa || 'Não especificado'}. Por favor, verifique com seu coordenador ou envie um novo atestado se for o caso. Atenciosamente, Medicina do Trabalho`;
            break;
          case 'aprovado_final':
            assunto = 'Atestado Aprovado';
            mensagem = `Prezado(a) ${atestado.nomeFuncionario}, Seu atestado médico foi APROVADO final pela Medicina do Trabalho. Atenciosamente, Medicina do Trabalho`;
            break;
          case 'recusado_final':
            assunto = 'Atestado Recusado';
            mensagem = `Prezado(a) ${atestado.nomeFuncionario}, Após análise, seu atestado foi RECUSADO pela Medicina do Trabalho. Motivo: ${motivoRecusa || 'Não especificado'}. Por favor, entre em contato com a Medicina do Trabalho (RH) para mais informações. Atenciosamente, Medicina do Trabalho`;
            break;
          default: return;
        }
        await transporter.sendMail({ from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>', to: atestado.email, subject: assunto, text: mensagem.trim() });
        console.log(`[ATEestados_EMAIL] Status (${status}) enviado para ${atestado.email}`);
      } catch (error) { console.error(`[ATEestados_EMAIL] Erro Status ${status}:`, error.message); }
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
Status: ${atestado.status ? atestado.status.toUpperCase() : 'N/A'}
Validado por (Coord): ${atestado.nomeCoordenadorValidador || 'N/A'}
Validado por (RH): ${atestado.nomeAdminValidador || 'N/A'}
${mensagemPersonalizada ? `Observação: ${mensagemPersonalizada}\n\n` : ''}
Atenciosamente,
Medicina do Trabalho`.trim();
        let emailOptions = { from: '"Medicina do Trabalho" <hmanotificacoes@gmail.com>', to: emails.join(', '), subject: assunto, text: mensagemBase };
        if (anexo && atestado.arquivo) {
            const filePath = path.join(uploadDirAtestados, atestado.arquivo);
            if (fs.existsSync(filePath)) {
                emailOptions.attachments = [{ filename: atestado.arquivo, path: filePath }];
            } else {
                 console.warn(`[ATEestados_EMAIL] Anexo não encontrado: ${filePath}`);
            }
        }
        await transporter.sendMail(emailOptions);
        console.log(`[ATEestados_EMAIL] Encaminhamento (Admin) para: ${emails.join(', ')}`);
      } catch (error) { console.error('[ATEestados_EMAIL] Erro Gestores:', error.message); }
    }


    // --- ROTAS PÚBLICAS (Páginas e APIs) ---
    router.use(express.static(path.join(__dirname, '../public/atestados')));
    router.get('/', (req, res) => res.redirect(`${BASE_URL_ATEestados}/index.html`));

    // API pública para o formulário
    router.get('/api/coordenadores', async (req, res) => {
        const endpointName = '/api/coordenadores';
        try {
            const query = 'SELECT id, nome, email, setor, escala FROM qhos.coord WHERE ativo = \'S\' ORDER BY nome';
            const { rows } = await poolDash.query(query);
            const data = rows.map(row => ({
                id: row.id ? row.id.trim() : null,
                nome: row.nome ? row.nome.trim() : 'Nome Inválido',
                setor: row.setor ? row.setor.trim() : '',
                escala: row.escala ? row.escala.trim() : ''
            }));
            res.json(data); 
        } catch (dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    // API pública de Upload
    router.post('/api/upload-atestado', uploadAtestado.single('atestadoFile'), async (req, res) => {
        const endpointName = '/api/upload-atestado';
        
        // --- INÍCIO DOS NOVOS LOGS ---
        console.log(`[${endpointName}] Rota iniciada.`);
        console.log(`[${endpointName}] Verificando req.file...`);
        
        if (!req.file) {
            console.warn(`[${endpointName}] ERRO: req.file é NULO ou indefinido. O upload falhou (provavelmente filtro de tipo de ficheiro ou erro no multer).`);
            // O 'return' original já está aqui
            return res.status(400).json({ error: 'Arquivo do atestado é obrigatório' });
        }
        
        // Se req.file existe, o multer tentou salvar.
        console.log(`[${endpointName}] SUCESSO: req.file existe.`);
        console.log(`[${endpointName}] Conteúdo de req.file:`, JSON.stringify(req.file, null, 2));

        // Verificação de disco IMEDIATA
        // (Usa a variável uploadDirAtestados definida no topo deste ficheiro, linha 50)
        const caminhoCompleto = path.join(uploadDirAtestados, req.file.filename);
        console.log(`[${endpointName}] Verificando existência do ficheiro em: ${caminhoCompleto}`);
        
        try {
            const ficheiroExiste = fs.existsSync(caminhoCompleto);
            console.log(`[${endpointName}] Resultado do fs.existsSync: ${ficheiroExiste}`);
            
            if (!ficheiroExiste) {
                console.error(`[${endpointName}] ALERTA CRÍTICO! req.file existe, mas o ficheiro não foi encontrado em ${caminhoCompleto}.`);
                console.error(`[${endpointName}] VERIFIQUE AS PERMISSÕES DE ESCRITA (WRITE) do utilizador Node.js na pasta montada: ${uploadDirAtestados}`);
                // Nota: Continuamos o processo para salvar no DB, mas logámos o erro crítico.
            }
        } catch (fsErr) {
            console.error(`[${endpointName}] Erro ao tentar verificar o ficheiro com fs.existsSync: ${fsErr.message}`);
        }
        try {
            const { nomeFuncionario, dataInicio, dataFim, dataEmissao, nomeMedico, crmMedico, email, coordenadorId, setor, hospital } = req.body;
            if (!req.file) return res.status(400).json({ error: 'Arquivo do atestado é obrigatório' });
            if (!isAtestadoValido(dataEmissao)) return res.status(400).json({ error: 'Atestado com mais de 48 horas.' });
            let coordenadorSelecionado;
            try {
                const query = 'SELECT nome, email FROM qhos.coord WHERE id = $1 AND ativo = \'S\'';
                const coordResult = await poolDash.query(query, [coordenadorId]);
                if (coordResult.rows.length === 0) return res.status(400).json({ error: 'Coordenador selecionado não é válido ou está inativo.' });
                coordenadorSelecionado = coordResult.rows[0];
            } catch (dbErr) { return logAndRespondError(res, dbErr, `${endpointName} (buscar coordenador)`); }
            let diasAfastamento = 0;
            try { diasAfastamento = Math.ceil(Math.abs(new Date(dataFim + 'T00:00:00') - new Date(dataInicio + 'T00:00:00')) / (1000 * 60 * 60 * 24)) + 1; } catch(e){}
            const insertQuery = `INSERT INTO qhos.atestados (nome_funcionario, email, setor, hospital, data_emissao, data_inicio, data_fim, dias_afastamento, nome_medico, crm_medico, arquivo, coordenador_id, coordenador_nome, coordenador_email, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id;`;
            const valores = [nomeFuncionario, email, setor, hospital, dataEmissao, dataInicio, dataFim, diasAfastamento || null, nomeMedico, crmMedico, req.file.filename, coordenadorId, coordenadorSelecionado.nome, coordenadorSelecionado.email, 'pendente_coordenador'];
            const insertResult = await poolDash.query(insertQuery, valores);
            const novoAtestadoId = insertResult.rows[0].id;
            console.log(`[ATEestados] Atestado (ID: ${novoAtestadoId}) salvo no DB.`);
            const dadosParaEmail = { id: novoAtestadoId, nomeFuncionario, email, setor, dataInicio, dataFim, diasAfastamento, nomeMedico, crmMedico, coordenadorInfo: { id: coordenadorId, nome: coordenadorSelecionado.nome, email: coordenadorSelecionado.email } };
            enviarEmailRecebimento(dadosParaEmail).catch(console.error);
            enviarEmailCoordenador(dadosParaEmail, req).catch(console.error);
            res.json({ success: true, message: 'Atestado enviado! Aguardando validação do seu coordenador.', id: novoAtestadoId });
        } catch (error) { logAndRespondError(res, error, endpointName); }
    });

    // API pública de arquivo (usada pelo Admin e Coordenador)
    router.get('/api/atestados/:id/arquivo', async (req, res) => {
        const endpointName = '/api/atestados/:id/arquivo';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        try {
            const query = "SELECT arquivo FROM qhos.atestados WHERE id = $1";
            const { rows } = await poolDash.query(query, [id]);
            if (rows.length === 0) return res.status(404).json({ error: 'Atestado não encontrado' });
            const filePath = path.join(uploadDirAtestados, rows[0].arquivo);
            if (!fs.existsSync(filePath)) {
                console.error(`[${endpointName}] Arquivo não encontrado em: ${filePath}`);
                return res.status(404).json({ error: 'Arquivo físico não encontrado no servidor' });
            }
            res.sendFile(filePath);
        } catch (dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });


    // --- ROTAS PROTEGIDAS (Coordenador - por Token) ---
    
    // Página do Coordenador
    router.get('/validar/:token', checkTokenCoord, (req, res) => {
        res.sendFile(path.join(__dirname, '../public/atestados', 'coordenador.html'));
    });

    // API: Obter info do Coordenador (Nome)
    router.get('/api/coordenador/:token/info', checkTokenCoord, (req, res) => {
        res.json({ nome: req.coordinator.nome });
    });

    // API: Obter  atestado da fila (coord)
    router.get('/api/coordenador/:token/meus-atestados', checkTokenCoord, async (req, res) => {
        const endpointName = '/api/coordenador/meus-atestados';
        const coordenadorId = req.coordinator.id; 
        try {
            // Busca todos os atestados vinculados a este coordenador
            const query = `
                SELECT * FROM qhos.atestados 
                WHERE coordenador_id = $1 
                ORDER BY 
                    CASE WHEN status = 'pendente_coordenador' THEN 1 ELSE 2 END, 
                    data_envio DESC;
            `;
            const { rows } = await poolDash.query(query, [coordenadorId]);
            
            // Mapeia os resultados para o formato de objeto
            res.json(rows.map(mapRowToAtestadoObject));
            
        } catch (dbErr) { 
            logAndRespondError(res, dbErr, endpointName); 
        }
    });

    // API: Aprovar (Coordenador)
    // (CORRIGIDO - A rota agora é '/:id/aprovar')
    router.post('/api/coordenador/:token/atestados/:id/aprovar', checkTokenCoord, async (req, res) => {
        const endpointName = '/api/coordenador/:id/aprovar';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        const coordenadorLogadoId = req.coordinator.id;
        const coordenadorLogadoNome = req.coordinator.nome;
        const client = await poolDash.connect();
        try {
            await client.query('BEGIN');
            const atestadoQuery = "SELECT nome_funcionario, email, coordenador_id FROM qhos.atestados WHERE id = $1 AND status = 'pendente_coordenador' FOR UPDATE";
            const { rows } = await client.query(atestadoQuery, [id]);
            if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ação não permitida (atestado já processado)' }); }
            const atestado = rows[0];
            if (atestado.coordenador_id !== coordenadorLogadoId) { 
                await client.query('ROLLBACK'); 
                return res.status(403).json({ error: 'Acesso negado. Este atestado não pertence a si.' }); 
            }
            const updateQuery = `UPDATE qhos.atestados SET status = 'pendente_admin', validado_por_coordenador = true, nome_coordenador_validador = $1, data_validacao_coordenador = NOW() WHERE id = $2;`;
            await client.query(updateQuery, [coordenadorLogadoNome, id]);
            await client.query('COMMIT');
            enviarEmailStatus({ nomeFuncionario: atestado.nome_funcionario, email: atestado.email }, 'pre_aprovado').catch(console.error);
            res.json({ success: true, message: 'Atestado aprovado e encaminhado ao RH.' });
        } catch (dbErr) { await client.query('ROLLBACK'); logAndRespondError(res, dbErr, endpointName); }
        finally { client.release(); }
    });

    // API: Recusar (Coordenador)
    // (CORRIGIDO - A rota agora é '/:id/recusar')
    router.post('/api/coordenador/:token/atestados/:id/recusar', checkTokenCoord, async (req, res) => {
        const endpointName = '/api/coordenador/:id/recusar';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        const coordenadorLogadoId = req.coordinator.id;
        const coordenadorLogadoNome = req.coordinator.nome;
        const { motivo } = req.body; if (!motivo || motivo.trim() === '') return res.status(400).json({ error: 'Motivo da recusa é obrigatório' });
        const client = await poolDash.connect();
        try {
            await client.query('BEGIN');
            const atestadoQuery = "SELECT nome_funcionario, email, coordenador_id FROM qhos.atestados WHERE id = $1 AND status = 'pendente_coordenador' FOR UPDATE";
            const { rows } = await client.query(atestadoQuery, [id]);
             if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ação não permitida (atestado já processado)' }); }
            const atestado = rows[0];
            if (atestado.coordenador_id !== coordenadorLogadoId) { 
                await client.query('ROLLBACK'); 
                return res.status(403).json({ error: 'Acesso negado. Este atestado não pertence a si.' }); 
            }
            const updateQuery = `UPDATE qhos.atestados SET status = 'recusado', validado_por_coordenador = false, nome_coordenador_validador = $1, motivo_recusa_coordenador = $2, data_validacao_coordenador = NOW() WHERE id = $3;`;
            await client.query(updateQuery, [coordenadorLogadoNome, motivo.trim(), id]);
            await client.query('COMMIT');
            enviarEmailStatus({ nomeFuncionario: atestado.nome_funcionario, email: atestado.email, nomeCoordenadorValidador: coordenadorLogadoNome }, 'recusado_coord', motivo.trim()).catch(console.error);
            res.json({ success: true, message: 'Atestado recusado com sucesso.' });
        } catch (dbErr) { await client.query('ROLLBACK'); logAndRespondError(res, dbErr, endpointName); }
        finally { client.release(); }
    });
    

    // --- ROTAS DE ADMIN (Sem proteção por enquanto) ---
    
    // API: Listar atestados (Admin)
    router.get('/api/atestados', async (req, res) => {
        const endpointName = '/api/atestados (admin)';
        try {
            const query = "SELECT * FROM qhos.atestados ORDER BY data_envio DESC";           
            const { rows } = await poolDash.query(query);
            res.json(rows.map(mapRowToAtestadoObject));
        } catch (dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    // API: Aprovar (Admin)
    router.post('/api/atestados/:id/aprovar', async (req, res) => { 
        const endpointName = '/api/atestados/:id/aprovar (admin)';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        try {
            const atestadoQuery = "SELECT nome_funcionario, email FROM qhos.atestados WHERE id = $1 AND status IN ('pendente_admin', 'pendente_coordenador')";            const { rows, rowCount } = await poolDash.query(atestadoQuery, [id]);
            if (rowCount === 0) return res.status(404).json({ error: 'Atestado não encontrado ou status inválido' });
            const updateQuery = `UPDATE qhos.atestados SET status = 'aprovado', validado_por_admin = true, nome_admin_validador = 'Medicina do Trabalho', data_validacao_admin = NOW() WHERE id = $1;`;
            await poolDash.query(updateQuery, [id]);
            enviarEmailStatus(rows[0], 'aprovado_final').catch(console.error);
            res.json({success: true, message: 'Atestado aprovado (final) com sucesso'});
        } catch(dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    // API: Recusar (Admin)
    router.post('/api/atestados/:id/recusar', async (req, res) => { 
        const endpointName = '/api/atestados/:id/recusar (admin)';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        const { motivo } = req.body; if (!motivo || motivo.trim() === '') return res.status(400).json({ error: 'Motivo da recusa (RH) é obrigatório' });
        try {
            const atestadoQuery = "SELECT nome_funcionario, email FROM qhos.atestados WHERE id = $1 AND status IN ('pendente_admin', 'pendente_coordenador')";            const { rows, rowCount } = await poolDash.query(atestadoQuery, [id]);
            if (rowCount === 0) return res.status(404).json({ error: 'Atestado não encontrado ou status inválido' });
            const updateQuery = `UPDATE qhos.atestados SET status = 'recusado', validado_por_admin = true, nome_admin_validador = 'Medicina do Trabalho', motivo_recusa_admin = $1, data_validacao_admin = NOW() WHERE id = $2;`;
            await poolDash.query(updateQuery, [motivo.trim(), id]);
            enviarEmailStatus(rows[0], 'recusado_final', motivo.trim()).catch(console.error);
            res.json({success: true, message: 'Atestado recusado (final) com sucesso'});
        } catch(dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    // API: Encaminhar (Admin)
    router.post('/api/atestados/:id/encaminhar', async (req, res) => { 
        const endpointName = '/api/atestados/:id/encaminhar (admin)';
        const id = parseInt(req.params.id); if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
        const { emails, mensagem } = req.body; if (!emails || !Array.isArray(emails) || emails.length === 0 || emails.some(e => !e || typeof e !== 'string')) return res.status(400).json({ error: 'Lista de e-mails inválida' });
        try {
            const { rows } = await poolDash.query("SELECT * FROM qhos.atestados WHERE id = $1", [id]);
            if (rows.length === 0) return res.status(404).json({error: 'Atestado não encontrado'});
            const atestado = mapRowToAtestadoObject(rows[0]);
            enviarEmailGestores(atestado, emails, mensagem || '', true).catch(console.error);
            await poolDash.query("UPDATE qhos.atestados SET encaminhado_para = $1, data_encaminhamento = NOW() WHERE id = $2", [emails.join(', '), id]); 
            res.json({success: true, message: `Atestado encaminhado para ${emails.length} e-mail(s).`});
        } catch(dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    // API: Estatísticas (Admin)
    router.get('/api/estatisticas', async (req, res) => { 
        const endpointName = '/api/estatisticas';
        try {
            const query = `SELECT status, COUNT(*) AS contagem FROM qhos.atestados WHERE status <> 'pendente_coordenador' GROUP BY status`;
            const { rows } = await poolDash.query(query);
            const stats = { total: 0, pendentes: 0, aprovados: 0, recusados: 0, invalidados: 0 };
            rows.forEach(row => {
                if (row.status === 'pendente_admin') stats.pendentes = parseInt(row.contagem, 10);
                if (row.status === 'aprovado') stats.aprovados = parseInt(row.contagem, 10);
                if (row.status === 'recusado') stats.recusados = parseInt(row.contagem, 10);
            });
            stats.total = stats.pendentes + stats.aprovados + stats.recusados;
            res.json(stats);
        } catch(dbErr) { logAndRespondError(res, dbErr, endpointName); }
    });

    console.log("🏁 Todas as rotas do Módulo de Atestados (v3) definidas.");
    return router;
}

module.exports = createAtestadosRouter;