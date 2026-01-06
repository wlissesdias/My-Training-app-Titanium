const CACHE_NAME = 'titan-ai-v2';
const URLS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('SW: Cacheando arquivos estáticos');
      return cache.addAll(URLS_TO_CACHE).catch((err) => {
        console.warn('SW: Falha não crítica no cache inicial:', err);
      });
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('SW: Limpando cache antigo', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições com estratégia Stale-While-Revalidate para recursos externos
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Lista de domínios externos essenciais para o app funcionar offline
  const externalDomains = [
    'esm.sh',               // React e bibliotecas
    'cdn.tailwindcss.com',  // Estilos
    'fonts.googleapis.com', // Fontes
    'fonts.gstatic.com',    // Arquivos de fonte
    'unpkg.com'
  ];

  // Verifica se é uma requisição externa permitida OU uma requisição local
  const isExternalResource = externalDomains.some(domain => url.hostname.includes(domain));
  const isLocalResource = url.origin === self.location.origin;

  // Ignora requisições que não sejam GET ou APIs dinâmicas (Firebase, Gemini)
  if (event.request.method !== 'GET' || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') && !url.hostname.includes('fonts')) {
    return;
  }

  if (isLocalResource || isExternalResource) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // Estratégia: Stale-While-Revalidate
        // 1. Retorna o cache se existir (rápido)
        // 2. Busca na rede e atualiza o cache (para a próxima vez)
        
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Verifica se a resposta é válida antes de cachear
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic' || networkResponse.type === 'cors') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(() => {
          // Se falhar a rede (offline) e não tiver cache, falha silenciosamente ou retorna fallback se necessário
        });

        // Se tiver cache, retorna ele e faz o fetch em background. Se não, espera o fetch.
        return cachedResponse || fetchPromise;
      })
    );
  }
});