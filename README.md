# Controle de Horas

Aplicativo simples para registrar ponto pessoal em viagens ou atendimentos externos. Cada clique envia uma linha para uma planilha Google e a aba `Relatorio` organiza os horários por dia.

## Arquivos

- `index.html`: tela principal.
- `styles.css`: visual da página.
- `app.js`: registro de horário, localização e envio.
- `google-apps-script.js`: código para colar no Google Apps Script.
- `manifest.webmanifest`: permite adicionar a página à tela inicial do celular.

## Como configurar o Google Sheets

1. Crie uma planilha no Google Sheets.
2. Acesse `Extensões > Apps Script`.
3. Apague o conteúdo inicial do editor.
4. Copie todo o conteúdo de `google-apps-script.js` e cole no editor.
5. Clique em `Implantar > Nova implantação`.
6. Em `Tipo`, escolha `App da Web`.
7. Configure:
   - Executar como: `Eu`.
   - Quem pode acessar: `Qualquer pessoa`.
8. Clique em `Implantar` e autorize o acesso à planilha.
9. Copie a URL que termina com `/exec`.

## Como usar

1. Abra `index.html` no celular ou hospede a pasta em um local HTTPS.
2. Toque no botão de engrenagem.
3. Cole a URL `/exec` do Apps Script.
4. Salve.
5. Use os botões `Entrada`, `Saída almoço`, `Retorno almoço` e `Saída`.

## Como hospedar pelo Netlify Drop

1. Acesse `https://app.netlify.com/drop`.
2. Arraste a pasta `Controle de Horas` para a área indicada na página.
3. Aguarde o upload terminar.
4. O Netlify vai gerar um link HTTPS para o app.
5. Abra esse link no celular e adicione à tela inicial, se quiser usar como aplicativo.

Como a URL do Apps Script já está configurada no `app.js`, não é necessário colar o link de novo depois da hospedagem.

## Observações importantes

- A localização no navegador só funciona de forma confiável em HTTPS ou localhost.
- Se abrir o arquivo diretamente pelo celular, o navegador pode bloquear a localização.
- O endereço usa OpenStreetMap/Nominatim para converter coordenadas em rua, número, bairro e cidade.
- Se a conversão falhar, a planilha ainda salva latitude, longitude e link do Google Maps.
- Para corrigir horário esquecido, desmarque `Usar horário atual do celular`, informe data/hora e escreva uma observação.
