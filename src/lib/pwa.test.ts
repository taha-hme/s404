import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getServiceWorkerRegistrationConfig,
  normalizeBasePath,
  registerAppServiceWorker,
  resolveAppAssetUrl,
} from './pwa.ts';

test('normalizeBasePath handles root, subpaths, whitespace, and slashes', () => {
  assert.equal(normalizeBasePath(undefined), '/');
  assert.equal(normalizeBasePath(''), '/');
  assert.equal(normalizeBasePath('   '), '/');
  assert.equal(normalizeBasePath('/'), '/');
  assert.equal(normalizeBasePath('./'), '/');
  assert.equal(normalizeBasePath('s404-league'), '/s404-league/');
  assert.equal(normalizeBasePath('/s404-league'), '/s404-league/');
  assert.equal(normalizeBasePath('/s404-league/'), '/s404-league/');
  assert.equal(normalizeBasePath('///org/s404///'), '/org/s404/');
});

test('resolveAppAssetUrl prefixes internal paths for root and repository subpaths without double prefixing', () => {
  assert.equal(resolveAppAssetUrl('sw.js', '/'), '/sw.js');
  assert.equal(resolveAppAssetUrl('/sw.js', '/'), '/sw.js');
  assert.equal(resolveAppAssetUrl('sw.js', '/s404-league/'), '/s404-league/sw.js');
  assert.equal(resolveAppAssetUrl('/sw.js', '/s404-league/'), '/s404-league/sw.js');
  assert.equal(
    resolveAppAssetUrl('/src/assets/images/unit_tall_stories_1795549692518.jpg', '/s404-league/'),
    '/s404-league/src/assets/images/unit_tall_stories_1795549692518.jpg'
  );
  assert.equal(
    resolveAppAssetUrl('/s404-league/manifest.webmanifest', '/s404-league/'),
    '/s404-league/manifest.webmanifest'
  );
  assert.equal(
    resolveAppAssetUrl('https://example.com/logo.png', '/s404-league/'),
    'https://example.com/logo.png'
  );
});

test('getServiceWorkerRegistrationConfig returns base-aware sw.js URL and scope', () => {
  assert.deepEqual(getServiceWorkerRegistrationConfig('/'), {
    scriptUrl: '/sw.js',
    scope: '/',
  });
  assert.deepEqual(getServiceWorkerRegistrationConfig('/s404-english-league'), {
    scriptUrl: '/s404-english-league/sw.js',
    scope: '/s404-english-league/',
  });
});

test('registerAppServiceWorker registers only in production and passes base-aware scope', async () => {
  const calls: Array<{ url: string; options?: RegistrationOptions }> = [];
  const mockNav = {
    serviceWorker: {
      register: async (url: string | URL, options?: RegistrationOptions) => {
        calls.push({ url: String(url), options });
        return {} as ServiceWorkerRegistration;
      },
    } as unknown as ServiceWorkerContainer,
  };

  const devResult = await registerAppServiceWorker({
    isProd: false,
    baseUrl: '/s404-league/',
    navigatorObj: mockNav,
    documentObj: { readyState: 'complete' },
  });
  assert.equal(devResult, undefined);
  assert.equal(calls.length, 0);

  let loadHandler: (() => void) | undefined;
  const mockWin = {
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'load' && typeof listener === 'function') {
        loadHandler = () => listener(new Event('load'));
      }
    },
  } as Pick<Window, 'addEventListener'>;

  const prodPromise = registerAppServiceWorker({
    isProd: true,
    baseUrl: '/s404-league/',
    navigatorObj: mockNav,
    windowObj: mockWin,
    documentObj: { readyState: 'interactive' },
  });

  assert.equal(calls.length, 0);
  loadHandler?.();
  await prodPromise;

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    url: '/s404-league/sw.js',
    options: { scope: '/s404-league/' },
  });
});
