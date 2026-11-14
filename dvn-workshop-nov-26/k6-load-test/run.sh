#!/usr/bin/env bash
set -euo pipefail

invocation_directory="$PWD"
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

if [[ $# -eq 0 || "$1" == --help ]]; then
  echo 'Uso: ./k6-load-test/run.sh <requisições> [segundos] | prepare <requisições> | status <runId>'
  echo 'No Mac, com o gerador em Go: ./k6-load-test/run.sh local 1000000 60'
  echo 'Distribuído: ./k6-load-test/run.sh plan|prepare-distributed [requisições] [segundos] [executores] [antecedência em segundos]'
  echo 'Em cada executor: ./k6-load-test/run.sh worker /caminho/plan.json <número do executor>'
  exit 0
fi

if [[ "$1" == worker ]]; then
  # Resolva o caminho do plano antes de mudar para a raiz do projeto.
  if [[ $# -ge 2 && "$2" != /* ]]; then
    set -- "$1" "$invocation_directory/$2" "${@:3}"
  fi
fi

if [[ "$1" != plan && ! -f k6-load-test/.env ]]; then
  echo 'Copie k6-load-test/.env.example para k6-load-test/.env e preencha os dados do laboratório.' >&2
  exit 1
fi

node_options=(--experimental-strip-types)
if [[ -f k6-load-test/.env ]]; then
  node_options+=(--env-file=k6-load-test/.env)
fi

if [[ "$1" == local || "$1" == worker || "$1" =~ ^[0-9]+$ ]]; then
  if [[ "$1" == local ]]; then
    if ! command -v go >/dev/null; then
      echo 'O gerador local precisa do Go no PATH.' >&2
      exit 1
    fi
  elif ! command -v k6 >/dev/null; then
    echo 'O k6 precisa estar no PATH. No macOS, instale com: brew install k6' >&2
    exit 1
  fi

  if ! node "${node_options[@]}" -e 'process.exit(process.env.API_KEY?.trim() ? 0 : 1)'; then
    read -rsp 'Cole a API key e pressione Enter: ' API_KEY
    printf '\n'
    export API_KEY
  fi
fi

if [[ ! -x backend/node_modules/.bin/tsc ]]; then
  npm --prefix backend ci
fi
npm --prefix backend run build
exec node "${node_options[@]}" k6-load-test/run-orders.ts "$@"
