export function normalizeBasePath(rawBase?: string): string {
  const trimmed = (rawBase ?? '').trim();
  if (!trimmed || trimmed === '/' || trimmed === './' || trimmed === '.') {
    return '/';
  }

  const collapsed = trimmed.replace(/\/+/g, '/').replace(/^\.\//, '');
  const withLeading = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
  return withTrailing === '//' ? '/' : withTrailing;
}

export function resolveAppAssetUrl(assetPath: string, baseUrl = '/'): string {
  if (/^(https?:|data:|blob:)/i.test(assetPath)) {
    return assetPath;
  }

  const normalizedBase = normalizeBasePath(baseUrl);
  if (normalizedBase !== '/' && assetPath.startsWith(normalizedBase)) {
    return assetPath;
  }

  const cleanAsset = assetPath.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!cleanAsset) {
    return normalizedBase;
  }
  return `${normalizedBase}${cleanAsset}`;
}

export interface ServiceWorkerConfig {
  scriptUrl: string;
  scope: string;
}

export function getServiceWorkerRegistrationConfig(baseUrl = '/'): ServiceWorkerConfig {
  const scope = normalizeBasePath(baseUrl);
  return {
    scriptUrl: resolveAppAssetUrl('sw.js', scope),
    scope,
  };
}

declare const __S404_BUILD_SW__: boolean | undefined;

export interface ServiceWorkerEnv {
  baseUrl?: string;
  isProd?: boolean;
  navigatorObj?: Pick<Navigator, 'serviceWorker'> | undefined;
  windowObj?: Pick<Window, 'addEventListener'> | undefined;
  documentObj?: Pick<Document, 'readyState'> | undefined;
}

export async function registerAppServiceWorker(env: ServiceWorkerEnv = {}): Promise<ServiceWorkerRegistration | undefined> {
  const defaultProd =
    typeof __S404_BUILD_SW__ === 'boolean' ? __S404_BUILD_SW__ : Boolean(import.meta.env?.PROD);
  const isProd = env.isProd ?? defaultProd;
  const nav = env.navigatorObj ?? (typeof navigator !== 'undefined' ? navigator : undefined);
  const win = env.windowObj ?? (typeof window !== 'undefined' ? window : undefined);
  const doc = env.documentObj ?? (typeof document !== 'undefined' ? document : undefined);

  if (!isProd || !nav || !('serviceWorker' in nav) || !nav.serviceWorker) {
    return undefined;
  }

  const baseUrl = env.baseUrl ?? import.meta.env.BASE_URL ?? '/';
  const { scriptUrl, scope } = getServiceWorkerRegistrationConfig(baseUrl);

  const performRegister = async () => {
    try {
      return await nav.serviceWorker.register(scriptUrl, { scope });
    } catch {
      return undefined;
    }
  };

  if (!win || doc?.readyState === 'complete') {
    return performRegister();
  }

  return new Promise((resolve) => {
    win.addEventListener(
      'load',
      () => {
        void performRegister().then(resolve);
      },
      { once: true }
    );
  });
}
