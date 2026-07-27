const BASE = '/api'

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  stats: () => req('GET', '/stats'),
  tunes: {
    list: (params = {}) => {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
      return req('GET', `/tunes${qs ? '?' + qs : ''}`)
    },
    get: (id) => req('GET', `/tunes/${id}`),
    create: (data) => req('POST', '/tunes', data),
    transpose: (id, semitones, title) => req('POST', `/tunes/${id}/transpose`, { semitones, title }),
    update: (id, data) => req('PUT', `/tunes/${id}`, data),
    delete: (id) => req('DELETE', `/tunes/${id}`),
  },
  practice: {
    list: (tuneId) => req('GET', `/tunes/${tuneId}/practice`),
    log: (tuneId, data) => req('POST', `/tunes/${tuneId}/practice`, data),
  },
  recordings: {
    listForTune: (tuneId) => req('GET', `/tunes/${tuneId}/recordings`),
    listSession: () => req('GET', '/recordings'),
    uploadForTune: (tuneId, formData) =>
      fetch(`${BASE}/tunes/${tuneId}/recordings`, { method: 'POST', body: formData })
        .then(r => r.json()),
    uploadSession: (formData) =>
      fetch(`${BASE}/recordings`, { method: 'POST', body: formData })
        .then(r => r.json()),
    patch: (id, data) => req('PATCH', `/recordings/${id}`, data),
    delete: (id) => req('DELETE', `/recordings/${id}`),
    audioUrl: (id) => `${BASE}/recordings/${id}/audio`,
  },
  sets: {
    list: () => req('GET', '/sets'),
    create: (data) => req('POST', '/sets', data),
    update: (id, data) => req('PUT', '/sets/' + id, data),
    delete: (id) => req('DELETE', '/sets/' + id),
  },
  thesession: {
    search: (q) => req('GET', `/search?q=${encodeURIComponent(q)}`),
    getTune: (id) => req('GET', `/thesession/${id}`),
  },  dupes: {
    list: (sameKeyIsDupe = true) => req('GET', `/dupes?same_key_is_dupe=${sameKeyIsDupe}`),
    resolve: (idA, idB, action) => req('POST', '/dupes/resolve', { id_a: idA, id_b: idB, action }),
  },
  share: {
    getToken: () => req('GET', '/share/token'),
    getConfig: () => req('GET', '/share/config'),
    saveConfig: (data) => req('POST', '/share/config', data),
    generateToken: () => req('POST', '/share/token', { action: 'generate' }),
    revokeToken: () => req('POST', '/share/token', { action: 'revoke' }),
  },
}
