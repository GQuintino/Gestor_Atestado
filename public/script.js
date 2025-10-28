document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('formAtestado');
    const mensagem = document.getElementById('mensagem');
    const btnSubmit = form.querySelector('.btn-submit');
    const dataEmissao = document.getElementById('dataEmissao');
    const alerta48h = document.getElementById('alerta48h');

    // Configurar datas mínimas/máximas
    const hoje = new Date().toISOString().split('T')[0];
    const dataMaxima = new Date();
    dataMaxima.setDate(dataMaxima.getDate() + 1); // Amanhã
    
    dataEmissao.max = hoje;
    dataEmissao.addEventListener('change', validarDataEmissao);

    // Validação de data de emissão
    function validarDataEmissao() {
        if (dataEmissao.value) {
            const dataEmissaoObj = new Date(dataEmissao.value);
            const agora = new Date();
            const diferencaHoras = (agora - dataEmissaoObj) / (1000 * 60 * 60);
            
            if (diferencaHoras > 48) {
                alerta48h.style.display = 'block';
                alerta48h.innerHTML = '❌ <strong>Atestado Inválido:</strong> Este atestado tem mais de 48 horas de emissão e não será aceito.';
                alerta48h.className = 'alerta invalido';
                return false;
            } else {
                alerta48h.style.display = 'block';
                alerta48h.innerHTML = '✅ <strong>Atestado Válido:</strong> Este atestado está dentro do prazo de 48 horas.';
                alerta48h.className = 'alerta valido';
                return true;
            }
        }
        return true;
    }

    // Validação de datas
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

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Validar data de emissão
        if (!validarDataEmissao()) {
            mostrarMensagem('Atestado com mais de 48 horas de emissão não é válido. Por favor, solicite um atestado mais recente.', 'erro');
            return;
        }

        // Validar arquivo
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
                alerta48h.style.display = 'none';
            } else {
                mostrarMensagem(result.error || 'Erro ao enviar atestado', 'erro');
            }
        } catch (error) {
            console.error('Erro:', error);
            mostrarMensagem('Erro ao enviar atestado. Tente novamente.', 'erro');
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = 'Enviar Atestado';
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