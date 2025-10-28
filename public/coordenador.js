let atestadoId = null;
let atestado = null; // Guarda os dados do atestado carregado

document.addEventListener('DOMContentLoaded', async function() {
    // 1. Verifica se o utilizador está logado
    const user = await checkAuth();
    if (!user) {
        // Se não estiver logado, redireciona para o login
        window.location.href = '/login.html';
        return;
    }
    
    // 2. Se logado, exibe o nome e carrega o próximo atestado
    document.getElementById('coordNome').textContent = user.nome;
    carregarProximoAtestado();
});

// Verifica a sessão no servidor
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/check');
        const result = await response.json();
        return result.user || null; // Retorna os dados do utilizador ou nulo
    } catch (error) {
        return null;
    }
}

// Carrega o próximo atestado pendente para este coordenador
async function carregarProximoAtestado() {
    try {
        const response = await fetch('/api/coordenador/proximo-atestado');
        
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
        
        // Popula os campos
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
    if (!atestadoId) return;

    const motivoRecusa = document.getElementById('motivoRecusaCoord').value.trim();
    
    if (acao === 'recusar' && !motivoRecusa) {
        alert('O motivo da recusa é obrigatório.');
        return;
    }
    
    // Desabilita botões para evitar duplo clique
    document.querySelectorAll('.actions button').forEach(btn => btn.disabled = true);
    
    const url = `/api/atestados/${atestadoId}/coordenador/${acao}`;
    
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

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

// Funções de visualização de arquivo
async function visualizarArquivo() {
    if (!atestadoId) return;
    
    const visualizador = document.getElementById('visualizadorArquivo');
    const modal = document.getElementById('modalArquivo');
    visualizador.innerHTML = '<p>Carregando arquivo...</p>';
    modal.style.display = 'flex';
    
    try {
        const response = await fetch(`/api/atestados/${atestadoId}/arquivo`);
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

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modalArquivo = document.getElementById('modalArquivo');
    if (event.target === modalArquivo) {
        fecharModalArquivo();
    }
}