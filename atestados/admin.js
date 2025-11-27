let atestados = [];
let atestadoParaRecusar = null;
let atestadoParaEncaminhar = null;
let atestadosFiltrados = [];

document.addEventListener('DOMContentLoaded', function() {
    carregarEstatisticas();
    carregarAtestados();
    setInterval(() => {
        carregarEstatisticas();
        carregarAtestados();
    }, 30000);
});

async function carregarEstatisticas() {
    try {
        const response = await fetch('/atestados/api/estatisticas');
        const estatisticas = await response.json();
        
        document.getElementById('totalAtestados').textContent = estatisticas.total;
        document.getElementById('pendentesAtestados').textContent = estatisticas.pendentes;
        document.getElementById('aprovadosAtestados').textContent = estatisticas.aprovados;
        document.getElementById('recusadosAtestados').textContent = estatisticas.recusados;
        document.getElementById('invalidadosAtestados').textContent = estatisticas.invalidados || 0;
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

async function carregarAtestados() {
    try {
        // Esta API (assumindo a alteração no router) agora carrega TODOS os atestados
        const response = await fetch('/atestados/api/atestados');
        atestados = await response.json();
        filtrarAtestados();
    } catch (error) {
        console.error('Erro ao carregar atestados:', error);
        document.getElementById('listaAtestados').innerHTML = 
            '<div class="loading">Erro ao carregar atestados</div>';
    }
}

function filtrarAtestados() {
    const filtroStatus = document.getElementById('filtroStatus').value;
    const buscaNome = document.getElementById('buscaNome').value.toLowerCase();
    
    atestadosFiltrados = atestados.filter(atestado => {
        // MODIFICAÇÃO: Lógica de filtro atualizada
        const statusMatch = filtroStatus === 'todos' || 
            (filtroStatus === 'pendente_admin' && atestado.status === 'pendente_admin') ||
            (filtroStatus === 'pendente_coordenador' && atestado.status === 'pendente_coordenador') ||
            (filtroStatus === 'aprovado' && atestado.status === 'aprovado') ||
            (filtroStatus === 'recusado' && atestado.status === 'recusado');
            
        const nomeMatch = atestado.nomeFuncionario.toLowerCase().includes(buscaNome);
        return statusMatch && nomeMatch;
    });
    
    renderizarAtestados();
}

function renderizarAtestados() {
    const container = document.getElementById('listaAtestados');
    
    if (atestadosFiltrados.length === 0) {
        container.innerHTML = '<div class="loading">Nenhum atestado encontrado</div>';
        return;
    }
    
    container.innerHTML = atestadosFiltrados.map(atestado => {
        let validacaoHtml = '';
        let motivoHtml = '';

        if (atestado.status === 'recusado') {
            if (atestado.motivoRecusaCoordenador) {
                validacaoHtml = `
                <div class="meta-item">
                    <span class="meta-label">Recusado por (Coord)</span>
                    <span class="meta-value" style="color: #e74c3c;">${atestado.nomeCoordenadorValidador || 'N/A'}</span>
                </div>`;
                motivoHtml = `
                <div class="meta-item">
                    <span class="meta-label">Motivo (Coord)</span>
                    <span class="meta-value">${atestado.motivoRecusaCoordenador}</span>
                </div>`;
            } else if (atestado.motivoRecusaAdmin) {
                validacaoHtml = `
                <div class="meta-item">
                    <span class="meta-label">Recusado por (RH)</span>
                    <span class="meta-value" style="color: #e74c3c;">${atestado.nomeAdminValidador || 'N/A'}</span>
                </div>`;
                motivoHtml = `
                <div class="meta-item">
                    <span class="meta-label">Motivo (RH)</span>
                    <span class="meta-value">${atestado.motivoRecusaAdmin}</span>
                </div>`;
            }
        } else { // pendente_admin, pendente_coordenador, aprovado
             validacaoHtml = `
            <div class="meta-item">
                <span class="meta-label">Aprovado por (Coord)</span>
                <span class="meta-value" style="color: ${atestado.nomeCoordenadorValidador ? '#27ae60' : '#7f8c8d'};">
                    ${atestado.nomeCoordenadorValidador || (atestado.status === 'pendente_coordenador' ? 'Aguardando...' : 'N/A')}
                </span>
            </div>`;
            if (atestado.status === 'aprovado') {
                 validacaoHtml += `
                 <div class="meta-item">
                    <span class="meta-label">Aprovado por (RH)</span>
                    <span class="meta-value" style="color: #27ae60;">${atestado.nomeAdminValidador || 'N/A'}</span>
                 </div>`;
            }
        }
        
        const botoesAcaoAdmin = `
            <button onclick="aprovarAtestado(${atestado.id})" class="btn btn-aprovar">
                Aprovar (RH)
            </button>
            <button onclick="abrirModalRecusar(${atestado.id})" class="btn btn-recusar">
                Recusar (RH)
            </button>
            <button onclick="abrirModalEncaminhar(${atestado.id})" class="btn btn-encaminhar">
                Encaminhar
            </button>
        `;

        return `
        <div class="atestado-item ${atestado.status} ${!atestado.valido ? 'invalido' : ''}">
            <div class="atestado-header">
                <div class="atestado-info">
                    <h3>${atestado.nomeFuncionario}</h3>
                    <span class="status-badge status-${atestado.status.replace('_coordenador', '')}">
                        ${getStatusText(atestado.status)}
                    </span>
                    ${!atestado.valido ? '<span class="status-badge status-invalido">Inválido</span>' : ''}
                </div>
            </div>
            <div class="atestado-meta">
                <div class="meta-item">
                    <span class="meta-label">Período</span>
                    <span class="meta-value">${formatarData(atestado.dataInicio)} a ${formatarData(atestado.dataFim)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Dias Afastado</span>
                    <span class="meta-value">${atestado.diasAfastamento || 'N/A'} dia(s)</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Data Emissão</span>
                    <span class="meta-value">${formatarData(atestado.dataEmissao)}</span>
                </div>
                <div class="meta-item">
                    <span class="meta-label">Médico</span>
                    <span class="meta-value">${atestado.nomeMedico || 'N/A'} - CRM: ${atestado.crmMedico || 'N/A'}</span>
                </div>
                 <div class="meta-item">
                    <span class="meta-label">Setor</span>
                    <span class="meta-value">${atestado.setor || 'N/A'}</span>
                </div>
                
                <div class="meta-item">
                    <span class="meta-label">Destinado ao Coordenador</span>
                    <span class="meta-value">${atestado.coordenadorInfo.nome || 'N/A'}</span>
                </div>
                
                ${validacaoHtml}
                ${motivoHtml}
                ${atestado.encaminhadoPara ? `
                <div class="meta-item">
                    <span class="meta-label">Encaminhado para</span>
                    <span class="meta-value">${Array.isArray(atestado.encaminhadoPara) ? atestado.encaminhadoPara.join(', ') : atestado.encaminhadoPara}</span>
                </div>
                ` : ''}
            </div>
            <div class="atestado-actions">
                <button onclick="visualizarArquivo(${atestado.id})" class="btn btn-visualizar">
                    Visualizar Atestado
                </button>
                
                ${(atestado.status === 'pendente_admin' || atestado.status === 'pendente_coordenador') && atestado.valido ? botoesAcaoAdmin : ''}
                
                <button onclick="downloadArquivo(${atestado.id})" class="btn btn-download">
                    Download
                </button>
            </div>
            <div class="atestado-footer">
                <small>Enviado em: ${formatarDataHora(atestado.dataEnvio)}</small>
                ${atestado.dataValidacaoCoordenador ? `
                <small> | Valid. Coord.: ${formatarDataHora(atestado.dataValidacaoCoordenador)}</small>
                ` : ''}
                ${atestado.dataValidacaoAdmin ? `
                <small> | Valid. RH: ${formatarDataHora(atestado.dataValidacaoAdmin)}</small>
                ` : ''}
            </div>
        </div>
    `}).join('');
}

function getStatusText(status) {
    const statusMap = {
        'pendente_coordenador': 'Aguardando Coordenador',
        'pendente_admin': 'Pendente (RH)',
        'aprovado': 'Aprovado',
        'recusado': 'Recusado'
    };
    return statusMap[status] || status;
}

function formatarData(data) {
    if (!data) return 'N/A';
    try {
        const dataObj = new Date(data); 
        return dataObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch (e) {
        console.error("Erro ao formatar data:", data, e);
        return 'Data Inválida';
    }
}

function formatarDataHora(data) {
    if (!data) return 'N/A';
    try {
        return new Date(data).toLocaleString('pt-BR');
    } catch (e) {
        console.error("Erro ao formatar data/hora:", data, e);
        return 'Data/Hora Inválida';
    }
}


async function visualizarArquivo(id) {
    const atestado = atestados.find(a => a.id === id);
    if (!atestado) return;
    
    const visualizador = document.getElementById('visualizadorArquivo');
    const modal = document.getElementById('modalArquivo');
    
    visualizador.innerHTML = '<p>Carregando arquivo...</p>';
    modal.style.display = 'flex';
    
    try {
        // MODIFICAÇÃO: URL com prefixo
        const response = await fetch(`/atestados/api/atestados/${id}/arquivo`);
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
        visualizador.innerHTML = `<p>Erro ao carregar arquivo: ${error.message}</p>`;
    }
}

function fecharModalArquivo() {
    document.getElementById('modalArquivo').style.display = 'none';
    document.getElementById('visualizadorArquivo').innerHTML = '';
}

async function downloadArquivo(id) {
    const atestado = atestados.find(a => a.id === id);
    if (!atestado) return;
    
    try {
        // MODIFICAÇÃO: URL com prefixo
        const response = await fetch(`/atestados/api/atestados/${id}/arquivo`);
        if (!response.ok) throw new Error('Arquivo não encontrado');
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const extensao = getFileExtension(atestado.arquivo) || 'bin';
        a.download = `atestado-${atestado.nomeFuncionario}-${atestado.dataInicio}.${extensao}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        mostrarMensagem('Erro ao fazer download do arquivo', 'erro');
    }
}

function getFileExtension(filename) {
    if (!filename) return '';
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
}

// Ação de Aprovação (Admin/RH)
async function aprovarAtestado(id) {
    if (!confirm('Tem certeza que deseja APROVAR este atestado (Ação Final)?')) return;
    
    try {
        // MODIFICAÇÃO: URL com prefixo
        const response = await fetch(`/atestados/api/atestados/${id}/aprovar`, {
            method: 'POST'
        });
        if (response.ok) {
            await carregarAtestados();
            await carregarEstatisticas();
            mostrarMensagem('Atestado aprovado (final)!', 'sucesso');
        } else {
            mostrarMensagem('Erro ao aprovar atestado', 'erro');
        }
    } catch (error) {
        mostrarMensagem('Erro ao aprovar atestado', 'erro');
    }
}

function abrirModalRecusar(id) {
    atestadoParaRecusar = id;
    document.getElementById('modalRecusar').style.display = 'flex';
    document.getElementById('motivoRecusa').value = '';
}

function fecharModal() {
    document.getElementById('modalRecusar').style.display = 'none';
    atestadoParaRecusar = null;
}

// Ação de Recusa (Admin/RH)
async function confirmarRecusa() {
    const motivo = document.getElementById('motivoRecusa').value.trim();
    if (!motivo) {
        alert('Por favor, informe o motivo da recusa (RH)');
        return;
    }
    
    try {
        // MODIFICAÇÃO: URL com prefixo
        const response = await fetch(`/atestados/api/atestados/${atestadoParaRecusar}/recusar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo })
        });
        
        if (response.ok) {
            fecharModal();
            await carregarAtestados();
            await carregarEstatisticas();
            mostrarMensagem('Atestado recusado (final)!', 'sucesso');
        } else {
            const error = await response.json();
            mostrarMensagem(error.error || 'Erro ao recusar atestado', 'erro');
        }
    } catch (error) {
        mostrarMensagem('Erro ao recusar atestado', 'erro');
    }
}

function abrirModalEncaminhar(id) {
    atestadoParaEncaminhar = id;
    document.getElementById('emailsGestores').value = '';
    document.getElementById('mensagemGestor').value = '';
    document.getElementById('modalEncaminhar').style.display = 'flex';
}

function fecharModalEncaminhar() {
    document.getElementById('modalEncaminhar').style.display = 'none';
    atestadoParaEncaminhar = null;
}

async function confirmarEncaminhamento() {
    const emailsInput = document.getElementById('emailsGestores').value.trim();
    const mensagem = document.getElementById('mensagemGestor').value.trim();
    if (!emailsInput) {
        alert('Informe pelo menos um email');
        return;
    }
    const emails = emailsInput.split(',').map(email => email.trim()).filter(email => email);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const emailsInvalidos = emails.filter(email => !emailRegex.test(email));
    if (emailsInvalidos.length > 0) {
        alert(`Emails inválidos: ${emailsInvalidos.join(', ')}`);
        return;
    }
    
    try {
        // MODIFICAÇÃO: URL com prefixo
        const response = await fetch(`/atestados/api/atestados/${atestadoParaEncaminhar}/encaminhar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails, mensagem })
        });
        if (response.ok) {
            fecharModalEncaminhar();
            await carregarAtestados();
            mostrarMensagem('Atestado encaminhado com sucesso!', 'sucesso');
        } else {
            const error = await response.json();
            mostrarMensagem(error.error || 'Erro ao encaminhar atestado', 'erro');
        }
    } catch (error) {
        mostrarMensagem('Erro ao encaminhar atestado', 'erro');
    }
}

function sair() {
    if (confirm('Deseja sair do painel administrativo?')) {
        window.location.href = '/';
    }
}

function mostrarMensagem(texto, tipo) {
    const mensagemAnterior = document.querySelector('.mensagem-flutuante');
    if (mensagemAnterior) {
        mensagemAnterior.remove();
    }
    const mensagem = document.createElement('div');
    mensagem.className = `mensagem-flutuante ${tipo}`;
    mensagem.textContent = texto;
    document.body.appendChild(mensagem);
    setTimeout(() => {
        if (mensagem.parentElement) {
            mensagem.remove();
        }
    }, 5000);
}

window.onclick = function(event) {
    const modalRecusar = document.getElementById('modalRecusar');
    const modalArquivo = document.getElementById('modalArquivo');
    const modalEncaminhar = document.getElementById('modalEncaminhar');
    if (event.target === modalRecusar) fecharModal();
    if (event.target === modalArquivo) fecharModalArquivo();
    if (event.target === modalEncaminhar) fecharModalEncaminhar();
}

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        fecharModal();
        fecharModalArquivo();
        fecharModalEncaminhar();
    }
});