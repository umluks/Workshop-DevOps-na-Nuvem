interface AwsFailure {
  name?: string;
  message?: string;
  throttlingReasons?: unknown;
  CancellationReasons?: unknown;
  $metadata?: {requestId?: string};
}

/** Mantém o catch como unknown e expõe somente os campos usados na lógica/logs. */
export function errorInfo(error: unknown): Required<Pick<AwsFailure, 'name' | 'message'>> & AwsFailure {
  const failure: AwsFailure = typeof error === 'object' && error !== null ? error : {};
  return {
    name: failure.name ?? 'Error',
    message: failure.message ?? String(error),
    throttlingReasons: failure.throttlingReasons,
    CancellationReasons: failure.CancellationReasons,
  };
}

/** Campos de diagnóstico sem o objeto completo de erro do SDK. */
export function errorDetails(error: unknown) {
  const failure = errorInfo(error);
  const metadata = (error as AwsFailure | undefined)?.$metadata;
  return {
    errorName: failure.name,
    errorMessage: failure.message.slice(0, 500),
    awsRequestId: metadata?.requestId,
  };
}
