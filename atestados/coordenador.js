let atestadoId = null;
let atestado = null; // Guarda os dados do atestado carregado
let coordenadorToken = null; // Guarda o token de acesso da URL

document.addEventListener('DOMContentLoaded', async function() {
    // 1. Extrai o token da URL
    coordenadorToken = obterTokenDaURL();
    
    if (!coordenadorToken) {
        // Se não houver token, exibe erro e para
        document.getElementById('loading').style.display = 'none';
        document.getElementById('conteudoAtestado').style.display = 'none';
        document.getElementById('semAtestados').style.display = 'block';
        document.getElementById('semAtestados').textContent = 'ERRO: Link de acesso inválido ou token não encontrado.';
        document.getElementById('semAtestados').className = 'mensagem erro';
        return;
    }
    
    // 2. Busca o nome do coordenador e carrega o atestado
    await carregarInfoCoordenador();
    carregarProximoAtestado();
});

// Extrai o token da URL (ex: /atestados/validar/TOKEN-VEM-AQUI)
function obterTokenDaURL() {
    try {
        const pathParts = window.location.pathname.split('/');
        // O token é a última parte da URL
        return pathParts[pathParts.length - 1]; 
    } catch (e) {
        return null;
    }
}

// (NOVA FUNÇÃO) Busca o nome do coordenador para exibir "Olá, [Nome]"
async function carregarInfoCoordenador() {
    if (!coordenadorToken) return;
    try {
        const response = await fetch(`/atestados/api/coordenador/${coordenadorToken}/info`);
        
        if (!response.ok) {
           throw new Error('Não foi possível verificar os dados do coordenador.');
        }
        
        const coordInfo = await response.json();
        document.getElementById('coordNome').textContent = coordInfo.nome;
        
    } catch (error) {
        // Se falhar, apenas não exibimos o nome
        document.getElementById('coordNome').textContent = '(Coordenador)';
        console.error("Erro ao buscar info do coordenador:", error.message);
    }
}


// (FUNÇÃO REMOVIDA) A função checkAuth() foi removida.

// Carrega o próximo atestado pendente (MODIFICADA)
async function carregarProximoAtestado() {
    if (!coordenadorToken) return; // Precisa do token

    try {
        // A URL da API agora inclui o token
        const response = await fetch(`/atestados/api/coordenador/${coordenadorToken}/proximo-atestado`);
        
        if (!response.ok) {
            if (response.status === 404) {
                // 404 significa que não há atestados pendentes
                document.getElementById('loading').style.display = 'none';
                document.getElementById('semAtestados').style.display = 'block';
                return;
            }
            const err = await response.json();
            throw new Error(err.error || 'Erro ao carregar atestado.');
        }
        
        atestado = await response.json();
        atestadoId = atestado.id;
        
        // Popula os campos (esta parte não muda)
        document.getElementById('nomeFuncionario').textContent = atestado.nomeFuncionario;
        document.getElementById('setor').textContent = atestado.setor || 'N/A';
        document.getElementById('periodo').textContent = `${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}`;
        document.getElementById('diasAfastamento').textContent = `${atestado.diasAfastamento || 'N/A'} dia(s)`;
        document.getElementById('medico').textContent = `${atestado.nomeMedico} - CRM: ${atestado.crmMedico}`;
        document.getElementById('hospital').textContent = atestado.hospital || 'N/A';
        
        // Exibe o conteúdo
        document.getElementById('loading').style.display = 'none';
        document.getElementById('conteudoAtestado').style.display = 'block';

    } catch (error) {
        mostrarMensagem(error.message, 'erro');
        document.getElementById('loading').style.display = 'none';
    }
}

async function tomarAcao(acao) {
    if (!atestadoId || !coordenadorToken) return;

    const motivoRecusa = document.getElementById('motivoRecusaCoord').value.trim();
    
    if (acao === 'recusar' && !motivoRecusa) {
        alert('O motivo da recusa é obrigatório.');
        return;
    }
    
    // Desabilita botões para evitar duplo clique
    document.querySelectorAll('.actions button').forEach(btn => btn.disabled = true);
    
    // (MODIFICADO) A URL da API agora é mais completa e inclui o token
    const url = `/atestados/api/coordenador/${coordenadorToken}/atestados/${atestadoId}/${acao}`;    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivoRecusa })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            mostrarMensagem(result.message, 'sucesso');
            document.getElementById('conteudoAtestado').style.display = 'none';
            // Tenta carregar o próximo
            carregarProximoAtestado();
        } else {
            mostrarMensagem(result.error || 'Erro ao processar ação', 'erro');
            document.querySelectorAll('.actions button').forEach(btn => btn.disabled = false);
        }
        
    } catch (error) {
        mostrarMensagem('Erro de comunicação com o servidor.', 'erro');
        document.querySelectorAll('.actions button').forEach(btn => btn.disabled = false);
    }
}

// (FUNÇÃO REMOVIDA) A função logout() foi removida.

// Funções de visualização de arquivo (Não mudam)
async function visualizarArquivo() {
    if (!atestadoId) return;
    
    const visualizador = document.getElementById('visualizadorArquivo');
    const modal = document.getElementById('modalArquivo');
    visualizador.innerHTML = '<p>Carregando arquivo...</p>';
    modal.style.display = 'flex';
    
    try {
        // A API de arquivo é pública (baseada no ID do atestado), não precisa de token
        const response = await fetch(`/atestados/api/atestados/${atestadoId}/arquivo`);
        if (!response.ok) throw new Error('Arquivo não encontrado');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        if (blob.type === 'application/pdf') {
            visualizador.innerHTML = `<iframe src="${url}" width="100%" height="400px"></iframe>`;
        } else if (blob.type.startsWith('image/')) {
            visualizador.innerHTML = `<img src="${url}" alt="Atestado médico" style="max-width: 100%; max-height: 400px;">`;
        } else {
            visualizador.innerHTML = '<p>Visualização não disponível</p>';
        }
    } catch (error) {
        visualizador.innerHTML = '<p>Erro ao carregar arquivo</p>';
    }
}

function fecharModalArquivo() {
    document.getElementById('modalArquivo').style.display = 'none';
    document.getElementById('visualizadorArquivo').innerHTML = '';
}

function formatarData(data) {
    if (!data) return 'N/A';
    const dataObj = new Date(data);
    // Adiciona o T00:00:00 se não vier (para garantir fuso horário correto)
    if (!data.includes('T')) {
        return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR');
    }
    return dataObj.toLocaleDateString('pt-BR');
}

function mostrarMensagem(texto, tipo) {
    const msgEl = document.getElementById('mensagemAcao');
    msgEl.textContent = texto;
    msgEl.className = `mensagem ${tipo}`;
    msgEl.style.display = 'block';
}

// Fechar modal ao clicar fora (Não muda)
window.onclick = function(event) {
    const modalArquivo = document.getElementById('modalArquivo');
    if (event.target === modalArquivo) {
        fecharModalArquivo();
    }
}