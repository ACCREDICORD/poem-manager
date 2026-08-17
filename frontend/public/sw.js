const CACHE = 'poem-manager-v6'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/media')) return

  // HTML（导航请求）：网络优先，失败回退缓存入口（保证断隧道时也能打开应用）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(event.request, copy))
          return res
        })
        .catch(() =>
          caches.match(event.request).then((cached) => cached || caches.match('/')),
        ),
    )
    return
  }

  // 静态资源（带哈希，内容不变）：缓存优先
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetched = fetch(event.request)
          .then((res) => {
            if (res && res.ok) cache.put(event.request, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || fetched
      }),
    ),
  )
})
