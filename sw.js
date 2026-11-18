/* Courier Bike — service worker (escrito à mão, sem bibliotecas).
 *
 * O que ele faz:
 *  - guarda o "casco" do app (HTML, JS, CSS, ícones) para abrir SEM internet;
 *  - guarda as fontes públicas do Google depois do primeiro acesso online (para o visual ficar igual offline);
 *  - nunca guarda dados seus: jornadas, corridas e valores ficam no IndexedDB do aparelho, fora deste cache;
 *  - uma versão nova fica esperando; só assume quando você toca em "Atualizar agora" (mensagem SKIP_WAITING).
 *
 * A versão e a lista de arquivos abaixo são preenchidas por build-web.mjs a cada empacotamento.
 */
const VERSION = '1.0.0-9281a5ed0b';
const SHELL_CACHE = 'courier-bike-shell-' + VERSION;
const FONT_CACHE = 'courier-bike-fonts-v1';
// Obrigatórios: sem eles o service worker não instala. Opcionais: se algum não existir no site, tudo bem.
const REQUIRED = ["./","index.html"];
const OPTIONAL = ["manifest.webmanifest","icon-192.png","icon-512.png","icon-maskable-512.png","apple-touch-icon.png","favicon-32.png"];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  // Sem skipWaiting aqui: a versão nova espera a sua autorização.
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(REQUIRED);
      await Promise.all(OPTIONAL.map((u) => cache.add(u).catch(() => undefined)));
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('courier-bike-shell-') && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(shellFirst(req));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
  // qualquer outro endereço externo segue direto para a rede, sem passar pelo cache
});

async function shellFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  // Abrir o app (navegação) sempre entrega o index.html guardado, mesmo sem internet.
  const hit = await cache.match(req.mode === 'navigate' ? 'index.html' : req, { ignoreSearch: true });
  if (hit) return hit;
  try {
    return await fetch(req);
  } catch (e) {
    if (req.mode === 'navigate') {
      const index = await cache.match('index.html');
      if (index) return index;
    }
    return new Response('Sem conexão e este arquivo ainda não foi guardado.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await refresh) || new Response('', { status: 504 });
}
