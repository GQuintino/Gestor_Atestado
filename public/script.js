document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formAtestado');
    const mensagem = document.getElementById('mensagem');
    const btnSubmit = form.querySelector('.btn-submit');
    const dataEmissao = document.getElementById('dataEmissao');
    const alerta48h = document.getElementById('alerta48h');
    const selectCoordenador = document.getElementById('coordenadorSelect');

    // Carregar Coordenadores (MODIFICADO)
    async function carregarCoordenadores() {
        try {
            const response = await fetch('/api/coordenadores');
            if (!response.ok) throw new Error('Falha ao carregar coordenadores');
            
            // O endpoint agora retorna { id, nome, setor, escala }
            const coordenadores = await response.json(); 
            
            selectCoordenador.innerHTML = '<option value="">-- Selecione seu Coordenador --</option>';
            
            // (CORREÇÃO) Atualiza o <select> para mostrar setor e escala
            coordenadores.forEach(coord => {
                const option = document.createElement('option');
                option.value = coord.id; // Envia o ID
                
                // Trata caso a escala seja nula ou vazia
                const escalaText = coord.escala ? ` / ${coord.escala}` : '';
                
                // Ex: "Maria (Centro Cirúrgico / T1)" ou "João (TI)"
                option.textContent = `${coord.nome} (${coord.setor}${escalaText})`;
                
                selectCoordenador.appendChild(option);
            });
            
        } catch (error) {
            console.error('Erro ao carregar coordenadores:', error);
            selectCoordenador.innerHTML = '<option value="">Erro ao carregar lista</option>';
            selectCoordenador.disabled = true;
        }
    }
    
    carregarCoordenadores();
    
    // Configurar datas mínimas/máximas
    const hoje = new Date().toISOString().split('T')[0];
    dataEmissao.max = hoje;
    dataEmissao.addEventListener('change', validarDataEmissao);

    // Validação de data de emissão
    function validarDataEmissao() {
        if (dataEmissao.value) {
            const dataEmissaoObj = new Date(dataEmissao.value);
            const agora = new Date();
            const diferencaHoras = (agora - dataEmissaoObj) / (1000 * 60 * 60);
            
            if (diferencaHoras > 48) {
                alerta48h.innerHTML = '❌ <strong>Atestado Inválido:</strong> Mais de 48 horas de emissão.';
                alerta48h.className = 'alerta invalido';
                return false;
            } else {
                alerta48h.innerHTML = '✅ <strong>Atestado Válido:</strong> Dentro do prazo de 48 horas.';
                alerta48h.className = 'alerta valido';
                return true;
            }
        }
        return true;
    }

    // Validação das datas de início e fim
    const dataInicio = document.getElementById('dataInicio');
    const dataFim = document.getElementById('dataFim');
    dataFim.addEventListener('change', function() {
        if (dataInicio.value && dataFim.value) {
            const inicio = new Date(dataInicio.value);
            const fim = new Date(dataFim.value);
            if (fim < inicio) {
                mostrarMensagem('A data fim não pode ser anterior à data início', 'erro');
                dataFim.value = '';
            }
        }
    });

    // Submissão do formulário
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        if (!validarDataEmissao()) {
            mostrarMensagem('Atestado com mais de 48 horas de emissão não é válido.', 'erro');
            return;
        }
        if (!selectCoordenador.value || selectCoordenador.value === "") {
            mostrarMensagem('Por favor, selecione seu coordenador.', 'erro');
            return;
        }

        const arquivoInput = document.getElementById('atestadoFile');
        const arquivo = arquivoInput.files[0];
        if (arquivo && arquivo.size > 5 * 1024 * 1024) {
            mostrarMensagem('O arquivo deve ter no máximo 5MB', 'erro');
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = 'Enviando...';

        try {
            const formData = new FormData(form);

            const response = await fetch('/upload-atestado', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                mostrarMensagem(result.message, 'sucesso');
                form.reset();
                alerta48h.style.display = 'block';
                selectCoordenador.innerHTML = '<option value="">Carregando coordenadores...</option>';
                carregarCoordenadores();
            } else {
                mostrarMensagem(result.error || 'Erro ao enviar atestado', 'erro');
            }
        } catch (error) {
            console.error('Erro:', error);
            mostrarMensagem('Erro ao enviar atestado. Tente novamente.', 'erro');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar para Validação';
        }
    });

    function mostrarMensagem(texto, tipo) {
        mensagem.textContent = texto;
        mensagem.className = `mensagem ${tipo}`;
        mensagem.style.display = 'block';
        setTimeout(() => {
            mensagem.style.display = 'none';
        }, 5000);
    }
});