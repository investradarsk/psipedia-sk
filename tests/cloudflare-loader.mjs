const cloudflareWorkersModule = `
  export const env = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  export const waitUntil = (promise) => {
    globalThis.__CLOUDFLARE_WAIT_UNTIL__ = promise;
    promise.catch(() => undefined);
  };
`;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "cloudflare:workers") {
    return {
      url: `data:text/javascript,${encodeURIComponent(cloudflareWorkersModule)}`,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
