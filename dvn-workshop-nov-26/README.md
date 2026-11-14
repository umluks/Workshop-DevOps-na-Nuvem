# Workshop DVN · 9 de novembro

Simulador de carga do workshop DevOps na Nuvem. O painel React inicia execuções no API Gateway. A Lambda de controle prepara o estoque no DynamoDB e aciona a geradora. Os pedidos passam pelo SQS FIFO e a Lambda processadora registra a baixa no estoque.

## Montagem manual

Use o [roteiro do Console AWS](site/public/roteiro-console.html) para criar os recursos e empacotar as Lambdas. Os arquivos `.env.example` de cada função descrevem as variáveis que você configura no Console. Use sua própria conta, endpoint e chave da API.

Com Node.js 22.18 ou superior, instale as dependências e abra o painel:

```bash
npm --prefix backend ci
npm --prefix backend run build
npm --prefix site ci
npm --prefix site run dev
```

Na aba de conexão do painel, informe a URL do seu stage do API Gateway e a chave do seu laboratório. Para gerar os arquivos estáticos para o S3, use `npm --prefix site run build`. A saída fica em `site/dist/`.

## Teste de carga

O k6 envia um `POST /orders` individual por pedido. Para executar, instale o k6, configure um perfil AWS com acesso à tabela do seu laboratório e preencha os valores da sua cópia local de `k6-load-test/.env`. O script solicita a chave da API no terminal quando ela não está configurada.

```bash
cp k6-load-test/.env.example k6-load-test/.env
./k6-load-test/run.sh 1000 60
./k6-load-test/run.sh status ID_DA_EXECUCAO
```

O primeiro argumento é a quantidade de requisições. O segundo é a janela em segundos. Com Go instalado, `./k6-load-test/run.sh local 1000 60` executa o gerador local em Go. Os relatórios ficam em `k6-load-test/reports/`. Para consultar as opções, use `./k6-load-test/run.sh --help`.
