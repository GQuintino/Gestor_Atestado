Versão: 1.0 (Pós-Implementação de Autenticação e Persistência)

1. Visão Geral
Este documento descreve a arquitetura e a lógica de desenvolvimento da aplicação web para gestão de atestados médicos. O sistema permite que colaboradores enviem atestados, que são então validados por um coordenador designado antes de serem encaminhados para a Medicina do Trabalho (RH/Admin) para aprovação ou recusa final. A aplicação inclui um fluxo de trabalho de duas etapas de aprovação, notificações por e-mail, persistência de dados em PostgreSQL e autenticação para coordenadores.

2. Arquitetura
A aplicação segue uma arquitetura cliente-servidor padrão:

Backend: Construído em Node.js com o framework Express. Responsável pela lógica de negócios, gestão de uploads, interação com a base de dados, envio de e-mails e autenticação.

Frontend: Páginas HTML estáticas servidas pelo Express, com interatividade implementada usando JavaScript vanilla (sem frameworks como React/Vue/Angular) e CSS para estilização.

Base de Dados: PostgreSQL, utilizada para persistir os dados dos atestados, coordenadores (leitura) e credenciais de autenticação dos coordenadores.

Armazenamento de Ficheiros: Os ficheiros de atestado (PDF, JPG, etc.) são armazenados num diretório de rede compartilhado (//10.172.0.11/Public/uploads).

3. Backend (server.js)
3.1. Bibliotecas Principais e Propósitos
express: Framework web para Node.js. Utilizado para definir rotas HTTP (API e páginas estáticas), gerir middleware e processar requisições/respostas.

pg (node-postgres): Driver PostgreSQL para Node.js. Permite a conexão e execução de consultas SQL na base de dados dash. Utiliza um Pool para gestão eficiente das conexões.

multer: Middleware para Express especializado no tratamento de multipart/form-data, usado principalmente para o upload de ficheiros (atestados). Configurado para guardar ficheiros num diretório de rede com nomes únicos.

nodemailer: Módulo para envio de e-mails via SMTP. Usado para notificações ao colaborador, coordenador e, potencialmente, outros gestores.

bcrypt: Biblioteca para hashing de senhas. Utilizada para encriptar as senhas dos coordenadores antes de as guardar na base de dados e para comparar as senhas durante o login.

express-session: Middleware para gestão de sessões no Express. Cria e mantém sessões para os coordenadores logados, armazenando dados da sessão (como ID do utilizador) num cookie encriptado.

cookie-parser: Middleware necessário para que o express-session possa ler e escrever os cookies da sessão.

body-parser: Middleware para processar o corpo das requisições (JSON, URL-encoded). Essencial para receber dados de formulários e APIs.

path, fs: Módulos nativos do Node.js usados para manipulação de caminhos de ficheiros e operações no sistema de ficheiros (verificar existência, criar diretórios).

3.2. Estrutura da Base de Dados (PostgreSQL)
qhos.coord: Tabela existente utilizada para obter a lista de coordenadores ativos (ID, Nome, E-mail, Setor, Escala). As consultas a esta tabela são apenas de leitura (SELECT).

qhos.coord_auth: Nova tabela criada pela aplicação para armazenar as credenciais dos coordenadores (id_coordenador, email UNIQUE, senha Hashed). Relaciona-se com qhos.coord através de id_coordenador.

qhos.atestados: Nova tabela criada pela aplicação para persistir todos os dados dos atestados enviados, incluindo o estado do fluxo de aprovação, quem validou e quando.

3.3. Lógica de Desenvolvimento e Fluxos
Inicialização: Ao arrancar, o servidor verifica/cria as tabelas qhos.atestados e qhos.coord_auth e testa a conexão com o PostgreSQL.

Fluxo de Envio (Colaborador):

O formulário (index.html) obtém a lista de coordenadores da API (/api/coordenadores).

Ao submeter, os dados e o ficheiro são enviados para /upload-atestado.

O backend valida a data de emissão (< 48h) e busca o e-mail do coordenador selecionado (pelo ID) na tabela qhos.coord.

O ficheiro é guardado no diretório de rede usando multer.

Os dados do atestado (incluindo nome/email do coordenador e nome do ficheiro) são inseridos na tabela qhos.atestados com status pendente_coordenador.

São enviados dois e-mails: um de confirmação para o colaborador e um de notificação para o coordenador (com link para o portal /validar-atestado).

Fluxo de Autenticação (Coordenador):

Primeiro Acesso (/register.html): O coordenador informa o seu e-mail e cria uma senha. O backend verifica se o e-mail existe em qhos.coord, se a senha ainda não foi criada em qhos.coord_auth, gera o hash da senha com bcrypt e guarda na qhos.coord_auth. Cria a sessão e redireciona.

Login (/login.html): O coordenador informa e-mail e senha. O backend busca o hash da senha em qhos.coord_auth pelo e-mail e compara com a senha fornecida usando bcrypt.compare. Se válida, cria a sessão e redireciona.

Verificação de Sessão (checkAuth middleware): Protege as rotas do coordenador (/validar-atestado, /api/coordenador/*). Verifica se req.session.user existe. Se não, redireciona para o login ou retorna 401 (para APIs).

Fluxo de Validação (Coordenador):

Ao aceder a /validar-atestado (logado), o frontend chama /api/coordenador/proximo-atestado.

O backend busca na qhos.atestados o atestado mais antigo com status='pendente_coordenador' e coordenador_id igual ao do utilizador logado.

Se encontrado, os dados são exibidos na coordenador.html.

Ao clicar em "Aprovar" ou "Recusar", uma chamada POST é feita para /api/atestados/:id/coordenador/aprovar ou /recusar.

O backend (protegido por checkAuth) verifica novamente se o atestado pertence ao coordenador logado e atualiza o status na qhos.atestados para pendente_admin ou recusado, registando quem validou e quando. Envia e-mail de status para o colaborador.

Fluxo de Admin (/admin):

A página (admin.html) carrega os atestados via GET /api/atestados. O backend retorna apenas os atestados que não estão pendente_coordenador.

O admin pode Aprovar (/api/atestados/:id/aprovar) ou Recusar (/api/atestados/:id/recusar), o que atualiza o status final na qhos.atestados e notifica o colaborador.

O admin pode encaminhar (/api/atestados/:id/encaminhar), enviando e-mail com anexo para outros e-mails.

3.4. API Endpoints Principais
/upload-atestado (POST): Recebe dados e ficheiro do colaborador, insere no DB, envia e-mails.

/api/coordenadores (GET): Retorna lista de coordenadores ativos (ID, Nome, Setor, Escala) do DB qhos.coord.

/api/atestados (GET): Retorna lista de atestados para o painel Admin (status != 'pendente_coordenador').

/api/atestados/:id/arquivo (GET): Serve o ficheiro do atestado (usado por Admin e Coordenador).

/api/auth/register (POST): Regista a senha do coordenador pela primeira vez.

/api/auth/login (POST): Autentica o coordenador e cria a sessão.

/api/auth/logout (POST): Destrói a sessão do coordenador.

/api/auth/check (GET): Verifica se o coordenador tem uma sessão ativa (protegido).

/api/coordenador/proximo-atestado (GET): Retorna o próximo atestado pendente para o coordenador logado (protegido).

/api/atestados/:id/coordenador/aprovar (POST): Coordenador aprova (protegido).

/api/atestados/:id/coordenador/recusar (POST): Coordenador recusa (protegido).

/api/atestados/:id/aprovar (POST): Admin aprova (não protegido atualmente).

/api/atestados/:id/recusar (POST): Admin recusa (não protegido atualmente).

/api/atestados/:id/encaminhar (POST): Admin encaminha por e-mail (não protegido atualmente).

/api/estatisticas (GET): Retorna contagens de atestados por status para o dashboard Admin.

4. Frontend
4.1. Ficheiros Principais
HTML: index.html (Colaborador), admin.html, coordenador.html, login.html, register.html. Estrutura básica das páginas.

CSS: style.css (Colaborador, Login, Registo), admin.css (Admin, Coordenador). Estilização visual.

JavaScript: script.js (Colaborador), admin.js, coordenador.js, login.js, register.js. Responsáveis pela interatividade, chamadas API (usando fetch), validações de formulário e manipulação do DOM.

4.2. Lógica Frontend
Carregamento Dinâmico: A lista de coordenadores em index.html é carregada via API. Os atestados em admin.html e coordenador.html também são carregados dinamicamente.

Validações: Validações básicas (campos obrigatórios, formato de e-mail, data de emissão < 48h, tamanho do ficheiro) são feitas no lado do cliente (JavaScript) antes do envio, além das validações no backend.

Interação com API: Todas as ações (enviar, aprovar, recusar, login, registo) utilizam a API fetch para comunicar com o backend.

Feedback ao Utilizador: Mensagens de sucesso ou erro são exibidas dinamicamente nas páginas.

5. Pontos de Atenção e Melhorias Futuras
Autenticação do Admin: O painel de Admin (/admin) e suas APIs associadas não possuem autenticação. É crucial implementar um sistema de login para o perfil de Admin/RH.

Segurança da Sessão: A secret da sessão em server.js deve ser alterada para uma string longa e aleatória e, idealmente, carregada a partir de variáveis de ambiente. Em produção, cookie.secure deve ser true (requer HTTPS).

Gestão de Erros: A gestão de erros pode ser aprimorada, especialmente na interação com a base de dados e o sistema de ficheiros (ex: tratamento mais robusto de falhas de permissão no diretório de rede).

Validação de 48h: A lógica atual (isAtestadoValido) apenas impede o envio após 48h. A estatística de "Inválidos" no dashboard Admin não está funcional, pois não há uma rotina que marque atestados como inválidos após o envio, se necessário.

Escalabilidade: Para um volume muito alto de atestados, a leitura da tabela inteira ou o uso do TRUNCATE na limpeza podem tornar-se ineficientes. Paginação e estratégias de arquivamento podem ser consideradas.

Testes: A aplicação carece de testes automatizados (unitários, integração, E2E).

Interface: A interface é funcional, mas poderia ser melhorada com um framework frontend moderno para melhor componentização e gestão de estado.

Configuração: Credenciais de DB e SMTP estão hardcoded no server.js. Devem ser movidas para variáveis de ambiente (ex: ficheiro .env).
